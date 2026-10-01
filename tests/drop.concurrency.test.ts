import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/prisma";
import { buyPair } from "@/src/services/drop.service";

beforeEach(async () => {
  await prisma.$transaction([
    prisma.purchase.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.hold.deleteMany(),
    prisma.queueEntry.deleteMany(),
    prisma.user.deleteMany(),
    prisma.sneaker.deleteMany(),
  ]);
});

describe("drop allocation", () => {
  it("never allocates more than inventory under concurrent buys", async () => {
    const sneaker = await prisma.sneaker.create({ data: { name: "Test", totalStock: 20, availableStock: 20, soldStock: 0 } });
    const users = await prisma.user.createManyAndReturn({ data: Array.from({ length: 100 }, (_, index) => ({ name: `User ${index}`, email: `${index}@test.local` })) });
    const results = await Promise.all(users.map((user) => buyPair(user.id, sneaker.id)));
    const refreshed = await prisma.sneaker.findUnique({ where: { id: sneaker.id } });
    expect(results.filter((result) => result.kind === "HOLD")).toHaveLength(20);
    expect(await prisma.hold.count({ where: { status: "ACTIVE" } })).toBe(20);
    expect(await prisma.queueEntry.count({ where: { status: "WAITING" } })).toBe(80);
    expect(refreshed?.availableStock).toBe(0);
    expect(refreshed?.availableStock).toBeGreaterThanOrEqual(0);
  });
});
