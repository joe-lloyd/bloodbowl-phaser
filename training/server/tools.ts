import type { z } from "zod";
import {
  ALL_ROSTERS,
  TOOLS,
  type ToolName,
  type ToolOutput,
} from "../boundary/schemas";
import { teamList, teamView, weightsView } from "../catalogue/views";
import type { CandidateStore } from "./candidates";

const serve =
  <Input extends z.ZodType, Output>(
    schema: Input,
    run: (input: z.infer<Input>) => Output
  ) =>
  (raw: unknown): Output =>
    run(schema.parse(raw));

export function toolHandlers(store: CandidateStore) {
  return {
    list_weights: serve(TOOLS.list_weights.input, weightsView),
    list_teams: serve(TOOLS.list_teams.input, () => teamList(ALL_ROSTERS)),
    get_team: serve(TOOLS.get_team.input, teamView),
    list_candidates: serve(TOOLS.list_candidates.input, () => ({
      candidates: store.list(),
    })),
    get_candidate: serve(TOOLS.get_candidate.input, ({ id }) => store.get(id)),
    save_candidate: serve(TOOLS.save_candidate.input, store.save),
    delete_candidate: serve(TOOLS.delete_candidate.input, ({ id }) => ({
      deleted: store.remove(id),
    })),
  } satisfies { [N in ToolName]: (raw: unknown) => ToolOutput<N> };
}

export type ToolHandlers = ReturnType<typeof toolHandlers>;
