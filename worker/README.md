# Vanish worker

The browser-automation worker (spec §7). It runs **off-Vercel** — on your own
machine or a hosted browser service — because the human-in-the-loop opt-out model
needs a persistent, visible browser that a serverless function can't host.

It pulls jobs from the control plane, runs Playwright web-form opt-outs, and
**hands off to you** whenever a CAPTCHA/Turnstile or ID upload appears. It never
solves challenges itself (§2.3).

## Run it

```bash
cd worker
cp .env.example .env        # set CONTROL_PLANE_URL + WORKER_TOKEN
npm install
npm run install-browser     # playwright install chromium
export $(grep -v '^#' .env | xargs)   # or use a dotenv runner
npm start
```

Set `WORKER_TOKEN` to the same value as the control plane's `WORKER_TOKEN` env
var (that also enables the `/api/worker/*` endpoints). Enqueue work by confirming
a **web-form** broker listing in the app — it creates a `web_form_removal` job.

## Human-in-the-loop

When the worker hits a challenge or the final submit, it pauses with the browser
open and asks you to finish the step, then press:

- `s` — you submitted it → request advances to *submitted*
- `c` — submitted, broker will email a confirmation → *awaiting confirmation*
- `x` — still blocked, leave for later → *awaiting user*
- `f` — failed

## Adapters

`src/adapters/` holds per-site modules keyed by `Broker.adapterKey`. The included
`generic` adapter is a template: it navigates the opt-out URL, detects challenges,
best-effort fills name/email, captures a screenshot, and defers the irreversible
submit to you. Write a dedicated adapter per broker for a smoother flow — each
site's form is different, and adapter maintenance is the standing cost (§12).

Evidence (screenshots) is written to `worker/evidence/`.
