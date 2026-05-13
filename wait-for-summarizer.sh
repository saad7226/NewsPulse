#!/bin/sh
set -eu

API_URL="${TEST_SUMMARIZER_URL:-http://summarizer:8000/summarize}"

BASE_URL=$(echo "$API_URL" | sed -E 's|(https?://[^/]+).*|\1|')

TIMEOUT="${WAIT_TIMEOUT:-600}"
SLEEP=3
elapsed=0

echo "Waiting for Summarizer at ${BASE_URL}/health → will use ${API_URL}"
while ! curl -sf "${BASE_URL}/health" >/dev/null 2>&1; do
  echo "[$elapsed s] waiting..."
  sleep $SLEEP
  elapsed=$((elapsed + SLEEP))
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "Timed out waiting for Summarizer API"
    exit 1
  fi
done

echo "Summarizer ready! Using endpoint: ${API_URL}"
exec "$@"