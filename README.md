# Vanish

A personal data-removal tool: get your PII deleted from data brokers and
people-search sites. Vanish intakes your identity "fingerprint," routes each
broker to the right removal **channel**, tracks every request through its full
lifecycle, and re-checks on a schedule because brokers re-list data.

This repository is the **control plane** — Next.js on Vercel + Neon
(Postgres) + Resend + Google/Gmail auth + the Anthropic API. Interactive browser
automation (the human-in-the-loop web-form opt-outs) lives in a **separate
worker** added later; it cannot run on Vercel. See [Architecture](#architecture).

## v3 — multi-user + aggregator discovery

Vanish is **multi-user** with `user` / `admin` roles. Each user signs up with
Google, signs an electronic authorized-agent consent (§2.2), completes an
identity intake, and gets their own field-encrypted fingerprint — every query is
scoped by `userId`, no cross-user reads. One-click account deletion purges all
of a user's data.

The headline v3 feature is the **aggregator-discovery pipeline** (`src/lib/discovery.ts`,
`/admin`): a daily cron and an admin "Search for new aggregators" button search
the web (Anthropic `web_search`), fetch candidate sites' public pages, have Claude
extract the removal process into strict JSON, and file them as **proposed** brokers
for admin review — only admin-**approved** brokers ever enter user-facing removal.
No user PII ever enters the discovery pipeline. Schema changed substantially since
Phase 1 — run `npx prisma db push` before deploying.

> **This is not legal advice.** Validate the legal posture — authorized-agent
> mode and automation-vs-ToS especially — with counsel before shipping anything
> beyond your own single-subject use.

---

## What's built (Phases 0–1)

- **App-level PII encryption** — every identity value is AES-256-GCM encrypted
  *before* it reaches Postgres, with the key held in env vars, not the DB. Blind
  indexes (keyed HMAC) allow de-duping without storing plaintext.
  (`src/lib/crypto.ts`)
- **Google/Gmail OAuth** via Auth.js — the same sign-in grants the
  `gmail.readonly` scope. Single-tenant: only `OPERATOR_EMAIL` may sign in.
  (`src/auth.ts`)
- **Prisma schema** for the full data model (Subject, IdentityAttribute, Broker,
  Listing, RemovalRequest, ChannelSubmission, Evidence, RequestEvent).
  (`prisma/schema.prisma`)
- **Identity intake** UI + API — field-encrypted fingerprint rows with per-type
  validation. (`/intake`)
- **Broker-registry importer** — ingests the CA data broker registry CSV + a
  curated people-search list, with routing metadata and the `coveredByDrop`
  derivation. (`scripts/import-brokers.ts`, `npm run brokers:import`)
- **Channel router** — DROP vs email vs web-form vs postal, and the
  "don't redundantly hit per-broker forms for DROP-covered brokers" logic.
  (`src/lib/channel-router.ts`)
- **DROP-assist flow** — records one bulk `ChannelSubmission` covering all
  CA-registered brokers, marks them `skipped_covered_by_drop`, and tracks the
  45-day retrieve / 90-day finalize windows. (`/drop`, `src/lib/drop.ts`)
- **Resend email opt-outs** — CCPA/Delete-Act deletion email, operator-approved
  before send, with data minimization (name + city/state + one email, never the
  whole fingerprint). (`src/app/api/removals/[id]/send-email`)
- **Gmail confirmation poller** — finds broker confirmation emails and advances
  `awaiting_confirmation → confirmed`. (`src/lib/gmail.ts`)
- **Lifecycle state machine** with an audited transition log. (`src/lib/state-machine.ts`)
- **Scheduled maintenance**: a single orchestrator endpoint (`/api/cron/tick`)
  runs the Gmail poll, relisting recheck, and DROP-window tracking, guarded by
  `CRON_SECRET`. Each routine is also exposed individually for manual runs.
  (`src/app/api/cron/*`, `src/lib/cron-jobs.ts`)
- **Worker adapter interface + reference adapter template** for Phase 3.
  (`src/worker/*`)

## Not yet built (later phases)

- **Phase 2** — match/confidence engine + human review queue for ambiguous
  matches. The `Listing` model and conservative-match posture are in place; the
  scorer is not.
- **Phase 3** — the browser-automation **worker**: Playwright discovery scanning
  and web-form opt-outs with the CAPTCHA/ID human handoff. The interface and a
  reference adapter stub exist under `src/worker/`.
- **Phase 4** — relisting detection + exportable reporting (recheck plumbing is
  in place).
- **Phase 5** — multi-subject / authorized-agent mode (guardrails enforced in
  the API; off by default).

---

## Architecture

```
Control plane (this repo, Vercel + Neon + Resend + Gmail)
  Identity intake → field-encrypt → Neon
  Broker registry (CA registry + curated) → routing metadata
  Channel router → DROP | email | web_form | postal
  DROP-assist tracking + email/postal generation (Resend)
  Confirmation handler (Gmail poll)
  Lifecycle state machine + Vercel Cron
  UI: intake, brokers, DROP, requests, dashboard

Worker (separate, Phase 3 — CANNOT run on Vercel)
  Playwright discovery scanning
  Web-form opt-out execution with human-in-the-loop handoff
  Pulls jobs from the control-plane API, reports results back
```

**Why the split:** Vercel functions are ephemeral and time-boxed. The
human-in-the-loop opt-out model — pause the browser, human clears the CAPTCHA,
resume — needs a persistent, visible browser session, which a serverless
function cannot host. Phases 0–1 need **no** browser automation: DROP covers the
600+ CA brokers (assisted), Resend covers email opt-outs, Gmail reads
confirmations.

---

## Setup

### 1. Prerequisites

- Node 20+
- A Neon Postgres database
- A Google Cloud OAuth client (with `gmail.readonly` on the consent screen)
- A Resend account with a **verified sending domain**

### 2. Environment

```bash
cp .env.example .env.local
# then fill in every value — see comments in .env.example
```

Generate the PII encryption key and auth secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # PII_ENCRYPTION_KEY
npx auth secret                                                              # AUTH_SECRET
```

### 3. Install + database

```bash
npm install
npm run prisma:generate
npm run prisma:migrate      # creates the schema in Neon (uses DIRECT_URL)
```

### 4. Import the broker registry

```bash
# Curated list only:
npm run brokers:import

# Full 600+ CA brokers: download the CA data broker registry CSV from the CPPA
# and place it at data/ca-data-broker-registry.csv, then re-run:
npm run brokers:import
```

### 5. Run

```bash
npm run dev
# open http://localhost:3000 and sign in with the operator Google account
```

### Deploy to Vercel

- Set every `.env.example` key in the Vercel project (Production + Preview).
- Use the Neon **pooled** connection string for `DATABASE_URL` and the direct
  string for `DIRECT_URL`.
- **Scheduling.** Vercel Cron requires a Pro plan on this account, so the app
  does **not** declare a Vercel-managed cron. Trigger `/api/cron/tick` daily from
  any scheduler — a `GET` with `Authorization: Bearer $CRON_SECRET`. Options:
  - **Vercel Cron (Pro):** add a `crons` block to `vercel.json` pointing at
    `/api/cron/tick` (e.g. `"0 7 * * *"`); Vercel injects the auth header.
  - **External cron** (GitHub Actions, cron-job.org, an uptime pinger): call the
    endpoint daily with the bearer token.

---

## Security posture (spec §2)

- **PII honeypot, now in the cloud.** App-level field encryption keeps the key
  out of the database; single-tenant keeps other people's PII out entirely.
- **Human-in-the-loop for risky steps.** No CAPTCHA solving/bypass, no automated
  ID-document upload, operator-confirmed sends.
- **Match conservatively.** Prefer false negatives (missed listing, re-caught
  next scan) over false positives (removing a namesake). Ambiguous matches route
  to a human review queue (Phase 2).
- **Track `exempt` honestly.** Public government records and FCRA/GLBA/HIPAA data
  are out of scope for CCPA deletion — reported as exempt, never false success.

---

## Directory map

```
prisma/schema.prisma            data model (§5)
scripts/import-brokers.ts       registry importer (§11 Phase 0)
data/curated-brokers.json       curated people-search list
src/env.ts                      validated env access
src/auth.ts                     Auth.js + Google/Gmail
src/lib/crypto.ts               PII field encryption (§2.1)
src/lib/identity.ts             encrypt/decrypt fingerprint helpers
src/lib/channel-router.ts       channel routing (§3)
src/lib/state-machine.ts        lifecycle (§8)
src/lib/drop.ts                 DROP windows (§3)
src/lib/email-templates.ts      CCPA deletion email (§7)
src/lib/resend.ts               outbound email (§10)
src/lib/gmail.ts                confirmation reading (§10)
src/app/api/*                   REST endpoints + cron
src/app/*                       UI (dashboard, intake, brokers, drop, requests)
src/worker/*                    Phase-3 adapter interface + reference template
```
