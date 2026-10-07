> Archived review of the earlier app release. The current business-system implementation and Supabase setup are documented in README.md and business-system-review.md.

# RM Small Jobs app update — 7 October 2026

The existing `admin.html` app keeps its Supabase connection and authentication route. No new backend, paid service or customer-data migration was introduced. The original logo and WhatsApp QR remain unchanged.

## Changes

- Responsive branded layout, labelled controls, current public business email and price/coverage reference.
- Validated job and expense creation/editing using fields already present in the original app. Repeated submission is disabled while saving. A save requires confirmation of one returned record; errors preserve the form. If confirmation is missing, check the list before retrying to avoid duplicates.
- Read errors are shown explicitly rather than appearing as empty records or £0 totals. Sign-out removes private views and cached records.
- Website editing is labelled as stored drafts: the static public website does not read these Supabase tables, so saving drafts does not publish the site.
- Private JSON export of accessible business tables with stable pagination, excluding connection keys and session tokens. It is an export, not a restore system.
- Quote calculator includes total time, target hourly pay, materials, travel, other costs and a manually confirmed discount. It rounds the initial estimate up to £5 and warns if a discount falls below target pay or the service starting price. Estimates are before tax and ongoing overheads, not confirmed revenue.
- Editable WhatsApp reply templates block unfinished square-bracket placeholders. Opening WhatsApp prepares a draft; the user chooses the recipient and sends it themselves.
- A seven-point job checklist with visible progress. Ticks are temporary and reset when leaving that screen.

## Verification and limits

JavaScript syntax and 19 browser checks passed with clearly identified simulated records. Checks covered overview and tool layouts at 320, 393, 768 and 1440 pixels; sign-in failure/retry; sign-out and write gating; job/expense validation, creation, editing, write errors and zero affected records; stored-draft editing; quote calculations and discount warning; reply placeholders/draft URL; checklist progress; export contents; and blocked server-only keys.

All Supabase library behaviour was intercepted for these checks. No real database request, customer message, payment or fake customer enquiry was made.

The workspace has no device-stored browser-safe Supabase key or signed-in account. Real authentication, table constraints, row-level permissions, persistence and password recovery remain unverified. Customer creation remains unavailable because the project defines no customer fields beyond `id`; required customer columns and access rules must be checked before implementing it. Existing stored records are not replaced.

Next live check: use the existing app connection, sign in, inspect real job/expense records and verify permissions with an explicitly authorised test record. Do not put database keys, tokens or private exports in this public repository.
