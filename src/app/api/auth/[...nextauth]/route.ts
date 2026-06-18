import { handlers } from "@/lib/auth";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function withNoCache(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest) => {
    const res = await handler(req);
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    headers.set("Pragma", "no-cache");
    return new Response(res.body, { status: res.status, headers });
  };
}

export const GET = withNoCache(handlers.GET as (req: NextRequest) => Promise<Response>);
export const POST = withNoCache(handlers.POST as (req: NextRequest) => Promise<Response>);
