import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { HOLD_DURATION_MS, MAX_PURCHASES } from "@/src/lib/constants";

const MAX_TRANSACTION_RETRIES = 3;

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
          return { kind: "HOLD" as const, hold };
        }

        const last = await tx.queueEntry.findFirst({ where: { sneakerId }, orderBy: { sequenceNumber: "desc" } });
        const entry = await tx.queueEntry.create({ data: { userId, sneakerId, status: "WAITING", sequenceNumber: (last?.sequenceNumber ?? 0) + 1 } });
        return { kind: "QUEUE" as const, entry };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_RETRIES - 1) throw error;
    }
  }
  throw new Error("TRANSACTION_FAILED");
}

export async function getDropStatus(userId: string, sneakerId: string) {
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
