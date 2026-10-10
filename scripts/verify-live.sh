#!/usr/bin/env bash
# Usage: verify-live.sh <url> <path to the built index.html>
# Succeeds once <url> serves this exact build with the expected security headers.
set -euo pipefail
url="${1:?deployment URL required}"
index="${2:?built index.html required}"
script=$(grep -o 'src="/assets/[^"]*\.js"' "$index" | head -1 | sed 's/src="//; s/"$//')
test -n "$script" || { echo "No script tag found in $index"; exit 1; }
echo "Waiting for $url to serve $script"

attempts="${VERIFY_ATTEMPTS:-36}"; delay="${VERIFY_DELAY:-5}"
for attempt in $(seq 1 "$attempts"); do
  headers=$(curl -sS -D - -o /tmp/live.html "$url" 2>/dev/null || true)
  status=$(printf '%s' "$headers" | head -1 | awk '{print $2}')
  if [ "$status" = "200" ] && grep -q "$script" /tmp/live.html; then
    printf '%s\n' "$headers"
    printf '%s' "$headers" | grep -qi "content-security-policy:.*connect-src 'none'" || { echo "FAIL: CSP missing or weakened"; exit 1; }
    printf '%s' "$headers" | grep -qi "x-frame-options: DENY" || { echo "FAIL: X-Frame-Options is not DENY"; exit 1; }
    printf '%s' "$headers" | grep -qi "x-content-type-options: nosniff" || { echo "FAIL: nosniff missing"; exit 1; }
    echo "OK: the live site serves this build with the security headers (attempt $attempt)."
    exit 0
  fi
  echo "Attempt $attempt: HTTP ${status:-none}, new build not live yet; waiting ${delay} s"
  sleep "$delay"
done
echo "FAIL: $url did not serve this build within $((attempts * delay)) seconds."
exit 1
