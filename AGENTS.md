# Agent instructions

## Pull requests

Every change reaches `main` through a pull request. CodeRabbit reviews every pull request that is not a draft.

Open pull requests ready for review. If you opened a draft, run `gh pr ready` once the work is done, because CodeRabbit skips drafts. Then invoke the `babysit-pr` skill and stay on the PR until it merges. Its CodeRabbit section is the process:

- Fix or decline every CodeRabbit finding, then wait for CodeRabbit to review the new head.
- Once CodeRabbit passes the head clean, and any CI the repo runs is green, merge without asking.
- If CodeRabbit still has open findings after three rounds of fixes, stop. Do not merge. Tell the owner directly.

## Review scope

Reviewers, CodeRabbit and fallback reviewers alike, skip `public/sprites/bloodbowl/` and `__tests__/`. Both are large and mostly generated, and the owner decided a review there is not worth it. Read the rest of the diff with `git diff origin/main...HEAD -- . ':!public/sprites/bloodbowl' ':!__tests__'`. CI still runs every test.

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
