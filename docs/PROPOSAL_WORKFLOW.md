# Proposal Workflow

## 1. Business readiness

Validate and persist a business profile. Certifications distinguish `verified`, `pending`, and `not-held`; pending status never confers set-aside eligibility.

## 2. Opportunity creation

Create a project from manual JSON or import a selected notice from an existing scored `report.json`. Each project links to one business and starts before commitment.

## 3. Solicitation analysis

Enter a structured analysis from the official solicitation and amendments. Phase 1 does not extract PDFs. Unknown facts remain empty or use explicit required-input markers.

## 4. Bid / No-Bid review

The weighted engine evaluates eligibility, NAICS/PSC alignment, capability and past-performance fit, geography, capacity, insurance/bonding, runway, complexity, competition, incumbent strength, pricing confidence, teaming, agency alignment, value, and performance risk.

The result is `bid`, `conditional-bid`, or `no-bid`, but human approval always starts `pending`. An authorized person records Bid / No-Bid approval separately.

## 5. Capture and compliance

`bid prepare` generates a capture plan, JSON and branded Excel compliance matrix, artifact manifest, and proposal-section drafts. Every unknown remains `[REQUIRED INPUT: ...]`; unverified proposal assets and past-performance records are excluded.

## 6. Reviews and controlled status changes

Recommended sequence:

```text
discovered → qualifying → bid-review → pursuing → capture → drafting
→ internal-review → submission-ready → submitted → awarded | lost → archived
```

`no-bid` is available at the relevant pre-submission stages. Invalid jumps fail validation. A passed readiness review does not replace proposal-release or submission-authorization approval.

## 7. Release and submission

Before any human submission action, confirm:

- compliance matrix approved;
- final pricing approved;
- representations and certifications approved;
- proposal release approved;
- submission authorization approved;
- latest amendments acknowledged;
- official delivery method and deadline independently verified.

GovReady Lab does not submit. The operator submits outside the engine and records the resulting status and receipt.

## 8. Award / loss

After government notice, record `awarded` or `lost`, preserve the evidence package, and capture lessons learned. Never infer an outcome from silence or portal state.
