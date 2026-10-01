import { z } from "zod";
import { buyPair } from "@/src/services/drop.service";

const requestSchema = z.object({ userId: z.string().min(1), sneakerId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const result = await buyPair(input.userId, input.sneakerId);
    return Response.json(result, { status: result.kind === "HOLD" ? 201 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    const statuses: Record<string, number> = { NOT_FOUND: 404, PURCHASE_LIMIT: 409, ALREADY_HOLDING: 409 };
    return Response.json({ error: statuses[message] ? message : "Invalid buy request" }, { status: statuses[message] ?? 400 });
  }
}