# Multi-stage build for network monitor

# Stage 1: Build eBPF programs
FROM --platform=linux/amd64 ubuntu:22.04 AS bpf-builder

RUN apt-get update && apt-get install -y \
    clang \
    llvm \
    libbpf-dev \
    linux-headers-generic \
    linux-tools-common \
    linux-tools-generic \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy eBPF source
COPY bpf/ ./bpf/

# vmlinux.h is already provided in the bpf directory
# No need to generate it at build time

# Compile eBPF programs
RUN clang -O2 -g -target bpf -D__TARGET_ARCH_x86_64 \
    -c bpf/packet_capture.bpf.c -o bpf/packet_capture.bpf.o

# Stage 2: Build Go application
FROM --platform=linux/amd64 golang:1.21-alpine AS go-builder

RUN apk add --no-cache \
    git \
    make \
    gcc \
    musl-dev \
    linux-headers \
    libbpf-dev \
    elfutils-dev \
    zlib-dev

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY cmd/ ./cmd/
COPY pkg/ ./pkg/

# Build - with architecture support
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -a -installsuffix cgo \
    -o network-monitor ./cmd/main.go

# Stage 3: Final image
FROM --platform=linux/amd64 alpine:3.18

RUN apk add --no-cache \
    libelf \
    zlib \
    ca-certificates

WORKDIR /app

# Copy eBPF object
COPY --from=bpf-builder /build/bpf/packet_capture.bpf.o ./bpf/

# Copy Go binary
COPY --from=go-builder /app/network-monitor /usr/bin/network-monitor

# Set entrypoint
ENTRYPOINT ["/usr/bin/network-monitor"]
CMD ["-bpf-object=/app/bpf/packet_capture.bpf.o"]
