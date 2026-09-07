# Just QA Automation — Agent Guide

## Scope

This repository contains Appium 2 and WebdriverIO tests for the Just Android app, with local emulator debugging and TestMu/LambdaTest real-device execution.

Keep this file framework-wide. Do not document individual test classes, scenarios, products, locations, or expected business data here. Those belong in specs, screen objects, fixtures, or focused test documentation.

## Working practices

- Use Node.js 20 or newer and run `npm run verify` after changes.
- Treat this as a production automation suite used by multiple engineers. Never encode one developer's device names, emulator serials, filesystem paths, credentials, or environment-specific values in code or documentation.
- Discover connected devices and configured AVDs at runtime. If neither exists, stop with a clear Android Studio Device Manager setup instruction.
- Keep credentials in ignored runtime configuration such as `.env`; never print, attach, commit, or hardcode them.
- Put scenario intent and assertions in `test/specs/` and selectors/UI mechanics in `src/screens/`.
- Route every UI interaction through `src/safety/guard.js`.
- Keep evidence and reporting independent of screen objects.
- Treat emulator runs as debugging evidence, not cloud acceptance evidence.
- Obtain explicit informed approval before uploading a private APK or artifacts to an external cloud.
- Use Allure for executable reports; do not restore the retired custom HTML report.

## Architecture

```text
test/specs/                  Mocha test classes and assertions
test/unit/                   Offline framework and safety tests
src/screens/                 Screen objects, selectors, waits, UI behavior
src/safety/guard.js          Interaction allowlist and mutation protection
src/evidence/evidence.js     Safe screenshot and hierarchy capture
src/reporting/               Structured result recording
src/config/                  Environment loading and validation
src/provider/                Cloud-provider capabilities
scripts/run-matrix.js        Cloud device orchestration
scripts/preflight.js         Runtime prerequisite validation
scripts/upload-apk.js        APK upload and app-ID cache
scripts/generate-allure-report.js
config/devices.json          Cloud device matrix
config/allure-categories.json
wdio*.conf.js                Suite/provider WDIO configurations
run-local.sh                 Local orchestration and Allure generation
run-cloud.sh                 Cloud preflight, matrix, and Allure generation
```

Do not force suites with different authentication, data, or safety requirements into one configuration. Select explicit specs and dedicated configurations where appropriate.

## Running

Install and verify:

```sh
npm install
npm run verify
```

Use the relevant script in `package.json` or `run-local.sh`. Direct local runs generally require `APK_PATH`, `ADB_DEVICE`, `ANDROID_SDK_ROOT`, `ANDROID_HOME`, `APPIUM_HOME`, `RUN_ROOT`, and `RUN_ARTIFACT_DIR`.

`run-local.sh` first uses an explicitly requested connected `ADB_DEVICE`, then any connected Android device. If none exists, it discovers configured AVDs, selects an unused AVD, assigns a free emulator port, boots it, and waits for both ADB state and `sys.boot_completed=1`. `AVD_NAME` may select a configured AVD without putting its name in source control. Set `EMULATOR_AUTO_START=false` to require a connected device. Startup logs are written under `.runtime/`.

Always isolate artifacts:

```sh
RUN_ROOT="$PWD/artifacts/local-debug" \
RUN_ARTIFACT_DIR="$PWD/artifacts/local-debug/emulator" \
npm run <local-suite-script>
```

Validate cloud configuration without uploading or starting sessions:

```sh
./run-cloud.sh --validate-env-only
```

After explicit external-upload approval, run the chosen suite through `run-cloud.sh`. Use `MATRIX_CONCURRENCY=1` while debugging. The matrix in `config/devices.json` must select the correct WDIO configuration and require only the credentials needed by that suite.

Generate or regenerate Allure:

```sh
node scripts/generate-allure-report.js artifacts/<run-directory>
```

The entry point is `<RUN_ROOT>/allure-report/index.html`.

## Test design

- Prefer runtime observations over hardcoded volatile catalogue/UI data.
- For cross-flow comparisons, capture and normalize the first flow as the baseline for the second.
- Hardcode only stable contract requirements such as prefixes, counts, types, or ordering rules.
- Keep normalization close to the screen object that reads the raw UI.
- Sort elements by on-screen coordinates when visual order matters.
- Use platform keycodes for keyboard actions when WebDriver string input could type literal text.
- Scope selectors to the expected app/package where practical.
- Validate navigation state before continuing so failures cannot cascade into another app or system UI.
- Expect WebView accessibility nodes to combine labels, prices, controls, and metadata.
- Use coordinate taps only when accessibility clicks demonstrably fail, and constrain them to a verified element's bounds.
- Keep mutation allowances narrow and action-specific.

## Allure and evidence

WDIO writes raw data to `<RUN_ROOT>/allure-results`. Capture failure evidence in `afterTest`, before Appium tears down the session.

On approved non-sensitive screens, attach a screenshot to the failed Allure test and retain the hierarchy XML. Evidence must fail closed: for login, OTP, credentials, phone numbers, addresses, profiles, orders, or other sensitive content, attach a text explanation instead. Never weaken redaction to obtain an attachment.

## Fast debugging workflow

1. Run `npm run verify` before starting Appium.
2. Reproduce on one emulator before consuming cloud minutes.
3. Give each attempt a fresh `RUN_ROOT`.
4. Read `results.csv` and fix the earliest causal failure first.
5. Inspect the matching screenshot, hierarchy XML, WDIO log, and Appium log together.
6. Confirm the foreground package after navigation failures.
7. Rerun the complete affected class when tests share state.
8. Generate Allure after execution finishes and confirm the expected tests and attachments exist.

Useful commands:

```sh
adb devices
adb -s <device-id> shell dumpsys window | rg 'mCurrentFocus|mFocusedApp'
rg -n 'Error in|FAILED|invalid element state|no such element' artifacts/<run> -g '*.log'
rg -n '<relevant visible text>' artifacts/<run> -g '*.xml'
tail -n 20 artifacts/<run>/<device>/results.csv
find artifacts/<run>/allure-results -type f | wc -l
```

Use `rg` for fast source/log/XML discovery and `sed` for small relevant regions. Do not print complete hierarchies when they may contain sensitive data.

## Debugging tools

- `npm run verify`: no-device feedback loop.
- `rg` and `sed`: targeted code, log, and hierarchy inspection.
- UIAutomator XML: actual class, text, content description, package, clickability, and bounds.
- Failure screenshots: visible state and wrong-screen diagnosis.
- WDIO/Appium logs: precise failed command, driver, session, and activity evidence.
- `adb`: emulator connectivity and foreground package/activity.
- Fresh artifact roots: prevent stale evidence from misleading diagnosis.
- Allure: status, duration, exception, and failure attachments.
- Screen-recording frame extraction: discover flows supplied as video; keep temporary extraction tools outside the repository.
- Parallel subagents: independently analyze flows, assertions, artifacts, and cloud readiness.

## Delegation history

Bounded subagents used during the current framework work:

- `flow_cases` (Copernicus): recording-to-scenario analysis.
- `search_assertion` (Descartes): dynamic capture, normalization, ordering, and comparison review.
- `testmu_readiness` (Ampere): cloud configuration, environment, and matrix audit.
- `inspect_latest_failures`: read-only screenshot, XML, and log root-cause inspection.

Use subagents for independent investigations rather than overlapping implementation. The primary agent owns repository instructions, integration, verification, and final status.

## Completion

Before reporting a change complete:

- `npm run verify` passes;
- the affected suite was exercised locally when a compatible emulator was available;
- Allure was generated for executed runs;
- approved cloud devices were attempted when cloud acceptance was requested;
- failures have safe screenshots or sensitive-evidence skip attachments;
- local and cloud outcomes are reported separately.
