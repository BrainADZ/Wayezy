# WAY EZY — known limitations

These are the gaps and unverified areas at release 1.0.0. None of them blocks the demo script. Items marked
**before go-live** should be closed for a production centre.

## Verification gaps (not possible in the build environment)

1. **External PostgreSQL through `pg`, Supabase Storage and the Docker image were not run.** Docker and PostgreSQL
   are not installed on the build machine. Every automated test runs against the embedded engine (PGlite, which
   is PostgreSQL compiled to WebAssembly) using the same migrations and SQL. The `pg` adapter was code-reviewed
   (JSON parameters are serialised with explicit `::jsonb` casts, and int8 counts are parsed to numbers).
   **Before go-live:** run `npm test` and the E2E suite against the target PostgreSQL and storage bucket, then
   build the image once.
2. **Browsers**: automated coverage is Chrome only (with emulated phones). Safari (iOS/macOS), Firefox and signage
   players were not tested. **Before go-live:** walk through the demo script on real iPhones, Android phones and
   the chosen kiosk hardware.
3. **Accessibility**: built to WCAG 2.2 practice (48 px+ touch targets on kiosk and phone, visible focus, labelled controls, high-contrast
   and larger-text modes, reduced motion, step-free routing), but there has been **no formal audit or
   screen-reader pass**.

## Content and data

4. Tenants, offers, campaigns and analytics in the demo are **sample data**. Brand names appear only as plain
   text. Logos are shown as coloured initial tiles, and store images are illustrated placeholders until real
   logos and photos are uploaded in COMMAND. The demo video advert is a generated motion graphic.
5. Hindi covers the full visitor interface, but only 3 of the 40 demo tenants have Hindi profile text; the others
   fall back to English. Search understands English terms and synonyms; Devanagari search terms are not mapped
   to synonyms yet.
6. Demo installations contain labelled demo-seed analytics. Clear them in COMMAND → Analytics before go-live.

## Maps and routing

7. The venue's floors are created by the seed (three aligned floors). COMMAND edits floors, units, nodes,
   corridors, connectors, amenities and kiosk positions, but has **no "add floor" screen** and **no CAD/PDF floor
   plan import**. New floors can be added through the admin API. Existing unit outlines can be deleted and redrawn,
   but not reshaped vertex by vertex.
8. There is no live indoor positioning (no "blue dot"). Routes start from the kiosk's configured location, and
   WAY EZY GO advances step by step when the visitor taps.
9. The 3D map needs WebGL and a reasonable GPU. On weak or blocklisted GPUs it falls back to the 2D map, and the
   default can be set to 2D in System Settings.

## Platform

10. **One venue per deployment** (`VENUE_ID`). The schema is venue-scoped for future multi-venue use, but COMMAND
    manages a single venue.
11. Live publish notifications are per server instance, and rate limits are kept in memory per instance. Behind
    several instances, screens still update through their 30-second poll.
12. User management has no email delivery: administrators set initial passwords and reset them. There is no
    self-service password reset, MFA or SSO.
13. Offline kiosk mode needs one successful online load. Full offline start-up (service worker) needs HTTPS or
    `localhost`, so a kiosk loading the app from a plain-HTTP LAN address keeps working offline while it runs but
    can't cold-start offline. QR hand-off always needs a connection.
14. Devices report health and pick up configuration. There is no remote reboot, remote screenshot or OS-level
    management.
15. Analytics are interaction analytics (sessions, searches, routes, QR, ads), not footfall counting.

## Engineering notes

16. The E2E suite runs one worker at a time and starts an embedded PostgreSQL. On machines with little free memory
    set `E2E_LOW_MEMORY=1`. In CI images without Google Chrome set `E2E_CHANNEL=chromium`.
17. The demo package's bundled `node_modules` and Node runtime target Windows x64. On macOS or Linux run
    `npm install --omit=dev` in the package first.
