import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// Sends push notifications (Expo Push Service) for an existing `notifications`
// row. Recipients are the `user_notifications` rows the web admin action
// already fanned out (push_sent = false), filtered by notification_preferences
// and joined against device_push_tokens.
//
// Caller must be the service role key, or an authenticated admin/teacher.
// Body: { "notification_id": number }

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

interface ExpoPushMessage {
  to: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  priority: "default" | "high";
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string; expoPushToken?: string };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Internal callers (web server actions, DB webhooks) pass the service role
    // key directly; everyone else needs an admin/teacher JWT.
    const bearer = authHeader.replace("Bearer ", "");
    if (bearer !== serviceRoleKey) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return json({ error: "Unauthorized" }, 401);
      }
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "teacher"]);
      if (!roles?.length) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const { notification_id } = await req.json();
    if (!notification_id) {
      return json({ error: "notification_id is required" }, 400);
    }

    const { data: notification, error: notifError } = await admin
      .from("notifications")
      .select("id, title, content, priority, metadata")
      .eq("id", notification_id)
      .single();
    if (notifError || !notification) {
      return json({ error: "Notification not found" }, 404);
    }

    // Recipients = fanned-out user_notifications not yet pushed.
    const { data: pending, error: pendingError } = await admin
      .from("user_notifications")
      .select("user_id")
      .eq("notification_id", notification_id)
      .eq("push_sent", false);
    if (pendingError) throw pendingError;
    let userIds = [...new Set((pending ?? []).map((r) => r.user_id))];
    if (!userIds.length) {
      return json({ sent: 0, recipients: 0, message: "No pending recipients" });
    }

    // Opt-out filter: only exclude users who explicitly disabled push.
    // (Registering a device token after the OS permission prompt is the
    // opt-in signal — an absent preferences row does not block.)
    const { data: optedOut } = await admin
      .from("notification_preferences")
      .select("user_id")
      .in("user_id", userIds)
      .eq("push_enabled", false);
    const optedOutIds = new Set((optedOut ?? []).map((r) => r.user_id));
    userIds = userIds.filter((id) => !optedOutIds.has(id));

    const { data: tokens, error: tokensError } = await admin
      .from("device_push_tokens")
      .select("token, user_id")
      .in("user_id", userIds);
    if (tokensError) throw tokensError;
    if (!tokens?.length) {
      return json({ sent: 0, recipients: userIds.length, message: "No registered devices" });
    }

    const body =
      notification.content.length > 170
        ? `${notification.content.slice(0, 167)}...`
        : notification.content;
    const baseMessage: Omit<ExpoPushMessage, "to"> = {
      title: notification.title,
      body,
      data: { notification_id: notification.id, url: notification.metadata?.url ?? null },
      sound: "default",
      priority: ["high", "urgent"].includes(notification.priority) ? "high" : "default",
    };

    const tickets: ExpoPushTicket[] = [];
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseMessage, to: chunk.map((t) => t.token) }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Expo push API ${res.status}: ${text}`);
        continue;
      }
      const { data } = await res.json();
      // Tickets come back in the same order as the tokens sent.
      (data as ExpoPushTicket[]).forEach((ticket, idx) => {
        tickets.push(ticket);
        if (ticket.details?.error === "DeviceNotRegistered") {
          ticket.details.expoPushToken = chunk[idx].token;
        }
      });
    }

    // Prune tokens Expo says are dead.
    const deadTokens = tickets
      .filter((t) => t.details?.error === "DeviceNotRegistered" && t.details.expoPushToken)
      .map((t) => t.details!.expoPushToken!);
    if (deadTokens.length) {
      await admin.from("device_push_tokens").delete().in("token", deadTokens);
    }

    const sentCount = tickets.filter((t) => t.status === "ok").length;

    const { error: markError } = await admin
      .from("user_notifications")
      .update({ push_sent: true, push_sent_at: new Date().toISOString() })
      .eq("notification_id", notification_id)
      .in("user_id", userIds);
    if (markError) throw markError;

    return json({
      sent: sentCount,
      recipients: userIds.length,
      devices: tokens.length,
      pruned_tokens: deadTokens.length,
      errors: tickets.filter((t) => t.status === "error").map((t) => t.message),
    });
  } catch (error) {
    console.error("send-push error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal error" }, 500);
  }
});
