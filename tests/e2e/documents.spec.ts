import { test, expect, open } from "./helpers.js";
test("synthetic document case keeps both the PO mismatch and missing signature visible", async ({
  page,
}) => {
  await open(page, "case-b");
  await expect(
    page.getByText("PO references differ: PO-482 / PO-428."),
  ).toBeVisible();
  await expect(
    page.getByText("Customer requests a signed completion report."),
  ).toBeVisible();
  await expect(page.getByText("Example finding · not AI")).toHaveCount(2);
  await page
    .getByRole("button", { name: /View conflicting excerpt/ })
    .first()
    .click();
  await expect(page.getByTestId("source-context")).toContainText(
    "Client signature: not supplied",
  );
  await expect(page.getByTestId("source-context")).toBeFocused();
  await page.screenshot({
    path: "docs/screenshots/documents-desktop.png",
    fullPage: true,
  });
});
