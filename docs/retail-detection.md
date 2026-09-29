# Architectural mall directory

The normal kiosk uses `public/maps/ground-floor-master.svg` as its authoritative architecture. Original shop paths, polygons, transforms and proportions remain intact. The customer view uses `public/maps/ground-floor-directory.svg`, a generated prepared copy; the master is never overwritten.

## Preparation and loading

- `npm run model:ground` resolves source fills/labels into `ground-floor-model.json`: 47 modules and 19 source amenities.
- `npm run prepare:ground` prepares metadata, exact-geometry clips/shadows, typography, reusable decor/amenity symbols and circulation data. It removes exporter metadata and inter-element whitespace without changing geometry attributes.
- The kiosk fetches a versioned prepared asset, parses it off-DOM, waits for the essential font and mounts the complete styled tree once. No runtime retail detection, geometry containment or label measurement runs on startup. No raw-SVG stage or fallback block map exists.

`npm run build` includes preparation and rejects a master/model hash mismatch. `ground-floor-prepared.json` versions browser/offline caches. After changing source geometry, regenerate the model first. Missing/stale prepared assets show an explicit error. Build-time Brotli/gzip copies are served with negotiated content encoding, preserving the exact SVG while cutting network transfer.

## Tenants and source geometry

`ground-floor-tenants.json` stores 30 source-backed tenant bindings across 38 modules. Nine modules have no confirmed tenant and display `TO LET`; their IDs stay available internally. Corrected labels place Love Birds in 14A/14B and Forest Essentials in 11A.

Twenty-seven local brand logos from `public/brand/logo/` are mapped, making 35 logo placements across the occupied modules. Parisian, Forest Essentials and Veg Non Veg still use clean typographic names because no corresponding local logo file exists. Update the mapping and regenerate preparation when those assets arrive. Names/images remain clipped to exact source paths and sized within precomputed interior areas.

`ground-floor-overrides.json` contains difficult label references, named areas and source-derived amenity locations. No replacement shop rectangles are generated. Clips/shadows copy exact original paths and root transforms.

Five compact wayfinding labels use original source text anchors for four lift lobbies and the goods lift lobby. Service corridor labels are suppressed in the customer view. The 88 original orange core paths are classified before red annotation strokes and restyled to identify non-retail facilities; this was previously hidden by an annotation-color collision. Forty-eight source door-swing curves receive a clearer stroke, while the original jambs and openings remain intact. Stairs use their plan symbol without a duplicate caption.

The northern service core contains separate rooms labeled `FEMALE TOILET` and `MALE TOILET` as vector outlines rather than SVG text. Their markers are validated against original fill paths `path183` and `path186`. A second men's toilet beside Spin is validated against `path26920`. Male and female pictograms and the map guide use matching symbols; no accessible toilet is indicated in this source.

## Presentation and controls

`ground-directory.ts` and `ground-environment.ts` run at preparation time; `ground-directory-state.ts` handles runtime interactions. Warm surfaces, shallow shadows, category tints and clipped wordmarks sit over the actual architecture. Technical labels/red annotations are hidden in customer CSS. Original walls, doors, office hatching and cores remain.

Muted planting is clipped inside nine existing central island outlines, referenced by source ID. Four separated water features follow the narrow median between those island rows, where the user marked the desired pond line; they stop before each cross-aisle and leave both vertical walking aisles clear. The planting and water are presentation details, not surveyed fixtures. Amenity symbols enhance existing stairs, escalators, lifts, toilets and entries; the map guide reuses those same symbols. Unsupported ATM/prayer-room/accessibility locations are not invented.

One outer SVG group rotates the floor into a landscape view without changing any original path, transform or relative position. The camera fits the rotated source bounds with modest closer initial zoom. Wheel zoom anchors to the cursor; drag paints a single SVG camera-group transform at most once per animation frame, leaving the outer viewport and source tree fixed. Search/route focus convert source points into the rotated view and respect reduced motion. Interactions do not reconstruct the SVG. Pointer capture begins only after dragging, retaining real source-shape click targets.

## Walking guidance

`ground-floor-circulation.json` records drawing-based aisle centre-lines and external store approaches. Preparation validates links against source retail/core fills and wall strokes at half-SVG-unit intervals. The symbolic entry gate has an explicit short approach into the open forecourt. Generated links are stored in `ground-floor-walks.json`.

29 storefronts have routes, rendered above all map layers with walking arrows and origin/destination markers. Routes stop outside store frontage rather than crossing shop fills. Soulfoods' internal connection through the southern core is unresolved and remains unavailable. Site verification of entrances and step-free access remains necessary; accessible routing is not asserted. Uncalibrated distance/time estimates are not displayed.

## Verification

```
npm run model:ground
npm run prepare:ground
npm run test:retail
npx tsx --test tests/unit/ground-directory.test.ts tests/unit/ground-floor-structure.test.ts
npx playwright test tests/e2e/architectural-ground-floor.spec.ts
npm run build
```

Use `npm.cmd` / `npx.cmd` in restricted Windows PowerShell. Browser checks cover geometry preservation, no raw flash, zero runtime containment analysis, persistent source DOM, source clicks, search/filter, routes, floor switching and load failures. Screenshots are saved to `test-results`.

Advertising stays temporarily paused through `KIOSK_ADS_PAUSED` in `ExplorerKiosk.tsx` until the user requests resuming it.
