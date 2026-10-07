package ebpf

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"time"
	"unsafe"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/vishvananda/netlink"
)

const (
	MaxPayloadSize = 2048
)

type PacketEvent struct {
	SrcIP    uint32
	DstIP    uint32
	SrcPort  uint16
	DstPort  uint16
	Len      uint16
	Flags    uint8
	_        uint8 // padding
	Ts       uint64
	Data     [MaxPayloadSize]byte
}

type SSLEvent struct {
	PID    uint32
	TID    uint32
	Ts     uint64
	Len    uint16
	IsRead uint8
	_      uint8 // padding
	Data   [MaxPayloadSize]byte
}

type Loader struct {
	collection     *ebpf.Collection
	tcLinks        []link.Link
	sslLinks       []link.Link
	packetReader   *ringbuf.Reader
	sslReader      *ringbuf.Reader
	handlers       *Handlers
	sslAvailable   bool
	attachedIfaces map[int]bool // interface index -> attached, so re-scans only add new veths
}

type Handlers struct {
	OnPacket func(*PacketEvent)
	OnSSL    func(*SSLEvent)
}

func NewLoader(bpfObjectPath string, handlers *Handlers) (*Loader, error) {
	// Load eBPF object
	spec, err := ebpf.LoadCollectionSpec(bpfObjectPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load eBPF spec: %w", err)
	}

	// Try loading full collection (TC + SSL)
	coll, err := ebpf.NewCollection(spec)
	if err != nil {
		log.Printf("Warning: Failed to load full eBPF collection: %v", err)
		log.Println("Retrying without SSL programs (TC packet capture only)...")

		// Remove SSL programs and retry
		delete(spec.Programs, "ssl_read_enter")
		delete(spec.Programs, "ssl_read_exit")
		delete(spec.Programs, "ssl_write")

		coll, err = ebpf.NewCollection(spec)
		if err != nil {
			return nil, fmt.Errorf("failed to create eBPF collection (TC only): %w", err)
		}

		return &Loader{
			collection:   coll,
			handlers:     handlers,
			sslAvailable: false,
		}, nil
	}

	return &Loader{
		collection:   coll,
		handlers:     handlers,
		sslAvailable: true,
	}, nil
}

// AttachTC attaches the packet-capture program to every non-loopback interface's
// ingress. It is idempotent and incremental: interfaces already attached in a
// previous pass are skipped, so it can be called on a timer to pick up the veths
// of pods created after startup. Ingress-on-all-interfaces means each packet is
// captured exactly once as it enters some interface (both directions covered).
func (l *Loader) AttachTC() error {
	if l.attachedIfaces == nil {
		l.attachedIfaces = make(map[int]bool)
	}

	// Get all network interfaces
	links, err := netlink.LinkList()
	if err != nil {
		return fmt.Errorf("failed to list network links: %w", err)
	}

	prog := l.collection.Programs["capture_packets"]
	if prog == nil {
		return fmt.Errorf("capture_packets program not found")
	}

	newlyAttached := 0
	for _, iface := range links {
		idx := iface.Attrs().Index
		// Skip loopback and interfaces we already attached to.
		if iface.Attrs().Name == "lo" || l.attachedIfaces[idx] {
			continue
		}

		// Create qdisc clsact
		qdisc := &netlink.GenericQdisc{
			QdiscAttrs: netlink.QdiscAttrs{
				LinkIndex: iface.Attrs().Index,
				Handle:    netlink.MakeHandle(0xffff, 0),
				Parent:    netlink.HANDLE_CLSACT,
			},
			QdiscType: "clsact",
		}

		// Try to add qdisc (ignore error if already exists)
		_ = netlink.QdiscAdd(qdisc)

		// Delete existing filters on ingress before adding new one
		existingFilters, _ := netlink.FilterList(iface, netlink.HANDLE_MIN_INGRESS)
		for _, f := range existingFilters {
			_ = netlink.FilterDel(f)
		}

		// Attach BPF filter
		filter := &netlink.BpfFilter{
			FilterAttrs: netlink.FilterAttrs{
				LinkIndex: iface.Attrs().Index,
				Parent:    netlink.HANDLE_MIN_INGRESS,
				Handle:    1,
				Protocol:  3, // ETH_P_ALL
				Priority:  1,
			},
			Fd:           prog.FD(),
			Name:         "capture_packets",
			DirectAction: true,
		}

		if err := netlink.FilterAdd(filter); err != nil {
			log.Printf("Warning: failed to attach TC to %s: %v", iface.Attrs().Name, err)
			continue
		}

		l.attachedIfaces[idx] = true
		newlyAttached++
		log.Printf("Attached TC to interface %s", iface.Attrs().Name)
	}

	if newlyAttached > 0 {
		log.Printf("TC attach pass: %d new interface(s) attached (%d total monitored)", newlyAttached, len(l.attachedIfaces))
	}

	return nil
}

func (l *Loader) AttachSSLUprobes(libsslPath string) error {
	if !l.sslAvailable {
		log.Println("SSL uprobes not available (programs not loaded), skipping")
		return nil
	}

	readEnter := l.collection.Programs["ssl_read_enter"]
	readExit := l.collection.Programs["ssl_read_exit"]
	write := l.collection.Programs["ssl_write"]

	if readEnter == nil || readExit == nil || write == nil {
		return fmt.Errorf("SSL uprobe programs not found")
	}

	// Attach SSL_read enter
	readEnterLink, err := link.OpenExecutable(libsslPath)
	if err != nil {
		return fmt.Errorf("failed to open libssl: %w", err)
	}

	upReadEnter, err := readEnterLink.Uprobe("SSL_read", readEnter, nil)
	if err != nil {
		return fmt.Errorf("failed to attach SSL_read uprobe: %w", err)
	}
	l.sslLinks = append(l.sslLinks, upReadEnter)

	// Attach SSL_read exit
	upReadExit, err := readEnterLink.Uretprobe("SSL_read", readExit, nil)
	if err != nil {
		return fmt.Errorf("failed to attach SSL_read uretprobe: %w", err)
	}
	l.sslLinks = append(l.sslLinks, upReadExit)

	// Attach SSL_write
	upWrite, err := readEnterLink.Uprobe("SSL_write", write, nil)
	if err != nil {
		return fmt.Errorf("failed to attach SSL_write uprobe: %w", err)
	}
	l.sslLinks = append(l.sslLinks, upWrite)

	log.Printf("Attached SSL uprobes to %s", libsslPath)
	return nil
}

func (l *Loader) StartReading() error {
	// Open packet ring buffer
	packetRb := l.collection.Maps["packet_events"]
	if packetRb == nil {
		return fmt.Errorf("packet_events map not found")
	}

	packetReader, err := ringbuf.NewReader(packetRb)
	if err != nil {
		return fmt.Errorf("failed to create packet ringbuf reader: %w", err)
	}
	l.packetReader = packetReader

	// Start reading packet events
	go l.readPacketEvents()

	// Open SSL ring buffer (optional)
	if l.sslAvailable {
		sslRb := l.collection.Maps["ssl_events"]
		if sslRb != nil {
			sslReader, err := ringbuf.NewReader(sslRb)
			if err != nil {
				log.Printf("Warning: failed to create SSL ringbuf reader: %v", err)
			} else {
				l.sslReader = sslReader
				go l.readSSLEvents()
			}
		}
	}

	log.Println("Started reading eBPF events")
	return nil
}

func (l *Loader) readPacketEvents() {
	for {
		record, err := l.packetReader.Read()
		if err != nil {
			log.Printf("Error reading packet event: %v", err)
			continue
		}

		var event PacketEvent
		if err := binary.Read(bytes.NewReader(record.RawSample), binary.LittleEndian, &event); err != nil {
			log.Printf("Error parsing packet event: %v", err)
			continue
		}

		if l.handlers.OnPacket != nil {
			l.handlers.OnPacket(&event)
		}
	}
}

func (l *Loader) readSSLEvents() {
	for {
		record, err := l.sslReader.Read()
		if err != nil {
			log.Printf("Error reading SSL event: %v", err)
			continue
		}

		var event SSLEvent
		if err := binary.Read(bytes.NewReader(record.RawSample), binary.LittleEndian, &event); err != nil {
			log.Printf("Error parsing SSL event: %v", err)
			continue
		}

		if l.handlers.OnSSL != nil {
			l.handlers.OnSSL(&event)
		}
	}
}

func (l *Loader) Close() error {
	if l.packetReader != nil {
		l.packetReader.Close()
	}

	if l.sslReader != nil {
		l.sslReader.Close()
	}

	for _, tcLink := range l.tcLinks {
		tcLink.Close()
	}

	for _, sslLink := range l.sslLinks {
		sslLink.Close()
	}

	if l.collection != nil {
		l.collection.Close()
	}

	return nil
}

// Helper functions
func Uint32ToIP(ip uint32) string {
	bytes := (*[4]byte)(unsafe.Pointer(&ip))
	return net.IPv4(bytes[0], bytes[1], bytes[2], bytes[3]).String()
}

func (pe *PacketEvent) String() string {
	return fmt.Sprintf("%s:%d -> %s:%d [%d bytes] @ %s",
		Uint32ToIP(pe.SrcIP), pe.SrcPort,
		Uint32ToIP(pe.DstIP), pe.DstPort,
		pe.Len,
		time.Unix(0, int64(pe.Ts)).Format(time.RFC3339Nano))
}

func (se *SSLEvent) String() string {
	direction := "read"
	if se.IsRead == 0 {
		direction = "write"
	}
	return fmt.Sprintf("PID:%d TID:%d %s [%d bytes] @ %s",
		se.PID, se.TID, direction, se.Len,
		time.Unix(0, int64(se.Ts)).Format(time.RFC3339Nano))
}
