import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { whatsappConnections } from "@/db/schema";
import { resolveEvolutionConfig } from "@/lib/whatsapp/evolution";
import { handleInboundMessage } from "@/lib/whatsapp/agent/router";
import { getConnectionByInstance } from "@/lib/whatsapp/queries";

export const runtime = "nodejs";

function eventName(body: Record<string, unknown>): string {
  const e = body.event || body.type || "";
  return String(e).toLowerCase();
}

function extractText(message: Record<string, unknown>): string {
  const msg = (message.message || message) as Record<string, unknown>;
  if (!msg || typeof msg !== "object") return "";
  if (typeof msg.conversation === "string") return msg.conversation;
  const ext = msg.extendedTextMessage as { text?: string } | undefined;
  if (ext?.text) return ext.text;
  const btn = msg.buttonsResponseMessage as { selectedDisplayText?: string } | undefined;
  if (btn?.selectedDisplayText) return btn.selectedDisplayText;
  return "";
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
      // Evolution may send data as message object or { key, message, ... }
      const messages = Array.isArray(data)
        ? data
        : Array.isArray(data.messages)
          ? (data.messages as Record<string, unknown>[])
          : [data];

      for (const m of messages) {
        const key = (m.key || {}) as {
          fromMe?: boolean;
          remoteJid?: string;
        };
        if (key.fromMe) continue;
        const remoteJid = key.remoteJid || String(m.remoteJid || "");
        if (!remoteJid) continue;
        const text = extractText(m);
        if (!text.trim()) continue;
        const pushName =
          typeof m.pushName === "string" ? m.pushName : undefined;
        await handleInboundMessage({
          instanceName: instance || String(m.instance || ""),
          remoteJid,
          text,
          pushName,
        });
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
