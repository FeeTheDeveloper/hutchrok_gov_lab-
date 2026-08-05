# Bid Operations Engine Architecture

**Status:** Accepted for Phase 1 foundation

**Date:** 2026-08-05

**Decider:** King Fee / Hutchrok Solutions Group

## Context

GovReady Lab already discovers and scores federal opportunities and produces branded Contract Maps. The internal team now needs to convert selected notices into disciplined capture and proposal projects without creating a public SaaS product, adding a database, weakening veteran-benefit controls, or allowing software to legally commit Hutchrok or a client.

## Decision

Use strict TypeScript domain modules, Zod validation at every external boundary, filesystem-backed JSON records under a configurable `.govready/` root, append-only JSONL audit events, and transport-neutral services shared by the CLI and local HTTP API.

Generated proposal artifacts remain separate from persistent operational records:

```text
External input          Domain/service layer             Outputs
──────────────          ────────────────────             ───────
Business JSON ────────► business/schema.ts ────────────► .govready/businesses
SAM/manual project ───► bids/schema + store ───────────► .govready/opportunities
Analysis JSON ─────────► Bid/No-Bid + compliance ──────► assessment + matrix
Verified records ──────► documents/proposalBuilder ────► out/.../proposal
Human action ──────────► approvals + transitions ──────► record + audit JSONL
```

## Options Considered

### Local JSON store — selected

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| Cost | No infrastructure cost |
| Portability | High |
| Concurrency | Limited to disciplined local operators |

It matches Phase 1, remains inspectable, supports backups, and avoids premature database work.

### Embedded SQLite

Would improve transactions and querying, but adds migration and operational complexity before project volume justifies it. Revisit when concurrent users or cross-project reporting make filesystem records limiting.

### Hosted database / SaaS platform

Rejected for this phase because the system is an internal, local-first machine and must not become a public SaaS redesign.

## Module Boundaries

- `src/business/`: business identity, federal identifiers, certification status, readiness, and proposal assets.
- `src/bids/`: opportunity projects, lifecycle rules, analysis, assessment, compliance, capture, persistence, and audit.
- `src/documents/`: transport-independent draft rendering and workspace assembly.
- `src/cli.ts`: operator commands with no independent domain rules.
- `src/server.ts`: local HTTP transport with no independent business rules.
- Existing scoring, Excel Contract Map, dashboard, SAM API, portal, TOTP, and assistant modules remain intact.

## Security and Commitment Boundaries

- The HTTP API binds to `127.0.0.1` unless explicitly configured otherwise.
- API keys remain environment-only; `SAM_GOV_API_KEY` is unchanged.
- Only `verified` certification records count for Bid / No-Bid set-aside eligibility.
- Active pursuit statuses require named-human Bid / No-Bid approval.
- `submitted` requires separate named-human submission authorization.
- Generated documents are drafts; no code signs, certifies, prices, submits, or authorizes teaming.

## Consequences

- CLI and API behavior stay consistent because both use `BidOperationsService`.
- PDF extraction, DOCX/PDF rendering, and richer portal workflows can be added without replacing domain logic.
- Filesystem concurrency and portfolio reporting are intentionally limited in Phase 1.
- Operators must protect `.govready/` and generated proposal directories as business-sensitive data.

## Follow-up

1. Add solicitation package ingestion and evidence-linked PDF/text extraction.
2. Add versioned amendments and exact page-level requirement traceability.
3. Add review-role permissions in the secured portal.
4. Reassess SQLite only after real concurrency or portfolio reporting demands it.
