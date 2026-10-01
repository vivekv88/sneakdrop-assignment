import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { MAX_PURCHASES } from "@/src/lib/constants";

export type PaymentEvent = { eventId: string; paymentId: string; holdId: string; userId: string; status: "PENDING" | "SUCCESS" | "FAILED" };

export async function processPaymentEvent(event: PaymentEvent) {
  let outcome = "IGNORED";
  await prisma.$transaction(async (tx) => {
    let payment = await tx.payment.findUnique({ where: { paymentId: event.paymentId } });
    if (!payment) {
      payment = await tx.payment.create({ data: { ...event, status: event.status } });
      if (event.status === "PENDING") {
        outcome = "PENDING";
        return;
      }
    } else if (payment.status === "SUCCESS" || payment.status === "EXPIRED") {
      return;
    } else if (event.status === "PENDING" && payment.status !== "PENDING") {
      return;
    } else if (event.status === "FAILED") {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      outcome = "FAILED";
      return;
    } else if (event.status === "SUCCESS") {
      const hold = await tx.hold.findFirst({ where: { id: event.holdId, userId: event.userId, status: "ACTIVE", expiresAt: { gt: new Date() } } });
      if (!hold) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: "EXPIRED" } });
        outcome = "EXPIRED";
        return;
      }
      const user = await tx.user.updateMany({ where: { id: event.userId, totalPurchased: { lt: MAX_PURCHASES } }, data: { totalPurchased: { increment: 1 } } });
      if (!user.count) throw new Error("PURCHASE_LIMIT");
      await tx.hold.update({ where: { id: hold.id }, data: { status: "CONVERTED" } });
      await tx.purchase.create({ data: { userId: event.userId, sneakerId: hold.sneakerId, holdId: hold.id, paymentId: event.paymentId } });
      await tx.sneaker.update({ where: { id: hold.sneakerId }, data: { soldStock: { increment: 1 } } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });
      outcome = "SUCCESS";
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return outcome;
}
