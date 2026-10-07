# Business-system upgrade review

This upgrade is prepared for the existing GitHub Pages/Supabase project. It is not activated on the live database. Keep the current production version until the database setup and owner enrolment are complete.

## Result

- The public website can read published CMS content through one explicitly limited read-only database function. Its original fallback website, prices, logo, QR, mobile design and WhatsApp draft journey are retained.
- The business app provides customer creation/editing/contact actions/history; full customer-linked job creation/editing/scheduling/status/quoted and final prices; confirmed job cancellation/deletion; and expense creation/editing/confirmed deletion with categories/dates.
- The dashboard displays upcoming jobs, enquiries, booked/completed jobs and customers. Money totals sum completed jobs' final prices and expenses in pennies, flag unknown final prices, and describe profit as an estimate before tax and unrecorded costs.
- Database access requires an approved signed-in account. Public visitors cannot access private tables or modify content. The app cannot approve additional administrators.
- Retry IDs, confirmed affected records, disabled repeated taps, loading/empty/error states and cleared sign-out caches improve reliability.
- Existing quote/reply/checklist tools and private JSON export remain available. Authentication includes reset-email and recovery screens.
- README and Supabase setup files explain the manual activation steps. The existing deployment route and original image files are unchanged.

## Verification

`python3 supabase/tests/test_database.py` passed against isolated PostgreSQL 17: fresh/repeated migration, owner CRUD, anonymous and unapproved-user denial, allowlist protection, publication filtering, exclusion of private extra columns, retry uniqueness and constraints. It also checked legacy bigint IDs/records/payment fields, expense notes/London dates, removal of old permissive policies and column grants, and complete rollback on incompatible schemas.

`node tests/business-system.cjs` passed 24 browser scenarios using clearly identified simulated records. It covered dashboard and published CMS layouts at 320/393/768/1440 pixels; customers/contact links/history; job creation/edit/completion/cancel/delete; expenses/errors/idempotent retry; money arithmetic; every CMS collection and global publication; unavailable/malformed/empty fallback handling; WhatsApp/QR/next steps; export; sign-in/logout/recovery; approved-account gating; rejected secret keys; and London summer/winter/DST scheduling. No browser script errors occurred.

The browser SDK/RPCs were intercepted. No live database request, fake customer record, message or payment was sent. Screenshots/results are outside source control under `/tmp/rm-small-jobs-browser-checks`. Chromium checks are not a physical iPhone/Safari test.

JavaScript syntax, whitespace checks and preservation checks for the original logo, favicon, QR and CNAME passed.

## Live blocker and activation order

The workspace has no live browser-safe Supabase key, signed-in owner session, database schema/policy settings or SQL execution access. The new live workflows, RLS, email delivery and real persistence therefore remain unverified.

1. Keep a private database backup and run the read-only preflight.
2. Run the transactional migration, resolve any compatibility errors without deleting data, then enrol the actual owner UID.
3. Optionally seed empty CMS tables from the existing website; review saved content before publishing it.
4. Configure authentication redirect URLs and a browser-safe public key.
5. Deploy the upgrade together through the existing GitHub Pages route.
6. Verify a real owner login and an explicitly authorised test record, signed-out/other-account denial, email recovery and the public content/WhatsApp route.

Unrelated legacy functions, views, storage buckets and integrations may expose data independently; review them using the preflight results. The live system must not be described as secured/audited until these actual settings are checked.

Recommended next task: complete live Supabase activation and its end-to-end verification before adding further features. Payment-received tracking is a useful later addition; quotes/final prices do not substitute for recorded receipts.
