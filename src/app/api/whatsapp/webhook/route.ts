import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";
import {
  ensureInstanceWebhook,
  resolveEvolutionConfig,
} from "@/lib/whatsapp/evolution";
import { handleInboundMessage } from "@/lib/whatsapp/agent/router";
import {
  rememberLidPhone,
  resolvePhoneFromLid,
} from "@/lib/whatsapp/lid-map";
import { getConnectionByInstance } from "@/lib/whatsapp/queries";

export const runtime = "nodejs";

function eventName(body: Record<string, unknown>): string {
  const e = body.event || body.type || "";
  return String(e).toLowerCase();
}

function unwrapMessage(
  msg: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!msg || typeof msg !== "object") return null;
  const ephemeral = msg.ephemeralMessage as
    | { message?: Record<string, unknown> }
    | undefined;
  if (ephemeral?.message) return unwrapMessage(ephemeral.message);
  const viewOnce = msg.viewOnceMessage as
    | { message?: Record<string, unknown> }
    | undefined;
  if (viewOnce?.message) return unwrapMessage(viewOnce.message);
  const viewOnceV2 = msg.viewOnceMessageV2 as
    | { message?: Record<string, unknown> }
    | undefined;
  if (viewOnceV2?.message) return unwrapMessage(viewOnceV2.message);
  return msg;
}

function extractText(message: Record<string, unknown>): string {
  const raw = (message.message || message) as Record<string, unknown>;
  const msg = unwrapMessage(raw);
  if (!msg) return "";
  if (typeof msg.conversation === "string") return msg.conversation;
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const btn = msg.buttonsResponseMessage as
    | { selectedDisplayText?: string }
    | undefined;
  if (btn?.selectedDisplayText) return btn.selectedDisplayText;
  const list = msg.listResponseMessage as
    | { title?: string; singleSelectReply?: { selectedRowId?: string } }
    | undefined;
  if (list?.title) return list.title;
  return "";
}

/** Prefer phone JID over WhatsApp LID (@lid). */
function resolveRemoteJidSync(m: Record<string, unknown>): {
  jid: string;
  lid?: string;
  phoneAlt?: string;
} {
  const key = (m.key || {}) as {
    remoteJid?: string;
    remoteJidAlt?: string;
    participant?: string;
    participantAlt?: string;
  };
  const candidates = [
    key.remoteJidAlt,
    key.participantAlt,
    key.remoteJid,
    key.participant,
    typeof m.remoteJid === "string" ? m.remoteJid : "",
  ].filter(Boolean) as string[];

  const phoneJid = candidates.find((j) => j.includes("@s.whatsapp.net"));
  const lidJid = candidates.find((j) => j.includes("@lid"));

  if (phoneJid) {
    return { jid: phoneJid, lid: lidJid, phoneAlt: phoneJid };
  }

  const nonLid = candidates.find((j) => j && !j.includes("@lid"));
  if (nonLid) return { jid: nonLid, lid: lidJid };

  return { jid: candidates[0] || "", lid: lidJid };
}

export async function POST(request: Request) {
  const cfg = resolveEvolutionConfig();
  if (!cfg) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const secret =
    url.searchParams.get("secret") ||
    request.headers.get("x-webhook-secret") ||
    "";
  if (secret !== cfg.webhookSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const evt = eventName(body);
  const instance =
    String(
      body.instance ||
        (body.data as { instance?: string } | undefined)?.instance ||
        "",
    ) || "";

  try {
    if (evt.includes("connection") && instance) {
      const data = (body.data || body) as Record<string, unknown>;
      const state = String(
        data.state ||
          (data.instance as { state?: string } | undefined)?.state ||
          "",
      ).toLowerCase();
      const conn = await getConnectionByInstance(instance);
      if (conn) {
        const status =
          state === "open"
            ? "open"
            : state === "close"
              ? "disconnected"
              : "qr";
        await db
          .update(whatsappConnections)
          .set({
            status,
            lastQr: status === "open" ? null : conn.lastQr,
            phone:
              typeof data.wuid === "string"
                ? String(data.wuid).split("@")[0]
                : conn.phone,
            updatedAt: new Date(),
          })
          .where(eq(whatsappConnections.id, conn.id));

        // Definitivo: toda vez que abre (troca de chip / QR), reaplica webhook
        if (status === "open") {
          await ensureInstanceWebhook(cfg, instance);
        }
      }
    }

    if (evt.includes("qrcode") && instance) {
      const data = (body.data || body) as Record<string, unknown>;
      const qr =
        typeof data.qrcode === "string"
          ? data.qrcode
          : typeof data.base64 === "string"
            ? data.base64
            : null;
      const conn = await getConnectionByInstance(instance);
      if (conn && qr) {
        await db
          .update(whatsappConnections)
          .set({ status: "qr", lastQr: qr, updatedAt: new Date() })
          .where(eq(whatsappConnections.id, conn.id));
      }
    }

    if (evt.includes("messages.upsert") || evt.includes("messages_upsert")) {
      const data = (body.data || body) as Record<string, unknown>;
      const messages = Array.isArray(data)
        ? data
        : Array.isArray(data.messages)
          ? (data.messages as Record<string, unknown>[])
          : [data];

      for (const m of messages) {
        const key = (m.key || {}) as {
          fromMe?: boolean;
        };
        if (key.fromMe) continue;

        const resolved = resolveRemoteJidSync(m);
        if (resolved.lid && resolved.phoneAlt) {
          await rememberLidPhone(resolved.lid, resolved.phoneAlt);
        }

        let remoteJid = resolved.jid;
        if (remoteJid.includes("@lid")) {
          const mapped = await resolvePhoneFromLid(remoteJid);
          if (mapped) {
            remoteJid = mapped.includes("@")
              ? mapped
              : `${mapped}@s.whatsapp.net`;
          }
        }

        if (!remoteJid) continue;
        const text = extractText(m);
        if (!text.trim()) continue;
        const pushName =
          typeof m.pushName === "string" ? m.pushName : undefined;
        const instanceName =
          instance ||
          String(m.instance || body.instance || "").trim() ||
          "";
        if (!instanceName) {
          console.error("[whatsapp webhook] instance vazio", {
            evt,
            remoteJid,
          });
          continue;
        }
        try {
          await handleInboundMessage({
            instanceName,
            remoteJid,
            text,
            pushName,
          });
        } catch (err) {
          console.error("[whatsapp webhook] handler", err);
        }
      }
    }
  } catch (e) {
    console.error("[whatsapp webhook]", e);
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const cfg = resolveEvolutionConfig();
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || "";
  if (!cfg || secret !== cfg.webhookSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    service: "guerraacervo-whatsapp-webhook",
  });
}
