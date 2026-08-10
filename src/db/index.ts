import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as {
  guerraSql?: ReturnType<typeof postgres>;
  guerraDb?: Db;
};

function createDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não definida");
  }

  if (!globalForDb.guerraSql) {
    globalForDb.guerraSql = postgres(connectionString, { max: 10 });
  }

  if (!globalForDb.guerraDb) {
    globalForDb.guerraDb = drizzle(globalForDb.guerraSql, { schema });
  }

  return globalForDb.guerraDb;
}

/** Use em Server Components / Route Handlers — exige DATABASE_URL */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const instance = createDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export type Database = Db;
