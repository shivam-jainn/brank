import { registry } from "@brank/providers";
import { withLogging } from "@/lib/logger";

export const GET = withLogging(async function GET() {
    try {
        return Response.json({
            providers: await registry.getProviderCatalog(),
        });
    } catch (error) {
        return Response.json({ error: String(error) }, { status: 500 });
    }
});

export const POST = withLogging(async function POST(request: Request) {
    try {
        const body = await request.json() as { apiKeys?: Record<string, string> };
        return Response.json({
            providers: await registry.getProviderCatalog(body.apiKeys ?? {}),
        });
    } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
    }
});
