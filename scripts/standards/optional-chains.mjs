import fs from "node:fs";

const report = process.argv[2];
if (!report) throw new Error("Provide an ESLint JSON report");
let count = 0;
for (const file of JSON.parse(fs.readFileSync(report, "utf8"))) {
  const messages = file.messages.filter(
    (message) =>
      message.ruleId === "@typescript-eslint/no-unnecessary-condition" &&
      message.message.startsWith("Unnecessary optional chain")
  );
  if (!messages.length) continue;
  let source = fs.readFileSync(file.filePath, "utf8");
  const lines = source.split("\n");
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const edits = messages.map(
    (message) => offsets[message.line - 1] + message.column - 1
  );
  for (const start of edits.sort((a, b) => b - a)) {
    if (source.slice(start, start + 2) !== "?.")
      throw new Error(`Unexpected token in ${file.filePath}:${start}`);
    const replacement = ["[", "("].includes(source[start + 2]) ? "" : ".";
    source = source.slice(0, start) + replacement + source.slice(start + 2);
    count++;
  }
  fs.writeFileSync(file.filePath, source);
}
console.log(`Removed ${count} unnecessary optional chains`);
