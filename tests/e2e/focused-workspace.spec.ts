import { test, expect, open } from "./helpers.js";
for (const width of [1440, 390]) {
  test(`focused workspace keeps one task visible and retains edits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, "case-b");
    await expect(page.locator("#pane-findings")).toBeVisible();
    await expect(page.locator("#pane-reply")).toBeHidden();
    await expect(page.locator("#pane-sources")).toBeHidden();
    await expect(page.locator("#pane-history")).toBeHidden();
    const findings = page.locator("#pane-findings .finding");
    await expect(findings).toHaveCount(2);
    await expect(findings.nth(1).locator(".provenance")).toBeVisible();
    await expect(findings.nth(0).locator(".issue-detail")).toBeVisible();
    await findings
      .nth(1)
      .getByRole("button", { name: "Inspect finding" })
      .click();
    await expect(findings.nth(1).locator(".issue-detail")).toBeVisible();
    await expect(findings.nth(0).locator(".issue-detail")).toBeHidden();
    await findings
      .nth(0)
      .getByRole("button", { name: "Inspect finding" })
      .click();
    if (width === 390) {
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeHidden();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(
        page.getByRole("navigation", { name: "Main navigation" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
    }
    await page.screenshot({
      path: `.local/ui-focus/issues-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await page
      .getByLabel("Reply text")
      .fill(
        "Please confirm the project reference before I prepare a response.",
      );
    await page.getByRole("button", { name: "Sources", exact: true }).click();
    await expect(page.getByTestId("source-context")).toBeVisible();
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(page.getByLabel("Reply text")).toHaveValue(
      "Please confirm the project reference before I prepare a response.",
    );
    await expect(
      page.getByText("Unsaved changes", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/ui-focus/reply-${width}.png`,
      fullPage: true,
    });
  });
}
