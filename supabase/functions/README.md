# Supabase Functions

## delayed-auto-worker

Purpose:
- Claim due delayed-auto rows from `delayed_outbox`
- Send exactly one auto-response per claimed row
- Mark each row as `sent` or `failed`

Environment variables required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Suggested schedule:
- Run every 1 minute for small deployments
- Increase interval as volume grows and batch size is tuned

Security notes:
- Keep service role key server-side only
- Restrict invocation (cron/scheduler only)
- Do not expose this as an unauthenticated public API
