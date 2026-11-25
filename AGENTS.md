# Agent instructions

## Pull requests

Every change reaches `main` through a pull request. Open it ready for review, not as a draft. Then invoke the `babysit-pr` skill and stay on the PR until it merges.

## Codex reviews first

CodeRabbit's plan is rate limited on most pushes. Waiting for it costs 20 to 40 minutes and usually ends in a refusal. In this repository, these rules replace the reviewer order in `~/.agents/AGENTS.md` and the CodeRabbit waits in `babysit-pr`:

- Before you ask for a review, use the change yourself the way the owner will, and fix what you hit. Put the main flows you ran under "Checked" in the PR body, and what the PR does not cover under "Out of scope". Keep one purpose per PR. Split a PR whose reviewable diff passes 1,000 lines.
- Spawn one Joe Codex reviewer with the `full-send` reviewer brief plus "What blocks a merge" below, which wins where they differ, when the PR is open and you are done with it. Do not wait for CodeRabbit first. Give the reviewer the head SHA. Do not push while it runs. It posts with `gh api repos/joe-lloyd/bloodbowl-phaser/pulls/<n>/reviews -f commit_id=<sha> -f event=COMMENT -F body=@<file>`, and its file ends with `<!-- babysit-pr-fallback-review -->`.
- If it says `Verdict: changes`, fix only the blocking findings that meet the bar below, each with the smallest fix, in one push. Add no new check, option or mechanism to cover cases nobody reported. Decline the rest in a reply. Then spawn one re-check, briefed with the first review, your reply and the range `<reviewed sha>..<new sha>`.
- The re-check reads only that range. It answers whether each blocking finding is fixed or rightly declined, and whether the fix itself breaks a main flow. It may not raise findings about code the fix did not touch.
- There is no third review. If the re-check says `Verdict: changes`, stop and ask the owner with a one-line summary per finding.
- A CI fix or a rebase without conflicts needs no new review.
- Never post `@coderabbitai review`. When the helper reports `coderabbit-stalled` or `coderabbit-refused`, run `wait` again and keep waiting for the Codex review and CI.
- CodeRabbit still runs on its own. Read `openThreads` in every digest, not only on a findings event. Fix or decline each open thread like any other review. When you fixed a thread and CodeRabbit cannot review the new head, reply on the thread with the commit that fixed it, then resolve it. An open CodeRabbit thread blocks the merge.
- Merge when the review or its re-check says `Verdict: approve`, CI is green on the head, and no CodeRabbit thread is open. Only a CI fix or a rebase may land between that approval and the merge.
- Merge with `gh pr merge <n> --merge --delete-branch --match-head-commit <sha>`, where `<sha>` is the head whose CI you checked. A head that changed after that then fails the merge. Do not use the helper's `merge` here: it reads the head again and accepts a CodeRabbit pass in place of Codex.
- On `round-limit`, stop. Do not merge. Ask the owner.

## What blocks a merge

Every reviewer brief includes this section.

A finding blocks only when all three hold:

- The change in this PR causes it.
- A player or the owner hits it while using the feature the normal way. Write the steps. An unusual mix of options nobody would pick is not the normal way.
- It does one of these: loses or corrupts data, breaks the live site or a match, opens a security hole, or makes a main flow fail or show the wrong result.

An error that names the problem, changes nothing and can be undone does not block. Neither do races nobody has hit, missing hardening, style, naming, or ideas for more checks. If you are unsure, it does not block. `Verdict: changes` needs at least one blocking finding.

Report every blocking finding in the first review. List at most five concerns, one line each. The author copies the real ones to the [review concerns issue](https://github.com/joe-lloyd/bloodbowl-phaser/issues/281) in one comment, and does not fix them in this PR. Nobody works on that list unless the owner picks an item.

Judge CodeRabbit threads by the same bar. Decline and resolve the ones that do not meet it, after copying the real ones to the issue.

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
