# Raymiyo Field for Android

The Android app the field team installs on the office phones. It opens
`https://field.raymiyo.com` inside a real app (built with Capacitor) and adds one
thing a website cannot do: **live location all day**, between Start day and End day,
even with the screen off. Android shows a permanent notification while that runs.

iPhones keep using the website (Share → Add to Home Screen).

## How a new app file is made

GitHub builds it. Nothing needs installing on a computer.

1. Change something in this folder and push, or open GitHub → **Actions** →
   **Field Android app** → **Run workflow**.
2. A few minutes later the signed file appears under **Releases** as
   `Raymiyo-Field.apk`. This link always gives the newest one:
   `https://github.com/sthams-ops/raymiyo-tools/releases/latest/download/Raymiyo-Field.apk`
3. Send the file to the phone (WhatsApp works) and open it. It installs over the old app.

Most changes never need a new file: the screens come from the website, so
updating the website updates the app. A new file is only needed when something
in this folder changes (icon, name, permissions, tracking plugin).

## Signing key (important)

`signing/field-release.p12` is the key that proves an update comes from us.
Its password is **not** in the code. It lives in the GitHub secret
`FIELD_KEYSTORE_PASSWORD` (repo → Settings → Secrets and variables → Actions).
Keep a copy of the password somewhere safe: if it is lost, phones must
uninstall the app before a newly signed one will install.

## What is where

```
capacitor.config.json   app name, id, and the website it opens
www/                    "No internet" page shown when the site cannot load
android/                the Android project (icon, permissions, signing)
scripts/make-icons.py   redraws the icon and splash screen
signing/                the password-protected signing key
```

The tracking code itself is in the website: `field/src/tracking.js` (phone side)
and `field/lib/track.js` + `field/api/track.js` (server side).

## Chat notifications (Firebase)

New chat messages ring the phone even when the app is closed, through
Firebase Cloud Messaging (free). Firebase project: **raymiyo-field**
(console.firebase.google.com, Mijesh's Google account).

- `android/app/google-services.json` tells the app which Firebase project to use.
  It holds no secret; Google designed it to ship inside the app.
- The server sends the messages with the service account key in the Railway
  variable `FIREBASE_SERVICE_ACCOUNT`. That key **is** secret and is never in the code.
- `res/raw/chat_ding.wav` is the message sound, `res/drawable/ic_stat_chat.xml`
  the status bar icon. The "Chat messages" channel is made in `MainActivity.java`.

## Settings each phone needs once

- Allow installing from the app used to open the file (WhatsApp, Files, Chrome).
- Location permission: **Allow** / **While using the app**, with **Precise** on.
- Notifications: **Allow** (the "tracking is on" notice and chat messages).
- Battery: set the app to **Unrestricted** so the phone does not stop tracking.
- Do not swipe the app away from recent apps during the day; that stops tracking.
