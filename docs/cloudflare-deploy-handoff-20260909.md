# Cloudflare deployment handoff — 2026-09-09

Implementation commit: `5cd8d53`

The database migration must be applied before the Pages deployment. The new Pages code reads `repair_requests.ticket_number`, `repair_tickets.short_code`, and `repair_ticket_number_sequence`; deploying the site first can temporarily break new Repair submissions.

## 1. Authenticate and inspect

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 migrations list oalum-orders --remote
npx wrangler pages secret list --project-name studiooalum
```

Confirm that the Pages project still has these bindings/secrets. Do not print secret values.

- `OALUM_DB`
- `OALUM_R2`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- One of `REPAIR_TICKET_ACCESS_SECRET`, `AUTH_SECRET`, or `ORDER_ADMIN_SECRET`
- Optional: `REPAIR_ADMIN_EMAIL` (defaults to `studio.oalum@gmail.com`)
- Recommended: `PUBLIC_SITE_URL=https://studiooalum.com`

## 2. Back up and migrate the production D1 database

Choose a private path outside the repository for the backup, then run:

```sh
npx wrangler d1 export oalum-orders --remote --output /private/tmp/oalum-orders-before-0025.sql
npx wrangler d1 migrations apply oalum-orders --remote
```

Expected new migration: `0025_my_oalum_repair_delivery.sql`.

Validate the migration without exposing customer data:

```sh
npx wrangler d1 execute oalum-orders --remote --command "SELECT COUNT(*) AS total, SUM(ticket_number IS NULL) AS missing_ticket_numbers FROM repair_requests;"
npx wrangler d1 execute oalum-orders --remote --command "SELECT COUNT(*) AS total, SUM(short_code IS NULL) AS missing_short_codes FROM repair_tickets;"
npx wrangler d1 execute oalum-orders --remote --command "SELECT template_key, channel, is_enabled, length(active_body) AS body_length FROM notification_templates WHERE template_key IN ('repair.application_submitted','repair.application_submitted_admin') ORDER BY template_key, channel;"
```

Expected results:

- `missing_ticket_numbers = 0`
- `missing_short_codes = 0`
- `repair.application_submitted_admin / email / is_enabled = 1`

Keep the exported SQL backup outside Git. The repository `.gitignore` excludes `*.sql` only in some locations, so do not add or commit the backup.

## 3. Deploy Cloudflare Pages

```sh
npm ci
npm run test:repair
npm run test:newsletter
npm run test:admin-deletion
npm run cf:pages:deploy
```

The scheduled notification Worker does not need a new deployment for this change; the changed Repair notification code runs in Pages Functions.

## 4. Production checks

Check these pages after deployment:

- `/account` — existing site GNB, 2×2 square My Oalum cards
- `/my-repairs` — back link only, status filters, `#001`-style numbering
- `/repair` — new studio address and Repair Ticket guidance/button after submission
- `/repair-ticket.html` — existing site GNB and ticket numbering
- Footer/policy panels — `서울특별시 동대문구 이문로42길 5, 2층 201호`

Then sign in to `/notification-admin.html` and use **test send** on `새 수선 신청 · 관리자`. Confirm that the message reaches the configured admin mailbox and contains:

- Customer/application details
- Studio OALUM email layout
- A `Repair Ticket` call-to-action button

Finally, submit one clearly marked test Repair request, confirm both customer and admin delivery, open its `/t/{short-code}` link, and delete the test request from the Repair admin only if it remains eligible for deletion.

Useful status-only query after the test (no recipients or message bodies):

```sh
npx wrangler d1 execute oalum-orders --remote --command "SELECT template_key, status, COUNT(*) AS count FROM notification_outbox WHERE template_key IN ('repair.application_submitted','repair.application_submitted_admin') GROUP BY template_key, status ORDER BY template_key, status;"
```

## 5. Source control

The implementation is committed locally on branch `codex/my-oalum-repairs`. Push that branch only from a GitHub-authorized environment. Merge it into `main` only after the production D1 migration is ready, so an automatic Pages Git integration cannot deploy schema-dependent code too early.
