#!/usr/bin/env bash
#
# deploy-kind.sh — spin up a real, self-hosted Kubernetes cluster (kind) and
# deploy the entire Brank stack with one command. Useful for demoing the
# "Deploy on self-hosted k8s" bonus locally without a cloud bill.
#
# Prerequisites: docker, kind, kubectl, helm, and the built `brank:latest` image.
#
# Usage:
#   OPENAI_API_KEY=sk-... ./scripts/deploy-kind.sh
#
set -euo pipefail

CLUSTER_NAME="brank"
RELEASE_NAME="brank"
NAMESPACE="brank"
HOST="brank.local"

if ! command -v kind >/dev/null || ! command -v helm >/dev/null || ! command -v kubectl >/dev/null; then
  echo "Error: kind, helm, and kubectl are required." >&2
  exit 1
fi

echo "==> Ensuring kind cluster '$CLUSTER_NAME' exists"
if ! kind get clusters | grep -qx "$CLUSTER_NAME"; then
  kind create cluster --name "$CLUSTER_NAME"
fi

echo "==> Loading local image into kind"
docker build -t brank:latest . >/dev/null
kind load docker-image brank:latest --name "$CLUSTER_NAME"

echo "==> Installing nginx ingress controller"
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml >/dev/null
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "==> Deploying Brank via Helm"
helm upgrade --install "$RELEASE_NAME" ./helm/brank \
  --namespace "$NAMESPACE" --create-namespace \
  --set image.tag=latest \
  --set secrets.DATABASE_URL="postgresql://brank:brank@${RELEASE_NAME}-postgres:5432/brank" \
  --set secrets.RABBITMQ_URL="amqp://brank:brank@${RELEASE_NAME}-rabbitmq:5672" \
  --set secrets.REDIS_URL="redis://${RELEASE_NAME}-redis:6379" \
  --set secrets.OPENAI_API_KEY="${OPENAI_API_KEY:-sk-placeholder}" \
  --wait --timeout 180s

echo "==> Waiting for migration job"
kubectl wait --for=condition=complete "job/${RELEASE_NAME}-db-migrate" \
  --namespace "$NAMESPACE" --timeout=120s

echo "==> Add this to /etc/hosts to reach the app:"
echo "    127.0.0.1  $HOST"
echo "    Then open http://$HOST"
echo
echo "==> Pods:"
kubectl get pods --namespace "$NAMESPACE"
