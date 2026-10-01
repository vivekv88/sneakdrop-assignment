import { processExpiredHolds } from "@/src/services/expiration.service";

export async function POST(request: Request) {
  if (process.env.INTERNAL_WORKER_SECRET && request.headers.get("x-worker-secret") !== process.env.INTERNAL_WORKER_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ processed: await processExpiredHolds() });
}