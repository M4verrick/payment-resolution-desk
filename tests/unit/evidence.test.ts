import { it, expect } from "vitest";
import { validateCitation } from "../../src/server/cases/evidence.js";
import { demoCase } from "../helpers.js";
it("checks immutable version and half-open UTF-16 spans including emoji CRLF and repetition", () => {
  const source = {
    ...demoCase("case-c").sources[0],
    text: "😀\r\nrepeat\r\nrepeat",
  };
  const c = { sourceVersionId: source.id, start: 12, end: 18, quote: "repeat" };
  expect(source.text.slice(12, 18)).toBe("repeat");
  expect(validateCitation(c, [source]).ok).toBe(true);
  for (const bad of [
    { ...c, end: 17 },
    { ...c, sourceVersionId: "old-unknown" },
    { ...c, start: -1 },
    { ...c, start: 0, end: 2, quote: "repeat" },
  ])
    expect(validateCitation(bad, [source]).ok).toBe(false);
});
