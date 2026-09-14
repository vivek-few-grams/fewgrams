#!/usr/bin/env bash
# Starts DynamoDB Local on :8000 with persistent storage.
#
# -sharedDb is REQUIRED: without it DynamoDB Local creates a separate database
# file per (access-key, region) pair, so tables appear to vanish when either
# changes. This is the single most common local-DynamoDB confusion.
set -euo pipefail

JAVA17="${JAVA17:-/opt/homebrew/opt/openjdk@17/bin/java}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/.dynamodb/bin"
DATA="$ROOT/.dynamodb/data"
PORT="${DDB_PORT:-8000}"

[ -x "$JAVA17" ] || { echo "JRE 17+ not found at $JAVA17 (brew install openjdk@17)" >&2; exit 1; }
[ -f "$BIN/DynamoDBLocal.jar" ] || { echo "DynamoDBLocal.jar missing — run npm run db:setup" >&2; exit 1; }

echo "DynamoDB Local on http://localhost:$PORT  (data: .dynamodb/data)"
cd "$BIN"
exec "$JAVA17" -Djava.library.path=./DynamoDBLocal_lib \
  -jar DynamoDBLocal.jar -sharedDb -dbPath "$DATA" -port "$PORT"
