#!/usr/bin/env bash
# Downloads DynamoDB Local into .dynamodb/bin (idempotent).
# NOTE: AWS's CloudFront "v2.x" path serves the current 3.x build; the "v3.x"
# path returns 403. Regional S3 buckets serve the deprecated 1.x line.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/.dynamodb/bin"
URL="https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz"

[ -f "$BIN/DynamoDBLocal.jar" ] && { echo "already installed"; exit 0; }
mkdir -p "$BIN" "$ROOT/.dynamodb/data"
echo "downloading DynamoDB Local..."
curl -fsSL --max-time 300 "$URL" | tar -xz -C "$BIN"
echo "installed to .dynamodb/bin"
