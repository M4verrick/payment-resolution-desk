# Run and evaluate Payment Resolution Desk

Updated 12 November 2026. A local single-owner prototype for reviewing an unpaid invoice alongside authored synthetic correspondence. It reads PayPal sandbox invoices, obtains cited Astropods suggestions, and lets the owner inspect, correct and prepare a reply. Copying never sends a message; case closure and payment status are separate.

## Choose a testing mode

| Mode | Credentials | What you can test |
| --- | --- | --- |
| Offline (default) | None | Complete evidence, decision, reply, copy and history workflow with labelled demo data |
| Genuine integration (opt-in) | Your own PayPal sandbox app and Astropods Gateway account | Real allowlisted invoice reads and model analysis using your own permitted credit |

No shared account or private credential handoff is needed. The offline route has no account expiry or external service dependency after installation. Genuine testing is subject to your provider account, credit and availability; bring-your-own credentials do not guarantee free integration access.

## Prerequisites

- Node 24.x; `.node-version` pins 24.14.0, plus npm and a browser.
- Genuine mode: PayPal sandbox business account, its REST app credentials and a known USD/SGD invoice resource ID (`INV2-…`).
- Genuine AI only: your Astropods Gateway key with verified sponsor credit. This project retains its credit-only safeguards; no shared secret, purchased-credit route or paid fallback is distributed.

## Install and run offline

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run demo
```

Open <http://127.0.0.1:4317>. Stop only your own server with Ctrl-C; leave other processes alone if the port is occupied. Open **Start with the partial payment**, load the authored suggestions, inspect evidence, decide a finding, then edit/save/review/copy a reply. New evidence makes prior review stale. A case opens on its next review task. Use **Issues**, **Sources**, **Reply** and **Activity** to work in one view at a time; switching views preserves unsaved reply text. Invoice details expand above the workspace, and **Show all** in Activity lists the full record.

This uses fixture invoices and authored suggestions, with no PayPal/model calls. It demonstrates the workflow, not genuine integration. `npm run demo` ignores a populated `.env`, forces offline providers, and uses `.local/demo.sqlite` even if `DATABASE_PATH` points to another database in your shell. The demo database persists; use `DEMO_DATABASE_PATH=.local/another-demo.sqlite npm run demo` for a separate demo without deleting history.

## Configure genuine operation

In a fresh checkout only:

```sh
cp .env.example .env
```

Keep `.env` private and enter only your own credentials. Populate `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and comma-separated `PAYPAL_INVOICE_IDS`; set `PAYPAL_SETUP_APPROVED=true` after confirming setup. `PAYPAL_MERCHANT_ID=paypal-sandbox-business` is an internal scope label, not another PayPal-issued merchant identifier. The credentials determine the provider account.

Create an Astropods account key under **Gateway → Gateway keys** (the **Your apps** setup also provides key creation). Keep host-only `ASTRO_GATEWAY_URL=https://aig.astropods.ai`; the server appends `/v1/chat/completions`. After verifying credit-only funding and approving synthetic-source/invoice-data transmission, set:

```text
ASTRO_GATEWAY_API_KEY=<private Gateway key>
ASTROPODS_SPONSOR_CREDITS_VERIFIED=true
SYNTHETIC_DATA_APPROVED=true
ANALYSIS_MODE=astropods
```

Flags record completed checks; they do not establish eligibility/balance by themselves. Inherited credentials alone cannot enable AI. Do not add a card, buy credit or enable fallback. The owner confirmed Astropods signup credit qualifies under their sponsor-only API rule.

```sh
npm run build
npm run start:configured
```

`npm start` alone does not load `.env`; `start:configured` does. Desk status should show sandbox configured and Astropods enabled. Startup makes no provider calls. Sandbox data persists separately at `.local/payment-resolution-sandbox.sqlite`.

1. Open an allowlisted case and select **Refresh invoice**. Compare accepted facts against PayPal. Unknown recorded payment remains unknown; pending/external records do not establish settled PayPal receipts.
2. Add labelled synthetic correspondence. The [demo scenario](demo-scenario.md) uses SGD 900; adapt authored numbers to the invoice actually configured.
3. Select **Analyze supplied sources**. Inspect exact citations and reject unsupported/duplicate suggestions. Unchanged inputs and the same prompt revision reuse a saved result; changed sources or prompt revisions permit a fresh run.
4. Edit the reply, remove placeholders/unsupported assertions, save, review and copy it. **Review saved draft** and **Copy reviewed reply** each refresh PayPal server-side. They never send a message or modify the invoice.
5. Add evidence and observe stale analysis/review guards. Re-review before copying. Payment never automatically closes the commercial case.



## Evaluation and checks

```sh
npm test
npm run typecheck
npm run build
npm run eval:validate
npm run eval:run
```

These are offline. The manifest has 12 development and 12 pre-frozen held-out synthetic cases. Default evaluation prepares inputs without inference; `--smoke` selects one development case. Explicitly authorized model evaluation uses private approved configuration:

```sh
node --env-file=.env --import tsx scripts/evaluate.ts --smoke --live
node --env-file=.env --import tsx scripts/evaluate.ts --live
```

The second command can make up to 12 sequential inference calls. Runs stop on the first failure/invalid response without retry/fallback, exclude answers from requests and create unique ignored outputs. Results record input hashes, prompt/schema revision, latency, labels and citation metrics; a separate worksheet requires semantic review. Retained responses are bounded, key-redacted and private.

The first held-out attempt failed at case 4 on malformed JSON. After a serialization-only fix, the follow-up completed 12/12 responses with 27/36 labels and 23/24 spans; median latency 6.4 seconds. This is a repeated-set follow-up, not a new unseen evaluation. Preliminary review found unsupported claims and does not certify acceptance. A later prompt revision removed promised actions and placeholders from replies; a second repeat of the same set stayed at 27/36 labels with 22/24 spans. `--development --live` runs the 12 development cases. Read the [evaluation report](evaluation-2026-11-12.md).

Browser tests use isolated fixture databases and port 4318. If the ordinary test browser is missing:

```sh
PLAYWRIGHT_BROWSERS_PATH=.local/browsers npx --no-install playwright install chromium
npm run test:e2e
```

Verified locally: 155 tests, 25 offline browser journeys, typecheck, build and manifest validation. A genuine browser/API/SQLite analysis and saved draft were also checked against a previously owner-refreshed sandbox record. This prototype requires owner review and has no production multi-user authentication.

## Submission package

Released under the [MIT license](../LICENSE). See [third-party notices](../THIRD_PARTY_NOTICES.md). Preserve upstream notices if distributing installed dependencies or browser/runtime binaries; those are excluded from the source package.

The [official rules](https://paypalaihackathon.devpost.com/rules) require meaningful PayPal and AI integration, functional judge access, a public open-source repository and a public YouTube working demo under three minutes. Hosting is optional with complete run instructions. Submission closes **13 November 2026 at 04:00 Singapore time**. Judge setup is offline by default with optional own credentials; bring-your-own credentials do not guarantee free provider access.
