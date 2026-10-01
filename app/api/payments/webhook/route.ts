import { z } from "zod";
import { processPaymentEvent } from "@/src/services/payment.service";

const eventSchema = z.object({ eventId: z.string().min(1), paymentId: z.string().min(1), holdId: z.string().min(1), userId: z.string().min(1), status: z.enum(["PENDING", "SUCCESS", "FAILED"]) });

export async function POST(request: Request) {
  try {
    const event = eventSchema.parse(await request.json());
    return Response.json({ result: await processPaymentEvent(event) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return Response.json({ error: message === "PURCHASE_LIMIT" ? message : "Invalid payment event" }, { status: message === "PURCHASE_LIMIT" ? 409 : 400 });
  }
}