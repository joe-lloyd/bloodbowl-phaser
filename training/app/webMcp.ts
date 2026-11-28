import { z } from "zod";
import { callTool } from "../boundary/client";
import { TOOL_NAMES, TOOLS } from "../boundary/schemas";

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (
    input: unknown
  ) => Promise<{ content: { type: "text"; text: string }[] }>;
}

interface ModelContext {
  registerTool: (tool: ModelContextTool) => void;
  unregisterTool?: (name: string) => void;
}

declare global {
  interface Navigator {
    readonly modelContext?: ModelContext;
  }
}

export function registerWebMcp(context = navigator.modelContext): () => void {
  if (!context) return () => undefined;
  for (const name of TOOL_NAMES)
    context.registerTool({
      name,
      description: TOOLS[name].description,
      inputSchema: z.toJSONSchema(TOOLS[name].input, { io: "input" }),
      execute: async (input) => ({
        content: [
          { type: "text", text: JSON.stringify(await callTool(name, input)) },
        ],
      }),
    });
  return () => {
    for (const name of TOOL_NAMES) context.unregisterTool?.(name);
  };
}
