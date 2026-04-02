# Edge Windows 10 Push Checklist (Dad Device)

Use this when the app shows:
- `push_subscribe_failed`
- `Registration failed - permission denied`

Goal: confirm whether push is blocked by Edge/Windows settings or policy.

## 1) Quick Browser Checks (Edge)

1. Open `edge://settings/content/notifications`
2. Confirm the Care Chat site/origin is under **Allow** (not Block).
3. If it is blocked, remove from Block and add to Allow.

## 2) Policy Checks (Managed Device)

1. Open `edge://policy`
2. Click **Reload policies**.
3. Look for notification-related policy entries, especially:
   - `NotificationsBlockedForUrls`
   - `DefaultNotificationsSetting`
4. If any policy blocks your app origin, ask IT/admin to allow it.

## 3) Windows 10 Notification Checks

1. Open **Settings -> System -> Notifications & actions**
2. Ensure **Get notifications from apps and other senders** is ON.
3. Scroll to app list and ensure **Microsoft Edge** notifications are ON.

## 4) Focus Assist / Battery / Background

1. **Settings -> System -> Focus Assist** -> set to **Off**.
2. **Settings -> System -> Battery** -> ensure Battery saver is OFF during testing.
3. Ensure Edge can run in background (if restricted by enterprise policy, ask IT).

## 5) In-App Permission State Test (Console)

Run this in Dad app DevTools console:

```js
const reg = await navigator.serviceWorker.ready;
await reg.pushManager.permissionState({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(window.APP_CONFIG.PUSH_VAPID_PUBLIC_KEY),
});
```

Expected: `"granted"`.

If result is:
- `"denied"`: push is blocked by browser/OS/policy.
- `"prompt"`: subscription permission not actually granted yet.

## 6) Hard Reset Push Subscription (Console)

Run this in Dad app DevTools console:

```js
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.getSubscription();
if (sub) await sub.unsubscribe();
console.log("Old subscription removed");
```

Then reload the app and trigger a user gesture in the Dad input box (click/focus), then retest.

## 7) Confirm Current App Version

In Dad app settings/diagnostics, verify version is current (for example `.16` or later).

## 8) If Still Failing

Capture and share:
- Notification permission (`Notification.permission`)
- Push permissionState result (from Step 5)
- Any relevant `edge://policy` notification entries
- Latest diagnostics line containing `push_subscribe_failed`

This lets us distinguish:
- code flow issue vs
- browser/OS/policy block with high confidence.

