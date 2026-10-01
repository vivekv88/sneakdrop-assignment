import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/prisma";
import { processPaymentEvent } from "@/src/services/payment.service";

const paymentSchema = z.object({ holdId: z.string().min(1), userId: z.string().min(1) });

// The three messy scenarios a real payment provider exhibits.
// The service layer's idempotency handles all of them correctly.
const SCENARIOS = ["normal", "out-of-order", "duplicate"] as const;
type Scenario = (typeof SCENARIOS)[number];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deliverWebhooks(paymentId: string, holdId: string, userId: string, scenario: Scenario) {
  const initialDelay = 500 + Math.floor(Math.random() * 2000); // 0.5 – 2.5 s

  if (scenario === "normal") {
    // SUCCESS arrives after a realistic network delay.
    // PENDING was already recorded at buy time; this is the confirmation.
    await sleep(initialDelay);
    await processPaymentEvent({ eventId: randomUUID(), paymentId, holdId, userId, status: "SUCCESS" });
  } else if (scenario === "out-of-order") {
    // SUCCESS arrives first; a late PENDING follows.
    // The idempotency check (event.status === "PENDING" && payment.status !== "PENDING") must ignore it.
    await sleep(initialDelay);
    await processPaymentEvent({ eventId: randomUUID(), paymentId, holdId, userId, status: "SUCCESS" });
    await sleep(300 + Math.floor(Math.random() * 1200));
    await processPaymentEvent({ eventId: randomUUID(), paymentId, holdId, userId, status: "PENDING" }).catch(() => {});
  } else {
    // Duplicate SUCCESS — provider re-delivers on its own retry logic.
    // The second call must be a silent no-op (payment.status already "SUCCESS").
    await sleep(initialDelay);
    await processPaymentEvent({ eventId: randomUUID(), paymentId, holdId, userId, status: "SUCCESS" });
    await sleep(500 + Math.floor(Math.random() * 2500));
    await processPaymentEvent({ eventId: randomUUID(), paymentId, holdId, userId, status: "SUCCESS" }).catch(() => {});
  }
}

export async function POST(request: Request) {
  try {
    const { holdId, userId } = paymentSchema.parse(await request.json());

    const payment = await prisma.payment.findUnique({ where: { holdId } });
    if (!payment || payment.userId !== userId) {
      return Response.json({ error: "Payment not found" }, { status: 404 });
    }
    if (payment.status !== "PENDING") {
      return Response.json({ error: "Payment already processed" }, { status: 409 });
    }

    const scenario: Scenario = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

    // Respond immediately — like a real provider redirect — then fire webhooks asynchronously.
    after(async () => {
      await deliverWebhooks(payment.paymentId, holdId, userId, scenario).catch(console.error);
    });

    return Response.json({ status: "INITIATED", scenario }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return Response.json({ error: message === "PURCHASE_LIMIT" ? message : "Invalid payment request" }, { status: 400 });
  }
}
