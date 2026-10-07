// SPDX-License-Identifier: GPL-2.0
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define ETH_P_IP 0x0800
#define IPPROTO_TCP 6
#define MAX_PAYLOAD_SIZE 2048

struct packet_event {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u16 len;
    __u8 flags;
    __u64 ts;
    char data[MAX_PAYLOAD_SIZE];
};

struct ssl_event {
    __u32 pid;
    __u32 tid;
    __u64 ts;
    __u16 len;
    __u8 is_read;
    char data[MAX_PAYLOAD_SIZE];
};

struct ssl_args {
    void *ssl;
    void *buf;
    int num;
};

// Ring buffer for packet events (8MB)
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 8 * 1024 * 1024);
} packet_events SEC(".maps");

// Ring buffer for SSL events (8MB)
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 8 * 1024 * 1024);
} ssl_events SEC(".maps");

// Map to store SSL_read/SSL_write arguments
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u64);
    __type(value, struct ssl_args);
} ssl_args_map SEC(".maps");

static __always_inline int parse_ip_header(struct __sk_buff *skb, __u32 *src_ip, __u32 *dst_ip) {
    // Read Ethernet header using skb helper
    __u16 eth_proto;
    if (bpf_skb_load_bytes(skb, 12, &eth_proto, sizeof(eth_proto)) < 0)
        return -1;

    if (bpf_ntohs(eth_proto) != ETH_P_IP)
        return -1;

    // Read IP header fields
    __u8 protocol;
    if (bpf_skb_load_bytes(skb, 14 + 9, &protocol, 1) < 0)
        return -1;

    if (protocol != IPPROTO_TCP)
        return -1;

    if (bpf_skb_load_bytes(skb, 14 + 12, src_ip, 4) < 0)
        return -1;
    if (bpf_skb_load_bytes(skb, 14 + 16, dst_ip, 4) < 0)
        return -1;

    __u8 ihl;
    if (bpf_skb_load_bytes(skb, 14, &ihl, 1) < 0)
        return -1;
    ihl = (ihl & 0x0f) * 4;

    return 14 + ihl;  // ETH_HLEN + IP header length
}

static __always_inline int parse_tcp_header(struct __sk_buff *skb, int offset,
                                              __u16 *src_port, __u16 *dst_port, __u8 *flags) {
    // Read TCP ports using skb helper
    __u16 sport, dport;
    if (bpf_skb_load_bytes(skb, offset, &sport, 2) < 0)
        return -1;
    if (bpf_skb_load_bytes(skb, offset + 2, &dport, 2) < 0)
        return -1;

    *src_port = bpf_ntohs(sport);
    *dst_port = bpf_ntohs(dport);

    // Read TCP flags (byte 13 of TCP header)
    if (bpf_skb_load_bytes(skb, offset + 13, flags, 1) < 0)
        return -1;

    // Read data offset (doff)
    __u8 doff;
    if (bpf_skb_load_bytes(skb, offset + 12, &doff, 1) < 0)
        return -1;
    doff = (doff >> 4) * 4;

    return offset + doff;
}

SEC("tc")
int capture_packets(struct __sk_buff *skb) {
    struct packet_event *event;
    __u32 src_ip = 0, dst_ip = 0;
    __u16 src_port = 0, dst_port = 0;
    __u8 flags = 0;

    // Parse IP header
    int ip_offset = parse_ip_header(skb, &src_ip, &dst_ip);
    if (ip_offset < 0)
        return 0;

    // Parse TCP header
    int tcp_offset = parse_tcp_header(skb, ip_offset, &src_port, &dst_port, &flags);
    if (tcp_offset < 0)
        return 0;

    // Skip if BOTH ports are ephemeral (> 32767) - no real service involved
    // This captures ALL service traffic (any port < 32768) while filtering noise
    __u16 sp = src_port;
    __u16 dp = dst_port;
    if (sp > 32767 && dp > 32767)
        return 0;

    // Reserve space in ring buffer
    event = bpf_ringbuf_reserve(&packet_events, sizeof(*event), 0);
    if (!event)
        return 0;

    event->src_ip = src_ip;
    event->dst_ip = dst_ip;
    event->src_port = src_port;
    event->dst_port = dst_port;
    event->flags = flags;
    event->ts = bpf_ktime_get_ns();

    // Copy payload - use constant sizes to satisfy BPF verifier
    __u32 tcp_off = (__u32)tcp_offset;
    event->len = 0;

    if (tcp_off >= skb->len)
        goto submit;

    __u32 avail = skb->len - tcp_off;

    // Tiered constant-size reads (verifier requires compile-time const for len)
    // Tiered reads - BPF verifier needs compile-time constant sizes
    // Fine-grained tiers ensure small HTTP responses (headers+body) aren't truncated
    if (avail >= 2047) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 2047);
        event->len = 2047;
    } else if (avail >= 1536) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 1536);
        event->len = 1536;
    } else if (avail >= 1024) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 1024);
        event->len = 1024;
    } else if (avail >= 768) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 768);
        event->len = 768;
    } else if (avail >= 512) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 512);
        event->len = 512;
    } else if (avail >= 384) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 384);
        event->len = 384;
    } else if (avail >= 256) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 256);
        event->len = 256;
    } else if (avail >= 192) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 192);
        event->len = 192;
    } else if (avail >= 128) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 128);
        event->len = 128;
    } else if (avail >= 64) {
        bpf_skb_load_bytes(skb, tcp_off, event->data, 64);
        event->len = 64;
    }

submit:
    bpf_ringbuf_submit(event, 0);
    return 0;
}

SEC("uprobe/SSL_read")
int ssl_read_enter(struct pt_regs *ctx) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct ssl_args args = {};

    // Get SSL_read arguments: SSL_read(ssl, buf, num)
    args.ssl = (void *)PT_REGS_PARM1(ctx);
    args.buf = (void *)PT_REGS_PARM2(ctx);
    args.num = (int)PT_REGS_PARM3(ctx);

    bpf_map_update_elem(&ssl_args_map, &pid_tgid, &args, BPF_ANY);
    return 0;
}

SEC("uretprobe/SSL_read")
int ssl_read_exit(struct pt_regs *ctx) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct ssl_args *args;
    struct ssl_event *event;

    args = bpf_map_lookup_elem(&ssl_args_map, &pid_tgid);
    if (!args)
        return 0;

    int ret = (int)PT_REGS_RC(ctx);
    if (ret <= 0) {
        bpf_map_delete_elem(&ssl_args_map, &pid_tgid);
        return 0;
    }

    event = bpf_ringbuf_reserve(&ssl_events, sizeof(*event), 0);
    if (!event) {
        bpf_map_delete_elem(&ssl_args_map, &pid_tgid);
        return 0;
    }

    event->pid = pid_tgid >> 32;
    event->tid = pid_tgid;
    event->ts = bpf_ktime_get_ns();
    event->is_read = 1;

    // Use constant-size reads for BPF verifier
    __u32 read_len = (__u32)ret;
    event->len = 0;

    if (read_len >= 2047) {
        bpf_probe_read_user(event->data, 2047, args->buf);
        event->len = 2047;
    } else if (read_len >= 1024) {
        bpf_probe_read_user(event->data, 1024, args->buf);
        event->len = 1024;
    } else if (read_len >= 512) {
        bpf_probe_read_user(event->data, 512, args->buf);
        event->len = 512;
    } else if (read_len >= 256) {
        bpf_probe_read_user(event->data, 256, args->buf);
        event->len = 256;
    } else if (read_len >= 64) {
        bpf_probe_read_user(event->data, 64, args->buf);
        event->len = 64;
    }

    bpf_ringbuf_submit(event, 0);
    bpf_map_delete_elem(&ssl_args_map, &pid_tgid);
    return 0;
}

SEC("uprobe/SSL_write")
int ssl_write(struct pt_regs *ctx) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    struct ssl_event *event;

    void *ssl = (void *)PT_REGS_PARM1(ctx);
    void *buf = (void *)PT_REGS_PARM2(ctx);
    int num = (int)PT_REGS_PARM3(ctx);

    if (num <= 0)
        return 0;

    event = bpf_ringbuf_reserve(&ssl_events, sizeof(*event), 0);
    if (!event)
        return 0;

    event->pid = pid_tgid >> 32;
    event->tid = pid_tgid;
    event->ts = bpf_ktime_get_ns();
    event->is_read = 0;

    // Use constant-size reads for BPF verifier
    __u32 write_len = (__u32)num;
    event->len = 0;

    if (write_len >= 2047) {
        bpf_probe_read_user(event->data, 2047, buf);
        event->len = 2047;
    } else if (write_len >= 1024) {
        bpf_probe_read_user(event->data, 1024, buf);
        event->len = 1024;
    } else if (write_len >= 512) {
        bpf_probe_read_user(event->data, 512, buf);
        event->len = 512;
    } else if (write_len >= 256) {
        bpf_probe_read_user(event->data, 256, buf);
        event->len = 256;
    } else if (write_len >= 64) {
        bpf_probe_read_user(event->data, 64, buf);
        event->len = 64;
    }

    bpf_ringbuf_submit(event, 0);
    return 0;
}

char _license[] SEC("license") = "GPL";
