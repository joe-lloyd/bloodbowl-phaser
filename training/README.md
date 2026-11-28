# Training ground

A companion server for the computer coach. It tells agents what each planner
weight makes the coach do and what every team can do, and keeps candidate
weight sets to try. A page for the owner follows in the next pull request. It never ships with the game: the live site builds from the root
`index.html` and `vite.config.ts`, and nothing there imports this folder.

| Part         | What it holds                                                              |
| ------------ | -------------------------------------------------------------------------- |
| `server/`    | A Node server for the built page, a JSON API and an MCP endpoint           |
| `catalogue/` | The plain-English descriptions and the views built from the game's modules |
| `boundary/`  | The schemas every request and response passes through                      |

The server reads the weights, rosters and skills from the game's own modules,
so the app cannot disagree with the coach. It does no heavy work.

## Run it

```sh
TRAINING_GROUND_DATA=~/training-ground pnpm training:serve
```

Then call <http://127.0.0.1:3960/api/tools>. The server reads three variables:

| Variable               | Default     | Use                                                                |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| `TRAINING_GROUND_DATA` | none        | The folder for candidate files. It must be outside the repository. |
| `TRAINING_GROUND_PORT` | `3960`      | The port.                                                          |
| `TRAINING_GROUND_HOST` | `127.0.0.1` | The address. Use `0.0.0.0` to serve the home network.              |
| `TRAINING_GROUND_NAMES` | `localhost,127.0.0.1,training.home.arpa` | Host names the server answers. A request for any other name is refused, which stops DNS rebinding. |

## Tools for agents

`boundary/schemas.ts` defines each tool once, and the server serves it two ways:

- `POST /api/tools/<name>` with the input as JSON. `GET /api/tools` lists
  the tools with their input schemas.
- MCP over Streamable HTTP at `/mcp`, without sessions.

The tools are `list_weights`, `list_teams`, `get_team`, `list_candidates`,
`get_candidate`, `save_candidate` and `delete_candidate`.

There is no sign-in, so serve it only on the home network. The server refuses
any request whose `Origin` header names another site, so a web page elsewhere
cannot save or delete candidates.

## Candidates

A candidate is `<id>.json` in the format `parseWeightFile` reads, so the
policy study takes it as it is:

```sh
pnpm exec tsx scripts/coach/policy-study/run.ts --weights ~/training-ground/<id>.json
```

The file always lists its `rosters` and `gameTypes` layers, because a file
without `rosters` keeps the shipped roster tweaks. For the same reason, a
save that leaves out `rosters` or `gameTypes` keeps the current layer. A second file,
`<id>.about.json`, holds the name, the note and when it was saved. Saving
refuses any value outside the weight's tuning bounds.

## Adding a weight

`WEIGHT_INFO` in `catalogue/weightInfo.ts` has an entry for every key of
`DEFAULT_WEIGHTS`, so a new weight without a description fails the type
check. `FEATURE_INFO` does the same for the board-evaluation features and
`SKILL_USE` for every skill.
