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
  [[ "$line" == *=* ]] || { echo "Invalid .env entry (expected NAME=value)." >&2; exit 2; }
  name="${line%%=*}"
  value="${line#*=}"
  name="${name#${name%%[![:space:]]*}}"
  name="${name%${name##*[![:space:]]}}"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "Invalid variable name in .env." >&2; exit 2; }
  if [[ ${#value} -ge 2 ]] && { [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] || [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; }; then
    value="${value:1:${#value}-2}"
  fi
  export "$name=$value"
done < .env

run_suite="${RUN_SUITE:-login}"
if [[ "$run_suite" != "guest" && "$run_suite" != "guest-issues" ]]; then
  missing=()
  for name in JUST_TEST_PHONE JUST_TEST_OTP; do
    [[ -n "${!name:-}" ]] || missing+=("$name")
  done
  if (( ${#missing[@]} )); then
    echo "Missing required variables in .env: ${missing[*]}" >&2
    exit 2
  fi
fi

shopt -s nullglob
apk_files=("$SCRIPT_DIR"/apk/*.apk)
shopt -u nullglob
if (( ${#apk_files[@]} != 1 )); then
  echo "Place exactly one .apk file in: $SCRIPT_DIR/apk" >&2
  exit 2
fi
export APK_PATH="${apk_files[0]}"

if [[ -z "${ANDROID_SDK_ROOT:-}" && -z "${ANDROID_HOME:-}" ]]; then
  sdk_candidate="$HOME/Library/Android/sdk"
  if [[ -d "$sdk_candidate/platform-tools" ]]; then
    export ANDROID_SDK_ROOT="$sdk_candidate"
    export ANDROID_HOME="$sdk_candidate"
  else
    echo "Android SDK not found. Export ANDROID_SDK_ROOT before running." >&2
    exit 2
  fi
elif [[ -z "${ANDROID_SDK_ROOT:-}" ]]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
elif [[ -z "${ANDROID_HOME:-}" ]]; then
  export ANDROID_HOME="$ANDROID_SDK_ROOT"
fi

adb_bin="$(command -v adb 2>/dev/null || true)"
[[ -n "$adb_bin" ]] || adb_bin="$ANDROID_SDK_ROOT/platform-tools/adb"
emulator_bin="$ANDROID_SDK_ROOT/emulator/emulator"
if [[ ! -x "$adb_bin" ]]; then
  echo "Android adb was not found in PATH or under $ANDROID_SDK_ROOT." >&2
  exit 2
fi

requested_device="${ADB_DEVICE:-}"
if [[ -n "$requested_device" && "$($adb_bin -s "$requested_device" get-state 2>/dev/null || true)" == "device" ]]; then
  export ADB_DEVICE="$requested_device"
elif [[ -z "$requested_device" ]]; then
  connected_device="$($adb_bin devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')"
  [[ -z "$connected_device" ]] || export ADB_DEVICE="$connected_device"
fi

if [[ -z "${ADB_DEVICE:-}" || "$($adb_bin -s "$ADB_DEVICE" get-state 2>/dev/null || true)" != "device" ]]; then
  if [[ "${EMULATOR_AUTO_START:-true}" != "true" ]]; then
    echo "No requested or connected Android device is available and EMULATOR_AUTO_START is disabled." >&2
    exit 2
  fi
  if [[ ! -x "$emulator_bin" ]]; then
    echo "Android emulator was not found under $ANDROID_SDK_ROOT." >&2
    exit 2
  fi
  if [[ -n "$requested_device" ]]; then
    if [[ ! "$requested_device" =~ ^emulator-([0-9]+)$ ]]; then
      echo "Requested physical device '$requested_device' is not connected. Check: adb devices" >&2
      exit 2
    fi
    emulator_port="${BASH_REMATCH[1]}"
    export ADB_DEVICE="$requested_device"
  else
    emulator_port=""
    for candidate_port in $(seq 5554 2 5682); do
      if ! "$adb_bin" devices | awk 'NR > 1 { print $1 }' | grep -qx "emulator-$candidate_port"; then
        emulator_port="$candidate_port"
        break
      fi
    done
    if [[ -z "$emulator_port" ]]; then
      echo "No free Android emulator port is available." >&2
      exit 2
    fi
    export ADB_DEVICE="emulator-$emulator_port"
  fi
  mapfile_command_available=false
  if builtin help mapfile >/dev/null 2>&1; then mapfile_command_available=true; fi
  if [[ "$mapfile_command_available" == true ]]; then
    mapfile -t available_avds < <("$emulator_bin" -list-avds)
  else
    available_avds=()
    while IFS= read -r avd; do [[ -n "$avd" ]] && available_avds+=("$avd"); done < <("$emulator_bin" -list-avds)
  fi
  if (( ${#available_avds[@]} == 0 )); then
    echo "No Android device is connected and no Android Virtual Device is configured. Create an AVD in Android Studio Device Manager." >&2
    exit 2
  fi
  # macOS ships Bash 3, where expanding an empty array under `set -u` raises
  # "unbound variable". Keep one harmless empty sentinel for portability.
  running_avds=("")
  while IFS= read -r serial; do
    [[ "$serial" =~ ^emulator- ]] || continue
    running_name="$($adb_bin -s "$serial" emu avd name 2>/dev/null | sed -n '1p' | tr -d '\r')"
    [[ -n "$running_name" ]] && running_avds+=("$running_name")
  done < <("$adb_bin" devices | awk 'NR > 1 && $2 == "device" { print $1 }')
  if [[ -n "${AVD_NAME:-}" ]]; then
    avd_name="$AVD_NAME"
  else
    avd_name=""
    for candidate in "${available_avds[@]}"; do
      candidate_running=false
      for running_name in "${running_avds[@]}"; do [[ "$running_name" == "$candidate" ]] && candidate_running=true; done
      if [[ "$candidate_running" != true ]]; then avd_name="$candidate"; break; fi
    done
    if [[ -z "$avd_name" ]]; then
      echo "All configured AVDs are already running. Set AVD_NAME explicitly or choose a connected ADB_DEVICE." >&2
      exit 2
    fi
  fi
  avd_found=false
  for avd in "${available_avds[@]}"; do [[ "$avd" == "$avd_name" ]] && avd_found=true; done
  if [[ "$avd_found" != true ]]; then
    echo "AVD '$avd_name' does not exist. Available AVDs: ${available_avds[*]}" >&2
    exit 2
  fi
  mkdir -p "$SCRIPT_DIR/.runtime"
  emulator_log="$SCRIPT_DIR/.runtime/emulator-$emulator_port.log"
  echo "Starting AVD $avd_name as $ADB_DEVICE..."
  "$emulator_bin" -avd "$avd_name" -port "$emulator_port" -no-snapshot-save >"$emulator_log" 2>&1 &
  emulator_pid=$!
  boot_deadline=$((SECONDS + ${EMULATOR_BOOT_TIMEOUT_SECONDS:-240}))
  while (( SECONDS < boot_deadline )); do
    state="$($adb_bin -s "$ADB_DEVICE" get-state 2>/dev/null || true)"
    booted="$($adb_bin -s "$ADB_DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$state" == "device" && "$booted" == "1" ]]; then break; fi
    if ! kill -0 "$emulator_pid" 2>/dev/null; then
      echo "Emulator exited before boot completed. See $emulator_log" >&2
      exit 2
    fi
    sleep 2
  done
  if [[ "$($adb_bin -s "$ADB_DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" != "1" ]]; then
    echo "Emulator did not finish booting in time. See $emulator_log" >&2
    exit 2
  fi
  "$adb_bin" -s "$ADB_DEVICE" shell input keyevent 82 >/dev/null 2>&1 || true
  echo "Emulator $ADB_DEVICE is ready."
fi

if [[ ! -x node_modules/.bin/wdio || ! -x node_modules/.bin/appium ]]; then
  echo "Installing locked npm dependencies..."
  npm ci
fi

export APPIUM_HOME="$SCRIPT_DIR/.appium"
mkdir -p "$APPIUM_HOME"
installed_drivers="$(node_modules/.bin/appium driver list --installed 2>&1 || true)"
driver_registry="$APPIUM_HOME/node_modules/.cache/appium/extensions.yaml"
expected_driver_path="$APPIUM_HOME/node_modules/appium-uiautomator2-driver"
driver_registration_valid=false
if [[ "$installed_drivers" == *uiautomator2* \
  && -f "$expected_driver_path/package.json" \
  && -f "$driver_registry" \
  && "$(sed -n '/^[[:space:]]*installPath:/p' "$driver_registry")" == *"$expected_driver_path"* ]]; then
  driver_registration_valid=true
fi
if [[ "$driver_registration_valid" != true ]]; then
  if [[ "$installed_drivers" == *uiautomator2* ]]; then
    echo "Repairing the UiAutomator2 driver registration in the local Appium home..."
    node_modules/.bin/appium driver uninstall uiautomator2
  fi
  echo "Installing the UiAutomator2 driver in the local Appium home..."
  node_modules/.bin/appium driver install uiautomator2
fi

export RUN_PROVIDER=local
export DEVICE_NAME="$($adb_bin -s "$ADB_DEVICE" shell getprop ro.product.model | tr -d '\r')"
export ANDROID_VERSION="$($adb_bin -s "$ADB_DEVICE" shell getprop ro.build.version.release | tr -d '\r')"
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
export RUN_ROOT="$SCRIPT_DIR/artifacts/local-$run_stamp"
export RUN_ARTIFACT_DIR="$RUN_ROOT/emulator"
mkdir -p "$RUN_ARTIFACT_DIR"

case "$run_suite" in
  login) test_script="test:local" ;;
  guest) test_script="test:local:guest" ;;
  guest-issues) test_script="test:local:guest:issues" ;;
  *)
    echo "Unsupported RUN_SUITE=$run_suite. Use login, guest, or guest-issues." >&2
    exit 2
    ;;
esac
echo "Running local-emulator $run_suite tests (debug only; not acceptance)..."
set +e
if [[ -n "${TEST_GREP:-}" ]]; then
  echo "Filtering tests with TEST_GREP=$TEST_GREP"
  npm run "$test_script" -- --mochaOpts.grep "$TEST_GREP"
else
  npm run "$test_script"
fi
test_status=$?
set -e

report_path="$(node scripts/generate-allure-report.js "$RUN_ROOT")"
echo "Local debug Allure report: $report_path"
exit "$test_status"
