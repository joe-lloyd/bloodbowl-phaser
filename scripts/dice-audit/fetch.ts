import { writeFileSync } from "node:fs";

const PROJECT = "bloodbowl-web";
const [out, since] = process.argv.slice(2);
const token = process.env["FIRESTORE_TOKEN"];
if (!out || !token) {
  console.error(
    "usage: FIRESTORE_TOKEN=... pnpm dice:fetch <out.json> [since YYYY-MM-DD]"
  );
  process.exit(1);
}

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

function decode(value: Value): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decode);
  return decodeFields(value.mapValue.fields ?? {});
}

function decodeFields(fields: Record<string, Value>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decode(value)])
  );
}

const startedAfter = since ? Date.parse(since) : 0;
const response = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "dice-logs", allDescendants: true }],
      },
    }),
  }
);
if (!response.ok) {
  console.error(
    `Firestore said ${String(response.status)}: ${await response.text()}`
  );
  process.exit(1);
}
interface Row {
  document?: { name: string; fields: Record<string, Value> };
}
const rows: unknown = await response.json();
const isRow = (row: unknown): row is Row =>
  typeof row === "object" && row !== null;

const logs = (Array.isArray(rows) ? rows.filter(isRow) : []).flatMap((row) => {
  if (!row.document) return [];
  const log = decodeFields(row.document.fields);
  const started = typeof log["startedAt"] === "number" ? log["startedAt"] : 0;
  return started >= startedAfter ? [{ ...log, path: row.document.name }] : [];
});
writeFileSync(out, JSON.stringify(logs));
console.log(`wrote ${String(logs.length)} dice logs to ${out}`);
