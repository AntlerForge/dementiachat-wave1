import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type DiagRow = {
  created_at: string;
  payload: Record<string, unknown> | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const conversationId = String(url.searchParams.get("conversation_id") || "").trim();
    const limitRaw = Number(url.searchParams.get("limit") || 120);
    const limit = Math.max(10, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 120));
    if (!conversationId) {
      return json({ ok: false, error: "conversation_id query parameter is required" }, 400);
    }

    const { data, error } = await supabase
      .from("activity_events")
      .select("created_at, payload")
      .eq("conversation_id", conversationId)
      .eq("event_type", "client_diag")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return json({ ok: false, error: error.message }, 500);
    const rows = (data || []) as DiagRow[];
    const countsByEvent: Record<string, number> = {};
    let lastByRole: Record<string, string> = {};
    for (const row of rows) {
      const event = String(row?.payload?.event || "unknown");
      countsByEvent[event] = (countsByEvent[event] || 0) + 1;
      const role = String(row?.payload?.role || "unknown");
      if (!lastByRole[role]) lastByRole[role] = String(row.created_at || "");
    }

    return json({
      ok: true,
      conversation_id: conversationId,
      total_rows: rows.length,
      summary: {
        counts_by_event: countsByEvent,
        last_by_role: lastByRole,
      },
      rows,
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
});

