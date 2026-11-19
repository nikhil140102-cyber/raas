# AvaStars Hire — recruitment software (Phase 1 + 2)

Next.js 15 (App Router, JavaScript/JSX) app for the AvaStars HR team: clients → requirements → job posting → resumes → AI matching → AI screening calls → client feedback → interviews → offers.

## Run it locally

```bash
npm install
cp .env.example .env.local      # then edit AUTH_SECRET at least
npm run dev                     # http://localhost:3000
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults: `admin@avastars.local` / `changeme123` — change them).
On an empty workspace, the dashboard offers **Load sample data** (3 clients, 2 jobs, 8 fictional candidates).

With no `DATABASE_URL`, data is stored in a built-in Postgres (PGlite) under `./.data/pglite`. Good for trying it out; use Supabase for real use.

## Deploy (Vercel + Supabase)

1. Create a Supabase project → **Project Settings → Database → Connection string** (use the *pooler* URI, port 6543). Put it in `DATABASE_URL`. Tables are created automatically on first request.
2. Import the repo into Vercel and add every variable from `.env.example` (at minimum `APP_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `CRON_SECRET`, `DATABASE_URL`).
3. `vercel.json` schedules two cron jobs: start booked AI calls (every 10 min) and import the careers inbox (every 15 min). Schedules under one day need a Vercel **Pro** plan; on Hobby, call the URLs from any external cron service with `?secret=CRON_SECRET`.
4. Point `careers.yourdomain` at the app so Google for Jobs indexes `/careers/<job>`.

## What each part does

| Area | Where | Notes |
|---|---|---|
| Clients & prospects | `/clients` | Ideal client profile (cloud, ₹ revenue band, focus cities); prospects scored "x of 4"; CSV import; convert to client |
| Requirement intake | `/jobs/new` | The 13 client fields from the PDF + hiring-manager call notes; AI drafts the JD and screening questions |
| Job posting | `/jobs/[id]` | Careers page + Google for Jobs are automatic. Indeed / LinkedIn / Naukri use **assisted posting** (copy-ready post → paste → save live link) |
| Resumes | `/resumes` | Bulk upload PDF/DOCX/TXT, careers inbox (IMAP), careers apply form. Duplicates merged by email/phone. Scanned PDFs flagged |
| Matching (match %) | automatic | Every upload is scored against **every open job**; a new job is scored against the whole database straight away. Match % = must-have skills 50 + preferred 10 + experience 20 + budget 10 + location 10, capped at 50% if fewer than half the must-haves are found. At or above the job's cut-off (default 60%) → added to the pipeline; below → score kept, shown in the Resume database. "Match all" / "Re-score everyone" buttons on the Resume database and job pages |
| Re-read details | `/resumes` | Re-reads stored resumes to fill in missing title, company, city, CTC, expected CTC and notice period (never overwrites HR edits) |
| Pipeline | `/pipeline` | Pending → Shortlisted → Screening → Forwarded to client → Client interview → Selected / Rejected; bulk actions |
| Candidate | `/candidates/[id]` | CCTC / ECTC / notice, match breakdown, call result, activity log, reject with reason |
| Client-ready resume | `/candidates/[id]/resume` | Edit, hide contact details, add branding + screening summary, download Word or PDF |
| AI screening | `/screening` | Candidate gets a link (email + WhatsApp) → picks a slot and consents (`/book/[token]`) → AI calls at the slot → transcript scored per question |
| Client feedback | `/share/[token]` | Private link with a 24-hour SLA timer; client shortlists or rejects with a reason; downloads PDFs (contacts always hidden) |
| Interviews & offers | `/interviews` | Schedule with calendar invite (.ics), record outcome, negotiation → accepted → joined |
| Announce hiring | `/jobs/[id]/announce` | Ready-made posts for LinkedIn, WhatsApp, X, Facebook, Instagram and Telegram (AI-written with a key). One-click share buttons, optional direct posting to your LinkedIn profile, share history |
| Public careers | `/careers` | Open to everyone, no login. Visitors opening the main address land here. Each job has share buttons and a preview image for WhatsApp/LinkedIn links |
| Settings | `/settings` | Integration status, call rules, team users, message outbox |

## Sharing the careers page with everyone

`localhost` only works on your own computer. To share job links in WhatsApp groups, LinkedIn, etc., the app must be reachable on the internet:

- **Quick test link (temporary):** with the app running, run `npx cloudflared tunnel --url http://localhost:3000`. It prints a `https://….trycloudflare.com` address. Put that address in `APP_URL` in `.env.local`, restart the app, and share links. The address changes every time and stops when you close the window, so use this only for testing.
- **Permanent:** deploy to Vercel with Supabase (see "Deploy" above) and use your own domain, e.g. `careers.avastars.in`. Set `APP_URL` to it.

## Integrations (all optional — the app works without them)

- **AI** — `ANTHROPIC_API_KEY`. Without it, resume reading and matching fall back to keyword rules and calls are saved unscored.
- **Email** — `SMTP_*`. Without it, every message is still saved in the Outbox (Settings) so nothing is lost.
- **WhatsApp** — `WHATSAPP_WEBHOOK_URL` receives `{to, text}`; connect it to your WhatsApp Business provider (Gupshup, Interakt, Twilio…).
- **Voice calls** — `VOICE_PROVIDER`:
  - `mock` (default): no real calls; use **Simulate call** on the AI screening page.
  - `bolna`: Bolna outbound call API. **Check the request/webhook field names in `lib/voice.js` against Bolna's current docs before going live.** Configure your Bolna agent to read `intro`, `questions` and `outro` from the call's user data.
  - `webhook`: the app POSTs `{screening_id, phone, script, callback_url}` to `VOICE_DISPATCH_URL` — use this to drive Omni or any other platform (e.g. through n8n).
  - Every provider reports back to `POST /api/webhooks/voice/<provider>?secret=VOICE_WEBHOOK_SECRET` with `screening_id`, `status` (`completed` / `no_answer` / `failed`), `transcript`, `recording_url`.
- **LinkedIn posting** — `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` from a free LinkedIn developer app with *Sign In with LinkedIn using OpenID Connect* and *Share on LinkedIn*. Posts go to the connected person's profile. Company page posting needs LinkedIn's Community Management API approval.
- **Careers inbox** — `IMAP_*`. Unread mails with PDF/DOCX attachments are imported; if the subject contains an open job title, the resume is matched to that job.

## Known limits / next steps

- LinkedIn is not accepting new Job Posting API partners; Naukri needs a paid integration module; Indeed's Job Sync API needs partner approval. Assisted posting covers these until access is granted.
- OneDrive import is not built yet (needs a Microsoft Graph app registration).
- Resume files are stored in the database (fine for thousands of resumes; move to Supabase Storage at larger scale).
- AI calls need candidate consent: it is collected on the booking page and repeated at the start of the call. Keep it that way (India DPDP Act).
- A candidate can be fully deleted from their profile page (for data deletion requests).

## Project layout

```
app/(app)/…        HR pages (login required)
app/careers, book, share   public pages
app/_actions/…     server actions (forms and buttons)
app/api/…          upload, exports, public apply, voice webhooks, cron
lib/               db, schema, AI, ingest, matching, screening, voice, messages, exports
```
