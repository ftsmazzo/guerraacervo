import webpush from "web-push";
import { listPushSubscriptions } from "@/lib/push/subscriptions";
import type { PushSubscriptionJSON } from "@/lib/push/types";
import { appPublicUrl } from "@/lib/stripe/client";

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function configureVapid() {
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() ||
    `mailto:ops@${new URL(appPublicUrl()).hostname}`;
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function sendPushToTenant(
  tenantId: string,
  payload: {
    title: string;
    body: string;
    url: string;
  },
) {
  if (!configureVapid()) {
    console.info("[push] VAPID não configurado — pulando.");
    return { sent: 0 };
  }

  const subs = await listPushSubscriptions(tenantId);
  if (!subs.length) return { sent: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub as webpush.PushSubscription, body, {
        TTL: 60 * 60,
        urgency: "high",
      });
      sent += 1;
    } catch (e) {
      const status =
        e && typeof e === "object" && "statusCode" in e
          ? Number((e as { statusCode: number }).statusCode)
          : 0;
      console.warn("[push] falha", status, sub.endpoint.slice(0, 48));
      // 404/410 = subscription morta — remove
      if (status === 404 || status === 410) {
        try {
          const { getRedis } = await import("@/lib/redis");
          const redis = getRedis();
          if (redis.status !== "ready") await redis.connect().catch(() => null);
          const all = await redis.hgetall(`ga:tenant:${tenantId}:push_subs`);
          for (const [uid, raw] of Object.entries(all)) {
            try {
              const parsed = JSON.parse(raw) as PushSubscriptionJSON;
              if (parsed.endpoint === sub.endpoint) {
                await redis.hdel(`ga:tenant:${tenantId}:push_subs`, uid);
              }
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore cleanup
        }
      }
    }
  }
  return { sent };
}
