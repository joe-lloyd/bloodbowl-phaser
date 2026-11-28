import { z } from "zod";
import { parseJson } from "../../src/boundary/json";
import { TOOLS, type ToolName } from "./schemas";

const failure = z.object({ error: z.string() });

export async function callTool(
  name: ToolName,
  input: unknown
): Promise<unknown> {
  const response = await fetch(`/api/tools/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(parseJson(body, failure).error);
  return parseJson(body, z.unknown());
}

const typed =
  <Name extends ToolName, Output>(name: Name, output: z.ZodType<Output>) =>
  async (input: z.input<(typeof TOOLS)[Name]["input"]>): Promise<Output> =>
    output.parse(await callTool(name, input));

export const api = {
  listWeights: typed("list_weights", TOOLS.list_weights.output),
  listTeams: typed("list_teams", TOOLS.list_teams.output),
  getTeam: typed("get_team", TOOLS.get_team.output),
  getCandidate: typed("get_candidate", TOOLS.get_candidate.output),
  listCandidates: typed("list_candidates", TOOLS.list_candidates.output),
  saveCandidate: typed("save_candidate", TOOLS.save_candidate.output),
  deleteCandidate: typed("delete_candidate", TOOLS.delete_candidate.output),
};
