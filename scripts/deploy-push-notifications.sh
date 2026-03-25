#!/usr/bin/env bash
# Deploy Web Push worker + VAPID secrets to Supabase.
#
# One-time: log in to Supabase CLI (opens browser):
#   cd "$(dirname "$0")/.." && npx supabase login
#
# Optional: link this folder to your cloud project (if not already):
#   npx supabase link --project-ref YOUR_PROJECT_REF
#   (Project ref = subdomain of https://YOUR_REF.supabase.co)
#
# Then run this script from repo root (keys are NOT stored in git):
#   export PUSH_VAPID_PUBLIC_KEY='...'
#   export PUSH_VAPID_PRIVATE_KEY='...'
#   ./scripts/deploy-push-notifications.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUB="${PUSH_VAPID_PUBLIC_KEY:-}"
PRIV="${PUSH_VAPID_PRIVATE_KEY:-}"
SUBJECT="${PUSH_VAPID_SUBJECT:-mailto:tonybarfoot@mac.com}"

if [[ -z "$PUB" || -z "$PRIV" ]]; then
  echo "Set PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY in your environment, then re-run."
  echo "Generate with: npx web-push generate-vapid-keys"
  exit 1
fi

echo "Setting Edge Function secrets..."
npx supabase secrets set \
  "PUSH_VAPID_PUBLIC_KEY=${PUB}" \
  "PUSH_VAPID_PRIVATE_KEY=${PRIV}" \
  "PUSH_VAPID_SUBJECT=${SUBJECT}"

echo "Deploying push-dispatcher..."
npx supabase functions deploy push-dispatcher --no-verify-jwt

echo ""
echo "Done. In Supabase Dashboard → Edge Functions → push-dispatcher → Schedules:"
echo "  Add a cron every 1 minute calling the function (or use pg_cron / external cron hitting the invoke URL)."
echo "  See supabase/functions/README.md"
