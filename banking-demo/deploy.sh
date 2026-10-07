#!/bin/bash
set -e

K3S_NODE="192.168.1.5"
SSH_USER="akshay"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=========================================="
echo "  SecureBank - 3-Tier Banking Demo"
echo "  (OOM Cascade Failure Simulation)"
echo "=========================================="

# Step 1: Build images on K3s node
echo ""
echo "[1/4] Copying source files to K3s node..."
ssh ${SSH_USER}@${K3S_NODE} "mkdir -p ~/banking-demo/{db,backend,frontend,k8s}"
scp -r ${SCRIPT_DIR}/db/* ${SSH_USER}@${K3S_NODE}:~/banking-demo/db/
scp -r ${SCRIPT_DIR}/backend/* ${SSH_USER}@${K3S_NODE}:~/banking-demo/backend/
scp -r ${SCRIPT_DIR}/frontend/* ${SSH_USER}@${K3S_NODE}:~/banking-demo/frontend/

echo ""
echo "[2/4] Building container images on K3s node..."
ssh ${SSH_USER}@${K3S_NODE} << 'REMOTE'
cd ~/banking-demo

# Build backend image
echo "Building bank-backend..."
sudo nerdctl --namespace k8s.io build -t bank-backend:latest ./backend/

# Build frontend image
echo "Building bank-frontend..."
sudo nerdctl --namespace k8s.io build -t bank-frontend:latest ./frontend/

echo "Images built successfully!"
sudo nerdctl --namespace k8s.io images | grep bank-
REMOTE

echo ""
echo "[3/4] Deploying to K3s..."
kubectl apply -f ${SCRIPT_DIR}/k8s/namespace.yaml
kubectl apply -f ${SCRIPT_DIR}/k8s/db.yaml
kubectl apply -f ${SCRIPT_DIR}/k8s/backend.yaml
kubectl apply -f ${SCRIPT_DIR}/k8s/frontend.yaml

echo ""
echo "[4/4] Waiting for pods to be ready..."
kubectl -n banking-demo wait --for=condition=ready pod -l app=bank-db --timeout=60s 2>/dev/null || echo "DB pod not ready yet (expected - low memory)"
kubectl -n banking-demo wait --for=condition=ready pod -l app=bank-backend --timeout=60s 2>/dev/null || echo "Backend pod waiting..."
kubectl -n banking-demo wait --for=condition=ready pod -l app=bank-frontend --timeout=60s 2>/dev/null || echo "Frontend pod waiting..."

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "  Frontend:  http://${K3S_NODE}:30080"
echo "  Backend:   http://${K3S_NODE}:30500"
echo ""
echo "  To trigger OOM cascade:"
echo "    kubectl apply -f ${SCRIPT_DIR}/k8s/oom-trigger-job.yaml"
echo ""
echo "  To watch the cascade:"
echo "    kubectl -n banking-demo get pods -w"
echo ""
echo "  To check OOM events:"
echo "    kubectl -n banking-demo describe pod -l app=bank-db | grep -A5 'Last State'"
echo ""
