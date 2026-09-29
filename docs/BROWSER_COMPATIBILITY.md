# WAY EZY — browser compatibility

## Tested

| Environment | What was tested | Result |
| --- | --- | --- |
| Google Chrome 152 (Windows 11), headless via Playwright | Full automated E2E suite on the production build: kiosk 1080×1920, WAY EZY GO on emulated iPhone 13 / Pixel 7 / 390×844 / 430×932 / 768×1024, COMMAND at 1440×900 and 1920×1080 | Pass |
| Chromium-based in-app browser (Claude desktop, GPU) | Manual walkthroughs of kiosk, GO and COMMAND during development | Pass |
| Software WebGL (SwiftShader) | All 3D map screens render. This is also the worst case for low-end kiosk GPUs | Pass (slower frame rate) |

## Supported targets

| App | Recommended | Also supported | Notes |
| --- | --- | --- | --- |
| **Kiosk** | Chrome or Edge 110+ in kiosk mode, hardware acceleration on | Any Chromium 110+ player (e.g. digital-signage browsers) | WebGL 1 or 2 for the 3D map. Without WebGL, or if the GPU context is lost, the kiosk switches to the 2D SVG map automatically. Video adverts: MP4 (H.264) or WebM (VP8/VP9). The demo video is WebM/VP9. |
| **WAY EZY GO** | iOS Safari 16.4+, Android Chrome 110+ | Samsung Internet 21+, desktop Chrome/Edge/Firefox/Safari | "Add to home screen", offline shell and the Web Share button need **HTTPS** (normal in production; LAN demos over plain HTTP still show routes but can't install). Without Web Share, the share button copies the link or shows it to copy. |
| **COMMAND** | Current Chrome, Edge, Firefox or Safari on desktop | — | Designed for 1280 px and wider. Uses `color-mix()` (Chrome 111, Firefox 113, Safari 16.2). |

## Features by platform

- **Service worker / offline**: all evergreen browsers, but only over HTTPS or on `localhost`.
- **Server-Sent Events** (live publish updates): all evergreen browsers. Clients also poll every 30 s, so updates
  still arrive when a proxy strips SSE.
- **WebGL** (3D map): all evergreen browsers. Chrome disables it on some blocklisted GPUs; those devices use 2D.
- **`prefers-reduced-motion`**: honoured in all three apps. CSS animations and transitions are switched off, and
  map route drawing and camera flights jump straight to the end state.
- **Touch**: pointer events with pinch-zoom and pan on both map renderers. The 3D camera does not rotate, so
  visitors can't disorient the map.
- **Fonts**: Inter is self-hosted (no Google Fonts request). Hindi text uses the system Devanagari font.

## Not verified (no device or browser available in this build environment)

- Safari on macOS and iOS, Firefox, and Samsung Internet were **not run**. The code uses only standard APIs with
  fallbacks (WebGL→SVG, share→clipboard→copy prompt, `crypto.randomUUID`→random id), but run the demo script
  on real iPhones and Android phones before go-live.
- Specific signage players (BrightSign, Android TV boxes, ChromeOS kiosk devices) should be qualified on site with
  the target content, especially video codecs and GPU performance for the 3D map.
