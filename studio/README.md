# Character studio

Makes sprite models for the game from existing ones. It is its own package and is not part of the game's
build.

| Part | Where it runs | What it does |
|---|---|---|
| `app/` | the browser | the editor |
| `worker/` | a V8 isolate on hasaki, <https://sprites.home.arpa> | serves the page and passes `/studio-api` and `/sprites` to the helper |
| `helper/` | old-mac, port 3941 | keeps the characters, drives Blender on Jellybingus over SSH and pushes art to GitHub |
| `boundary/` | all three | the schemas |

An isolate cannot run Blender, SSH or git, so the helper does.

`pnpm studio` from the repository root runs the page and the helper's code on your checkout instead. It
installs art into the checkout and pushes nothing.

## The helper

It reads `STUDIO_HOME`, a folder with:

- `token`: the value the worker sends with every request. The worker reads it from its `helper-token` secret.
- `characters/`: the saved characters.
- `tree/`: a clone of this repository that exports are built in. The helper resets it, so do not work in it.

Exports collect on the `studio/art` branch until its pull request merges. The next export then starts a
new branch from `main`. The HomeLab repository has the launch agent and the deploy steps.

## Deploying the worker

`pnpm --filter studio build` writes the worker to `dist/`. HomeLab's `hasaki/workerd/apps/sprite-studio/refresh.sh`
copies it there.
