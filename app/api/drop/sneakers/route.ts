import { z } from "zod";
import { listSneakers } from "@/src/services/drop.service";

const querySchema = z.object({ userId: z.string().min(1).optional() });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = querySchema.parse({ userId: url.searchParams.get("userId") ?? undefined });
  return Response.json(await listSneakers(input.userId), { headers: { "Cache-Control": "no-store" } });
}