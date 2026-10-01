import { afterAll } from "vitest";
import { prisma } from "@/src/lib/prisma";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must point to a PostgreSQL test database");
}

afterAll(async () => {
  await prisma.$disconnect();
});
