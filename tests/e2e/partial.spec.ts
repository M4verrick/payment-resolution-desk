import { test, expect, open, review, detail } from "./helpers.js";
test("synthetic partial journey copies a reviewed clarification then pending and paid stay owner-controlled", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await review(page);
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Reviewed draft copied. No message sent."),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "$600 remaining",
  );
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByText("Add or replace a source", { exact: true }).click();
  await page.getByLabel("Source type").selectOption("customer_statement");
  await page
    .getByLabel("Author as supplied", { exact: true })
    .fill("Synthetic Client C");
  await page
    .getByLabel("Source text")
    .fill(
      "Handover is complete and accepted. I'll pay the remaining $600 now.",
    );
  await page.getByRole("button", { name: "Save source" }).click();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByText("Needs review again", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByText("Demo controls", { exact: true }).click();
  await page.getByLabel("Simulated invoice state").selectOption("pending");
  await page.getByRole("button", { name: "Apply simulated state" }).click();
  await expect(
    page.getByText("PAYMENT_PENDING", { exact: true }),
  ).toBeVisible();
  expect((await detail(request)).invoice.snapshot.dueCents).toBe(60000);
  await page.getByLabel("Simulated invoice state").selectOption("paid");
  await page.getByRole("button", { name: "Apply simulated state" }).click();
  await expect(page.getByText("PAID", { exact: true })).toBeVisible();
  const paid = await detail(request);
  expect(paid.invoice.snapshot.dueCents).toBe(0);
  expect(paid.status).not.toBe("resolved");
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByText("Change case decision or close", { exact: true })
    .click();
  await page
    .getByLabel("Case decision", { exact: true })
    .selectOption("resolved");
  await page
    .getByLabel("Reason for case decision")
    .fill(
      "Owner reviewed remaining issues after the simulated record changed.",
    );
  await page.getByRole("button", { name: "Save case decision" }).click();
  await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/partial-paid-desktop.png",
    fullPage: true,
  });
});
test("390px synthetic review is usable by keyboard with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Sources", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Issues/ }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /View supporting excerpt/ })
    .first()
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("source-context")).toBeFocused();
  await page.getByRole("button", { name: "Reply", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Reply text").focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(
    "Please confirm the agreed handover and payment timing.",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
  await page.getByRole("button", { name: "Review saved draft" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Reviewed saved draft snapshot. No message sent."),
  ).toBeVisible();
  expect(
    await page
      .getByRole("link", { name: "Skip to desk" })
      .evaluate((el) => el.getBoundingClientRect().width),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/partial-narrow.png",
    fullPage: true,
  });
});
