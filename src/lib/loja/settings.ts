"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getAuthContext } from "@/lib/auth/context";
import { assertTenantCanWrite } from "@/lib/auth/guards";
import { normalizePhone } from "@/lib/whatsapp/evolution";

export type LojaSettingsResult =
  | { ok: true; phone: string | null }
  | { ok: false; error: string };

export async function getReservationNotifyWhatsapp(): Promise<string | null> {
  const ctx = await getAuthContext();
  if (!ctx?.tenant) return null;
  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);
  const settings = (tenant?.settings || {}) as Record<string, unknown>;
  const raw = settings.reservationNotifyWhatsapp;
  return typeof raw === "string" ? raw : null;
}

export async function saveReservationNotifyWhatsapp(
  phoneRaw: string,
): Promise<LojaSettingsResult> {
  const ctx = await getAuthContext();
  if (!ctx) return { ok: false, error: "Não autenticado." };
  try {
    assertTenantCanWrite(ctx, "store_whatsapp");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const trimmed = phoneRaw.trim();
  let phone: string | null = null;
  if (trimmed) {
    phone = normalizePhone(trimmed);
    if (!phone || phone.length < 12) {
      return { ok: false, error: "WhatsApp inválido. Use DDD + número." };
    }
  }

  const [tenant] = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenant.id))
    .limit(1);

  const prev = (tenant?.settings || {}) as Record<string, unknown>;
  const next = { ...prev };
  if (phone) next.reservationNotifyWhatsapp = phone;
  else delete next.reservationNotifyWhatsapp;

  await db
    .update(tenants)
    .set({ settings: next, updatedAt: new Date() })
    .where(eq(tenants.id, ctx.tenant.id));

  revalidatePath("/painel/loja");
  return { ok: true, phone };
}
