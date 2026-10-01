import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { HOLD_DURATION_MS, MAX_PURCHASES } from "@/src/lib/constants";
import { processExpiredHolds } from "@/src/services/expiration.service";

const MAX_TRANSACTION_RETRIES = 10;

const isRetryableTransactionError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002");

export async function buyPair(userId: string, sneakerId: string) {
  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const [user, sneaker] = await Promise.all([
          tx.user.findUnique({ where: { id: userId } }),
          tx.sneaker.findUnique({ where: { id: sneakerId } }),
        ]);
        if (!user || !sneaker) throw new Error("NOT_FOUND");
        if (user.totalPurchased >= MAX_PURCHASES) throw new Error("PURCHASE_LIMIT");

        const activeHold = await tx.hold.findFirst({ where: { userId, sneakerId, status: "ACTIVE", expiresAt: { gt: now } } });
        if (activeHold) throw new Error("ALREADY_HOLDING");

        const reserved = await tx.sneaker.updateMany({ where: { id: sneakerId, availableStock: { gt: 0 } }, data: { availableStock: { decrement: 1 } } });
        if (reserved.count) {
          const hold = await tx.hold.create({ data: { userId, sneakerId, status: "ACTIVE", expiresAt: new Date(now.getTime() + HOLD_DURATION_MS) } });
          await tx.payment.create({ data: { paymentId: `fake_${randomUUID()}`, eventId: randomUUID(), userId, holdId: hold.id, status: "PENDING" } });
          return { kind: "HOLD" as const, hold };
        }

        const last = await tx.queueEntry.findFirst({ where: { sneakerId }, orderBy: { sequenceNumber: "desc" } });
        const entry = await tx.queueEntry.create({ data: { userId, sneakerId, status: "WAITING", sequenceNumber: (last?.sequenceNumber ?? 0) + 1 } });
        return { kind: "QUEUE" as const, entry };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 10000 });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new Error("TRANSACTION_FAILED");
}

export async function getDropStatus(userId: string, sneakerId: string) {
  await processExpiredHolds();
  const now = new Date();
  const [sneaker, user, hold, queue] = await Promise.all([
    prisma.sneaker.findUnique({ where: { id: sneakerId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.hold.findFirst({ where: { userId, sneakerId, status: "ACTIVE", expiresAt: { gt: now } } }),
    prisma.queueEntry.findFirst({ where: { userId, sneakerId, status: "WAITING" } }),
  ]);
  if (!sneaker || !user) throw new Error("NOT_FOUND");
  const position = queue ? await prisma.queueEntry.count({ where: { sneakerId, status: "WAITING", sequenceNumber: { lte: queue.sequenceNumber } } }) : null;
  return { availableStock: sneaker.availableStock, purchasedCount: user.totalPurchased, hold, queue: { position } };
}

export async function listSneakers(userId?: string) {
  await processExpiredHolds();
  const now = new Date();
  const sneakers = await prisma.sneaker.findMany({ orderBy: { name: "asc" } });
  return Promise.all(sneakers.map(async (sneaker) => {
    const [activeHolds, waitingCount, userHold, userQueue] = await Promise.all([
      prisma.hold.count({ where: { sneakerId: sneaker.id, status: "ACTIVE", expiresAt: { gt: now } } }),
      prisma.queueEntry.count({ where: { sneakerId: sneaker.id, status: "WAITING" } }),
      userId ? prisma.hold.findFirst({ where: { userId, sneakerId: sneaker.id, status: "ACTIVE", expiresAt: { gt: now } }, select: { expiresAt: true } }) : null,
      userId ? prisma.queueEntry.findFirst({ where: { userId, sneakerId: sneaker.id, status: "WAITING" }, select: { sequenceNumber: true } }) : null,
    ]);
    const position = userQueue
      ? await prisma.queueEntry.count({ where: { sneakerId: sneaker.id, status: "WAITING", sequenceNumber: { lte: userQueue.sequenceNumber } } })
      : null;
    return {
      id: sneaker.id,
      name: sneaker.name,
      available: sneaker.availableStock > 0,
      soldOut: sneaker.soldStock >= sneaker.totalStock,
      activeHolds,
      waitingCount,
      userHold,
      userQueue: position === null ? null : { position },
    };
  }));
}
