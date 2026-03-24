// Supabase Edge Function: delayed-auto-worker
// Claims due outbox rows, sends one auto-response per claimed row, and marks sent/failed.
// Deploy with service role key; do not expose this endpoint publicly without auth guard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildSafeAutoReply(): string {
  return "Thanks for your message. I saw it and will reply as soon as I can.";
}

Deno.serve(async (_req) => {
  try {
    const { data: rows, error: claimErr } = await supabase.rpc("worker_claim_due_outbox", {
      p_limit: 25,
    });
    if (claimErr) throw claimErr;

    const claimed = rows || [];
    let sent = 0;
    let failed = 0;

    for (const row of claimed) {
      try {
        const reply = buildSafeAutoReply();
        const { error: markErr } = await supabase.rpc("worker_mark_outbox_sent", {
          p_outbox_id: row.id,
          p_system_message_content: reply,
        });
        if (markErr) throw markErr;
        sent += 1;
      } catch (err) {
        failed += 1;
        await supabase.rpc("worker_mark_outbox_failed", {
          p_outbox_id: row.id,
          p_reason: String(err?.message || err),
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        claimed: claimed.length,
        sent,
        failed,
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message || err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
