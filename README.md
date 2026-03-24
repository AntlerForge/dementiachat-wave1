# Wave 1 Care Chat

Wave 1 implementation scaffold for a dementia-focused caregiver chat:

- Single persistent thread (dad <-> caregiver)
- Trust Levels 1-3 only (Manual, Suggested, Delayed Auto)
- Caregiver-first controls with separate tabs
- Staged dad UI apply (`Preview` -> explicit `Apply to Dad`)
- Offline local outbox with `sending/sent/failed` states
- Supabase-first backend model with RLS-ready SQL

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
4. (Optional but recommended) deploy edge function in `supabase/functions/delayed-auto-worker`.
5. Schedule the worker endpoint every minute for Level-3 delayed auto processing.

## Files

- `index.html` - App shell and layout
- `styles.css` - Calm, low-stimulus UI style
- `app.js` - UI logic, trust level controls, outbox sync
- `manifest.webmanifest` - PWA metadata
- `sw.js` - Basic cache/offline support
- `serve.ps1` - simple local static server helper
- `supabase/schema.sql` - Wave 1 schema + policy scaffolding
- `supabase/functions/delayed-auto-worker/index.ts` - delayed auto worker

## Notes

- This is a Wave 1 foundation, not a complete production deployment.
- Delayed auto is implemented as SQL worker flow + edge function scaffold; enable with scheduler deployment.
- Keep Level 4-5 (priority escalation, coordinated backup) deferred.
