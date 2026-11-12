import { test, expect, detail, mockClipboard } from "./helpers.js";
test("offline review journey recovers a lost analysis response and preserves approval after restart", async ({
  page,
  request,
  desk,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("table", { name: "Resolution cases" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/2026-10-22-queue-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Start with the partial payment/ })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Case views" }),
  ).toBeVisible();
  let lost = true;
  await page.route("**/api/cases/case-c/analyze", async (route) => {
    if (lost) {
      lost = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(
    page.getByText(
      "Demo suggestions loaded. No AI model was called; your review is required.",
    ),
  ).toBeVisible();
  expect(
    (await detail(request)).activity.filter(
      (e: any) => e.kind === "analysis.completed",
    ),
  ).toHaveLength(1);
  await page.getByLabel(/Finding decision:/).selectOption("accepted");
  await expect(page.getByText("Saved case change.")).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByText("Demo reply suggestion · not reviewed", { exact: true })
    .click();
  await page.getByRole("button", { name: "Use suggestion in editor" }).click();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(
    page.getByText("Reviewed saved draft snapshot. No message sent."),
  ).toBeVisible();
  await mockClipboard(page);
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Reviewed draft copied. No message sent."),
  ).toBeVisible();
  const before = await detail(request);
  await desk.restart();
  await page.reload();
  expect((await detail(request)).activity).toEqual(before.activity);
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(
    page.getByText(
      "Demo suggestions loaded. No AI model was called; your review is required.",
    ),
  ).toBeVisible();
  expect(
    (await detail(request)).activity.filter(
      (e: any) => e.kind === "analysis.completed",
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "docs/screenshots/2026-10-22-reviewed-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("changed evidence blocks obsolete demo wording and keeps manual work usable", async ({
  page,
}) => {
  await page.goto("/#case/case-c");
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(
    page.getByText(
      "Demo suggestions loaded. No AI model was called; your review is required.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByText("Add or replace a source", { exact: true }).click();
  await page
    .getByLabel("Source text")
    .fill("Handover accepted today; please confirm payment timing.");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByText("Saved case change.")).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByText("Demo reply suggestion · not reviewed", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Use suggestion in editor" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Demo analysis cannot read new material",
  );
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByLabel("Reply text")
    .fill("I will review the updated handover evidence.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
});
test("narrow queue and review path are keyboard usable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Start with the partial payment/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/2026-10-22-queue-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: /Start with the partial payment/ })
    .click();
  await page.getByRole("button", { name: /^Issues/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#pane-findings")).toBeFocused();
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await expect(
    page.getByText(
      "Demo suggestions loaded. No AI model was called; your review is required.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/2026-10-22-analysis-mobile.png",
    fullPage: true,
  });
});
