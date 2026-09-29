# Reference kiosk integration

The kiosk at `/` uses the map explorer imported from the supplied Brainadz way project. COMMAND (`/command`) and GO (`/go`) retain their existing interfaces.

The kiosk uses the existing published snapshot, live updates, offline cache, device identity and heartbeat, idle timeout, campaign playlist, analytics, route graph and signed QR handoff. Store hours, names, colours, entrance positions and unit polygons come from COMMAND. Floor controls, search, filters, place details, directions, accessible routes, route steps, zoom, pan and fullscreen use the reference presentation.

On the first startup in demo mode, the bundled Riverside map is converted to the four-floor reference layout. Existing tenant and device IDs, profiles, offers, campaigns, media and device keys are retained; reference stores are added. Original corridor edges are retained as inactive records. Map geometry and routing records are editable in COMMAND. Later restarts do not repeat the import or overwrite admin edits.

The import is transactional. The original working copy and published snapshot are retained in the `reference_map_imports` table, and previous published snapshots remain in history. The working and published copies are converted separately so unpublished edits remain unpublished. Automatic import only applies to the original Riverside demo geometry; production mode and custom venues are not converted.

The supplied floor layout and its route distances are illustrative, as in the source project.

Validation:

- `npm test` — domain, routing, search, advertising and API integration tests, including reference layout connectivity and preservation of existing records.
- `npm run build` — strict TypeScript validation and client/server production bundles.
- `npm run test:e2e -- tests/e2e/reference-kiosk.spec.ts` — reference kiosk UI, live admin updates, published map geometry, accessible routing, QR/GO, offline search and idle reset. Set `E2E_TARGET=build` to test the production bundle.

Legacy kiosk journey/screenshot specs still describe the former kiosk interface; use the reference kiosk suite for the replacement interface.
