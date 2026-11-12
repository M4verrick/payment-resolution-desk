import { test, expect, detail } from "./helpers.js";
test("long source labels remain inside the evidence column at laptop and mobile widths", async ({
  page,
  request,
}) => {
  const d = await detail(request);
  const saved = await request.post("/api/cases/case-c/commands", {
    data: {
      operationId: "long-label-layout",
      expectedVersion: d.version,
      action: {
        type: "source.add",
        source: {
          kind: "owner_document",
          suppliedAuthor:
            "Synthetic studio with a long departmental description ".repeat(3),
          suppliedAt: null,
          text: "Synthetic record for checking a long source label.",
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/#case/case-c");
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    const pane = page.locator("#pane-sources");
    await expect(
      pane.getByRole("heading", { name: "Sources", exact: true }),
    ).toBeVisible();
    const bounds = (await pane.boundingBox())!;
    for (const source of await pane.locator(".source-slip").all()) {
      const box = (await source.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
