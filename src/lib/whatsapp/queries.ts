import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bookTags,
  clientInterestTags,
  clientProfiles,
  clients,
  orderItems,
  tags,
  whatsappConnections,
} from "@/db/schema";

export async function getWhatsappConnection(tenantId: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

export async function getConnectionByInstance(instanceName: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(eq(whatsappConnections.instanceName, instanceName))
    .limit(1);
  return row ?? null;
}

export async function findClientByWhatsapp(
  tenantId: string,
  phoneDigits: string,
) {
  const variants = [phoneDigits];
  if (phoneDigits.startsWith("55") && phoneDigits.length > 11) {
    variants.push(phoneDigits.slice(2));
  } else if (!phoneDigits.startsWith("55")) {
    variants.push(`55${phoneDigits}`);
  }

  for (const v of variants) {
    const [row] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.whatsapp, v)))
      .limit(1);
    if (row) return row;

    // match digits-only stored with formatting — scan small set via ilike last digits
    const last8 = v.slice(-8);
    if (last8.length >= 8) {
      const matches = await db
        .select()
        .from(clients)
        .where(and(eq(clients.tenantId, tenantId)))
        .limit(200);
      const found = matches.find((c) => {
        const d = (c.whatsapp || "").replace(/\D/g, "");
        return d === v || d.endsWith(last8) || d === `55${v}` || `55${d}` === v;
      });
      if (found) return found;
    }
  }
  return null;
}

export async function getOrCreateClientProfile(
  tenantId: string,
  clientId: string,
) {
  const [existing] = await db
    .select()
    .from(clientProfiles)
    .where(eq(clientProfiles.clientId, clientId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(clientProfiles)
    .values({
      tenantId,
      clientId,
      onboardingStatus: "pending",
      onboardingStep: "welcome",
    })
    .returning();
  return created;
}

export async function upsertInterestTags(
  tenantId: string,
  clientId: string,
  tagNames: string[],
  source: "declared" | "purchase" | "engagement",
  weight = 1,
) {
  const cleaned = [
    ...new Set(
      tagNames
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 80),
    ),
  ];
  for (const tag of cleaned) {
    const [existing] = await db
      .select()
      .from(clientInterestTags)
      .where(
        and(
          eq(clientInterestTags.clientId, clientId),
          eq(clientInterestTags.tag, tag),
          eq(clientInterestTags.source, source),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(clientInterestTags)
        .set({
          weight: existing.weight + weight,
          updatedAt: new Date(),
        })
        .where(eq(clientInterestTags.id, existing.id));
    } else {
      await db.insert(clientInterestTags).values({
        tenantId,
        clientId,
        tag,
        source,
        weight,
      });
    }
  }
}

/** Grava tags dos livros do pedido como preferências de compra */
export async function applyPurchaseTagsFromOrder(
  tenantId: string,
  clientId: string,
  orderId: string,
) {
  const rows = await db
    .select({ name: tags.name })
    .from(orderItems)
    .innerJoin(bookTags, eq(bookTags.bookId, orderItems.bookId))
    .innerJoin(tags, eq(tags.id, bookTags.tagId))
    .where(eq(orderItems.orderId, orderId));

  const names = rows.map((r) => r.name);
  if (!names.length) return;
  await upsertInterestTags(tenantId, clientId, names, "purchase", 2);
  await getOrCreateClientProfile(tenantId, clientId);
}

export async function listOptInClientsWithWhatsapp(tenantId: string) {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      whatsapp: clients.whatsapp,
    })
    .from(clients)
    .innerJoin(clientProfiles, eq(clientProfiles.clientId, clients.id))
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clientProfiles.optInNotices, true),
      ),
    );
}
