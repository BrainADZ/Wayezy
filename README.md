# WAY EZY — shopping-centre wayfinding platform

**FIND · EXPLORE · ENJOY**

WAY EZY is a complete wayfinding platform for shopping centres. Three apps run on one Node.js server and share a
single domain model, route graph and published directory:

| App                 | URL                                            | For                                                                                                                                                              |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WAY EZY kiosk**   | `/` (`/?device=K-001` on a provisioned screen) | Portrait 1080×1920 touch kiosks: intent search, rich store profiles, animated 2.5D/3D routes, accessible routes, multi-floor view, QR hand-off, idle advertising |
| **WAY EZY GO**      | `/go`, `/go/r/<token>`                         | Visitors' phones (installable PWA, no app store): the same route step by step                                                                                    |
| **WAY EZY COMMAND** | `/command`                                     | Centre staff: directory, maps and routing, advertising, devices, analytics, users and publishing                                                                 |

Powered by BrainADZ.

---

## Quick start (local demo)

Requirements: **Node.js 22.12+**, npm, and a local MongoDB service or MongoDB Atlas URI.
Set `MONGODB_URI` in `.env`. On first start the sample venue is seeded in MongoDB.
To copy an existing healthy PGlite database instead, set `MONGODB_IMPORT_PGLITE=true` before the first start.

```bash
npm install
cp .env.example .env  # set MONGODB_URI and ADMIN_PASSWORD
npm run dev
```

Open http://localhost:4173/ (kiosk), http://localhost:4173/go and http://localhost:4173/command.
Sign-in details for COMMAND (Super Admin plus one user per role) are written on first start to
**`.data/demo-access.txt`**, together with kiosk provisioning links. An admin password configured in `.env`
is not copied to this file. Changing `ADMIN_EMAIL` or `ADMIN_PASSWORD` synchronizes the existing Super Admin
on the next server start. Run `npm run db:reset` to start fresh.

Phones on the same Wi-Fi can scan kiosk QR codes: the server detects this computer's LAN address. Set
`PUBLIC_BASE_URL` to pin the address used inside QR codes.

## Production build

```bash
npm run build          # type-check + client bundle (dist/client) + server bundle (dist/server)
npm start              # NODE_ENV=production node dist/server/index.js
```

Packaged builds:

```bash
npm run build:demo     # self-contained presenter build (double-click START-WAY-EZY-DEMO.cmd)
npm run build:release  # production release folder + zip (Dockerfile, compose, env template, docs)
```

Docker with MongoDB: `cp .env.example .env`, set production mode and the required secrets, then `docker compose up -d --build`.
See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Scripts

| Command               | What it does                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run dev`         | Dev server (Express API + Vite HMR) on `PORT` (default 4173)                                               |
| `npm run check`       | TypeScript, strict mode, whole repository                                                                  |
| `npm test`            | Unit + integration tests (the isolated test runner uses an in-memory SQL engine)                           |
| `npm run test:e2e`    | Playwright end-to-end tests (isolated server and database). `E2E_TARGET=build` tests the production bundle |
| `npm run screenshots` | Regenerates `docs/screenshots/`                                                                            |
| `npm run build`       | Production build (fails on any type error)                                                                 |
| `npm start`           | Runs the production server                                                                                 |
| `npm run db:migrate`  | Applies database migrations (also runs automatically on start)                                             |
| `npm run db:seed`     | Seeds the demo venue into an empty database                                                                |
| `npm run db:reset`    | Clears the configured database, then seeds (**destructive**)                                               |
| `npm run assets`      | Regenerates logo, favicon, PWA icons, icon SVGs and demo posters                                           |
| `npm run build:video` | Re-renders the demo video advert (needs Chrome)                                                            |

## Architecture

```
apps/
  server/            Express 5 API, auth/RBAC, publishing, SSE, media, analytics (bundled to dist/server)
    db/              migrations (SQL), table mappings, seed, CLI
    repositories/    content, snapshots, users/sessions, audit, analytics, devices, settings
    services/        passwords (scrypt), route tokens (HMAC), storage (local/Supabase), media processing, realtime
    http/            public, auth and admin routes
  web/               React 19 + Vite client (dist/client)
    kiosk/  go/  command/   the three apps (lazy-loaded)
    map/             MapRenderer → ThreeMap (React Three Fiber) or SvgMap, shared floor model + route playback
    icons/  brand/   illustrated icon system, WAY EZY wordmark
    shared/          content sync (snapshot + SSE + offline cache), analytics queue, i18n (en/hi), device identity
packages/
  domain/            zod schemas, types, RBAC policy, opening-hours logic, demo venue (3 floors, 40 tenants)
  routing/           A* routing, accessible routing, closures, instruction generation, graph validation
  search/            intent search (synonyms, fuzzy matching, did-you-mean)
  advertising/       campaign scheduling, targeting, playlist and idle-state logic
tests/  unit/  integration/  e2e/
```

Key design points:

- **Routing is independent of rendering.** Route nodes, edges, vertical connectors, destination access nodes
  and kiosk start nodes live in the database; A* runs on that graph. The 3D and SVG renderers only draw it.
- **Publish model.** COMMAND edits a working copy. _Publish_ creates an immutable, visitor-safe snapshot.
  Kiosks and phones receive it over Server-Sent Events (with 30-second polling as a fallback), cache it for
  offline use, and never see unpublished changes. Corridor closures publish immediately.
- **One idle-timeout source.** Each device's `idleTimeout` (default 10 s) is set in COMMAND → Screens & Devices.
- **Security.** Server-side RBAC on every admin API call (6 roles), scrypt password hashing, httpOnly SameSite
  session cookies with hashed tokens, CSRF header check, zod validation, login and API rate limits, upload
  sniffing and re-encoding, audit log, signed expiring QR tokens, CSP/helmet headers, safe error responses.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): environments, Docker, MongoDB, TLS, kiosks
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): WAY EZY COMMAND for centre staff
- [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md): the 26-step client demo
- [docs/BROWSER_COMPATIBILITY.md](docs/BROWSER_COMPATIBILITY.md)
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)
- [docs/database/schema.sql](docs/database/schema.sql): database schema

Demo content (store names, offers, campaigns) is sample data for presentations only.
