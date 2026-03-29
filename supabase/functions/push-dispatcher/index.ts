import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PUSH_VAPID_PUBLIC_KEY = Deno.env.get("PUSH_VAPID_PUBLIC_KEY") || "";
const PUSH_VAPID_PRIVATE_KEY = Deno.env.get("PUSH_VAPID_PRIVATE_KEY") || "";
const PUSH_VAPID_SUBJECT =
  Deno.env.get("PUSH_VAPID_SUBJECT") || "mailto:carechat@example.com";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!PUSH_VAPID_PUBLIC_KEY || !PUSH_VAPID_PRIVATE_KEY) {
  throw new Error("Missing PUSH_VAPID_PUBLIC_KEY or PUSH_VAPID_PRIVATE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
webpush.setVapidDetails(PUSH_VAPID_SUBJECT, PUSH_VAPID_PUBLIC_KEY, PUSH_VAPID_PRIVATE_KEY);

type NotificationJob = {
  id: string;
  conversation_id: string;
  message_id: string;
  recipient_user_id: string;
  attempts: number;
  messages: {
    sender_role: string | null;
    content: string | null;
    image_url: string | null;
    created_at: string;
  } | null;
};

async function claimJobs(limit = 25): Promise<NotificationJob[]> {
  const { data, error } = await supabase
    .from("notification_jobs")
    .select(
      "id, conversation_id, message_id, recipient_user_id, attempts, messages(sender_role, content, image_url, created_at)"
    )
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(Math.max(1, limit));
  if (error) throw error;
  return (data || []) as NotificationJob[];
}

async function markJobSent(jobId: string) {
  const { error } = await supabase
    .from("notification_jobs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      last_error: null,
      attempts: 0,
    })
    .eq("id", jobId);
  if (error) throw error;
}

async function markJobFailed(jobId: string, attempts: number, reason: string) {
  const backoffMinutes = Math.min(60, Math.max(1, attempts) * 2);
  const nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString();
  const { error } = await supabase
    .from("notification_jobs")
    .update({
      status: "pending",
      attempts: attempts + 1,
      next_retry_at: nextRetryAt,
      last_error: reason.slice(0, 500),
    })
    .eq("id", jobId);
  if (error) throw error;
}

async function loadActiveSubscriptions(recipientUserId: string, conversationId: string) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", recipientUserId)
    .eq("conversation_id", conversationId)
    .eq("is_active", true);
  if (error) throw error;
  return data || [];
}

async function deactivateSubscription(subscriptionId: string) {
  await supabase
    .from("push_subscriptions")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId);
}

function buildPushPayload(job: NotificationJob) {
  const senderRole = String(job.messages?.sender_role || "").toLowerCase();
  const isFromCaregiver = senderRole === "caregiver";
  const messageText =
    job.messages?.content && job.messages.content.trim()
      ? job.messages.content.trim()
      : job.messages?.image_url
      ? "[Photo]"
      : "New message";
  return JSON.stringify({
    title: isFromCaregiver ? "Tony sent a message" : "Dad sent a message",
    body: messageText.slice(0, 120),
    url: "/?cloud=1",
    tag: `${isFromCaregiver ? "caregiver" : "dad"}-message-${job.message_id}`,
  });
}

Deno.serve(async (_req) => {
  try {
    const jobs = await claimJobs(25);
    let sent = 0;
    let failed = 0;
    let deactivatedSubscriptions = 0;

    for (const job of jobs) {
      try {
        const subscriptions = await loadActiveSubscriptions(
          job.recipient_user_id,
          job.conversation_id
        );
        if (!subscriptions.length) {
          await markJobFailed(job.id, job.attempts, "No active push subscriptions");
          failed += 1;
          continue;
        }

        const payload = buildPushPayload(job);
        let deliveredCount = 0;
        for (const sub of subscriptions) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              payload
            );
            deliveredCount += 1;
          } catch (err) {
            const statusCode = Number(err?.statusCode || err?.status || 0);
            if (statusCode === 404 || statusCode === 410) {
              await deactivateSubscription(sub.id);
              deactivatedSubscriptions += 1;
              continue;
            }
            throw err;
          }
        }

        if (deliveredCount > 0) {
          await markJobSent(job.id);
          sent += 1;
        } else {
          await markJobFailed(job.id, job.attempts, "No active deliveries");
          failed += 1;
        }
      } catch (err) {
        await markJobFailed(job.id, job.attempts, String(err?.message || err));
        failed += 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        claimed: jobs.length,
        sent,
        failed,
        deactivatedSubscriptions,
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
