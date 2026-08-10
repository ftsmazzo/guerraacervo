import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const productEnum = pgEnum("product", ["personal", "business"]);
export const tenantStatusEnum = pgEnum("tenant_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "suspended",
]);
export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "staff",
  "readonly",
]);
export const bookConditionEnum = pgEnum("book_condition", [
  "Novo",
  "Ótimo",
  "Bom",
  "Regular",
]);
export const coverTypeEnum = pgEnum("cover_type", ["Brochura", "Capa Dura"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "Dinheiro",
  "Pix",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Transferência",
  "Outro",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "Aguardando Pagamento",
  "Pago",
  "Enviado",
  "Entregue",
  "Cancelado",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

/** Conta / sebo / coleção — isolamento multi-tenant */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    product: productEnum("product").notNull().default("business"),
    planCode: varchar("plan_code", { length: 40 }).notNull(),
    status: tenantStatusEnum("status").notNull().default("trialing"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 120 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 120 }),
    storeEnabled: boolean("store_enabled").notNull().default(false),
    settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("tenants_slug_uidx").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_uidx").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("owner"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_uidx").on(t.tenantId, t.userId),
  ],
);

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  cpf: varchar("cpf", { length: 20 }),
  whatsapp: varchar("whatsapp", { length: 30 }),
  email: varchar("email", { length: 255 }),
  cep: varchar("cep", { length: 12 }),
  street: varchar("street", { length: 200 }),
  number: varchar("number", { length: 30 }),
  complement: varchar("complement", { length: 120 }),
  district: varchar("district", { length: 120 }),
  city: varchar("city", { length: 120 }),
  state: varchar("state", { length: 2 }),
  notes: text("notes"),
  ...timestamps,
});

export const books = pgTable("books", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  isbn: varchar("isbn", { length: 32 }),
  title: varchar("title", { length: 300 }).notNull(),
  author: varchar("author", { length: 200 }),
  publisher: varchar("publisher", { length: 200 }),
  year: integer("year"),
  synopsis: text("synopsis"),
  pages: integer("pages"),
  coverUrl: text("cover_url"),
  genre: varchar("genre", { length: 100 }),
  language: varchar("language", { length: 60 }).default("Português"),
  weightGrams: integer("weight_grams"),
  condition: bookConditionEnum("condition").notNull().default("Bom"),
  coverType: coverTypeEnum("cover_type").notNull().default("Brochura"),
  purchasePrice: numeric("purchase_price", { precision: 12, scale: 2 }),
  salePrice: numeric("sale_price", { precision: 12, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(1),
  location: varchar("location", { length: 120 }),
  ...timestamps,
});

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
  },
  (t) => [uniqueIndex("tags_tenant_name_uidx").on(t.tenantId, t.name)],
);

export const bookTags = pgTable(
  "book_tags",
  {
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.bookId, t.tagId] })],
);

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  orderDate: timestamp("order_date", { withTimezone: true })
    .defaultNow()
    .notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("Pix"),
  status: orderStatusEnum("status").notNull().default("Aguardando Pagamento"),
  trackingCode: varchar("tracking_code", { length: 80 }),
  totalWeight: integer("total_weight").default(0),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).default(
    "0",
  ),
  notes: text("notes"),
  ...timestamps,
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  bookId: uuid("book_id")
    .notNull()
    .references(() => books.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappConnectionStatusEnum = pgEnum(
  "whatsapp_connection_status",
  ["disconnected", "qr", "open"],
);

export const whatsappConnections = pgTable(
  "whatsapp_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    instanceName: varchar("instance_name", { length: 80 }).notNull(),
    status: whatsappConnectionStatusEnum("status")
      .notNull()
      .default("disconnected"),
    phone: varchar("phone", { length: 30 }),
    lastQr: text("last_qr"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("whatsapp_connections_tenant_uidx").on(t.tenantId),
    uniqueIndex("whatsapp_connections_instance_uidx").on(t.instanceName),
  ],
);

export const clientOnboardingStatusEnum = pgEnum("client_onboarding_status", [
  "pending",
  "in_progress",
  "done",
  "skipped",
]);

export const clientProfiles = pgTable(
  "client_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    optInNotices: boolean("opt_in_notices").notNull().default(false),
    budgetMin: integer("budget_min"),
    budgetMax: integer("budget_max"),
    onboardingStatus: clientOnboardingStatusEnum("onboarding_status")
      .notNull()
      .default("pending"),
    onboardingStep: varchar("onboarding_step", { length: 40 }),
    rawNotes: text("raw_notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("client_profiles_client_uidx").on(t.clientId),
  ],
);

export const interestTagSourceEnum = pgEnum("interest_tag_source", [
  "declared",
  "purchase",
  "engagement",
]);

export const clientInterestTags = pgTable(
  "client_interest_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    tag: varchar("tag", { length: 80 }).notNull(),
    source: interestTagSourceEnum("source").notNull().default("declared"),
    weight: integer("weight").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("client_interest_tags_uidx").on(
      t.clientId,
      t.tag,
      t.source,
    ),
  ],
);
