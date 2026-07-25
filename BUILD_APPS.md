# Building the Apps + Best-in-class Push (Android · Desktop · PWA)

This guide takes the ORM from "web app on Vercel" to **installable Android, Desktop
and PWA apps** with **push notifications that reach devices even when the app is
closed** — including an **emergency alert sound** on a locked/closed phone.

> The app code is push-ready. What only you can run (native tooling + secrets) is
> spelled out below with exact commands.

---

## 0. One-time secrets (Vercel → Settings → Environment Variables → Production)

| Variable | What | Needed for |
|---|---|---|
| `FCM_SERVICE_ACCOUNT` | The **full** Firebase service-account JSON (one line or multiline) | Native Android push |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key | PWA / browser push |
| `VAPID_PRIVATE_KEY` | VAPID private key | PWA / browser push |
| `VAPID_SUBJECT` | `mailto:theatre@unth.edu.ng` (or a URL) | PWA / browser push (optional; has a default) |

Generate the VAPID keypair once:

```bash
npx web-push generate-vapid-keys
```

Paste `publicKey` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `privateKey` → `VAPID_PRIVATE_KEY`.
**Redeploy** after setting env vars (they only apply to new deployments).

Each channel **no-ops safely** until its keys are set, so nothing breaks meanwhile.

---

## 1. PWA (works today once VAPID is set — no build needed)

The site is already an installable PWA (`public/manifest.json`, `public/sw.js`).

1. Set the two `*VAPID*` vars above + redeploy.
2. On a phone/desktop: open the site in Chrome/Edge → **Install app** (or "Add to Home screen").
3. In the app, allow notifications (this saves a `PushSubscription`).
4. Done — `src/lib/webpush.ts` now delivers push to it, and the service worker
   shows the notification **even when the PWA is closed** (desktop needs the
   browser process alive; Android Chrome wakes it via the OS).

---

## 2. Android (Capacitor) — generate → configure → build → sign

All Capacitor deps are already in `package.json`. From the `unth-theatre` folder:

### 2.1 Generate the native project
```bash
npx cap add android
npx cap sync android
```

### 2.2 Firebase config
Copy the existing Firebase Android config into the project:
```
firebase/google-services.json  →  android/app/google-services.json
```
(It must be the SAME Firebase project whose service account you put in
`FCM_SERVICE_ACCOUNT`. Package name must be `ng.edu.unth.orm`.)

### 2.3 Emergency alert SOUND on a CLOSED phone (this is the "voice when closed")
A closed Android phone can't run in-app text-to-speech, but it **can** play a
**recorded clip as the notification sound**. Wire it up once:

1. Copy an alert/voice clip into the app's raw resources:
   ```
   public/audio/emergency-alert.wav  →  android/app/src/main/res/raw/emergency.wav
   ```
   (Use any short recorded voice/siren `.wav`/`.mp3`; the file **name** must be
   `emergency` — the server already sends `sound: "emergency"` for emergencies.)

2. Create the high-importance `orm_alerts` channel with that sound. In
   `android/app/src/main/java/ng/edu/unth/orm/MainActivity.java` add, inside
   `onCreate` (after `super.onCreate`):
   ```java
   if (android.os.Build.VERSION.SDK_INT >= 26) {
     android.media.AudioAttributes attrs = new android.media.AudioAttributes.Builder()
       .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_EVENT)
       .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
     android.net.Uri sound = android.net.Uri.parse(
       "android.resource://" + getPackageName() + "/raw/emergency");
     android.app.NotificationChannel ch = new android.app.NotificationChannel(
       "orm_alerts", "Theatre Alerts", android.app.NotificationManager.IMPORTANCE_HIGH);
     ch.setSound(sound, attrs);
     ch.enableVibration(true);
     ch.setBypassDnd(true); // break through Do-Not-Disturb for emergencies
     ((android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE))
       .createNotificationChannel(ch);
   }
   ```

### 2.4 Build & run
```bash
npx cap open android          # opens Android Studio
```
In Android Studio: let Gradle sync → **Run** on a device, or **Build → Generate
Signed Bundle/APK** (create a keystore the first time) for distribution.

### 2.5 First launch
Open the app once with internet, allow notifications → it registers an FCM
`DeviceToken`. From then on, emergency pushes ring the phone (with the emergency
sound) even when closed/locked.

---

## 3. Desktop (Electron) — build installers

Everything is ready in `desktop/`. From the `desktop` folder:

```bash
cd desktop
npm install
npm run dist:win     # NSIS installer (.exe)   — or dist:mac / dist:linux
```

Notes:
- It's a thin viewer of the live site, so it always runs the latest deploy.
- Auto-update is wired to GitHub Releases (`astrobsm/unth-theatre`) — publishing a
  new release (`electron-builder --publish always`, with `GH_TOKEN`) makes
  installed desktops self-update.
- **Push caveat:** Electron has no background push service, so desktop push/voice
  only fire while the window is open (the in-app Theatre Radio speaks alerts
  aloud then). For always-on theatre displays, keep an Electron/PWA window open on
  the emergency board — that gives you full spoken announcements.

---

## 4. What "push when closed" gives you, per platform

| Platform | App CLOSED → notification (sound+vibrate) | App CLOSED → spoken voice (TTS) |
|---|---|---|
| **Android (native APK)** | ✅ (with emergency clip as the channel sound, §2.3) | Clip plays as the sound; live TTS needs a foreground service (§5) |
| **PWA (Android Chrome / desktop browser)** | ✅ notification + default sound | ❌ (SW can't run TTS) |
| **Desktop (Electron)** | Only while a window is open | Only while a window is open (in-app radio speaks) |

The full **spoken voice announcements** (ElevenLabs/TTS, repeated until
acknowledged) are the in-app Theatre Radio — designed for **open display screens**
(`/emergency-display`, announcement boards). Keep one open per theatre.

---

## 5. (Optional, advanced) Live spoken TTS on a CLOSED Android phone

To literally have a closed phone *speak* the alert text (not just a fixed clip),
add a small native service that runs Android `TextToSpeech` when a **data**
FCM message arrives. Sketch:

- Add a `FirebaseMessagingService` subclass; on `onMessageReceived`, if
  `data.kind == "emergency_booking"`, start a foreground service that calls
  `new TextToSpeech(ctx, …).speak(data.body, QUEUE_FLUSH, …)`.
- Send emergencies as **data-only** messages (so the OS hands them to your
  service even in the background). The server helper (`src/lib/fcm.ts`) can add a
  `data`-only variant for this.

This is native Java/Kotlin work in the generated `android/` project and needs a
device to test; the clip-as-sound approach in §2.3 covers most needs without it.

---

## 6. Verify checklist

- [ ] `FCM_SERVICE_ACCOUNT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` set in Vercel + redeployed
- [ ] `POST /api/push-test` sends without a "not configured / invalid JSON" error
- [ ] PWA installed + notifications allowed → a `PushSubscription` row exists
- [ ] Android APK built with `google-services.json` + `orm_alerts` channel + `emergency.wav`
- [ ] A real device registered a `DeviceToken`
- [ ] Book a test emergency → closed phone rings with the emergency sound
