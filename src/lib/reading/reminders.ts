import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { readingPlans } from "@/db/schema";
import { listEnabledReadingPlans, pagesReadOn } from "@/lib/reading/queries";
import {
  hmInTimeZone,
  parseRemindAt,
  todayInTimeZone,
} from "@/lib/reading/types";
import { sendPushToTenant } from "@/lib/push/send";

export async function runReadingReminders() {
  const plans = await listEnabledReadingPlans();
  let sent = 0;
  let skipped = 0;

  for (const plan of plans) {
    const tz = plan.timezone || "America/Sao_Paulo";
    const today = todayInTimeZone(tz);
    const last = plan.lastRemindedOn
      ? String(plan.lastRemindedOn).slice(0, 10)
      : null;
    if (last === today) {
      skipped += 1;
      continue;
    }
    const now = hmInTimeZone(tz);
    const target = parseRemindAt(plan.remindAt);
    const nowMin = now.hour * 60 + now.minute;
    const targetMin = target.hour * 60 + target.minute;
    if (nowMin < targetMin) {
      skipped += 1;
      continue;
    }

    const todayPages = await pagesReadOn(plan.tenantId, today);
    if (todayPages >= plan.dailyPages) {
      await db
        .update(readingPlans)
        .set({ lastRemindedOn: today, updatedAt: new Date() })
        .where(and(eq(readingPlans.id, plan.id)));
      skipped += 1;
      continue;
    }

    const result = await sendPushToTenant(plan.tenantId, {
      title: "Sua hora de ler",
      body: `Ainda faltam ${Math.max(0, plan.dailyPages - todayPages)} página(s) da meta de hoje.`,
      url: "/painel/leitura",
      tag: "ga-reading",
    });
    sent += result.sent;

    await db
      .update(readingPlans)
      .set({ lastRemindedOn: today, updatedAt: new Date() })
      .where(and(eq(readingPlans.id, plan.id)));
  }

  return { plans: plans.length, sent, skipped };
}
