# Payment Resolution Desk

Review an unpaid PayPal invoice alongside customer correspondence, inspect cited AI suggestions, and prepare an owner-reviewed reply. Saving or copying never sends a message. A commercial case decision and the invoice's payment status remain separate.

The prototype uses React/TypeScript, Fastify, SQLite and Astropods Gateway with Claude Sonnet 4.6. It supports authored synthetic correspondence and read-only allowlisted PayPal sandbox invoices in USD or SGD. No invoice creation, sending, editing, refunds or payment API is implemented.

## PayPal, AI and sponsor integration

| Technology | Role in this project | Implementation |
| --- | --- | --- |
| PayPal REST OAuth 2.0 and Invoicing API v2 (sandbox) | Authenticates server-side and reads an allowlisted invoice's amounts, due date and provider status. Refreshes the invoice before reply review and copy to detect changed financial context. | [PayPal provider](src/server/invoices/paypal-provider.ts): `POST /v1/oauth2/token`, then `GET /v2/invoicing/invoices/{id}` on the sandbox host. |
| Astropods Gateway (additional sponsor integration) | Routes the application's model requests through an account Gateway key. | [Astropods adapter](src/server/analysis/astropods-analyzer.ts): `POST https://aig.astropods.ai/v1/chat/completions`. |
| Anthropic Claude Sonnet 4.6 | Analyses supplied synthetic correspondence against an invoice snapshot, identifies possible blockers, cites supporting/conflicting passages and suggests a next step and editable reply. | Requested as `claude-sonnet-4-6` through Astropods; observed response identity `global.anthropic.claude-sonnet-4-6`. Structured responses and citations are checked before display; the owner reviews their meaning. |
| React, TypeScript and Vite | Browser interface and frontend build. | [Client](src/web), [package manifest](package.json). |
| Node.js, Fastify, SQLite and Zod | Local server, persistent cases/review history and input/output validation. | [Server](src/server), [database](src/server/db/database.ts). |

PayPal supplies the financial record; the model helps interpret the correspondence. Neither model output nor a case decision changes the PayPal invoice. API keys remain server-side. The offline mode below substitutes labelled fixtures for both integrations.

## Run the offline workflow

Use Node 24.x (`.node-version` pins 24.14.0):

```sh
git clone https://github.com/M4verrick/payment-resolution-desk.git
cd payment-resolution-desk
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run demo
```

Open <http://127.0.0.1:4317>. Start with **the partial payment**, load the authored demo analysis, inspect passages, decide a finding, edit/save/review/copy a reply, then add evidence to see review become stale. This mode is explicitly offline: fixture invoices and authored suggestions are not genuine PayPal/model calls. It preserves `.local/demo.sqlite`; no existing database is reset.

## Run genuine sandbox and AI integration

Copy [.env.example](.env.example) to a private `.env` in a fresh checkout. Supply permitted PayPal sandbox credentials and known invoice IDs, plus an Astropods Gateway key with approved sponsor-credit/data setup. Follow the [complete judge guide](docs/judge-guide.md), then:

```sh
npm run build
npm run start:configured
```

Desk status shows the configured modes. Add labelled synthetic sources before analyzing. Inspect supporting/conflicting excerpts, reject unsupported findings and edit any proposed reply. **Review saved draft** and **Copy reviewed reply** refresh the invoice server-side; copying still sends no message. New evidence or financial changes invalidate earlier review. Prompt/schema revisions also invalidate analysis-cache reuse without overwriting owner drafts.

Startup makes no provider calls. The server binds to localhost; this is a single-owner prototype without production multi-user authentication. Keys and SQLite data stay under ignored `.env`/`.local`; never distribute a populated configuration or database. Judges can run the complete offline workflow without credentials. Optional genuine integration uses their own permitted PayPal sandbox credentials and Astropods key; no credential handoff is needed.

## Verified scope and limits

Verified on 12 November 2026: a real SGD 900 PayPal sandbox invoice, genuine Astropods analysis, exact citation navigation, persisted owner corrections and a reviewed reply copied through the browser. The latest review/copy events match the current evidence context. No message or payment was sent.

The first held-out evaluation stopped at case 4 on malformed JSON. A serialization fix enabled completion. The latest measured prompt completed a second repeat of the same 12 cases: **27/36 blocker labels (75%)**, **22/24 expected spans**, **5.9s median latency**. Preliminary review found 8 aligned next actions, 3 partial and 1 unsupported; the proposed 10/12 target remains unmet. This repeated set is not unseen evaluation, and semantic acceptance is not certified. These small synthetic results do not establish production reliability or customer impact. Read the [full evaluation report](docs/evaluation-2026-11-12.md).

Model output never sends messages, changes a payee or settles an invoice. A pending/external record or browser return does not prove settled PayPal payment. Exact citations establish matching text, not the truth of a supplied claim. Owner review remains necessary.

## Checks and demonstration

```sh
npm test
npm run typecheck
npm run build
npm run eval:validate
npm run eval:run
npm run test:e2e
```

Verified: 155 tests, 25 offline browser journeys, typecheck, build and 24-case manifest validation. Browser tests need ordinary Playwright Chromium; setup and explicit live-evaluation commands are in the [judge guide](docs/judge-guide.md). Offline test results are separate from genuine integration evidence.

[Three-minute demo scenario](docs/demo-scenario.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

The application runs locally. Hosting is not required for the offline demonstration.
