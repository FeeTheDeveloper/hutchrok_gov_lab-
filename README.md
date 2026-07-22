# GovReady Lab — Phase 1 Contract Map Generator

Hutchrok Solutions Group LLC · the engine behind the GovReady Lab service line.

This repository is intended to run as a standalone tool/app, even when linked from a
parent repository. The parent repo should treat this project as an external launcher
target (for example, linking to its deploy URL or invoking its CLI workflow), not as an
embedded module.

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
