import { registry } from "@/packages/providers/registry";
import { withLogging } from "@/lib/logger";

export const GET = withLogging(async function GET() {
    try {
        const models = await registry.getAllModels();
        return Response.json(models);
    } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
    }
});