import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { TOOL_NAMES, TOOLS } from "../boundary/schemas";
import { errorText } from "../../src/ui/errorText";
import type { ToolHandlers } from "./tools";

const text = (value: string, isError = false) => ({
  content: [{ type: "text" as const, text: value }],
  isError,
});

export async function mcpResponse(
  request: Request,
  handlers: ToolHandlers
): Promise<Response> {
  const server = new McpServer({ name: "training-ground", version: "1.0.0" });
  for (const name of TOOL_NAMES) {
    const { description, input } = TOOLS[name];
    server.registerTool(
      name,
      { description, inputSchema: input },
      (args: unknown) => {
        try {
          return text(JSON.stringify(handlers[name](args)));
        } catch (error: unknown) {
          return text(errorText(error), true);
        }
      }
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
