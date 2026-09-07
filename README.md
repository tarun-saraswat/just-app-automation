# Just production read-only Android sanity

This is a cloud-first Appium 2 + WebdriverIO suite for the Just production Android app. Acceptance runs are intentionally restricted to TestMu/LambdaTest Android Real Device Cloud. No test adds items, changes an address or profile, modifies an order, contacts support/delivery, or enters checkout/payment.

## Safety model

Every tap and text/keyboard interaction goes through `src/safety/guard.js`. An action must be explicitly allowlisted, and the resolved element text/accessibility label is checked again against mutation terms before clicking. Unknown actions and suspicious CTAs fail before interaction. Product Add/Buy/View Cart/quantity controls are never selected.

Evidence is disabled for login, OTP, profile, address, and order-detail screens. On approved screens, hierarchy is scanned before either XML or screenshot is written. Runtime secrets, phone-like values, OTP-like values, and address-like text cause evidence collection to fail closed. Reports redact runtime secrets and contain only non-sensitive product/category observations.

## Prerequisites

- Node.js 20+
- TestMu/LambdaTest App Automation and Real Device Cloud access
- Three available Android real-device combinations
- APK upload permission when `LT_APP_ID` is not already supplied
- Runtime-only `LT_USERNAME`, `LT_ACCESS_KEY`, `JUST_TEST_PHONE`, and `JUST_TEST_OTP`
- Either an `lt://APP…` value in `LT_APP_ID`, or the supplied APK available through `APK_PATH`

Install dependencies:

```sh
npm install
```

## One-command run

1. Put exactly one APK in `apk/`.
2. Populate the ignored `.env` with `LT_USERNAME`, `LT_ACCESS_KEY`, `JUST_TEST_PHONE`, and `JUST_TEST_OTP`. `LT_APP_ID` may stay empty.
3. Run:

```sh
./run-cloud.sh
```

To validate `.env` without uploading an APK or starting cloud sessions:

```sh
./run-cloud.sh --validate-env-only
```

The script installs locked dependencies when needed, uploads the APK if `LT_APP_ID` is empty, validates configuration, runs the configured TestMu/LambdaTest real-device matrix, and creates `artifacts/<run timestamp>/allure-report/index.html`. Each device directory also contains CSV results, WebdriverIO logs, cloud-session links, and safe failure evidence.

Failure screenshots are fail-closed: login/OTP/policy/address/profile/order screens and any hierarchy containing credentials or sensitive patterns get a `screenshot-skipped.txt` safety record instead of an image.

Copy `.env.example` to `.env` if desired. `.env` is ignored. Prefer exporting secrets in the process environment or a CI secret store. The suite never prints their values.

## Upload the production APK

If an app ID is not already available:

```sh
export APK_PATH='/absolute/path/to/app.apk'
export LT_USERNAME='runtime-only'
export LT_ACCESS_KEY='runtime-only'
npm run upload:apk
```

The helper writes only the returned `lt://APP…` identifier to stdout. Capture it into a runtime variable without committing it:

```sh
export LT_APP_ID="$(npm run --silent upload:apk)"
```

To avoid printing the app ID, save it in the ignored, permission-restricted runtime cache. Preflight, WDIO, and the matrix runner load this automatically when `LT_APP_ID` is otherwise empty:

```sh
node scripts/upload-apk.js --output-file .runtime/lt-app-id
```

The helper uses LambdaTest's real-device upload endpoint and emits secret-safe HTTP errors. Do not enable shell tracing (`set -x`) around credentials.

## Configuration and preflight

Required for a real run:

```sh
export RUN_PROVIDER=lambdatest
export LT_USERNAME='runtime-only'
export LT_ACCESS_KEY='runtime-only'
export LT_APP_ID='lt://APP…'
export JUST_TEST_PHONE='runtime-only'
export JUST_TEST_OTP='runtime-only'
npm run preflight
```

Optional controls are `DEVICE_NAME`, `ANDROID_VERSION`, `LT_TUNNEL_ENABLED`, `LT_TUNNEL_NAME`, `SEARCH_TOP_N`, `LT_BUILD_NAME`, `WDIO_LOG_LEVEL`, and `MATRIX_CONCURRENCY`. Tunnel defaults to false because production endpoints should not require internal routing.

Preflight validates prerequisites without starting a session. Its output reports secrets only as `[configured]` or `[missing]`.

## Real-device matrix

The default `config/devices.json` uses Samsung phones from three generations verified against the account's AP-region inventory: Galaxy S26 Ultra/Android 16 (new), Galaxy S23 Ultra/Android 13 (mid), and Galaxy S10/Android 11 (oldest available phone). Device inventory changes over time; run `node scripts/list-samsung-devices.js` to inspect current Samsung capability pairs. An unavailable real device is a failure, and the runner never substitutes an emulator or simulator.

Sequential (default):

```sh
MATRIX_CONCURRENCY=1 npm run test:cloud
```

Parallel, subject to account concurrency:

```sh
MATRIX_CONCURRENCY=3 npm run test:cloud
```

One explicitly selected real device:

```sh
DEVICE_NAME='Samsung Galaxy S22 5G' ANDROID_VERSION=14 npm run test:cloud:one
```

Local-emulator execution is deliberately not wired into the acceptance config. A separate local debug adapter can be added later, but it must not be used to claim acceptance.

## Current executable coverage

- First-login screen: Just icon, Account heading, login-purpose text, login CTA, and complete consent copy
- Terms of Service link: opens an in-app policy WebView and validates its title and substantive legal content
- Privacy Policy link: opens an in-app policy WebView and validates its title and privacy/consent content
- Phone form: heading, login/signup copy, phone input, Get OTP, consent copy, and Close control
- OTP form: runtime-only OTP entry and successful transition away from OTP to home or a post-login permission prompt

Only these login/policy tests are selected by the current WDIO spec. Screen objects and fixtures for broader read-only sanity coverage remain scaffolded for later phases but are not executed in this phase.

The supplied APK currently opens an Android 16 compatibility notice on the local emulator because multiple native libraries are not 16 KB page-size aligned. This is a build/device compatibility diagnostic, not a test bypass and not a LambdaTest acceptance result.

## Optional local login discovery

The local helper is for emulator selector discovery only. It reads credentials from runtime variables, sends them to ADB without printing them, redacts hierarchy output, and removes temporary device XML. It must never be used as acceptance evidence.

```sh
node scripts/local-login-debug.js phone
node scripts/local-login-debug.js otp
npm run debug:login:inspect
```

The helper stops at post-login permission prompts; it does not grant location or notification access.

To run the complete login/policy WDIO spec on the already-running emulator and create an Allure report:

```sh
./run-local.sh
```

The runner discovers a connected Android device automatically. If none is connected, it discovers configured AVDs and starts an unused one. A specific runtime device may be selected when needed:

```sh
ADB_DEVICE='<adb-device-id>' ./run-local.sh
```

The self-contained report is written to `artifacts/local-<timestamp>/allure-report/index.html`. Local results are explicitly labeled as debug-only and do not count as TestMu/LambdaTest acceptance.

## Future fixtures

Maintain non-sensitive inputs in `fixtures/*.csv`. Leave expected values blank when they cannot be safely stored. Never put a phone number, OTP, complete address, order identifier, cloud credential, or other personal data in fixtures.

## Artifacts and results

Each matrix entry gets an isolated `artifacts/<timestamp>/<device>/` directory containing:

- `results.csv` with scenario, Android version, provider, device, expected/observed result, outcome, duration, and session link
- `search-observations.csv` with safe product names and ranks
- approved screenshots/UI XML only on non-sensitive screens
- WebdriverIO/Appium client logs

Each test is included in the Allure report. When a test fails, a screenshot is attached while the Appium session is still active. On a sensitive screen, the existing fail-closed policy attaches a text explanation instead of capturing an image.

The session link opens the LambdaTest automation log page, where provider-hosted video, device/Appium logs, network logs, and other enabled artifacts are available. `matrix-summary.json` records each device exit status and local artifact directory. All generated artifact directories are ignored by git.

## Offline verification

```sh
npm run verify
```

This tests fail-closed safety behavior, redaction, CSV handling, and the three-device matrix, then runs lint. It does not create a device session or touch the production app.

## Troubleshooting an unexpected-error screen

The home assertion fails immediately on known error-state text. Use the LambdaTest session link to correlate provider device/Appium/network logs and video. Compare failures across all three real devices to distinguish a device/OS compatibility issue from networking, production configuration, or APK validity. Do not bypass security controls or use a mutating CTA to advance the test.
