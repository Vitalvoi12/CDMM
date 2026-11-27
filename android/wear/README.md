# CDMM for Wear OS

The watch app replaces the former Now/Next/Todo list with a focus flow:

- Start the subject of the current planned block, or choose a subject (recently used first).
- See a wall-clock timer, then confirm Finish to save actual time as a separate calendar event.
- Rate concentration with three choices, or skip. The prompt survives process restart.
- Check today's tasks; during a session, show that subject's tasks and unassigned tasks.
- Open the current session from a tile or a watch-face complication. The complication's elapsed time updates through the system.

Pair using the code shown on the watch in CDMM Settings → Phone & watch. This remains a standalone watch app using the same account and server as the phone/web app.

## Server requirement

Deploy the accompanying `server/` changes before using this APK. The new authenticated `POST /api/focus` handles `start`, `finish`, `rate`, and `task`. Database initialization adds `focus_commands` automatically; no existing calendar data is removed. The existing phone/widget APIs remain available.

`GET /api/glance` advertises `focusApiVersion: 1`. With an older server the watch shows an upgrade message and disables session controls. If a server is downgraded while commands are pending, an unknown-route response keeps the outbox for retry after the server is updated.

Each command has a durable idempotency key. Finish uses the session ID as the calendar event ID, preserves a pre-existing event from another device's Finish, and never clears a newer active session. Commands, calendar records, settings and change-log entries commit in one SQLite transaction.

## Offline and sync

Commands are committed to a local outbox before updating the screen, then sent in order. Finish records the time of the tap, rather than the eventual upload time. Queued commands and the rating prompt survive restarts. The tile and complication project pending commands over the cached snapshot.

While the app is visible, it refreshes every 10 seconds during a session or pending upload, and every 20 seconds while idle. WorkManager retries pending uploads when connected and performs periodic background refreshes; background refresh is not immediate.

A second session cannot start until the previous session's start/finish commands are acknowledged. Pending task updates and ratings do not prevent starting a session. Offline starts older than seven days are rejected by the server. If another device changes the session before an offline Start arrives, the watch reports a conflict and archives the rejected commands in its private `focus` preferences (`rejected`); they are not silently applied to another session. There is no in-app recovery editor for that archive yet.

Today's checklist uses the watch's local date. Cached checklists from a previous day are hidden until refreshed. On revoked access, reconnect using the same pairing flow; a different account cannot consume the previous account's outbox.

## Build and install

From `android/`:

```sh
ANDROID_HOME=/opt/android-sdk ./gradlew :wear:assembleDebug :app:compileDebugKotlin :wear:lintDebug
adb -s WATCH_SERIAL install -r wear/build/outputs/apk/debug/wear-debug.apk
```

The package remains `ru.vitalvoi.cdmm`, so installing on the watch replaces the previous watch app. Version 0.2.0 uses versionCode 2. Use the same signing key as the installed version; otherwise Android requires uninstalling it before installing this build. The debug APK is for local installation.

From the repository root, run the server integration tests:

```sh
node --test server/focus.test.mjs
```

Device checks still needed: round-screen layout with large fonts, rotary scrolling, background upload after losing/recovering connectivity, notification permissions, and pairing against the deployed server.
