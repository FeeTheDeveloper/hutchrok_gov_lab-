# GovReady Lab — Internal Federal Capture & Bid Operations

Hutchrok Solutions Group LLC · the engine behind the GovReady Lab service line.

This repository is Hutchrok Solutions Group's local-first internal operating system for
federal opportunity discovery, qualification, capture planning, proposal preparation,
review controls, and award/loss tracking. It is not a public SaaS product. A parent repo
should treat it as an external launcher target, not an embedded module.

Takes a **client intake** + a raw **SAM.gov CSV export** and produces the two client
deliverables from the service concept:

- **Contract Map** (`.xlsx`) — fit-scored pipeline, readiness, grant positioning, legend.
- **Lab Dashboard** (`.html`) — the branded, self-contained client-facing dashboard.

The original zero-infrastructure Contract Map workflow remains fully supported. The Bid
Operations Engine extends that workflow after opportunity selection with local persistent
projects, capture artifacts, proposal drafts, reviews, and explicit human approval gates.

## Install

```bash
npm install
```

Requires Node 18+. No API keys — it reads CSVs you export by hand from SAM.gov.

For local personal use, you can also pull opportunities directly from SAM.gov API
with your own key (see API mode below).

You can also run the scoring engine as a local HTTP API for browser or automation
clients (see HTTP API below).

## Brand Palette (Hutchrok)

The dashboard theme follows the Hutchrok Solutions Group visual identity:

- Navy: `#0F2E5E` (primary text, primary data emphasis)
- Gold: `#C6982F` (accent, status emphasis)
- Green: `#2F7A4F` (supporting brand color, positive state)
- Light background: `#F4F5F7`
- White surface: `#FFFFFF`

Theme variables are implemented in [`src/dashboard.ts`](src/dashboard.ts).

## Generate a client map

```bash
npm run govready -- generate \
  --intake  path/to/intake.json \
  --contracts path/to/sam_contract_export.csv \
  --assistance path/to/sam_assistance_export.csv \
  --out out/acme \
  --today 2026-07-17
```

### API mode (local/personal use)

Set your key in local environment:

```bash
# PowerShell
$env:SAM_GOV_API_KEY = "your-key"
```

Then generate using API source instead of contract CSV:

```bash
npm run govready -- generate \
   --intake path/to/intake.json \
   --sam-api \
   --api-date-from 2026-01-01 \
   --api-date-to 2026-12-31 \
   --out out/personal
```

Notes:

- Use one contract source at a time: `--contracts` or `--sam-api`.
- Keep secrets local in `.env` or shell env vars. Do not commit API keys.
- `.env.example` shows the local configuration shape.

### HTTP API

Start the local API server:

```bash
npm run api
```

Available routes:

- `GET /health`
- `POST /api/generate`

The API is CORS-enabled for browser clients. `POST /api/generate` accepts either
raw CSV text or a SAM.gov API request and returns the scored `report` plus the
rendered `dashboardHtml`. Set `includeWorkbook` to `true` to also receive
`workbookBase64`. For non-local use, set `GOVREADY_ALLOWED_ORIGIN` to the
trusted frontend origin you want the server to allow.

The CSV payload uses the same tolerant parser as the CLI: extra SAM.gov export
columns are fine, while the most useful fields are the notice id/title, NAICS,
type, set-aside, deadline, and description columns.

Example request using CSV content:

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "intake": {
      "company": "Lone Star Facility Services LLC",
      "state": "TX",
      "certifications": { "smallBusiness": true },
      "naicsLanes": ["541611"],
      "strengths": "facility support staffing",
      "readiness": {}
    },
    "contractsCsv": "NoticeId,Title,NaicsCode\nABC-1,Example Opportunity,541611",
    "includeWorkbook": true
  }'
```

For live SAM.gov pulls, send `samApi` instead of `contractsCsv`:

```json
{
  "intake": { "...": "..." },
  "samApi": {
    "apiKey": "your-key",
    "dateFrom": "2026-01-01",
    "dateTo": "2026-12-31"
  }
}
```

### Deploy the stateless API to Vercel

The repository includes Vercel Node Function entry points for:

- `GET /api`
- `GET /api/health`
- `POST /api/generate`

Import the repository in Vercel, keep the project root at the repository root,
and use the detected `npm run build` command. Add `SAM_GOV_API_KEY` in Vercel
Project Settings when live SAM.gov requests are needed. Set
`GOVREADY_ALLOWED_ORIGIN` to the exact browser origin allowed to call the API.

The Bid Operations routes and authenticated portal intentionally remain local-only.
They persist users, sessions, bids, and generated files on the local filesystem;
Vercel Functions have ephemeral storage and therefore cannot safely host those
features without an external database and object store. The deployed generation
endpoint is stateless and returns its dashboard/workbook in the response.

### Quick NAICS Search (terminal list)

Query SAM.gov directly and print a clean opportunity list in terminal:

```bash
npm run govready -- search \
  --naics 621999 541611 \
  --api-date-from 2026-01-01 \
  --api-date-to 2026-12-31 \
  --limit 50
```

Notes:

- Uses `SAM_GOV_API_KEY` from your local `.env` by default.
- You can pass `--sam-api-key` to override for one run.
- Tune result volume with `--api-page-size`, `--api-max-pages`, and `--limit`.
- Network hardening flags: `--api-timeout-ms`, `--api-retries`, `--api-retry-base-ms`.

Run the built-in demo (uses `examples/`):

```bash
npm run demo
```

Flags:

| Flag | Purpose |
|---|---|
| `-i, --intake` | Client intake JSON (required) |
| `-c, --contracts` | SAM.gov Contract Opportunities CSV export |
| `--sam-api` | Pull contracts directly from SAM.gov API |
| `--sam-api-key` | SAM.gov API key (optional if `SAM_GOV_API_KEY` is set) |
| `--sam-api-endpoint` | Override the opportunities endpoint URL |
| `--api-page-size` | API page size per request (default `250`) |
| `--api-max-pages` | Max pages fetched per NAICS lane (default `8`) |
| `--api-timeout-ms` | Per-request timeout in milliseconds (default env `SAM_API_TIMEOUT_MS` or `30000`) |
| `--api-retries` | Retry count for transient API errors/timeouts (default env `SAM_API_RETRIES` or `2`) |
| `--api-retry-base-ms` | Base backoff delay in milliseconds (default env `SAM_API_RETRY_BASE_MS` or `800`) |
| `--api-date-from` | Posted-from filter for API mode (`YYYY-MM-DD`) |
| `--api-date-to` | Posted-to filter for API mode (`YYYY-MM-DD`) |
| `-a, --assistance` | SAM.gov Assistance Listings CSV export (optional; enables grant panel) |
| `-o, --out` | Output directory (default `out`) |
| `-t, --today` | Reference date `YYYY-MM-DD` for deadline runway (default: today) |
| `--json` | Also write the full scored `report.json` |

## The Portal

A self-hosted web portal in the Hutchrok brand (navy / gold / green), with mandatory
two-factor login and a built-in Claude assistant:

```bash
npm run portal        # → http://localhost:4173
```

- **First launch** walks you through creating the administrator account, then enrolls
  two-factor authentication: scan the QR code with any authenticator app (Google
  Authenticator, Authy, 1Password…) and confirm a 6-digit code. Every sign-in after
  that requires passphrase **and** TOTP code. Passwords are scrypt-hashed; login and
  2FA attempts are rate-limited (5 tries / 15 min); sessions are HttpOnly cookies.
- **Contract Maps** generated by the engine (`out/`) are listed on the portal home and
  served behind authentication — open any client's Lab Dashboard directly.
- **Claude · Lab Assistant** — an in-app Claude connector (official Anthropic SDK,
  streaming). It reads the latest `report.json` (generate with `--json`) so it can
  answer questions about the actual pipeline, draft capability statements, and explain
  set-asides — inside the same compliance guardrails as the deliverables. Enable it
  with an API key:

  ```bash
  ANTHROPIC_API_KEY=sk-ant-... npm run portal
  ```

| Env var | Purpose |
|---|---|
| `PORT` | Portal port (default `4173`) |
| `ANTHROPIC_API_KEY` | Enables the Claude assistant |
| `GOVREADY_DATA_DIR` | User/2FA store location (default `.govready/`, gitignored) |
| `GOVREADY_OUT_DIR` | Where generated maps live (default `out/`) |

### Happy Authentication (programmatic sign-in)

For local automation, the portal exposes a JSON endpoint that performs the
happy-path login in one call (username + passphrase + TOTP code), then sets
the same `gr_session` HttpOnly cookie used by the web UI.

```bash
curl -X POST http://localhost:4173/api/auth/happy \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "your-operator-id",
    "password": "your-passphrase",
    "code": "123456"
  }'
```

Then call authenticated routes using the saved cookie jar:

```bash
curl -b cookies.txt http://localhost:4173/portal
```

Response shape on success:

```json
{ "ok": true, "username": "your-operator-id", "stage": "full" }
```

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

## Bid Operations Engine

The Bid Operations Engine turns a selected, scored SAM.gov notice into a persistent internal capture and proposal project while preserving the Contract Map generator, API mode, dashboard, portal, TOTP authentication, and Claude assistant. It is an in-house machine, not a public SaaS product.

### Lifecycle

```text
Business Profile → Federal Readiness → Discovery → Qualification → Bid / No-Bid
→ Capture → Solicitation Analysis → Compliance → Drafting → Internal Review
→ Submission Readiness → Submitted → Award / Loss
```

Verified business data is stored separately from generated analysis, recommendations, drafts, and human approvals. A recommendation never authorizes pursuit or submission.

### Local data directories

Persistent records default to `.govready/`:

```text
.govready/
  businesses/       validated business profiles
  opportunities/    persistent opportunity projects
  proposals/        assessments and artifact indexes
  audit/             append-only daily JSONL audit events
```

Set `GOVREADY_DATA_DIR` to relocate the store. Draft workspaces go to `--out`; the API uses `GOVREADY_OUT_DIR` or `out/`.

### Commands

```bash
npm run govready -- business validate \
  --profile examples/business-profile.hutchrok.json --save --actor "King Fee"

npm run govready -- bid create \
  --business examples/business-profile.hutchrok.json \
  --opportunity examples/opportunity-project.example.json \
  --out out/hutchrok --actor "King Fee"

npm run govready -- bid create \
  --business examples/business-profile.hutchrok.json \
  --report out/demo/report.json --notice-id NOTICE-ID --owner "King Fee"

npm run govready -- bid assess \
  --business examples/business-profile.hutchrok.json \
  --opportunity examples/opportunity-project.example.json \
  --analysis examples/solicitation-analysis.example.json \
  --out out/hutchrok --actor "King Fee"

npm run govready -- bid prepare \
  --business examples/business-profile.hutchrok.json \
  --opportunity examples/opportunity-project.example.json \
  --analysis examples/solicitation-analysis.example.json \
  --out out/hutchrok --actor "King Fee"

npm run govready -- bid approve \
  --project-id hsg-example-r408 --gate bidNoBid --actor "King Fee" \
  --notes "Approved for capture subject to listed mitigations."

npm run govready -- bid status \
  --project-id hsg-example-r408 --to bid-review --actor "King Fee"
```

### Proposal artifacts and controls

Each workspace is created at `<out>/<business-id>/<project-id>/proposal/` with a manifest, capture plan, JSON/XLSX compliance matrix, executive summary, technical and management sections, staffing, quality, transition, past performance, pricing narrative, submission checklist, risk register, and review log.

All Markdown displays `DO NOT SUBMIT — DRAFT`, states that official solicitation instructions and amendments control, and uses `[REQUIRED INPUT: ...]` rather than inventing missing claims.

Five independent gates control Bid / No-Bid approval, final pricing, representations and certifications, proposal release, and submission authorization. Active pursuit requires named-human Bid / No-Bid approval; `submitted` additionally requires submission authorization. No command or route submits, signs, certifies, prices, or authorizes teaming.

### Bid Operations API

The API binds to `127.0.0.1` by default and adds:

- `GET|POST /api/businesses`
- `GET|POST /api/bids`
- `GET /api/bids/:id`
- `POST /api/bids/:id/assess`
- `POST /api/bids/:id/prepare`
- `POST /api/bids/:id/approve`
- `POST /api/bids/:id/status`
- `POST /api/bids/:id/readiness-review`
- `GET /api/bids/:id/compliance`
- `GET /api/bids/:id/artifacts`

Use `X-GovReady-Actor` or an `actor` body field to identify the operator in audit events.

### Tests and design references

```bash
npm test
npm run test:watch
npm run typecheck
npm run build
```

See [Bid Operations Architecture](docs/BID_OPERATIONS_ARCHITECTURE.md), [Proposal Workflow](docs/PROPOSAL_WORKFLOW.md), and [Data Model](docs/DATA_MODEL.md).
