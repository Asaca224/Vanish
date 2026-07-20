import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads / warm serverless invocations
// to avoid exhausting Neon connections. Use Neon's POOLED connection string
// (DATABASE_URL) so many short-lived function invocations share the pool.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
