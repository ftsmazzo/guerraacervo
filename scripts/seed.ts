import "dotenv/config";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { memberships, tenants, users } from "../src/db/schema";

async function main() {
  const email = "admin@guerraacervo.local";
  const password = "admin123";
  const tenantSlug = "sebo-demo";

  let [admin] = await db.select().from(users).where(eq(users.email, email));
  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 10);
    [admin] = await db
      .insert(users)
      .values({
        email,
        name: "Admin Plataforma",
        passwordHash,
        isPlatformAdmin: true,
      })
      .returning();
    console.log("User criado:", email);
  } else {
    console.log("User já existe:", email);
  }

  let [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (!tenant) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    [tenant] = await db
      .insert(tenants)
      .values({
        name: "Sebo Demo",
        slug: tenantSlug,
        product: "business",
        planCode: "business_trial",
        status: "trialing",
        trialEndsAt: trialEnds,
        storeEnabled: true,
      })
      .returning();
    console.log("Tenant criado:", tenantSlug);
  } else {
    console.log("Tenant já existe:", tenantSlug);
  }

  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.tenantId, tenant.id),
        eq(memberships.userId, admin.id),
      ),
    );

  if (!membership) {
    await db.insert(memberships).values({
      tenantId: tenant.id,
      userId: admin.id,
      role: "owner",
    });
    console.log("Membership criada");
  } else {
    console.log("Membership já existe");
  }

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
