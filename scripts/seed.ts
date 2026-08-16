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

  const [demo] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug));

  if (demo) {
    await db
      .delete(memberships)
      .where(
        and(eq(memberships.tenantId, demo.id), eq(memberships.userId, admin.id)),
      );
  }

  console.log("Seed OK");
  console.log("  Admin:", email, "/", password);
  console.log("  /admin não exige sebo vinculado");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
