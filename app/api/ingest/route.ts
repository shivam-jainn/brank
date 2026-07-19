import { getIngestionService } from "@/lib/ingestion-service";
import { withLogging } from "@/lib/logger";

export const POST = withLogging(async function POST(req: Request) {
  const payload = await req.json();
  return getIngestionService().accept(payload);
});
