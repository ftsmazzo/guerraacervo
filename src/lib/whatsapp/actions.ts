"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tenants, whatsappConnections } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";
import {
  connectInstance,
  connectionState,
  createInstance,
  deleteInstance,
  extractQrBase64,
  instanceNameForSlug,
  logoutInstance,
  resolveEvolutionConfig,
  setInstanceWebhook,
  waitForQr,
} from "@/lib/whatsapp/evolution";
import { getWhatsappConnection } from "@/lib/whatsapp/queries";

export type WhatsappActionResult =
  | {
      ok: true;
      status: string;
      qr?: string | null;
      phone?: string | null;
      message?: string;
    }
  | { ok: false; error: string };

function mapState(state?: string): "disconnected" | "qr" | "open" {
  const s = (state || "").toLowerCase();
  if (s === "open") return "open";
  if (s === "connecting" || s === "close" || s === "qr") return "qr";
  return "disconnected";
}

export async function connectWhatsapp(): Promise<WhatsappActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "store_whatsapp");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const cfg = resolveEvolutionConfig();
  if (!cfg) {
    return {
      ok: false,
      error: "Evolution API não configurada (EVOLUTION_BASE_URL / API_KEY).",
    };
  }

  const [tenant] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  if (!tenant) return { ok: false, error: "Tenant não encontrado." };

  const instance = instanceNameForSlug(tenant.slug);
  let conn = await getWhatsappConnection(ctx.tenant.id);

  try {
    let createPayload: unknown = null;
    if (!conn) {
      try {
        createPayload = await createInstance(cfg, instance);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // já existe — segue
        if (!/already|exist|409/i.test(msg)) throw e;
      }
      const [created] = await db
        .insert(whatsappConnections)
        .values({
          tenantId: ctx.tenant.id,
          instanceName: instance,
          status: "qr",
        })
        .returning();
      conn = created;
    } else {
      // reaplica connect mesmo com registro local
      createPayload = null;
    }

    await setInstanceWebhook(cfg, instance).catch(() => null);

    let qr =
      extractQrBase64(createPayload) ||
      (await waitForQr(cfg, instance, 12, 2000)).qr;

    const statePayload = await connectionState(cfg, instance).catch(() => null);
    const state =
      statePayload?.instance?.state ||
      statePayload?.state ||
      (qr ? "connecting" : "close");
    let status = mapState(state);
    if (qr) status = "qr";
    if (!qr && status === "disconnected") status = "qr";

    await db
      .update(whatsappConnections)
      .set({
        status,
        lastQr: qr,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappConnections.id, conn.id),
          eq(whatsappConnections.tenantId, ctx.tenant.id),
        ),
      );

    revalidatePath("/painel/loja");

    if (!qr) {
      return {
        ok: true,
        status: "qr",
        qr: null,
        message:
          "Instância criada, mas o QR ainda não foi gerado pela Evolution. Aguarde alguns segundos e clique em Atualizar status. Se persistir, use Desconectar e Conectar de novo.",
      };
    }

    return {
      ok: true,
      status,
      qr,
      message:
        status === "open"
          ? "WhatsApp conectado."
          : "Escaneie o QR Code com o WhatsApp do sebo.",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Falha ao conectar: ${msg}` };
  }
}

export async function refreshWhatsappStatus(): Promise<WhatsappActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  if (!ctx.tenant) return { ok: false, error: "Tenant obrigatório." };

  const cfg = resolveEvolutionConfig();
  if (!cfg) return { ok: false, error: "Evolution API não configurada." };

  const conn = await getWhatsappConnection(ctx.tenant.id);
  if (!conn) {
    return { ok: true, status: "disconnected", qr: null, phone: null };
  }

  try {
    const statePayload = await connectionState(cfg, conn.instanceName);
    const state = statePayload?.instance?.state || statePayload?.state;
    let status = mapState(state);
    let qr = conn.lastQr;

    if (status !== "open") {
      const waited = await waitForQr(cfg, conn.instanceName, 8, 1500);
      const freshQr = waited.qr || extractQrBase64(waited.raw);
      if (freshQr) {
        qr = freshQr;
        status = "qr";
      } else if (!qr) {
        // tenta um connect avulso
        const connectPayload = await connectInstance(
          cfg,
          conn.instanceName,
        ).catch(() => null);
        const once = extractQrBase64(connectPayload);
        if (once) {
          qr = once;
          status = "qr";
        }
      }
    } else {
      qr = null;
    }

    await db
      .update(whatsappConnections)
      .set({
        status,
        lastQr: qr,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConnections.id, conn.id));

    revalidatePath("/painel/loja");
    return { ok: true, status, qr, phone: conn.phone };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

export async function disconnectWhatsapp(): Promise<WhatsappActionResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "store_whatsapp");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const cfg = resolveEvolutionConfig();
  if (!cfg) return { ok: false, error: "Evolution API não configurada." };

  const conn = await getWhatsappConnection(ctx.tenant.id);
  if (!conn) return { ok: true, status: "disconnected" };

  try {
    await logoutInstance(cfg, conn.instanceName).catch(() => null);
    await deleteInstance(cfg, conn.instanceName).catch(() => null);
    await db
      .delete(whatsappConnections)
      .where(eq(whatsappConnections.id, conn.id));
    revalidatePath("/painel/loja");
    return { ok: true, status: "disconnected", message: "WhatsApp desconectado." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
