# WAY EZY COMMAND — admin guide

WAY EZY COMMAND (`/command`) is where centre staff manage everything visitors see on kiosks and on WAY EZY GO.
It is designed for desktop and laptop screens (1280 px and wider).

## 1. Signing in and roles

Sign in with the email and password your administrator gave you. Sessions last 12 hours (configurable) and end
when you choose **Sign out** from the menu under your name. After 10 sign-in attempts for the same account within
15 minutes, further attempts are blocked for the rest of that window.

Each user has one role. Permissions are enforced by the server for every action, so hiding a button is never the
only protection. The full matrix is in **Administration → Roles & Permissions**.

| Role | Can change | Can publish |
| --- | --- | --- |
| **Super Admin** | Everything, including users, roles, system settings and destructive actions | Yes |
| **Mall Admin** | Venue, floors, maps, routing, directory, campaigns, devices, settings. Views users, analytics and audit | Yes |
| **Content Manager** | Tenants, categories, amenities, offers, events, media | Yes |
| **Advertising Manager** | Campaigns and media. Views analytics | Yes |
| **Analyst** | Nothing. Views content, analytics and the audit log | No |
| **Device Operator** | Screens & devices (provisioning, idle timeout, maintenance) | No |

## 2. The publishing model

Edits change the **working copy**. Visitors keep seeing the last *published* version until someone publishes.

- The **publish pill** in the top bar shows "All changes live" or "N unpublished changes".
- **Publish** opens a dialog that checks the route graph (every destination reachable from every kiosk), shows
  recent releases and takes an optional release note.
- After publishing, running kiosks and phones update within seconds over a live connection (and within 30 s at
  worst). Nobody needs to reload a screen.
- Two actions publish immediately because they affect safety and wayfinding: **closing/reopening a corridor**
  (Routing) and **Save & publish** on a campaign.

Every create, update, delete, publish and closure is recorded in **Administration → Audit Log** with who, when,
and a before/after comparison.

## 3. Dashboard

Today's kiosk status, searches, route requests, QR hand-offs and ad plays. It also shows a 7-day interaction
chart, top searches and destinations, live device health, campaign status, alerts (offline or maintenance
screens), and recent changes. Use **Preview kiosk** to open the visitor experience in a new tab.

## 4. Directory

### Tenants
Search, filter by category, floor or status, and sort. Click a row (or use the quick search at the top) to edit.
Tabs:

- **Basics**: name, trading name, category, subcategory, status (Active / Coming soon / Temporarily closed /
  Hidden), brand colour, anchor store (anchors get larger map labels and rank first).
- **Profile**: short summary (shown in search results and cards), description, phone, website, accessibility notes.
- **Products & tags**: *known for* / product types, search keywords, services and brands stocked. Keywords power
  intent search (e.g. add "gelato" so "ice cream" searches find the store).
- **Hours**: opening and closing time per day, or closed.
- **Dining & cinema**: cuisines, dietary options, dine-in/takeaway/delivery, price band, menu and reservation links
  (shown to visitors as QR codes). For cinemas: screens, booking link and today's showtimes.
- **Media**: logo, hero image and gallery from the Media Library.
- **Map location**: floor, unit number, map unit and entrance node (the route destination). A warning appears if
  the unit is already assigned to another tenant.
- **Translations**: Hindi name, summary and description (English is used where a translation is missing).
- **Preview**: how the kiosk card will look.

### Categories
Name, accent colour, illustrated icon, display order, whether the category appears as a large tile on the kiosk
home screen, and **search synonyms** (e.g. *Dining*: food, restaurant, eat). A category that still has tenants
cannot be deleted.

### Amenities & POIs
Washrooms, accessible washrooms, ATMs, lifts, escalators, parking, information, baby care, prayer room, first
aid, taxi pick-up and more. Each has a floor, a route node (where visitors are routed), an optional map unit,
hours, step-free access and visibility.

### Offers and Events
Offers belong to a tenant and have a title, a short highlight ("20% OFF"), description, image, terms, start and
end dates, and a status (Active, Draft, Paused). Events work the same way. Only active items inside their dates
are shown to visitors.

## 5. Floors, maps and routing

### Floors & Maps (map editor)
Pick a floor (L0/L1/L2), then a tool:

| Tool | Use |
| --- | --- |
| **Select** | Click a unit, node or edge to edit it in the inspector. Drag empty space to pan; use +/− to zoom. |
| **Move node** | Drag route nodes. Corridor lengths and walking times update automatically. |
| **Add node** | Click to add a corridor node (auto-connected to the nearest node). |
| **Connect** | Click two nodes to create a two-way corridor. |
| **Draw unit** | Click the corners of a new shop unit. Click the first corner or press Finish to close it. |
| **Place amenity** | Click to place an amenity with its own route node. |
| **Place kiosk** | Choose a kiosk, then click where it stands. This sets its "You are here". |
| **Preview route** | Click a start and a destination to test routing on the working copy. |

Layers (units, nodes, edges, labels) can be toggled. **Validate graph** reports disconnected nodes, missing
endpoints and destinations that cannot be reached, and highlights them in red. In the edge inspector you can
mark a corridor as not step-free (accessible routes avoid it) or close it.

### Routing
- **Route preview**: pick a kiosk and destination, optionally step-free, and see the exact steps, time and distance.
- **Vertical connectors**: lifts, escalators and stairs, the floors they serve, their direction (escalators are
  one-way) and whether they are step-free.
- **Corridors & closures**: search any corridor and press **Close** with a reason (e.g. floor cleaning). The
  closure publishes immediately, and kiosks showing an affected route recalculate it and tell the visitor
  "Route updated". **Reopen** reverses it. If no route exists (for example every step-free path is closed), the
  kiosk explains this and directs the visitor to the information desk.

## 6. Advertising

### Campaigns
**On air right now** shows what each kiosk would play at this moment. Create a campaign with:

- name, advertiser, description, internal notes
- **creative** from the Media Library (image or MP4/WebM video) or an upload, plus play duration
- **schedule**: start and end dates, daily time window, days of the week
- **targeting**: all screens, specific floors, device groups or individual kiosks
- **schedule windows** may run overnight (e.g. 20:00–02:00)
- **priority**: High, Normal or Low. Higher priority plays earlier in each rotation. Also set a tap destination for reporting
- status: Draft, Scheduled, Active, Paused, Completed

**Save** keeps it in the working copy. **Save & publish** makes it live (or scheduled, if the start date is in
the future) on the targeted screens. The editor shows a kiosk-frame preview and the campaign's impressions,
completed plays, taps and playback errors.

### Idle behaviour
Kiosks switch to the advertising playlist after their **idle timeout** (default 10 seconds, set per kiosk in
Screens & Devices). Any touch closes the advert and starts a clean session on the home screen; that first touch
never "clicks through" to a button. If no campaign is on air, the kiosk shows house promotions built from current
offers and events.

### Media Library
Drag and drop images (JPG, PNG, WebP, AVIF) or videos (MP4, WebM). Files are checked by content, not just extension.
Images are re-encoded to optimised WebP. Media in use by a tenant or campaign cannot be deleted; the detail view
lists where it is used.

## 7. Screens & Devices

- **Fleet status**: Online (heartbeat within 90 s), Warning (late heartbeat or outdated content version), Offline,
  Maintenance, Not provisioned.
- **Idle advertising timeout**: set once and **Apply to all kiosks**, or per kiosk in its editor.
- Kiosk editor: device ID, friendly name, location, device group (used for ad targeting), floor, start node
  ("You are here"), status (including Maintenance), orientation, idle timeout, default language, and
  **Provision device / Re-issue device key**, which shows the provisioning link as a QR code.

## 8. Analytics

Interaction analytics from kiosks and WAY EZY GO. These measure sessions, searches and route requests, not
physical footfall. Filter by period, floor and kiosk. You get totals, daily activity, top searches,
**zero-result searches** (add these as keywords or synonyms), top destinations, categories opened, advertising
proof-of-play per campaign and a per-kiosk breakdown. **Export CSV** downloads the current view.

Demo installations include clearly labelled demo-seed events so charts are not empty. Remove them with
**Clear demo data** before go-live.

## 9. Administration

- **Venue**: centre name, address, visitor description, opening hours text, phone, email, website, timezone
  (used for opening hours and campaign schedules) and brand colour.
- **Users**: invite users with an initial password (12+ characters), change roles, deactivate, reset passwords
  (resetting signs the user out everywhere). At least one active Super Admin is always required.
- **Roles & Permissions**: the enforced permission matrix.
- **Branding**: the WAY EZY logo in light, dark and mark variants, with downloads.
- **Languages**: the visitor interface languages (English, Hindi) and how far tenant content is translated.
  Tenant text falls back to English.
- **System Settings**: QR link lifetime, analytics retention, "Powered by BrainADZ" visibility, kiosk accent
  colour, kiosk default map mode (3D or 2D), high-contrast default, support contact.
- **Audit Log**: searchable history with before/after details.

## 10. Good practice

- Publish with a short release note so the history is readable.
- Check **Zero-result searches** weekly and add keywords.
- Close corridors from COMMAND rather than taping them off only, so routes avoid them.
- Put kiosks into **Maintenance** before physical work, so their alerts don't look like faults.
