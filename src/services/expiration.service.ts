import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { HOLD_DURATION_MS } from "@/src/lib/constants";

export async function processExpiredHolds(limit = 100) {
  const candidates = await prisma.hold.findMany({ where: { status: "ACTIVE", expiresAt: { lte: new Date() } }, take: limit, select: { id: true } });
  let processed = 0;

  for (const candidate of candidates) {
    const expired = await prisma.$transaction(async (tx) => {
      const hold = await tx.hold.findFirst({ where: { id: candidate.id, status: "ACTIVE", expiresAt: { lte: new Date() } } });
      if (!hold) return false;
      await tx.hold.update({ where: { id: hold.id }, data: { status: "EXPIRED" } });

      const waiting = await tx.queueEntry.findFirst({ where: { sneakerId: hold.sneakerId, status: "WAITING" }, orderBy: { sequenceNumber: "asc" } });
      if (waiting) {
        await tx.queueEntry.update({ where: { id: waiting.id }, data: { status: "PROMOTED" } });
        await tx.hold.create({ data: { userId: waiting.userId, sneakerId: hold.sneakerId, status: "ACTIVE", expiresAt: new Date(Date.now() + HOLD_DURATION_MS) } });
      } else {
        await tx.sneaker.update({ where: { id: hold.sneakerId }, data: { availableStock: { increment: 1 } } });
      }
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (expired) processed += 1;
  }

  return processed;
}
