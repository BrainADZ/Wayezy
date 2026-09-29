# WAY EZY — client demo script (26 steps)

Every step below is covered by the automated acceptance test `tests/e2e/demo-script.spec.ts`, which runs it end
to end against the production build with a portrait kiosk, a phone and a COMMAND session.

## Before the meeting (10 minutes)

1. Start the demo build (**START-WAY-EZY-DEMO.cmd**) or `npm run dev` from the source.
2. Open **data/demo-access.txt** (or `.data/demo-access.txt` in the source tree) for the COMMAND password.
3. **Screen 1, kiosk**: Chrome, `http://localhost:4173/?device=K-001`, full screen (F11). A portrait monitor is
   ideal. On a landscape screen the kiosk scales to fit the height.
4. **Screen 2, COMMAND**: `http://localhost:4173/command` on the laptop. Sign in and leave it on the Dashboard.
5. **Phone**: on the same Wi-Fi as the laptop. The QR code uses the laptop's LAN address. If Windows asks, allow
   Node.js on *private* networks. If phones can't connect (guest Wi-Fi isolation), use a phone hotspot for both.
6. For a clean start: close the server, delete the `data` folder, start again.

## The walkthrough

| # | Do | Say / point out |
| --- | --- | --- |
| 1 | Show the kiosk home screen. | Branded, colourful, large touch targets: search, 6 categories plus Offers and Events, a live 3D map with "You are here", quick amenities. |
| 2 | Step back. Don't touch it for **10 seconds**. | The idle timeout is a per-screen COMMAND setting. |
| 3 | The full-screen advert starts. | Scheduled, targeted campaigns (images and video) with proof-of-play reporting. |
| 4 | Touch anywhere. | That first touch never "clicks through" to a button. |
| 5 | A clean home screen opens. | The previous visitor's search and route are gone (privacy). |
| 6 | Tap search and type **Italian food** on the on-screen keyboard. | Intent search: it understands what you want, not only store names. |
| 7 | Suggestions appear: Olive Trattoria, Pizza Express, Gelato Room, with walking times. | Try "shoes", "lipstick", "ATM", "toilet" if asked. Typos are tolerated. |
| 8 | Tap **Olive Trattoria**. | The map flies to the unit, which lifts and highlights. |
| 9 | Scroll the profile. | Open-now status, walking time, current offer, known-for tags, dietary options, menu QR, hours. |
| 10 | Tap **Get directions**. | |
| 11 | The route draws progressively in 3D. A floor-change banner appears at the escalator. | Real A* routing on the centre's corridor graph, not a drawn line. |
| 12 | Point at **2 min · 128 m** and the floor steps L0 → L1 → L2. | Steps: turns, landmarks, escalators, "on your right". |
| 13 | Turn on **Accessible route** (the switch under the map). | |
| 14 | The route changes to the **central lift**: 3 min · 103 m. | Step-free routing never uses stairs or escalators, and lift wait time is included. |
| 15 | Tap **All floors**. | Exploded 3-floor view showing the vertical journey. Tap **One floor** to return. |
| 16 | Tap **Send to phone**. The QR code appears. | Signed, short-lived link (2 hours by default). No app or account. |
| 17 | Scan it with the phone camera. WAY EZY GO opens. | Installable web app. |
| 18 | The phone shows the same destination and the same accessible route. Tap **Next step**. | Turn-by-turn in the visitor's pocket. |
| 19 | Switch to **WAY EZY COMMAND**. | Role-based admin (6 roles); everything is audited. |
| 20 | Directory → **Offers** → *Pasta Nights* → change the highlight to **25% OFF** → **Save**. (Or Tenants → edit any field.) | The top bar shows "1 unpublished change". Visitors don't see drafts. |
| 21 | Press **Publish** in the top bar → **Publish now**. | Route graph validation runs first. A release note is optional. |
| 22 | On the kiosk: search "Olive", open the profile. The offer shows **25% OFF**. | Pushed live to every screen in seconds, with no reload. |
| 23 | Advertising → **New campaign**: name, advertiser, **Creative**, start date in the future → **Save & publish**. | It appears as **Scheduled**. Show targeting by floor, device group or kiosk, time windows and priority. |
| 24 | Open **Analytics**. | Searches, zero-result searches, top destinations, QR hand-offs, ad proof-of-play, per-kiosk breakdown, CSV export. The session you just ran is included. |
| 25 | On the kiosk, open directions to Olive Trattoria again (standard route). In COMMAND go to **Routing** → search `l0-e-esc-e-up` → **Close** → **Close corridor**. | Corridor closures publish immediately. |
| 26 | The kiosk shows **"Route updated"** and redraws the route through the central glass lift (3 min · 103 m) instead of the closed escalator corridor. | Rerouting is automatic. Reopen the corridor afterwards (Routing → Reopen). |

## Useful extras if there is time

- **Language**: tap the हिन्दी button in the kiosk header.
- **Accessibility panel** (wheelchair button): larger text, high contrast, step-free by default.
- **2D map** toggle, and the **All floors** view from the home map.
- COMMAND **Floors & Maps**: drag a route node and watch walking times update. Use **Validate graph**.
- COMMAND **Screens & Devices**: kiosk health, idle timeout for all kiosks, provisioning QR.
- Pull the network cable: the kiosk keeps working and shows "Offline · saved directory".

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| Phone cannot open the QR link | Phone and laptop must be on the same network. Try a hotspot. Check the firewall prompt. Set `PUBLIC_BASE_URL=http://<laptop-ip>:4173` before starting. |
| Map looks flat or 2D only | That browser or GPU has no WebGL, so the kiosk switched to the 2D map automatically. Enable hardware acceleration in Chrome. |
| Advert appears during the demo | That's the 10-second idle timeout working. Touch to continue, or raise the timeout in Screens & Devices. |
| Forgot the password | Look in `data/demo-access.txt`, or delete `data` and restart for new credentials. |
| Port 4173 in use | Close the other app, or `set PORT=4180` before starting. |
