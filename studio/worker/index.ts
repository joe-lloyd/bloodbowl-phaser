interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Environment {
  readonly ASSETS: Fetcher;
  readonly HELPER: Fetcher;
  readonly TOKEN: string;
}

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

export default {
  fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    if (HELPED.some((start) => url.pathname.startsWith(start))) return askHelper(request, url, env);
    const target = url.pathname === "/" ? new URL("/index.html", url) : url;
    return env.ASSETS.fetch(new Request(target, { method: request.method, headers: request.headers }));
  },
};
