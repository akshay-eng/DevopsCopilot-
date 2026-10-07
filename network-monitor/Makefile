.PHONY: all build bpf go docker clean deploy

all: build

# Generate vmlinux.h
vmlinux:
	@echo "Generating vmlinux.h..."
	bpftool btf dump file /sys/kernel/btf/vmlinux format c > bpf/vmlinux.h

# Compile eBPF programs
bpf:
	@echo "Compiling eBPF programs..."
	clang -O2 -g -target bpf -D__TARGET_ARCH_x86_64 \
		-I/usr/include/x86_64-linux-gnu \
		-c bpf/packet_capture.bpf.c -o bpf/packet_capture.bpf.o

# Build Go binary
go:
	@echo "Building Go binary..."
	go mod tidy
	go build -o bin/network-monitor ./cmd/main.go

# Build everything
build: bpf go

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker build -t network-monitor:latest .

# Clean build artifacts
clean:
	rm -f bpf/*.o
	rm -rf bin/

# Deploy to Kubernetes
deploy:
	kubectl apply -f deployments/daemonset.yaml

# Undeploy from Kubernetes
undeploy:
	kubectl delete -f deployments/daemonset.yaml

# Run locally (requires root)
run:
	sudo ./bin/network-monitor -bpf-object=bpf/packet_capture.bpf.o

# Test eBPF compilation
test-bpf:
	@echo "Testing eBPF compilation..."
	clang -O2 -g -target bpf -D__TARGET_ARCH_x86_64 \
		-I/usr/include/x86_64-linux-gnu \
		-fsyntax-only bpf/packet_capture.bpf.c

# Format Go code
fmt:
	go fmt ./...

# Run Go tests
test:
	go test -v ./...

# Install dependencies
deps:
	go mod download
