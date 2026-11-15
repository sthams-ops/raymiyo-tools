# Raymiyo Field

GPS check-in app for the Kathmandu direct sales team.

- **Field users** start their day, check in at each shop (the phone's GPS is saved), record what happened, and see the race.
- **Admin** sees everyone on a live map, corrects or deletes check-ins, manages shops, team, points rules, and downloads PDF or Excel (CSV) reports.
- **Admin, view only** sees everything the admin sees and can change nothing.
- **Office TV** shows the map and leaderboard at `/tv?key=...` with no sign-in.

React + Vite, a small Node server (`server.mjs`), Redis for storage, Zoho sign-in. Runs on Railway (current plan) or Vercel.
Map: MapLibre with OpenFreeMap tiles (open source, no key, no bill). Icons: Lucide. PDF: jsPDF.

## Install on a phone (no App Store or Play Store)

The app installs straight from its web address and then opens full screen with its own icon.

- **Android (Chrome):** open the address, tap **Install app** at the top of the screen, or the three dots menu → **Add to Home screen**.
- **iPhone (Safari):** open the address, tap the **Share** button → **Add to Home Screen** → **Add**.

Updates arrive by themselves; nobody has to reinstall. Files: `public/manifest.webmanifest`, `public/sw.js` and the icons in `public/`.

## Things the admin changes inside the app (no code)

| What | Where |
| --- | --- |
| Add or remove people, change roles, map colour | Team tab |
| Points for a visit, new shop, first order, repeat order | Settings tab |
| How far from a shop a check-in can be before it is flagged | Settings tab |
| Competitor brand list | Settings tab |
| Shop name, area, phone, who it belongs to, archive | Shops tab |
| Correct or delete a check-in | Map tab, tap the check-in |
| Reports with date, person and outcome filters | Export tab |

Only `@unijoynepal.com` emails can be added. The owner account (`mijesh.shrestha@unijoynepal.com`) always stays an active admin so nobody can lock the app.

## Go live on Railway (one time)

1. **Railway**: New Project → Deploy from GitHub repo → `raymiyo-tools` → in the service Settings set **Root Directory** to `field`. Railway builds with `npm run build` and starts with `npm start` by itself.
2. **Storage**: in the same project add a **Redis** database, then on the app service add the variable `REDIS_URL` = `${{Redis.REDIS_URL}}`. (Or use the Upstash keys instead: `KV_REST_API_URL` and `KV_REST_API_TOKEN`.)
3. **Address**: service → Settings → Networking → Generate Domain (or add your own domain).
4. **Sign-in**: add `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`, and in the Zoho API Console add `https://YOUR-DOMAIN/api/auth?action=callback` to the Authorized Redirect URIs.
5. **TV**: add `FIELD_TV_KEY` (12 or more characters). The TV opens `https://YOUR-DOMAIN/tv?key=THAT-PHRASE`.
6. **Photos (optional)**: add a Volume to the app service mounted at `/data`, then set `PHOTO_DIR=/data/photos`.

Same variables as the table below; `BLOB_READ_WRITE_TOKEN` is not needed on Railway.

## Go live on Vercel (alternative)

1. **Vercel**: Add New → Project → import `raymiyo-tools` → set **Root Directory** to `field` → Deploy.
2. **Storage**: connect the same Upstash Redis store the Huddle Board uses to this project. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`. Field data uses its own `field:` keys and never touches Huddle data.
3. **Sign-in**: add `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` (same Zoho client as the Huddle Board). In the Zoho API Console, add this to the client's Authorized Redirect URIs:
   `https://YOUR-DOMAIN/api/auth?action=callback`
4. **TV**: add `FIELD_TV_KEY` with any private phrase of 12 or more characters. The TV opens `https://YOUR-DOMAIN/tv?key=THAT-PHRASE`.
5. Redeploy after adding the settings.

### Settings (Environment Variables)

| Name | Needed | What it is |
| --- | --- | --- |
| `REDIS_URL` | Yes (Railway) | Redis connection from the Railway Redis database |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Instead of `REDIS_URL` | Upstash Redis storage |
| `PHOTO_DIR` | For photos on Railway | Folder on a Volume, e.g. `/data/photos` |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | Yes | Zoho sign-in |
| `FIELD_TV_KEY` | For the TV | Private phrase in the TV link |
| `BLOB_READ_WRITE_TOKEN` | For photos | Added automatically when a Vercel Blob store is connected |
| `ZOHO_FIELD_API_KEY` | For CRM | REST API URL of the CRM function that creates Shop Visit records |
| `FIELD_APP_URL` | No | Only if sign-in redirects to the wrong address |
| `FIELD_DOMAIN`, `FIELD_OWNER_EMAIL` | No | Defaults: `unijoynepal.com`, `mijesh.shrestha@unijoynepal.com` |

The Settings tab in the app shows which connections are on.

## Zoho CRM

Each saved check-in is sent to a Zoho CRM function when `ZOHO_FIELD_API_KEY` is set (`lib/crm.js`).
The function receives one argument, `payload`, with the check-in as JSON text, and should create the shop
as an Account under "Kathmandu Raymiyo Trading Pvt Ltd" if it is new, then create the Shop Visit record.
Until the key is set, check-ins are kept in the app only.

## Where things are

```
field/
  api/        one file per server job (sign-in, state, check-ins, shops, day, admin, tv, photo)
  lib/        storage, sign-in and role checks, Nepal time, CRM sync
  shared/     rules used by both server and screens (points, outcomes, roles, colours)
  src/        the screens: App (sign-in), Rep (field user), Admin, TV, MapView, export (PDF/CSV)
  src/styles.css   all colours and fonts, set once at the top
  server.mjs  the server Railway runs
  mobile/     the Android app (see mobile/README.md): live tracking all day
  scripts/    test.mjs (rule checks) and local-server.mjs (run on a laptop)
```

Every change to who can do what is enforced on the server (`guard(...)` at the top of each `api/` file), not only hidden on screen.

## For a developer

```
npm install
npm test                 # 43 checks on roles, points, shops and the TV link
npm run build
FIELD_DEV_LOGIN=1 npm run local   # http://localhost:4173/api/auth?action=dev&email=sajina@unijoynepal.com
```

The laptop mode keeps data in memory and the dev sign-in never works on Vercel.

## Known limits

- Location is saved when a person taps Start day, Check in or End day. A web app cannot follow a phone continuously in the background.
- PDF text uses a standard font; notes typed in Devanagari will not print correctly in the PDF (the CSV keeps them).
- Vercel's Hobby plan is for personal use and was paused for going over its limit; Railway is the current host.
