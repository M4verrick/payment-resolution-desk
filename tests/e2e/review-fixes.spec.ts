import { test, expect, open, detail, mockClipboard } from "./helpers.js";

test("typing during draft save stays unsaved and cannot be reviewed or copied", async ({
  page,
}) => {
  await open(page);
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const intercepted = new Promise<void>((done) => {
    started = done;
  });
  await page.route("**/api/cases/case-c/commands", async (route) => {
    started();
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  const editor = page.getByLabel("Reply text");
  await editor.fill("Earlier submitted reply");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await intercepted;
  await editor.fill("Newer unsaved reply typed while saving");
  release();
  await expect(
    page.getByText(
      "Earlier reply saved; your newer edits are still unsaved. No message sent.",
    ),
  ).toBeVisible();
  await expect(editor).toHaveValue("Newer unsaved reply typed while saving");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Review saved draft" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy reviewed reply" }),
  ).toBeDisabled();
});

test("clean refresh displays and copies the newer draft reviewed by another owner tab", async ({
  page,
  request,
}) => {
  await open(page);
  const original = await detail(request);
  const text = "Another tab saved and reviewed this exact synthetic reply.";
  expect(
    (
      await request.post("/api/cases/case-c/commands", {
        data: {
          operationId: "other-tab-save",
          expectedVersion: original.version,
          action: { type: "draft.save", body: text },
        },
      })
    ).ok(),
  ).toBe(true);
  const saved = await detail(request);
  expect(
    (
      await request.post("/api/cases/case-c/commands", {
        data: {
          operationId: "other-tab-review",
          expectedVersion: saved.version,
          action: {
            type: "draft.review",
            draftVersionId: saved.drafts.at(-1).id,
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(page.getByLabel("Reply text")).toHaveValue(text);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page.getByText("Reviewed snapshot")).toBeVisible();
  await mockClipboard(page);
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Reviewed draft copied. No message sent."),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).copiedText)).toBe(text);
});

test("keyboard skip focuses the desk without routing away from an unsaved case", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByLabel("Reply text").fill("Keep this unsaved synthetic reply");
  let dialogCount = 0;
  page.on("dialog", async (dialog) => {
    dialogCount++;
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Skip to desk" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page).toHaveURL(/#case\/case-c$/);
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Keep this unsaved synthetic reply",
  );
  expect(dialogCount).toBe(0);
});

test("history shows the exact copied reply and former payment facts after later edits", async ({
  page,
  request,
}) => {
  await open(page);
  const original = await detail(request);
  const financialClaim = "Original invoice reported six hundred dollars due.";
  expect(
    (
      await request.post("/api/cases/case-c/commands", {
        data: {
          operationId: "historical-invoice-finding",
          expectedVersion: original.version,
          action: {
            type: "finding.add",
            finding: {
              category: "payment_timing",
              claim: financialClaim,
              supporting: [
                {
                  fingerprint: original.invoice.snapshot.fingerprint,
                  field: "dueCents",
                },
              ],
              conflicting: [],
              missing: [],
              nextStep:
                "Check the recorded remaining due before agreeing timing.",
            },
          },
        },
      })
    ).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "Refresh invoice" }).click();
  await expect(
    page.getByRole("heading", { name: financialClaim }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(
    page.getByText("Reviewed saved draft snapshot. No message sent."),
  ).toBeVisible();
  await mockClipboard(page);
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Reviewed draft copied. No message sent."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByLabel("Reply text").fill("Later synthetic replacement reply");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByText("Demo controls", { exact: true }).click();
  await page.getByLabel("Simulated invoice state").selectOption("paid");
  await page.getByRole("button", { name: "Apply simulated state" }).click();
  await expect(
    page.getByText("Simulated invoice state applied."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Invoice payment facts" }),
  ).toContainText("$0.00");
  await page.getByRole("button", { name: /Show all \d+ events/ }).click();
  await page
    .getByRole("button", { name: "Inspect copied reply and review context" })
    .click();
  const historical = page.getByRole("region", { name: "Historical evidence" });
  await expect(
    historical.getByRole("heading", { name: "Historical reviewed reply" }),
  ).toBeVisible();
  await expect(historical).toContainText(original.drafts.at(-1).body);
  await expect(historical).toContainText("$600.00");
  await expect(historical).toBeFocused();
  const oldFinding = original.findings.find((finding: any) =>
    finding.supporting.some((citation: any) => citation.sourceVersionId),
  );
  const oldSourceCitation = oldFinding.supporting.find(
    (citation: any) => citation.sourceVersionId,
  );
  await historical
    .getByRole("button", {
      name: `View historical supporting excerpt 1 for ${oldFinding.claim}`,
    })
    .click();
  await expect(
    historical.getByTestId("historical-source-context").locator("mark"),
  ).toHaveText(oldSourceCitation.quote);
  await expect(page).toHaveURL(/#case\/case-c$/);
  await page.screenshot({
    path: "docs/screenshots/historical-reviewed-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^Issues/ }).click();
  await page
    .getByRole("button", {
      name: `View supporting excerpt 1 for ${financialClaim}`,
    })
    .click();
  await expect(
    historical.getByRole("heading", { name: "Historical payment snapshot" }),
  ).toBeVisible();
  await expect(historical).toContainText("$600.00");
  await expect(historical).toContainText(original.invoice.snapshot.fingerprint);
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Later synthetic replacement reply",
  );
});

test("owner correction keeps citations and a new manual finding selects an exact immutable passage", async ({
  page,
  request,
}) => {
  await open(page, "case-a");
  const original = await detail(request, "case-a");
  await page
    .getByRole("button", { name: "Edit as owner correction" })
    .first()
    .click();
  const correctedClaim =
    "Owner-corrected scope concern with preserved evidence.";
  await page.getByLabel("Owner finding", { exact: true }).fill(correctedClaim);
  await page
    .getByLabel("Reason for correction")
    .fill("Clarify the wording while keeping the supplied evidence.");
  await page.getByRole("button", { name: "Save owner finding" }).click();
  await expect(
    page.getByRole("heading", { name: correctedClaim }),
  ).toBeVisible();
  const corrected = (await detail(request, "case-a")).findings.find(
    (f: any) => f.claim === correctedClaim,
  );
  expect(corrected.supporting).toEqual(original.findings[0].supporting);
  expect(corrected.conflicting).toEqual(original.findings[0].conflicting);
  const sourceCitation = corrected.supporting.find(
    (c: any) => c.sourceVersionId,
  );
  await page
    .getByRole("button", {
      name: `View supporting excerpt 1 for ${correctedClaim}`,
    })
    .click();
  await expect(page.getByTestId("source-context").locator("mark")).toHaveText(
    sourceCitation.quote,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Issues/ }).click();
  const manual = page.locator("#manual-finding");
  if (!(await manual.evaluate((element) => element.hasAttribute("open"))))
    await page.getByText("Add owner finding", { exact: true }).click();
  const manualClaim = "Selected exact passage in a manual owner finding.";
  await page.getByLabel("Owner finding", { exact: true }).fill(manualClaim);
  await page
    .getByLabel("Proposed next action")
    .fill("Check this exact passage with the customer.");
  await page.getByText("Choose source evidence", { exact: true }).click();
  const source = original.sources[0];
  await page.getByLabel("Evidence source version").selectOption(source.id);
  await page
    .getByLabel("Excerpt text", { exact: true })
    .fill(source.text.slice(0, 20));
  await page.getByLabel("Matching passage").selectOption("0");
  await page.getByLabel("Evidence role").selectOption("supporting");
  await expect(page.getByTestId("exact-passage-preview")).toHaveText(
    source.text.slice(0, 20),
  );
  await page.getByRole("button", { name: "Add exact passage" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/manual-evidence-narrow.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save owner finding" }).click();
  await expect(page.getByRole("heading", { name: manualClaim })).toBeVisible();
  const saved = (await detail(request, "case-a")).findings.find(
    (f: any) => f.claim === manualClaim,
  );
  expect(saved.supporting).toEqual([
    {
      sourceVersionId: source.id,
      start: 0,
      end: 20,
      quote: source.text.slice(0, 20),
    },
  ]);
  await page
    .getByRole("button", {
      name: `View supporting excerpt 1 for ${manualClaim}`,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Sources", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("source-context").locator("mark")).toHaveText(
    source.text.slice(0, 20),
  );
});

test("typing during mandatory copy refresh cancels the clipboard write and acknowledgement", async ({
  page,
  request,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByRole("button", { name: "Review saved draft" }).click();
  await expect(
    page.getByText("Reviewed saved draft snapshot. No message sent."),
  ).toBeVisible();
  await mockClipboard(page);
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((done) => {
    release = done;
  });
  const intercepted = new Promise<void>((done) => {
    started = done;
  });
  await page.route("**/api/cases/case-c/prepare-copy", async (route) => {
    started();
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await intercepted;
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByLabel("Reply text")
    .fill("New local reply during pending copy preparation");
  release();
  await expect(
    page.getByText(
      "Copy cancelled because the reply changed. Save and review your retained edits before copying.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "New local reply during pending copy preparation",
  );
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  expect(await page.evaluate(() => (window as any).clipboardWrites ?? 0)).toBe(
    0,
  );
  expect(
    (await detail(request)).activity.filter(
      (event: any) => event.kind === "draft.copied",
    ),
  ).toHaveLength(0);
});
