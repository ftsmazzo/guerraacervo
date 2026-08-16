import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import {
  parseRewardConfig,
  REFERRAL_REWARDS,
  REFERRAL_SETTINGS_KEY,
  type ReferralRewardConfig,
} from "@/lib/referrals/config";

export async function loadReferralRewards(): Promise<ReferralRewardConfig> {
  try {
    const [row] = await db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, REFERRAL_SETTINGS_KEY))
      .limit(1);
    if (!row) return REFERRAL_REWARDS;
    return parseRewardConfig(row.value);
  } catch {
    return REFERRAL_REWARDS;
  }
}

export async function saveReferralRewards(config: ReferralRewardConfig) {
  const now = new Date();
  await db
    .insert(platformSettings)
    .values({
      key: REFERRAL_SETTINGS_KEY,
      value: config as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value: config as unknown as Record<string, unknown>,
        updatedAt: now,
      },
    });
}
