import { afterEach, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { CaseService } from "../../src/server/cases/service.js";
import { loadConfig } from "../../src/server/config.js";
import { financialFingerprint } from "../../src/server/invoices/normalize.js";
import { openTestRepository } from "../helpers.js";

const resources: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of resources.reverse()) await close();
  resources.length = 0;
});

function setup(mode: "fixture" | "paypal_sandbox" = "fixture") {
  const repository = openTestRepository();
  const app = buildApp({ config: loadConfig({ APP_MODE: mode }), repository });
  resources.push(
    () => repository.close(),
    () => app.close(),
  );
  return { repository, app, service: new CaseService(repository) };
}

async function reviewedHistory(service: CaseService) {
  const repository = service.repository;
  const original = repository.getCase("case-c")!;
  const saved = await service.applyCommand(original.id, {
    operationId: "save-A",
    expectedVersion: original.version,
    action: {
      type: "draft.save",
      body: "Reply A: please confirm the remaining $600 timing.",
    },
  });
  if (!saved.ok) throw new Error(saved.error.message);
  const draft = saved.value.drafts.at(-1)!;
  const reviewed = await service.applyCommand(original.id, {
    operationId: "review-A",
    expectedVersion: saved.value.version,
    action: { type: "draft.review", draftVersionId: draft.id },
  });
  if (!reviewed.ok) throw new Error(reviewed.error.message);
  const permit = await service.prepareCopy(original.id, draft.id);
  if (!permit.ok) throw new Error(permit.error.message);
  expect(service.acknowledgeCopy(permit.value.id, "copy-A").ok).toBe(true);
  const copied = repository.getCase(original.id)!.activity.at(-1)!;
  return { original, draft, copied };
}

it("reads the copied reply and exact review evidence after newer text, sources, decisions and payment facts", async () => {
  const { repository, app, service } = setup();
  const { original, draft, copied } = await reviewedHistory(service);
  for (const action of [
    { type: "draft.save" as const, body: "Reply B: a later private reply." },
    {
      type: "finding.decide" as const,
      findingId: original.findings[0].id,
      decision: "accepted" as const,
    },
    {
      type: "source.replace" as const,
      sourceId: original.sources[0].sourceId,
      reason: "Later supplied correction",
      source: {
        kind: "customer_statement" as const,
        suppliedAuthor: "Client C",
        suppliedAt: null,
        text: "Newer source: handover is complete.",
      },
    },
  ]) {
    const current = repository.getCase(original.id)!;
    expect(
      (
        await service.applyCommand(original.id, {
          operationId: action.type,
          expectedVersion: current.version,
          action,
        })
      ).ok,
    ).toBe(true);
  }
  repository.update(original.id, (current) => {
    const invoice = current.invoice.snapshot!;
    invoice.providerStatus = "PAID";
    invoice.recordedCents = 90000;
    invoice.dueCents = 0;
    invoice.fetchedAt = "2026-10-05T12:00:00.000Z";
    invoice.fingerprint = financialFingerprint(invoice);
    return current;
  });
  const beforeReads = [
    "cases",
    "drafts",
    "sources",
    "snapshots",
    "review_contexts",
    "activity",
    "operations",
    "copy_permits",
  ].map((table) =>
    repository.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
  );
  const response = await app.inject({
    headers: { host: "127.0.0.1:4317" },
    url: `/api/cases/${original.id}/history/drafts/${draft.id}?contextHash=${copied.contextHash}`,
  });
  expect(response.statusCode).toBe(200);
  const history = response.json();
  expect(history.draft.body).toBe(draft.body);
  expect(history.contextHash).toBe(copied.contextHash);
  expect(history.reviewContext).toMatchObject({
    caseId: original.id,
    draftVersionId: draft.id,
    body: draft.body,
    status: original.status,
    activeSourceVersionIds: original.activeSourceVersionIds,
  });
  expect(history.reviewContext.invoiceSnapshot).toEqual(
    original.invoice.snapshot,
  );
  expect(history.reviewContext.findings).toEqual(original.findings);
  expect(history.reviewContext.sources).toEqual(original.sources);
  expect(history.reviewContext.missingSourceVersionIds).toEqual([]);
  expect(history.reviewContext.reviewedAt).toEqual(expect.any(String));
  expect(repository.getCase(original.id)!.drafts.at(-1)!.body).toBe(
    "Reply B: a later private reply.",
  );
  expect(repository.getCase(original.id)!.invoice.snapshot!.dueCents).toBe(0);
  const invoiceResponse = await app.inject({
    headers: { host: "127.0.0.1:4317" },
    url: `/api/cases/${original.id}/history/invoices/${original.invoice.snapshot!.fingerprint}`,
  });
  expect(invoiceResponse.statusCode).toBe(200);
  expect(invoiceResponse.json().snapshots).toEqual([original.invoice.snapshot]);
  expect(
    [
      "cases",
      "drafts",
      "sources",
      "snapshots",
      "review_contexts",
      "activity",
      "operations",
      "copy_permits",
    ].map((table) =>
      repository.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
    ),
  ).toEqual(beforeReads);
});

it("does not infer a review from saving and reports an unavailable explicit context honestly", async () => {
  const { app, service } = setup();
  const { original, draft } = await reviewedHistory(service);
  for (const suffix of ["", "?contextHash=missing-context"]) {
    const response = await app.inject({
      headers: { host: "127.0.0.1:4317" },
      url: `/api/cases/${original.id}/history/drafts/${draft.id}${suffix}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: { body: draft.body },
      contextHash: suffix ? "missing-context" : null,
      reviewContext: null,
    });
  }
});

it("scopes draft, review context and invoice history to their case", async () => {
  const { app, service, repository } = setup();
  const { original, draft, copied } = await reviewedHistory(service);
  const wrongDraft = await app.inject({
    headers: { host: "127.0.0.1:4317" },
    url: `/api/cases/case-a/history/drafts/${draft.id}?contextHash=${copied.contextHash}`,
  });
  expect(wrongDraft.statusCode).toBe(404);
  expect(wrongDraft.body).not.toContain(draft.body);
  const wrongInvoice = await app.inject({
    headers: { host: "127.0.0.1:4317" },
    url: `/api/cases/case-a/history/invoices/${original.invoice.snapshot!.fingerprint}`,
  });
  expect(wrongInvoice.statusCode).toBe(404);
  const unrelatedDraft = repository.getCase("case-a")!.drafts[0];
  const wrongContext = await app.inject({
    headers: { host: "127.0.0.1:4317" },
    url: `/api/cases/case-a/history/drafts/${unrelatedDraft.id}?contextHash=${copied.contextHash}`,
  });
  expect(wrongContext.statusCode).toBe(200);
  expect(wrongContext.json().reviewContext).toBeNull();
  expect(wrongContext.body).not.toContain(draft.body);
  expect(
    (
      await app.inject({
        headers: { host: "127.0.0.1:4317" },
        url: "/api/cases/case-c/history/drafts/missing-draft",
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.inject({
        headers: { host: "127.0.0.1:4317" },
        url: "/api/cases/case-c/history/invoices/missing-fingerprint",
      })
    ).statusCode,
  ).toBe(404);
});

it("does not expose fixture historical records in sandbox mode", async () => {
  const { app, service } = setup("paypal_sandbox");
  const { original, draft, copied } = await reviewedHistory(service);
  for (const path of [
    `drafts/${draft.id}?contextHash=${copied.contextHash}`,
    `invoices/${original.invoice.snapshot!.fingerprint}`,
  ]) {
    const response = await app.inject({
      headers: { host: "127.0.0.1:4317" },
      url: `/api/cases/${original.id}/history/${path}`,
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(draft.body);
  }
});
