#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [[ ! -f .env ]]; then
  echo "Missing .env. Run: cp .env.example .env" >&2
  exit 2
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" != *=* ]]; then
    echo "Invalid .env entry (expected NAME=value)." >&2
    exit 2
  fi
  name="${line%%=*}"
  value="${line#*=}"
  name="${name#${name%%[![:space:]]*}}"
  name="${name%${name##*[![:space:]]}}"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid variable name in .env." >&2
    exit 2
  fi
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  export "$name=$value"
done < .env

required=(LT_USERNAME LT_ACCESS_KEY)
if [[ "${RUN_SUITE:-login}" != "guest" ]]; then
  required+=(JUST_TEST_PHONE JUST_TEST_OTP)
fi
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing+=("$name"); fi
done
if (( ${#missing[@]} )); then
  echo "Missing required variables in .env: ${missing[*]}" >&2
  exit 2
fi

if [[ "${1:-}" == "--validate-env-only" ]]; then
  echo ".env syntax and required variable presence are valid."
  exit 0
fi

shopt -s nullglob
apk_files=("$SCRIPT_DIR"/apk/*.apk)
shopt -u nullglob
if (( ${#apk_files[@]} != 1 )); then
  echo "Place exactly one .apk file in: $SCRIPT_DIR/apk" >&2
  exit 2
fi
export APK_PATH="${apk_files[0]}"
export RUN_PROVIDER=lambdatest

if [[ ! -x node_modules/.bin/wdio ]]; then
  echo "Installing locked npm dependencies..."
  npm ci
fi

apk_hash="$(shasum -a 256 "$APK_PATH" | awk '{print $1}')"
cached_hash="$(sed -n '1p' .runtime/apk.sha256 2>/dev/null || true)"
if [[ -z "${LT_APP_ID:-}" && -s .runtime/lt-app-id && "$cached_hash" == "$apk_hash" ]]; then
  export LT_APP_ID="$(tr -d '\r\n' < .runtime/lt-app-id)"
elif [[ -z "${LT_APP_ID:-}" ]]; then
  echo "Uploading APK to TestMu/LambdaTest Real Device Cloud..."
  node scripts/upload-apk.js --output-file .runtime/lt-app-id
  printf '%s\n' "$apk_hash" > .runtime/apk.sha256
fi

npm run preflight

run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
export RUN_ROOT="$SCRIPT_DIR/artifacts/$run_stamp"
mkdir -p "$RUN_ROOT"

echo "Running the configured real-device matrix..."
set +e
npm run test:cloud
test_status=$?
set -e

report_path="$(node scripts/generate-allure-report.js "$RUN_ROOT")"
echo "Allure report: $report_path"
echo "Per-device CSV results and safe failure evidence: $RUN_ROOT"
exit "$test_status"
