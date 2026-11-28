import { z } from "zod";
import { callTool } from "../boundary/client";
import { TOOL_NAMES, TOOLS } from "../boundary/schemas";

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: unknown) => Promise<unknown>;
}

interface ModelContext {
  registerTool: (
    tool: ModelContextTool,
    options: { signal: AbortSignal }
  ) => Promise<void>;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

export function registerWebMcp(context = document.modelContext): () => void {
  if (!context) return () => undefined;
  const registered = new AbortController();
  for (const name of TOOL_NAMES)
    void context.registerTool(
      {
        name,
        description: TOOLS[name].description,
        inputSchema: z.toJSONSchema(TOOLS[name].input, { io: "input" }),
        execute: (input) => callTool(name, input),
      },
      { signal: registered.signal }
    );
  return () => {
    registered.abort();
  };
}
