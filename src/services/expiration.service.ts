import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { HOLD_DURATION_MS, MAX_PURCHASES } from "@/src/lib/constants";

export async function processExpiredHolds(limit = 100) {
  const candidates = await prisma.hold.findMany({ where: { status: "ACTIVE", expiresAt: { lte: new Date() } }, take: limit, select: { id: true } });
  let processed = 0;

  for (const candidate of candidates) {
    let expired = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        expired = await prisma.$transaction(async (tx) => {
          const hold = await tx.hold.findFirst({ where: { id: candidate.id, status: "ACTIVE", expiresAt: { lte: new Date() } } });
          if (!hold) return false;
          await tx.hold.update({ where: { id: hold.id }, data: { status: "EXPIRED" } });
          await tx.payment.updateMany({ where: { holdId: hold.id, status: "PENDING" }, data: { status: "FAILED" } });

          // Walk the queue in FIFO order, skipping (and cancelling) any entry whose user
          // has already reached the purchase limit, until we find an eligible candidate.
          let eligible: { id: string; userId: string } | null = null;
          let lastSeq = 0;
          while (true) {
            const candidate = await tx.queueEntry.findFirst({
              where: { sneakerId: hold.sneakerId, status: "WAITING", sequenceNumber: { gt: lastSeq } },
              orderBy: { sequenceNumber: "asc" },
              include: { user: { select: { totalPurchased: true } } },
            });
            if (!candidate) break;
            if (candidate.user.totalPurchased >= MAX_PURCHASES) {
              await tx.queueEntry.update({ where: { id: candidate.id }, data: { status: "CANCELLED" } });
              lastSeq = candidate.sequenceNumber;
              continue;
            }
            eligible = { id: candidate.id, userId: candidate.userId };
            break;
          }

          if (eligible) {
            await tx.queueEntry.update({ where: { id: eligible.id }, data: { status: "PROMOTED" } });
            const promotedHold = await tx.hold.create({ data: { userId: eligible.userId, sneakerId: hold.sneakerId, status: "ACTIVE", expiresAt: new Date(Date.now() + HOLD_DURATION_MS) } });
            await tx.payment.create({ data: { paymentId: `fake_${randomUUID()}`, eventId: randomUUID(), userId: eligible.userId, holdId: promotedHold.id, status: "PENDING" } });
          } else {
            await tx.sneaker.update({ where: { id: hold.sneakerId }, data: { availableStock: { increment: 1 } } });
          }
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (!retryable || attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
    if (expired) processed += 1;
  }

  return processed;
}
