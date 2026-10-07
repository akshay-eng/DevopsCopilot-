#!/bin/bash

set -e

echo "Building Network Monitor..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"

    if ! command -v clang &> /dev/null; then
        echo -e "${RED}clang not found. Please install: sudo apt-get install clang${NC}"
        exit 1
    fi

    if ! command -v go &> /dev/null; then
        echo -e "${RED}go not found. Please install Go 1.21+${NC}"
        exit 1
    fi

    echo -e "${GREEN}Dependencies OK${NC}"
}

# Generate vmlinux.h
generate_vmlinux() {
    echo -e "${YELLOW}Generating vmlinux.h...${NC}"

    if [ -f /sys/kernel/btf/vmlinux ]; then
        bpftool btf dump file /sys/kernel/btf/vmlinux format c > bpf/vmlinux.h.generated
        echo -e "${GREEN}Generated vmlinux.h${NC}"
    else
        echo -e "${YELLOW}Warning: /sys/kernel/btf/vmlinux not found, using provided vmlinux.h${NC}"
    fi
}

# Compile eBPF
compile_ebpf() {
    echo -e "${YELLOW}Compiling eBPF programs...${NC}"

    clang -O2 -g -target bpf -D__TARGET_ARCH_x86_64 \
        -I/usr/include/x86_64-linux-gnu \
        -c bpf/packet_capture.bpf.c -o bpf/packet_capture.bpf.o

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}eBPF compilation successful${NC}"
    else
        echo -e "${RED}eBPF compilation failed${NC}"
        exit 1
    fi
}

# Build Go binary
build_go() {
    echo -e "${YELLOW}Building Go binary...${NC}"

    go mod tidy
    CGO_ENABLED=1 go build -o bin/network-monitor ./cmd/main.go

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Go build successful${NC}"
    else
        echo -e "${RED}Go build failed${NC}"
        exit 1
    fi
}

# Main
main() {
    cd "$(dirname "$0")/.."

    check_dependencies
    # generate_vmlinux  # Uncomment if you want to generate vmlinux.h
    compile_ebpf
    build_go

    echo -e "${GREEN}Build complete! Binary: bin/network-monitor${NC}"
}

main "$@"
