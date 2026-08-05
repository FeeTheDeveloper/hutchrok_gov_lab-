# Bid Operations Data Model

## BusinessProfile

Contains identity, contacts, federal identifiers, certification records, service alignment, readiness, and proposal assets. Only verified certifications establish set-aside eligibility. Only verified reusable assets and past-performance records render as proposal claims.

## OpportunityProject

Links a business to a SAM notice and stores acquisition metadata, Fit Score, eligibility, Bid / No-Bid state, probability of win, ownership, risk, lifecycle status, and five independent approval gates.

Lifecycle validation prevents pursuit without Bid / No-Bid approval and prevents `submitted` status without submission authorization.

## SolicitationAnalysis

Captures scope, SOW, requirements, deliverables, instructions, evaluation factors, limits, forms, certifications, clauses, deadlines, amendments, pricing, staffing, security, insurance, bonding, subcontracting, site visits, oral presentations, risks, and clarification questions.

Future extraction should populate this same model with evidence references rather than changing downstream engines.

## BidNoBidResult

Separates a generated weighted recommendation, factor rationale, strengths, weaknesses, risks, gaps, and mitigations from a human approval record initialized to `pending`.

## ComplianceMatrix

Each requirement tracks source section/page, requirement text, category, mandatory status, volume, owner, response location, workflow status, notes, and due date.

## CapturePlan

Captures customer context, timeline, competition, strengths, weaknesses, discriminators, win themes, teaming, relationships, pricing, solution, risks, actions, gates, and submission calendar. Missing information is explicit.

## ProposalManifest

Lists generated artifacts, draft status, approval-gate state, and prohibited automations. It is an inventory, not release authorization.

## AuditEvent

Append-only JSONL records include event ID, timestamp, actor, business, opportunity, action, summary, artifact, and previous/new state where applicable.

## Storage

```text
GOVREADY_DATA_DIR (default .govready/)
├── businesses/<business-id>.json
├── opportunities/<project-id>.json
├── proposals/<project-id>/
│   ├── bid-assessment.json
│   ├── artifacts.json
│   └── submission-readiness-review.json
└── audit/YYYY-MM-DD.jsonl
```

Generated drafts are separate:

```text
<out>/<business-id>/<project-id>/proposal/
```
