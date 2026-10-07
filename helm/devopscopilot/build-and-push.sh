#!/usr/bin/env bash
# Build & push the cluster-agent image used by the chart (agent.mode=image).
# Usage:
#   ./build-and-push.sh [REPO] [TAG]
# Examples:
#   ./build-and-push.sh                          # -> ak3hay/devopscopilot-cluster-agent:latest
#   ./build-and-push.sh myrepo/cluster-agent v1  # -> myrepo/cluster-agent:v1
set -euo pipefail

REPO="${1:-ak3hay/devopscopilot-cluster-agent}"
TAG="${2:-latest}"
IMAGE="${REPO}:${TAG}"

# The Dockerfile + source live in ../../cluster-agent relative to this script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT="${SCRIPT_DIR}/../../cluster-agent"

echo "Building ${IMAGE} from ${CONTEXT} ..."
docker build -t "${IMAGE}" "${CONTEXT}"

echo "Pushing ${IMAGE} ..."
docker push "${IMAGE}"

echo "Done. Install with:"
echo "  helm upgrade --install dcp ${SCRIPT_DIR} -n devopscopilot --create-namespace \\"
echo "    --set agent.image.repository=${REPO} --set agent.image.tag=${TAG}"
