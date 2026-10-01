import { z } from "zod";
import { getDropStatus } from "@/src/services/drop.service";

const querySchema = z.object({ userId: z.string().min(1), sneakerId: z.string().min(1) });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({ userId: url.searchParams.get("userId"), sneakerId: url.searchParams.get("sneakerId") });
    return Response.json(await getDropStatus(input.userId, input.sneakerId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return Response.json({ error: message === "NOT_FOUND" ? message : "Invalid status request" }, { status: message === "NOT_FOUND" ? 404 : 400 });
  }
}