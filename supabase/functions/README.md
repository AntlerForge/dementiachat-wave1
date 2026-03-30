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

## push-dispatcher

Purpose:
- Claim pending rows from `notification_jobs`
- Deliver Web Push notifications to active `push_subscriptions`
- Mark jobs as sent or retry with backoff

Environment variables required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT` (e.g. `mailto:you@example.com`)

Suggested schedule:
- Run every 30-60 seconds for near-real-time push

Security notes:
- Keep VAPID private key server-side only
- Restrict invocation (cron/scheduler only)

## diagnostics-read

Purpose:
- Read recent `client_diag` rows from `activity_events`
- Return summary counts and last-seen times by role
- Provide autonomous lockup diagnostics without browser DevTools access

Environment variables required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Endpoint query parameters:
- `conversation_id` (required)
- `limit` (optional, default 120, min 10 max 500)

Security notes:
- Uses service role key and should be restricted to trusted operators.
