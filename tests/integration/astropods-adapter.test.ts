import { expect, it, vi } from "vitest";
import { AstropodsAnalyzer } from "../../src/server/analysis/astropods-analyzer.js";
import { analysisInput, analysisOutput } from "../analysis-fixtures.js";
import { buildApp } from "../../src/server/app.js";
import { loadConfig } from "../../src/server/config.js";
import { openTestRepository } from "../helpers.js";

const settings = {
  url: "https://aig.astropods.ai",
  apiKey: "synthetic-secret",
};
function wire() {
  const output = analysisOutput();
  return {
    blockers: output.blockers,
    findings: output.findings.map(({ category, claim, missing, nextStep }) => ({
      category,
      claim,
      missing,
      nextStep,
      supportingCandidateIds: ["source-0"],
      conflictingCandidateIds: [],
    })),
    suggestedReply: output.suggestedReply!.text,
  };
}
const envelope = (value: unknown = wire(), extra = {}) =>
  Response.json({
    model: "claude-sonnet-4-6",
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
    ...extra,
  });
it("sends one bounded request to the fixed gateway and resolves immutable citations", async () => {
  const transport = vi.fn(async () => envelope());
  const result = await new AstropodsAnalyzer(settings, transport).analyze(
    analysisInput(),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    ok: true,
    value: {
      modelId: "claude-sonnet-4-6",
      findings: [
        {
          supporting: [analysisInput().evidenceCandidates[0].citation],
          decision: "unreviewed",
          origin: "model",
        },
      ],
    },
  });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://aig.astropods.ai/v1/chat/completions");
  expect(init.redirect).toBe("error");
  const body = JSON.parse(init.body as string);
  expect(body.model).toBe("claude-sonnet-4-6");
  expect(body.max_tokens).toBeLessThanOrEqual(6000);
  expect(body).not.toHaveProperty("tools");
  expect(init.body).not.toContain(settings.apiKey);
});
it("accepts the observed documented Sonnet 4.6 global inference ID and preserves that reported identity", async () => {
  const result = await new AstropodsAnalyzer(settings, async () =>
    envelope(wire(), { model: "global.anthropic.claude-sonnet-4-6" }),
  ).analyze(analysisInput(), new AbortController().signal);
  expect(result).toMatchObject({
    ok: true,
    value: { modelId: "global.anthropic.claude-sonnet-4-6" },
  });
  for (const model of [
    "global.anthropic.claude-sonnet-5",
    "global.anthropic.claude-sonnet-4-6:unknown",
    "evil/global.anthropic.claude-sonnet-4-6",
  ])
    expect(
      (
        await new AstropodsAnalyzer(settings, async () =>
          envelope(wire(), { model }),
        ).analyze(analysisInput(), new AbortController().signal)
      ).ok,
    ).toBe(false);
});
it("accepts a single JSON code fence but rejects surrounding prose, multiple objects and malformed JSON", async () => {
  const json = JSON.stringify(wire());
  for (const content of [
    json,
    `\`\`\`json\n${json}\n\`\`\``,
    `\`\`\`\n${json}\n\`\`\``,
  ]) {
    const result = await new AstropodsAnalyzer(settings, async () =>
      envelope(wire(), {
        choices: [{ finish_reason: "stop", message: { content } }],
      }),
    ).analyze(analysisInput(), new AbortController().signal);
    expect(result.ok).toBe(true);
  }
  for (const content of [
    `Here it is: ${json}`,
    `${json}\n${json}`,
    `\`\`\`json\n${json}\n\`\`\` trailing`,
    `\`\`\`json\n{broken}\n\`\`\``,
  ]) {
    const result = await new AstropodsAnalyzer(settings, async () =>
      envelope(wire(), {
        choices: [{ finish_reason: "stop", message: { content } }],
      }),
    ).analyze(analysisInput(), new AbortController().signal);
    expect(result.ok).toBe(false);
  }
});
it("refuses foreign hosts, incomplete setup, cancelled work and oversized/non-synthetic input without transport", async () => {
  const transport = vi.fn(async () => envelope());
  for (const url of [
    "https://evil.example",
    "http://aig.astropods.ai",
    "https://aig.astropods.ai:443",
    "https://aig.astropods.ai/v1",
    "https://aig.astropods.ai?x=1",
  ])
    expect(
      () => new AstropodsAnalyzer({ ...settings, url }, transport),
    ).toThrow();
  expect(
    () => new AstropodsAnalyzer({ ...settings, apiKey: "" }, transport),
  ).toThrow();
  const analyzer = new AstropodsAnalyzer(settings, transport);
  const abort = new AbortController();
  abort.abort();
  expect((await analyzer.analyze(analysisInput(), abort.signal)).ok).toBe(
    false,
  );
  for (const change of [
    { text: "x".repeat(30001) },
    { provenance: "private" },
  ]) {
    const input = analysisInput();
    Object.assign(input.sources[0], change);
    expect(
      (await analyzer.analyze(input, new AbortController().signal)).ok,
    ).toBe(false);
  }
  expect(transport).not.toHaveBeenCalled();
});
it("rejects unknown citations, injected authority, foreign links, truncated JSON and model substitution", async () => {
  const unknown = wire();
  unknown.findings[0].supportingCandidateIds = ["invented"];
  const authority = wire();
  Object.assign(authority.findings[0], { decision: "accepted" });
  const link = { ...wire(), suggestedReply: "Pay https://evil.example" };
  for (const response of [
    envelope(unknown),
    envelope(authority),
    envelope(link),
    envelope(wire(), { model: "other" }),
    envelope(wire(), {
      choices: [{ finish_reason: "length", message: { content: "{" } }],
    }),
    new Response("x".repeat(150001)),
  ]) {
    const transport = vi.fn(async () => response);
    expect(
      (
        await new AstropodsAnalyzer(settings, transport).analyze(
          analysisInput(),
          new AbortController().signal,
        )
      ).ok,
    ).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  }
});
it("never retries or exposes remote error bodies and thrown secrets", async () => {
  for (const status of [401, 429, 500]) {
    const transport = vi.fn(
      async () => new Response(settings.apiKey, { status }),
    );
    const result = await new AstropodsAnalyzer(settings, transport).analyze(
      analysisInput(),
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(settings.apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
  }
  const transport = vi.fn(async () => {
    throw Error(settings.apiKey);
  });
  expect(
    JSON.stringify(
      await new AstropodsAnalyzer(settings, transport).analyze(
        analysisInput(),
        new AbortController().signal,
      ),
    ),
  ).not.toContain(settings.apiKey);
});
it("reports safe protocol mismatch fields without disclosing response content", async () => {
  const transport = vi.fn(async () =>
    envelope(wire(), { model: "claude-sonnet-4-6-20260217" }),
  );
  const result = await new AstropodsAnalyzer(settings, transport).analyze(
    analysisInput(),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    ok: false,
    error: { code: "ANALYSIS_INVALID" },
  });
  expect(JSON.stringify(result)).toContain("model");
  expect(JSON.stringify(result)).toContain("claude-sonnet-4-6-20260217");
  expect(JSON.stringify(result)).not.toContain(wire().suggestedReply);
});
it("distinguishes missing model metadata from a gateway model alias without accepting either", async () => {
  for (const [model, description] of [
    [undefined, "missing"],
    [17, "number"],
    [
      "bedrock/global.anthropic.claude-sonnet-4-6-v1:0",
      "bedrock/global.anthropic.claude-sonnet-4-6-v1:0",
    ],
    [settings.apiKey, "redacted"],
  ] as const) {
    const result = await new AstropodsAnalyzer(settings, async () =>
      envelope(wire(), { model }),
    ).analyze(analysisInput(), new AbortController().signal);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain(description);
    expect(JSON.stringify(result)).not.toContain(settings.apiKey);
  }
});
it("can retain a bounded response for offline diagnosis with the configured key redacted", async () => {
  const observed: unknown[] = [];
  const transport = vi.fn(async () =>
    envelope({ ...wire(), suggestedReply: settings.apiKey }),
  );
  const result = await new AstropodsAnalyzer(settings, transport, (raw) =>
    observed.push(raw),
  ).analyze(analysisInput(), new AbortController().signal);
  expect(result.ok).toBe(true);
  expect(observed).toHaveLength(1);
  expect(JSON.stringify(observed)).not.toContain(settings.apiKey);
  expect(JSON.stringify(observed)).toContain("[redacted]");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("aborts a stalled transport within its deadline without retry", async () => {
  vi.useFakeTimers();
  try {
    const transport = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(Error("aborted")),
          ),
        ),
    );
    const pending = new AstropodsAnalyzer(settings, transport).analyze(
      analysisInput(),
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(14001);
    expect((await pending).ok).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
it("wires approved configuration through the API, persists validated results and replays without another request", async () => {
  const repository = openTestRepository();
  const before = repository.getCase("case-c")!;
  const transport = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      const input = JSON.parse(
        JSON.parse(init!.body as string).messages[1].content,
      );
      const output = wire();
      output.blockers.questioned_amount.supportingCandidateIds = [
        input.evidenceCandidates[0].id,
      ];
      output.blockers.missing_document.supportingCandidateIds = [
        input.evidenceCandidates[0].id,
      ];
      output.findings[0].supportingCandidateIds = [
        input.evidenceCandidates[0].id,
      ];
      return envelope(output);
    },
  );
  const app = buildApp({
    repository,
    fetch: transport,
    config: loadConfig({
      ANALYSIS_MODE: "astropods",
      ASTRO_GATEWAY_URL: settings.url,
      ASTRO_GATEWAY_API_KEY: settings.apiKey,
      ASTROPODS_SPONSOR_CREDITS_VERIFIED: "true",
      SYNTHETIC_DATA_APPROVED: "true",
    }),
  });
  const headers = {
    host: "127.0.0.1:4317",
    "content-type": "application/json",
  };
  try {
    const status = await app.inject({ url: "/api/status", headers });
    expect(status.json().analysis).toBe("astropods");
    expect(status.body).not.toContain(settings.apiKey);
    const request = {
      method: "POST" as const,
      url: "/api/cases/case-c/analyze",
      headers,
      payload: {},
    };
    const response = await app.inject(request);
    expect(response.statusCode).toBe(200);
    expect(response.json().analysis).toMatchObject({
      execution: "model",
      modelId: "claude-sonnet-4-6",
      verification: "syntactic_only",
    });
    expect(response.json().invoice).toEqual(before.invoice);
    expect(response.json().drafts).toEqual(before.drafts);
    expect((await app.inject(request)).json()).toEqual(response.json());
    expect(transport).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
    repository.close();
  }
});
