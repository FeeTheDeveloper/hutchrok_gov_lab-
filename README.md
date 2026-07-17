# GovReady Lab — Phase 1 Contract Map Generator

Hutchrok Solutions Group LLC · the engine behind the GovReady Lab service line.

Takes a **client intake** + a raw **SAM.gov CSV export** and produces the two client
deliverables from the service concept:

- **Contract Map** (`.xlsx`) — fit-scored pipeline, readiness, grant positioning, legend.
- **Lab Dashboard** (`.html`) — the branded, self-contained client-facing dashboard.

Zero infrastructure. This is the manual engine the SOP calls for in Stage 1–2; when a
client's map has been produced this way twice, the Automation Mandate says build Phase 2
(SAM.gov + Grants.gov API nightly pull). This repo is Phase 1.

## Install

```bash
npm install
```

Requires Node 18+. No API keys — it reads CSVs you export by hand from SAM.gov.

## Generate a client map

```bash
npm run govready -- generate \
  --intake  path/to/intake.json \
  --contracts path/to/sam_contract_export.csv \
  --assistance path/to/sam_assistance_export.csv \
  --out out/acme \
  --today 2026-07-17
```

Run the built-in demo (uses `examples/`):

```bash
npm run demo
```

Flags:

| Flag | Purpose |
|---|---|
| `-i, --intake` | Client intake JSON (required) |
| `-c, --contracts` | SAM.gov Contract Opportunities CSV export (required) |
| `-a, --assistance` | SAM.gov Assistance Listings CSV export (optional; enables grant panel) |
| `-o, --out` | Output directory (default `out`) |
| `-t, --today` | Reference date `YYYY-MM-DD` for deadline runway (default: today) |
| `--json` | Also write the full scored `report.json` |

## Where the inputs come from (maps to the SOP)

1. **Intake JSON** — the Part 1 Federal Readiness Assessment, structured. See
   [`examples/intake.example.json`](examples/intake.example.json). Every field the
   Fit Score engine needs is there: certifications (set-aside eligibility), NAICS
   lanes, strong points (strength matching), and the readiness checklist.
2. **Contracts CSV** — SAM.gov → Contract Opportunities → search per NAICS lane
   (active, all types) → **Download** the CSV. The parser is tolerant of SAM's
   column-name variations across export versions.
3. **Assistance CSV** — SAM.gov → Assistance Listings export, for the grant
   positioning panel.

## The Fit Score engine

Every opportunity in the client's lanes is scored **0–100**, exactly the four factors
in the concept doc — all weights live in [`src/config.ts`](src/config.ts):

| Factor | What it measures |
|---|---|
| **Opportunity type** | Solicitation/Combined (bid now) > Sources Sought (cap statement) > Presolicitation (prep) > Award (intel) |
| **Set-aside eligibility** | Match to the client's certifications. Ineligible set-asides are penalized and flagged `Eligible: No`. |
| **Deadline runway** | Days to respond — enough time scores highest; closed scores zero. |
| **Strength match** | Client strong-point keywords found in the notice title/description. |

Then tiered: **Pursue / Qualify / Monitor / Intel**. Award notices, closed notices,
and set-asides the client cannot win are forced to **Intel** regardless of score.

### Benefit-integrity guardrail (in code, not just on the page)

Set the client's `sdvosb`/`vosb` to `false` and the engine automatically:

- drops every SDVOSB/VOSB set-aside to **Intel · not eligible**, and
- hides veteran-only assistance listings from the grant panel.

Non-veteran clients get consulting expertise, never veteran-specific benefits — enforced
by the scorer, so a deliverable can't accidentally imply a benefit transfer.

## Project layout

```
src/
  cli.ts         CLI entry (commander)
  types.ts       Domain types
  config.ts      Scoring weights + SAM.gov code maps (tune here)
  intake.ts      Intake schema (zod) + strength-keyword extraction
  samParser.ts   Tolerant SAM.gov CSV parsers (contracts + assistance)
  fitScore.ts    The Fit Score engine + report assembly
  excel.ts       Contract Map workbook (exceljs)
  dashboard.ts   Self-contained branded HTML dashboard
examples/        Runnable demo intake + SAM-format CSVs
```

## Compliance

All output carries the standard footer: operational business consulting — not legal, tax,
or financial advice; no award guarantees; verify every requirement against the official
SAM.gov / Grants.gov notice. Non-veteran clients receive expertise, not veteran benefits.
