#!/usr/bin/env node
/**
 * Read or deploy the live Firestore rules with a short-lived bearer token.
 *
 *   FIREBASE_RULES_TOKEN="$(ssh vault token bloodbowl-sevens/firestore-key)" \
 *     node scripts/firestore-rules.mjs live    > live.rules
 *   FIREBASE_RULES_TOKEN=... node scripts/firestore-rules.mjs deploy
 *
 * `live` prints the rules the project serves now. `deploy` publishes
 * ./firestore.rules. The project defaults to bloodbowl-web, the live game.
 */
import { readFileSync } from "node:fs";

const [command, project = "bloodbowl-web"] = process.argv.slice(2);
const token = process.env.FIREBASE_RULES_TOKEN?.trim();
const root = "https://firebaserules.googleapis.com/v1";
const release = `${root}/projects/${project}/releases/cloud.firestore`;

async function call(url, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  if (!response.ok) {
    const reason = payload.error?.message ?? JSON.stringify(payload);
    throw new Error(`${method} ${url} failed (${response.status}): ${reason}`);
  }
  return payload;
}

async function live() {
  const { rulesetName } = await call(release);
  const ruleset = await call(`${root}/${rulesetName}`);
  const file = ruleset.source.files.find((entry) => entry.name.endsWith(".rules"));
  process.stdout.write(file?.content ?? "");
  console.error(`${project} serves ${rulesetName}.`);
}

async function deploy() {
  const content = readFileSync("firestore.rules", "utf8");
  const ruleset = await call(`${root}/projects/${project}/rulesets`, {
    method: "POST",
    body: { source: { files: [{ name: "firestore.rules", content }] } },
  });
  await call(release, {
    method: "PATCH",
    body: {
      release: {
        name: `projects/${project}/releases/cloud.firestore`,
        rulesetName: ruleset.name,
      },
    },
  });
  console.error(`Deployed ${ruleset.name} to ${project}.`);
}

const commands = { live, deploy };
if (!token || !(command in commands)) {
  console.error(
    "Usage: FIREBASE_RULES_TOKEN=<bearer> node scripts/firestore-rules.mjs live|deploy [project]"
  );
  process.exit(2);
}
commands[command]().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
