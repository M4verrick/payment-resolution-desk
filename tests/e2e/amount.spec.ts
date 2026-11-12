import { test, expect, open, review } from "./helpers.js";
test("synthetic questioned amount preserves the $1200 provider balance", async ({
  page,
  request,
}) => {
  await open(page, "case-a");
  await expect(
    page.getByText("Customer questions the additional $200."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /View supporting excerpt/ })
    .first()
    .click();
  await expect(page.getByTestId("source-context")).toContainText(
    "We agreed $1,000.",
  );
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByLabel("Reply text")
    .fill(
      "Please share the approval for the additional charge before we confirm a next step.",
    );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
  await review(page);
  const d = await (await request.get("/api/cases/case-a")).json();
  expect(d.invoice.snapshot.dueCents).toBe(120000);
  expect(d.status).toBe("needs_review");
  await page.screenshot({
    path: "docs/screenshots/amount-desktop.png",
    fullPage: true,
  });
});
