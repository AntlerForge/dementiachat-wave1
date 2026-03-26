# New Machine Handoff (GSTACK + Project)

Use this when continuing development on a different computer.

## 1) Clone and open

1. Clone `https://github.com/AntlerForge/dementiachat-wave1.git`
2. Open the repo in Cursor.
3. Read:
   - `README.md`
   - `WAVE2-SITREP.md`
   - `docs/gstack/README.md` and snapshots

## 2) App runtime setup

1. Copy `config.example.js` -> `config.js`
2. Fill `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optional keys.
3. Serve the app from local static server (not `file://`).

## 3) Supabase parity

1. Ensure `supabase/schema.sql` has been run on your target project.
2. Ensure edge functions are deployed (as needed):
   - `delayed-auto-worker`
   - `push-dispatcher`
3. Configure required environment variables for deployed functions.

## 4) Picking up GSTACK workflow on new machine

There are two modes:

### Mode A: Repo-contained context only (fastest)

- Use this repo's docs (`docs/gstack/*` + `WAVE2-SITREP.md`) as canonical context.
- Continue implementation directly with normal Cursor workflow.

### Mode B: Full GSTACK skill workflow

If you want slash-command behavior (`/office-hours`, `/plan-eng-review`, etc.), ensure your machine has the GSTACK skill pack available in the workspace session. Then:

1. Open this repository in Cursor.
2. Start with the existing context docs in `docs/gstack/`.
3. Run the next review/planning command you need (for example `/plan-eng-review`) to generate fresh artifacts.
4. Copy or summarize any new outputs back into `docs/gstack/` so context stays portable in GitHub.

## 5) Recommended operating discipline

- Treat repo docs as source of truth for cross-machine continuity.
- When plans change materially, update `WAVE2-SITREP.md` and `docs/gstack/*` in the same PR.
- Keep secrets out of repo docs (`service_role` keys, private tokens, etc.).
