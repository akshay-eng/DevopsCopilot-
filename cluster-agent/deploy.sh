#!/bin/bash

###############################################################################
# DevOps Copilot Cluster Agent - Deployment Script
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="${DOCKER_REGISTRY:-your-registry.com}"
IMAGE_NAME="devopscopilot-cluster-agent"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        print_error "kubectl is not installed"
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        print_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    print_info "Prerequisites check passed"
}

# Build Docker image
build_image() {
    print_info "Building Docker image for AMD64..."

    docker buildx build \
        --platform linux/amd64 \
        -t "${IMAGE_NAME}:${IMAGE_TAG}" \
        -t "${FULL_IMAGE}" \
        --load \
        .

    print_info "Image built successfully: ${FULL_IMAGE}"
}

# Push Docker image
push_image() {
    print_info "Pushing image to registry..."

    docker push "${FULL_IMAGE}"

    print_info "Image pushed successfully"
}

# Update deployment YAML with image
update_deployment_yaml() {
    print_info "Updating deployment YAML with image: ${FULL_IMAGE}"

    # Create temporary deployment file
    cp k8s/deployment.yaml k8s/deployment.yaml.tmp

    # Replace image placeholder
    sed -i.bak "s|YOUR_REGISTRY/devopscopilot-cluster-agent:latest|${FULL_IMAGE}|g" k8s/deployment.yaml.tmp

    print_info "Deployment YAML updated"
}

# Get MongoDB IDs
get_mongodb_ids() {
    print_warn "===================================================================="
    print_warn "IMPORTANT: You need to provide USER_ID and CLUSTER_ID from MongoDB"
    print_warn "===================================================================="
    echo ""
    echo "1. Login to your DevOpsCopilot dashboard"
    echo "2. Get your USER_ID from MongoDB users collection"
    echo "3. Get your CLUSTER_ID from MongoDB clusters collection"
    echo ""
    read -p "Enter USER_ID: " USER_ID
    read -p "Enter CLUSTER_ID: " CLUSTER_ID

    if [[ -z "$USER_ID" || -z "$CLUSTER_ID" ]]; then
        print_error "USER_ID and CLUSTER_ID are required"
        exit 1
    fi

    # Update secrets in deployment
    kubectl create secret generic cluster-agent-secrets \
        --from-literal=USER_ID="${USER_ID}" \
        --from-literal=CLUSTER_ID="${CLUSTER_ID}" \
        --from-literal=KAFKA_USERNAME="" \
        --from-literal=KAFKA_PASSWORD="" \
        --namespace=devopscopilot \
        --dry-run=client -o yaml | kubectl apply -f -

    print_info "Secrets updated"
}

# Deploy to Kubernetes
deploy_to_k8s() {
    print_info "Deploying to Kubernetes..."

    # Apply deployment
    kubectl apply -f k8s/deployment.yaml.tmp

    # Wait for deployment
    print_info "Waiting for deployment to be ready..."
    kubectl wait --for=condition=available --timeout=300s \
        deployment/devopscopilot-cluster-agent \
        -n devopscopilot

    # Clean up temporary file
    rm k8s/deployment.yaml.tmp k8s/deployment.yaml.tmp.bak

    print_info "Deployment successful"
}

# Show status
show_status() {
    print_info "Deployment Status:"
    echo ""
    kubectl get pods -n devopscopilot -l app=devopscopilot-cluster-agent
    echo ""
    print_info "To view logs, run:"
    echo "  kubectl logs -f deployment/devopscopilot-cluster-agent -n devopscopilot"
    echo ""
    print_info "To test the webhook, run:"
    echo "  kubectl port-forward svc/devopscopilot-cluster-agent 8080:8080 -n devopscopilot"
    echo "  curl http://localhost:8080/health"
}

# Main deployment flow
main() {
    echo ""
    print_info "================================================"
    print_info "  DevOps Copilot Cluster Agent Deployment"
    print_info "================================================"
    echo ""

    # Parse arguments
    SKIP_BUILD=false
    SKIP_PUSH=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --skip-push)
                SKIP_PUSH=true
                shift
                ;;
            --registry)
                REGISTRY="$2"
                FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
                shift 2
                ;;
            --tag)
                IMAGE_TAG="$2"
                FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${IMAGE_TAG}"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Usage: $0 [--skip-build] [--skip-push] [--registry REGISTRY] [--tag TAG]"
                exit 1
                ;;
        esac
    done

    check_prerequisites

    if [ "$SKIP_BUILD" = false ]; then
        build_image
    else
        print_warn "Skipping image build"
    fi

    if [ "$SKIP_PUSH" = false ]; then
        push_image
    else
        print_warn "Skipping image push"
    fi

    update_deployment_yaml
    get_mongodb_ids
    deploy_to_k8s
    show_status

    echo ""
    print_info "✅ Deployment completed successfully!"
    echo ""
}

# Run main function
main "$@"
