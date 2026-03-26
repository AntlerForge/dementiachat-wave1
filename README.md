# Wave 1 Care Chat

Wave 1 implementation for a dementia-focused father/son chat experience.

- Single persistent thread (dad <-> caregiver)
- Trust Levels 1-3 only (Manual, Suggested, Delayed Auto)
- Caregiver-first controls with separate tabs
- Staged dad UI apply (`Preview` -> explicit `Apply to Dad`)
- Offline local outbox with `sending/sent/failed` states
- Supabase-first backend model with RLS-ready SQL
- Deployed static frontend + managed Supabase backend

## Current implementation status (2026-03-25)

Shipped and running with no known active bugs in current deployment.

Implemented highlights:

- Two-device cloud messaging with persistent history
- Caregiver moderation controls (edit/hide) with revision-safe backend flow
- Remote Dad UI controls (font, theme, bubble width, image defaults) with staged apply
- Dad-side naming/tone updates (`Tony Chat`, non-patronizing copy)
- Message auto-scroll and auto-refresh on inbound updates
- Caregiver queue panel is viewport-bounded and scrollable
- Photo send path with local image handling and display-size metadata
- Outbox reliability hardening, duplicate-send recovery, and safer cache behavior
- Service worker cache safeguards to avoid stale Supabase/chat reads
- Push-notification scaffolding (`push-dispatcher`, VAPID config hooks)

## Wave 2 direction (proposed)

1. AI confidence + handoff policy
2. Context timeline (appointments/check-ins/notes) for caregiver and AI prompts
3. Priority escalation channels and delivery observability
4. Backup caregiver coordination and permission boundaries
5. Production hardening: auth recovery UX, auditing dashboards, and reliability SLOs

## Run locally

This version is static and needs no npm install.

1. Configure `config.js` from `config.example.js`.
2. Serve the folder with any static server (for service worker support). On Windows:
   - `powershell -ExecutionPolicy Bypass -File .\serve.ps1`
3. Open `index.html` in browser via local server URL (not `file://`).

### Supabase setup (no code edits required)

1. Create a Supabase project.
2. Run `supabase/schema.sql` in SQL editor.
3. Copy `config.example.js` to `config.js` and fill URL + anon key.
4. Deploy edge functions:
   - `supabase/functions/delayed-auto-worker`
   - `supabase/functions/push-dispatcher`
5. Schedule the delayed-auto worker endpoint every minute for Level-3 processing.

## Files

- `index.html` - App shell and layout
- `styles.css` - Calm, low-stimulus UI style
- `app.js` - UI logic, trust level controls, outbox sync
- `manifest.webmanifest` - PWA metadata
- `sw.js` - Basic cache/offline support
- `_headers` - Netlify cache header controls (service worker safety)
- `scripts/deploy-push-notifications.sh` - push setup helper script
- `serve.ps1` - simple local static server helper
- `WAVE2-SITREP.md` - current status and proposed Wave 2 scope
- `supabase/schema.sql` - Wave 1 schema + policy scaffolding
- `supabase/functions/delayed-auto-worker/index.ts` - delayed auto worker
- `supabase/functions/push-dispatcher/index.ts` - push dispatch worker

## Notes

- This remains a Wave 1 product: Levels 4-5 are still deferred.
- Delayed auto is active via SQL worker flow + scheduler/edge-function runtime.
- Keep `config.js` client-safe only (publishable key only; never add service-role key).
