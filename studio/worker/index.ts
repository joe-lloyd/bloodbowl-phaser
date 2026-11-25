interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Environment {
  readonly ASSETS: Fetcher;
  readonly HELPER: Fetcher;
  readonly TOKEN: string;
}

const TYPES: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
};
const HELPED = ["/studio-api/", "/sprites/"];

function changesFromElsewhere(request: Request, url: URL): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  return origin === null || new URL(origin).host !== url.host;
}

async function askHelper(request: Request, url: URL, env: Environment): Promise<Response> {
  if (changesFromElsewhere(request, url)) return new Response("The studio only takes changes from its own page", { status: 403 });
  const headers = new Headers(request.headers);
  headers.set("x-studio-token", env.TOKEN);
  try {
    return await env.HELPER.fetch(new Request(`http://helper${url.pathname}${url.search}`, { method: request.method, headers, body: request.body }));
  } catch {
    return new Response("The studio helper on old-mac is not answering", { status: 502 });
  }
}

async function asset(request: Request, url: URL, env: Environment): Promise<Response> {
  const target = url.pathname === "/" ? new URL("/index.html", url) : url;
  const response = await env.ASSETS.fetch(new Request(target, { method: request.method, headers: request.headers }));
  const headers = new Headers(response.headers);
  const type = TYPES[target.pathname.split(".").pop() ?? ""];
  if (response.ok && type) headers.set("content-type", type);
  headers.set("cache-control", "no-cache");
  return new Response(response.body, { status: response.status, headers });
}

export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (HELPED.some((start) => url.pathname.startsWith(start))) return askHelper(request, url, env);
    return asset(request, url, env);
  },
};
