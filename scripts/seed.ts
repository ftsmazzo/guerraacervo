import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { memberships, tenants, users } from "../src/db/schema";

async function main() {
  const email = "admin@guerraacervo.local";
  const password = "admin123";

  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length) {
    console.log("Seed já aplicado:", email);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [admin] = await db
    .insert(users)
    .values({
      email,
      name: "Admin Plataforma",
      passwordHash,
      isPlatformAdmin: true,
    })
    .returning();

  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 7);

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Sebo Demo",
      slug: "sebo-demo",
      product: "business",
      planCode: "business_trial",
      status: "trialing",
      trialEndsAt: trialEnds,
      storeEnabled: true,
    })
    .returning();

  await db.insert(memberships).values({
    tenantId: tenant.id,
    userId: admin.id,
    role: "owner",
  });

  console.log("Seed OK");
  console.log("  Admin:", email, "/", password);
  console.log("  Tenant:", tenant.slug, `(${tenant.planCode})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
