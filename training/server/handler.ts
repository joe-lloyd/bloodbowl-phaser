import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseJson } from "../../src/boundary/json";
import { jsonResponse as json } from "../boundary/http";
import { isToolName, TOOL_NAMES, TOOLS } from "../boundary/schemas";
import { errorText } from "../../src/ui/errorText";
import { mcpResponse } from "./mcp";
import type { ToolHandlers } from "./tools";

const TOOL_PATH = "/api/tools/";
const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function crossSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  return (
    origin !== null && URL.parse(origin)?.host !== request.headers.get("host")
  );
}

async function toolResponse(
  request: Request,
  handlers: ToolHandlers,
  name: string
): Promise<Response> {
  if (!isToolName(name)) return json({ error: `No tool called ${name}` }, 404);
  if (request.method !== "POST")
    return json({ error: "Call a tool with POST" }, 405);
  try {
    const body = await request.text();
    const input = body === "" ? {} : parseJson(body, z.unknown());
    return json(handlers[name](input));
  } catch (error: unknown) {
    return json({ error: errorText(error) }, 400);
  }
}

const toolList = () =>
  json({
    tools: TOOL_NAMES.map((name) => ({
      name,
      description: TOOLS[name].description,
      inputSchema: z.toJSONSchema(TOOLS[name].input, { io: "input" }),
    })),
  });

async function staticFile(root: string, pathname: string): Promise<Response> {
  const file = path.join(root, path.normalize(pathname));
  const inside = file.startsWith(root + path.sep) && path.extname(file) !== "";
  const served = inside ? file : path.join(root, "index.html");
  try {
    const body = await readFile(served);
    return new Response(body, {
      headers: {
        "content-type":
          TYPES[path.extname(served)] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

interface ServerArgs {
  handlers: ToolHandlers;
  root: string;
  hosts: ReadonlySet<string>;
}

export function trainingHandler({ handlers, root, hosts }: ServerArgs) {
  return async (request: Request): Promise<Response> => {
    const { pathname, hostname } = new URL(request.url);
    if (!hosts.has(hostname))
      return json({ error: "Requests for other host names are refused" }, 403);
    if (crossSite(request))
      return json({ error: "Requests from other sites are refused" }, 403);
    if (pathname === "/mcp") return mcpResponse(request, handlers);
    if (pathname === "/api/tools") return toolList();
    if (pathname.startsWith(TOOL_PATH))
      return toolResponse(request, handlers, pathname.slice(TOOL_PATH.length));
    return staticFile(root, pathname);
  };
}
