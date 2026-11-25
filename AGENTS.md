# Payment Resolution Desk

This is a local single-owner React/Fastify/SQLite desk for reviewing PayPal invoice disputes and preparing owner-reviewed replies. It supports an offline fixture workflow and an explicitly configured PayPal sandbox/Astropods workflow; it never sends messages or changes an invoice.

Read [`ARCHITECTURE.md`](ARCHITECTURE.md) first for the system, data flow, storage, integrations, failure modes, and known issues. Use [`docs/judge-guide.md`](docs/judge-guide.md) for configured integration and release guidance.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run demo
npm test
npm run typecheck
npm run test:e2e
```

Run commands from the repository root. Keep credentials in ignored `.env`/`.local` files, never use real customer data, preserve immutable evidence/history, and do not turn copy/review actions into message or payment execution.
