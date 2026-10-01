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
    const sneakers = await prisma.sneaker.createManyAndReturn({
      data: Array.from({ length: 20 }, (_, index) => ({ name: `Test Pair ${index + 1}`, totalStock: 1, availableStock: 1, soldStock: 0 })),
    });
    const users = await prisma.user.createManyAndReturn({ data: Array.from({ length: 100 }, (_, index) => ({ name: `User ${index}`, email: `${index}@test.local` })) });
    const results = await Promise.all(users.map((user, index) => buyPair(user.id, sneakers[index % sneakers.length].id)));
    const refreshed = await prisma.sneaker.findMany();
    expect(results.filter((result) => result.kind === "HOLD")).toHaveLength(20);
    expect(await prisma.hold.count({ where: { status: "ACTIVE" } })).toBe(20);
    expect(await prisma.queueEntry.count({ where: { status: "WAITING" } })).toBe(80);
    expect(refreshed.reduce((total, sneaker) => total + sneaker.availableStock, 0)).toBe(0);
    expect(refreshed.every((sneaker) => sneaker.availableStock >= 0)).toBe(true);
  });
});
