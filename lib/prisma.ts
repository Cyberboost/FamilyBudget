import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;

  // IMPORTANT:
  // - `next build` (especially on Vercel) may run without DATABASE_URL configured,
  //   depending on environment-variable scoping or Preview settings.
  // - Instantiating a pg.Pool + PrismaPg adapter at module import time can cause
  //   build-time failures.
  //
  // We therefore only create the Postgres adapter when DATABASE_URL is present.
  // If it's missing, we fall back to the default Prisma engine configuration.
  // The app will still fail at runtime when a DB query is made, but the build
  // (and static analysis) won't be blocked.

  if (!databaseUrl) {
    return new PrismaClient();
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;