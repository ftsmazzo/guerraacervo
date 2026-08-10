/**
 * Start do container (deploy EasyPanel):
 * 1) espera Postgres
 * 2) aplica migrations Drizzle
 * 3) seed idempotente (user + tenant + membership)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "drizzle");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[bootstrap] DATABASE_URL não definida");
  process.exit(1);
}

const RUN_SEED = process.env.RUN_SEED !== "false";
const MAX_ATTEMPTS = Number(process.env.DB_WAIT_MAX_ATTEMPTS || 30);
const DELAY_MS = Number(process.env.DB_WAIT_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDb(sql) {
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    try {
      await sql`select 1`;
      console.log(`[bootstrap] Postgres ok (tentativa ${i})`);
      return;
    } catch (err) {
      console.log(
        `[bootstrap] aguardando Postgres (${i}/${MAX_ATTEMPTS}): ${err.message}`,
      );
      await sleep(DELAY_MS);
    }
  }
  throw new Error("Postgres indisponível após várias tentativas");
}

async function seed(sql) {
  const email = "admin@guerraacervo.local";
  const password = "admin123";
  const tenantSlug = "sebo-demo";

  let [admin] = await sql`
    select id from users where email = ${email} limit 1
  `;

  if (!admin) {
    const passwordHash = await bcrypt.hash(password, 10);
    [admin] = await sql`
      insert into users (email, name, password_hash, is_platform_admin)
      values (${email}, ${"Admin Plataforma"}, ${passwordHash}, ${true})
      returning id
    `;
    console.log("[bootstrap] user criado:", email);
  } else {
    console.log("[bootstrap] user já existe:", email);
  }

  let [tenant] = await sql`
    select id, slug, plan_code from tenants where slug = ${tenantSlug} limit 1
  `;

  if (!tenant) {
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 7);
    [tenant] = await sql`
      insert into tenants (
        name, slug, product, plan_code, status, trial_ends_at, store_enabled
      ) values (
        ${"Sebo Demo"},
        ${tenantSlug},
        ${"business"},
        ${"business_trial"},
        ${"trialing"},
        ${trialEnds},
        ${true}
      )
      returning id, slug, plan_code
    `;
    console.log("[bootstrap] tenant criado:", tenantSlug);
  } else {
    console.log("[bootstrap] tenant já existe:", tenantSlug);
  }

  const [membership] = await sql`
    select id from memberships
    where tenant_id = ${tenant.id} and user_id = ${admin.id}
    limit 1
  `;

  if (!membership) {
    await sql`
      insert into memberships (tenant_id, user_id, role)
      values (${tenant.id}, ${admin.id}, ${"owner"})
    `;
    console.log("[bootstrap] membership owner vinculada");
  } else {
    console.log("[bootstrap] membership já existe");
  }

  console.log("[bootstrap] Seed OK");
  console.log("  Admin:", email, "/", password);
  console.log("  Tenant:", tenant.slug, `(${tenant.plan_code})`);
}

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  try {
    await waitForDb(sql);
    const db = drizzle(sql);
    console.log("[bootstrap] aplicando migrations…");
    await migrate(db, { migrationsFolder });
    console.log("[bootstrap] migrations ok");
    if (RUN_SEED) {
      await seed(sql);
    } else {
      console.log("[bootstrap] seed pulado (RUN_SEED=false)");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("[bootstrap] falhou:", err);
  process.exit(1);
});
