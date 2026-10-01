import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { MAX_PURCHASES } from "@/src/lib/constants";

export type PaymentEvent = { eventId: string; paymentId: string; holdId: string; userId: string; status: "PENDING" | "SUCCESS" | "FAILED" };

export async function completeFakePayment(userId: string, holdId: string) {
  const payment = await prisma.payment.findUnique({ where: { holdId } });
  if (!payment) throw new Error("PAYMENT_NOT_FOUND");
  return processPaymentEvent({ eventId: randomUUID(), paymentId: payment.paymentId, holdId, userId, status: "SUCCESS" });
}

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
        await tx.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
        outcome = "FAILED";
        return;
      }
      const user = await tx.user.updateMany({ where: { id: event.userId, totalPurchased: { lt: MAX_PURCHASES } }, data: { totalPurchased: { increment: 1 } } });
      if (!user.count) throw new Error("PURCHASE_LIMIT");
      // If the user has now reached the purchase limit, cancel any queues they are still waiting in.
      const updatedUser = await tx.user.findUnique({ where: { id: event.userId }, select: { totalPurchased: true } });
      if (updatedUser && updatedUser.totalPurchased >= MAX_PURCHASES) {
        await tx.queueEntry.updateMany({ where: { userId: event.userId, status: "WAITING" }, data: { status: "CANCELLED" } });
      }
      await tx.hold.update({ where: { id: hold.id }, data: { status: "CONVERTED" } });
      await tx.purchase.create({ data: { userId: event.userId, sneakerId: hold.sneakerId, holdId: hold.id, paymentId: event.paymentId } });
      await tx.sneaker.update({ where: { id: hold.sneakerId }, data: { soldStock: { increment: 1 } } });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "SUCCESS" } });
      outcome = "SUCCESS";
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return outcome;
}
