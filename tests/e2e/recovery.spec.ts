import {
  test,
  expect,
  open,
  review,
  mockClipboard,
  detail,
} from "./helpers.js";
test("SQLite source draft and activity survive server restart", async ({
  page,
  desk,
  request,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page
    .getByLabel("Reply text")
    .fill("Persist this synthetic owner reply.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByText("Add or replace a source", { exact: true }).click();
  await page
    .getByLabel("Source text")
    .fill("Persist this synthetic owner note.");
  await page.getByRole("button", { name: "Save source" }).click();
  await expect(page.getByText("Saved case change.")).toBeVisible();
  const before = await detail(request);
  await desk.restart();
  await page.reload();
  await expect(page.getByLabel("Reply text")).toHaveValue(
    "Persist this synthetic owner reply.",
  );
  const after = await detail(request);
  expect(after.sources).toEqual(before.sources);
  expect(after.drafts).toEqual(before.drafts);
  expect(after.activity).toEqual(before.activity);
});
test("two-tab stale edit preserves local text and requires explicit current-case comparison", async ({
  page,
  context,
}) => {
  await open(page);
  const second = await context.newPage();
  await open(second);
  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await page.getByLabel("Reply text").fill("First tab saved text");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved. No message sent.")).toBeVisible();
  await second.getByRole("button", { name: "Reply", exact: true }).click();
  await second.getByLabel("Reply text").fill("Second tab retained text");
  await second.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    second.getByText("This case changed. Your local reply is retained."),
  ).toBeVisible();
  await expect(second.getByLabel("Reply text")).toHaveValue(
    "Second tab retained text",
  );
  await second
    .getByRole("button", { name: "Load current case and keep local reply" })
    .click();
  await second.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(second.getByText("Draft saved. No message sent.")).toBeVisible();
  await second.close();
});
test("clipboard rejection never creates a copied event", async ({
  page,
  request,
}) => {
  await open(page);
  await mockClipboard(page, true);
  await review(page);
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Copy failed. Your draft is saved."),
  ).toBeVisible();
  expect(
    (await detail(request)).activity.filter(
      (a: any) => a.kind === "draft.copied",
    ),
  ).toHaveLength(0);
});
test("copied-but-unrecorded acknowledgement retries exact permit without copying again", async ({
  page,
  request,
}) => {
  await open(page);
  await mockClipboard(page);
  await review(page);
  const requests: string[] = [];
  let fail = true;
  await page.route("**/api/copy-permits/*/ack", (route) => {
    requests.push(route.request().postData()!);
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "REQUEST_FAILED",
            message: "Simulated ack failure",
            retryable: true,
          },
        }),
      });
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "Copy reviewed reply" }).click();
  await expect(
    page.getByText("Copied; activity could not be saved"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry activity save" }).click();
  await expect(
    page.getByText("Reviewed draft copied. No message sent."),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(await page.evaluate(() => (window as any).clipboardWrites)).toBe(1);
  expect(
    (await detail(request)).activity.filter(
      (a: any) => a.kind === "draft.copied",
    ),
  ).toHaveLength(1);
});
test("duplicate save is one action and copying a permit survives an intervening edit", async ({
  request,
}) => {
  const d = await detail(request);
  const command = {
    operationId: "same",
    expectedVersion: d.version,
    action: { type: "draft.save", body: "Saved once" },
  };
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request.post("/api/cases/case-c/commands", { data: command })
      ).ok(),
    ).toBe(true);
  const saved = await detail(request);
  expect(
    saved.activity.filter((a: any) => a.kind === "draft.save"),
  ).toHaveLength(1);
  await request.post("/api/cases/case-c/commands", {
    data: {
      operationId: "review",
      expectedVersion: saved.version,
      action: { type: "draft.review", draftVersionId: saved.drafts.at(-1).id },
    },
  });
  const permit = await request.post("/api/cases/case-c/prepare-copy", {
    data: { draftVersionId: saved.drafts.at(-1).id },
  });
  expect(permit.ok()).toBe(true);
  const p = await permit.json();
  const current = await detail(request);
  await request.post("/api/cases/case-c/commands", {
    data: {
      operationId: "edit",
      expectedVersion: current.version,
      action: { type: "draft.save", body: "Edited after permit" },
    },
  });
  const ack = await request.post(`/api/copy-permits/${p.id}/ack`, {
    data: { operationId: "ack" },
  });
  expect(ack.ok()).toBe(true);
  expect((await ack.json()).activity.at(-1).subjectVersionId).toBe(
    saved.drafts.at(-1).id,
  );
});
