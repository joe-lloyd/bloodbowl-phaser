/** The initials on a team's crest. */
import { describe, expect, it } from "vitest";
import { crestInitials } from "../../src/ui/components/common/TeamCrest";

describe("crestInitials", () => {
  it.each([
    ["Nuln Hammers", "NH"],
    ["Skaven", "SK"],
    ["the  grim-lads XI", "TG"],
    ["", "?"],
    [undefined, "?"],
  ])("%s -> %s", (name, initials) => {
    expect(crestInitials(name)).toBe(initials);
  });
});
