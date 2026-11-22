# Agent instructions

## Pull requests

Every change reaches `main` through a pull request. Open it ready for review, not as a draft. Then invoke the `babysit-pr` skill and stay on the PR until it merges.

## Codex reviews first

CodeRabbit's plan is rate limited on most pushes. Waiting for it costs 20 to 40 minutes and usually ends in a refusal. In this repository, these rules replace the reviewer order in `~/.agents/AGENTS.md` and the CodeRabbit waits in `babysit-pr`:

- Spawn the Joe Codex reviewer with the reviewer brief from `full-send` as soon as the PR is open. Spawn a new one whenever the head changes, whether from a review fix, a CI fix or a rebase. If you declined every finding without pushing, spawn a new one with the review and your reply. Give each reviewer the head SHA it reviews, and have it post against that commit instead of with the helper's `review`: end the review file with `<!-- babysit-pr-fallback-review -->`, then run `gh api repos/joe-lloyd/bloodbowl-phaser/pulls/<n>/reviews -f commit_id=<sha> -f event=COMMENT -F body=@<file>`. Do not push while a reviewer is running. If a push cannot wait, cancel that reviewer with `task_cancel` and spawn a new one on the new head. Do not wait for CodeRabbit first.
- Never post `@coderabbitai review`. When the helper reports `coderabbit-stalled` or `coderabbit-refused`, run `wait` again and keep waiting for the Codex review and CI.
- CodeRabbit still runs on its own. Read `openThreads` in every digest, not only on a findings event. Fix or decline each open thread like any other review. When you fixed a thread and CodeRabbit cannot review the new head, reply on the thread with the commit that fixed it, then resolve it. An open CodeRabbit thread blocks the merge.
- Merge only when a Codex review on the current head says `Verdict: approve`, CI is green, and no CodeRabbit thread is open. A `ready` event without that Codex approval is not enough. Keep waiting.
- Merge with `gh pr merge <n> --merge --delete-branch --match-head-commit <sha>`, where `<sha>` is the head the Codex reviewer was briefed on. A head that changed after the approval then fails the merge. Do not use the helper's `merge` here: it reads the head again and accepts a CodeRabbit pass in place of Codex.
- If three Codex rounds in a row end in `Verdict: changes`, stop. Do not merge. Ask the owner.
- On `round-limit`, stop. Do not merge. Ask the owner.

## Review scope

Reviewers, Codex and CodeRabbit alike, skip `public/sprites/bloodbowl/` and `__tests__/`. Both are large and mostly generated, and the owner decided a review there is not worth it. Read the rest of the diff with `git -C "$(git rev-parse --show-toplevel)" diff origin/main...HEAD -- . ':(exclude)public/sprites/bloodbowl' ':(exclude)__tests__'`, which works from any folder. CI still runs every test.

## Firestore rules

Merging to `main` deploys the client to the live site, but it never deploys `firestore.rules`. A client that writes a path the live rules refuse breaks on the live site. When a pull request changes the rules, deploy them yourself just before you merge it:

1. Keep the new rules a superset of the live ones, so the client already on the live site keeps working. Prove them with `pnpm test:rules`, which CI also runs.
2. Get a short-lived bearer token for the live project, `bloodbowl-web`, from the vault. The owner approves the request on their phone, and the request waits up to five minutes:

   ```sh
   export FIREBASE_RULES_TOKEN="$(ssh vault token bloodbowl-sevens/firestore-key)"
   ```

   Never print, log or commit the token.
3. Compare the live rules with `main`, so the deploy cannot drop a change made outside the repository:

   ```sh
   node scripts/firestore-rules.mjs live > /tmp/live.rules
   git show origin/main:firestore.rules > /tmp/main.rules
   git diff --no-index /tmp/live.rules /tmp/main.rules
   ```

   If they differ, stop and ask the owner.
4. Deploy the branch's rules:

   ```sh
   node scripts/firestore-rules.mjs deploy
   ```

5. Run `node scripts/firestore-rules.mjs live` again and check it matches the branch's `firestore.rules`.
6. Wait ten minutes, then merge the pull request. New rules reach new queries within about a minute and open listeners within about ten, so a client published sooner can still be refused.
