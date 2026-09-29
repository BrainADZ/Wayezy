# WAY EZY — deployment guide

WAY EZY is one Node.js process serving the kiosk (`/`), WAY EZY GO (`/go`), WAY EZY COMMAND (`/command`) and the
API (`/api`). It needs MongoDB and somewhere to keep uploaded media.

## 1. Requirements

|               | Minimum                                 | Notes                                                                                                                                 |
| ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js       | 22.12 (LTS)                             | Node 24 also tested. Not needed with Docker.                                                                                          |
| Database      | MongoDB 8 or Atlas                      | Set `MONGODB_URI` and `MONGODB_DATABASE`. Set `MONGODB_IMPORT_PGLITE=true` before first start only for a healthy old database.         |
| Media         | Local disk (volume) or Supabase Storage | `STORAGE_DRIVER=local` keeps files under `DATA_DIR/media`.                                                                            |
| TLS           | HTTPS in production                     | Needed for secure cookies, the WAY EZY GO service worker and "Add to home screen". Terminate TLS at a reverse proxy or load balancer. |
| Server        | 1 vCPU, 1 GB RAM                        | Per venue. Kiosk traffic is light; 3D rendering happens on the screens.                                                               |
| Kiosk screens | Chrome/Edge 110+ with WebGL             | Portrait 1080×1920 recommended. Screens without WebGL fall back to the 2D map automatically.                                          |

## 2. Configuration

Configuration comes from environment variables or a root `.env` file. Copy **`.env.example`** for both
local and production setup, then set `NODE_ENV=production`, `APP_MODE=production` and the required production values.
Explicit environment variables take precedence over `.env` values.
Production mode (`NODE_ENV=production`, `APP_MODE=production`) refuses to start unless:

- `ROUTE_TOKEN_SECRET` is at least 32 characters (it signs QR route links), e.g. `openssl rand -base64 48`
- `PUBLIC_BASE_URL` is an `https://` URL (it is embedded in QR codes)
- `MONGODB_URI` points to the MongoDB deployment
- when the venue has no active Super Admin, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+ characters) are set
- with `STORAGE_DRIVER=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

Secrets stay on the server. The browser bundle contains no keys, and the Supabase service-role key is only
used server-side for storage uploads.

Behind a proxy, set `TRUST_PROXY` (e.g. `1`) so rate limiting and audit logs see real client IPs.

## 3. Build, start, migrate, seed

```bash
npm ci
npm run build        # type-check, client bundle → dist/client, server bundle → dist/server
npm start            # node dist/server/index.js
```

- **MongoDB data loads automatically on start.** The existing SQL repository code uses an in-memory
  compatibility engine while MongoDB stores every table's records durably. The old `.data/pgdata`
  directory is left untouched. Set `MONGODB_IMPORT_PGLITE=true` only for an explicit old-data import.
- **Seed**: the first start needs a venue. Start once with `SEED_DEMO=true` to create the structured sample venue
  (3 floors, units, route graph, amenities, 4 kiosks), then rename the venue and replace the directory in COMMAND.
  Demo users and demo analytics are _not_ created in production mode unless `DEMO_USERS`/`DEMO_ANALYTICS` are
  set. Alternatively run `npm run db:seed` from the source tree against the target database.
- **Reset** (`npm run db:reset`) drops the configured MongoDB database and seeds it again. In production mode it
  also requires `CONFIRM_RESET=yes`.

## 4. Docker (recommended)

```bash
cp .env.example .env
# set NODE_ENV=production, APP_MODE=production, PUBLIC_BASE_URL, ROUTE_TOKEN_SECRET
# replace ADMIN_PASSWORD and set MONGO_PASSWORD; disable DEMO_USERS and DEMO_ANALYTICS
# set SEED_DEMO=false for a live venue (or true only for the first sample-content start)
docker compose up -d --build
docker compose logs -f app
```

`docker-compose.yml` runs MongoDB 8 plus the app. It has health checks, named volumes (`mongodata` for the
database, `appdata` for media and generated secrets), and the app on `HOST_PORT` (default 4173). The image is
a multi-stage build: client libraries are only in the build stage, and the runtime stage installs just the
server dependencies and runs as the non-root `node` user.

MongoDB Atlas instead of the bundled database: remove the `db` service and set `MONGODB_URI` in `.env`.

The production release package (`npm run build:release`) already contains built bundles. Its Dockerfile only
installs runtime dependencies, so `docker compose up -d --build` works from the unzipped release folder too.

## 5. Optional Supabase media storage

1. Create a Storage bucket (e.g. `way-ezy-media`), set it to **public read**, then set `STORAGE_DRIVER=supabase`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_BUCKET`.
2. Keep `MONGODB_URI` configured for application records; Supabase only stores uploaded media in this setup.

## 6. Reverse proxy example (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name wayfinding.example.com;
  # ssl_certificate …; ssl_certificate_key …;
  client_max_body_size 50m;                      # ≥ MAX_UPLOAD_MB
  location /api/stream {                          # Server-Sent Events: no buffering, long timeout
    proxy_pass http://127.0.0.1:4173;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_read_timeout 1h;
  }
  location / {
    proxy_pass http://127.0.0.1:4173;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 7. Setting up kiosk screens

1. In COMMAND → **Screens & Devices**, add or select a kiosk and use **Place kiosk** in the map editor to set its
   "You are here" point. In the kiosk's editor press **Provision device** (or **Re-issue device key**) to get
   a provisioning link and QR code. Re-issuing invalidates the previous key.
2. Open the link once on the kiosk (`/?device=K-001&key=…`). The key is stored on the device and removed from the
   address bar. The kiosk then sends heartbeats, which feed COMMAND's online/warning/offline status.
3. Run the browser full-screen with auto-restart, for example:
   `chrome --kiosk --noerrdialogs --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required --app=https://wayfinding.example.com/?device=K-001`
4. Recommended: portrait 1080×1920, touch overlay, OS auto-login, and screen sleep disabled.

Once loaded, a kiosk keeps working **offline**: the published directory is cached, the app shell and map code
are cached by the service worker, and analytics queue until the network returns. QR hand-off needs a connection.

## 8. Operations

- **Health**: `GET /api/health` → `200 { ok, version, database, driver, contentVersion }`, or 503 when the database
  is unreachable (used by the Docker health check).
- **Logs**: JSON lines on stdout in production (request id, method, path, status, duration; no bodies or cookies).
- **Backups**: back up MongoDB and the media volume/bucket. `DATA_DIR/secrets.json` holds the
  generated route-token secret when `ROUTE_TOKEN_SECRET` is not set, so back it up or set the variable.
- **Retention**: analytics older than _System Settings → analytics retention_ (default 395 days) and expired
  sessions are purged every 6 hours.
- **Upgrades**: deploy the new build and restart; pending migrations apply on start. Running kiosks notice the new
  client build within 30 seconds and reload at their next idle moment (never mid-session). Phones pick it up on
  their next visit. The service worker's build id changes with every release, so old cached code is replaced.
- **Scaling**: run one application process per venue. The in-memory SQL compatibility layer loads its state
  from MongoDB on startup, so multiple app processes would not share live changes between restarts.

## 9. Demo build (presenter laptop)

`npm run build:demo` produces `WAY-EZY-Demo-<version>/` (plus a zip) with runtime packages and, on Windows, a
bundled Node runtime. Double-click **START-WAY-EZY-DEMO.cmd**; sign-in details appear in `data/demo-access.txt`.
See `README-DEMO.md` inside the package and `docs/DEMO_SCRIPT.md`.
