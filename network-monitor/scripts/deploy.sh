#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
IMAGE_NAME="${IMAGE_NAME:-network-monitor}"
TAG="${TAG:-latest}"
NAMESPACE="network-monitor"

echo -e "${YELLOW}Deploying Network Monitor...${NC}"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}kubectl not found${NC}"
    exit 1
fi

# Build Docker image
build_image() {
    echo -e "${YELLOW}Building Docker image...${NC}"
    docker build -t ${IMAGE_NAME}:${TAG} .

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Docker build successful${NC}"
    else
        echo -e "${RED}Docker build failed${NC}"
        exit 1
    fi
}

# Push image
push_image() {
    if [ "$SKIP_PUSH" != "true" ]; then
        echo -e "${YELLOW}Pushing image to ${REGISTRY}...${NC}"
        docker tag ${IMAGE_NAME}:${TAG} ${REGISTRY}/${IMAGE_NAME}:${TAG}
        docker push ${REGISTRY}/${IMAGE_NAME}:${TAG}

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}Image pushed successfully${NC}"
        else
            echo -e "${RED}Image push failed${NC}"
            exit 1
        fi
    fi
}

# Deploy to Kubernetes
deploy_k8s() {
    echo -e "${YELLOW}Deploying to Kubernetes...${NC}"

    # Create namespace
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

    # Deploy dependencies (optional)
    if [ "$DEPLOY_DEPS" == "true" ]; then
        echo -e "${YELLOW}Deploying dependencies...${NC}"
        kubectl apply -f deployments/kafka-example.yaml
        kubectl apply -f deployments/neo4j-example.yaml

        echo -e "${YELLOW}Waiting for dependencies to be ready...${NC}"
        kubectl wait --for=condition=ready pod -l app=kafka -n default --timeout=300s || true
        kubectl wait --for=condition=ready pod -l app=neo4j -n default --timeout=300s || true
    fi

    # Update image in daemonset
    if [ "$SKIP_PUSH" != "true" ]; then
        sed -i.bak "s|image: network-monitor:latest|image: ${REGISTRY}/${IMAGE_NAME}:${TAG}|g" deployments/daemonset.yaml
    fi

    # Deploy daemonset
    kubectl apply -f deployments/daemonset.yaml

    if [ "$SKIP_PUSH" != "true" ]; then
        # Restore original daemonset.yaml
        mv deployments/daemonset.yaml.bak deployments/daemonset.yaml
    fi

    echo -e "${GREEN}Deployment successful${NC}"
}

# Check deployment status
check_status() {
    echo -e "${YELLOW}Checking deployment status...${NC}"

    kubectl get daemonset -n ${NAMESPACE}
    kubectl get pods -n ${NAMESPACE}

    echo -e "${YELLOW}Waiting for pods to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=network-monitor -n ${NAMESPACE} --timeout=120s || true

    echo -e "${GREEN}Status check complete${NC}"
}

# Show logs
show_logs() {
    if [ "$SHOW_LOGS" == "true" ]; then
        echo -e "${YELLOW}Showing logs...${NC}"
        kubectl logs -n ${NAMESPACE} -l app=network-monitor -f --tail=50
    fi
}

# Main
main() {
    cd "$(dirname "$0")/.."

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD="true"
                shift
                ;;
            --skip-push)
                SKIP_PUSH="true"
                shift
                ;;
            --deploy-deps)
                DEPLOY_DEPS="true"
                shift
                ;;
            --logs)
                SHOW_LOGS="true"
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ "$SKIP_BUILD" != "true" ]; then
        build_image
        push_image
    fi

    deploy_k8s
    check_status
    show_logs
}

main "$@"
