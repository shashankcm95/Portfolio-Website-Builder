import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { logger } from "@/lib/log";

if (!process.env.DATABASE_URL) {
  logger.warn("[db] DATABASE_URL is not set. Database connections will fail.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

export { db, pool };
