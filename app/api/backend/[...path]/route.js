const methodsWithBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedMethods = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function proxy(request, context) {
  const apiOrigin = process.env.HCM_API_ORIGIN || "http://localhost:4000";
  let apiBase;
  try {
    apiBase = new URL(apiOrigin);
  } catch {
    return Response.json({ error: "The API proxy is not configured." }, { status: 503 });
  }

  if (!["https:", "http:"].includes(apiBase.protocol)) {
    return Response.json({ error: "The API proxy is not configured." }, { status: 503 });
  }

  const params = await context.params;
  const path = Array.isArray(params?.path) ? params.path : [];
  const encodedPath = path.map((part) => encodeURIComponent(part)).join("/");
  const upstreamUrl = new URL(`/api/${encodedPath}`, apiBase);
  upstreamUrl.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of ["authorization", "accept", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const bypassSecret = process.env.HCM_API_VERCEL_BYPASS_SECRET;
  if (bypassSecret) headers.set("x-vercel-protection-bypass", bypassSecret);

  const init = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (methodsWithBody.has(request.method) && request.body) {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    for (const name of ["content-type", "content-disposition", "content-length"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    console.error("HCM API proxy could not reach the configured API.");
    return Response.json({ error: "The API server is unavailable." }, { status: 502 });
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: allowedMethods } });
}
