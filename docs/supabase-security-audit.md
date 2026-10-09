# Supabase security audit — 9 October 2026

Read-only inspection and live requests were performed between 14:17 and 14:23 UTC. The connected project named **RM Small Jobs** matches the project URL in the existing repository connection file. Project status was `ACTIVE_HEALTHY`, region `eu-west-1`, and the database reported PostgreSQL `17.6`.

No customer records, administrator identifiers, passwords, API keys or session tokens are included here. No database migrations, row changes, new users, password emails, paid resources, publication changes or database restarts were performed. Role checks used `BEGIN READ ONLY`, session-local roles/claims and `ROLLBACK`; the synthetic identity was not created as a real account.

## Verified results

| Check actually performed | Result | What this proves and its limit |
| --- | --- | --- |
| Inspected PostgreSQL grants, RLS flags and policies for all ten `public` tables | **PASS** | RLS is enabled everywhere. `anon` has no SELECT/INSERT/UPDATE/DELETE privileges on any application table. Authenticated access is constrained by the approved administrator helper. |
| Inspected `business_admins` grants and policies | **PASS** | No client grants or policies permit reading or changing the administrator allowlist. The advisor's no-policy notice is intentional protection. |
| Inspected all application function definitions and execution privileges | **PASS, with documented intentional advisor warnings** | There are three application functions, all with fixed empty search paths. Public-content output is explicitly selected; administrator helpers do not return records or identifiers. See details below. |
| Ran the public-content RPC as the `anon` database role | **PASS** | It returned only `{"published":false}`. Current saved CMS content remains unpublished. |
| Simulated an authenticated non-administrator with an explicit synthetic JWT subject | **PASS** | The supplied subject was applied, `is_business_admin()` returned false, and visible counts were zero for leads, customers, jobs, expenses, settings, services and areas. This checks actual RLS evaluation rather than inferring access from policy names. |
| Repeated checks as `authenticated` with no subject | **PASS** | Administrator status was false and all inspected private/content row counts were zero. |
| Live HTTP call to `rm_public_site` using the repository's configured browser key | **PASS** | HTTP 200 returned `{"published":false}`. The configured key works for its intended public RPC; its value was not logged. |
| Live anonymous HTTP reads of every application table | **PASS** | All ten valid requests returned HTTP 401 with PostgreSQL permission code `42501`; no records were returned. Tables checked: `business_admins`, `customers`, `jobs`, `expenses`, `leads`, `site_settings`, `services`, `faqs`, `service_areas`, `gallery`. |
| Live anonymous HTTP calls to `rm_admin_status` and `is_business_admin` | **PASS** | Both returned HTTP 401 / `42501`. Anonymous visitors cannot call the administrator helpers. |
| Live public Auth settings endpoint | **PASS for the fields inspected** | HTTP 200 confirmed public signup is disabled, email authentication is enabled, and email autoconfirm is false. Password recovery, SMTP delivery and owner login were not exercised. |
| Inspected application views, other application schemas, Storage buckets and Edge Functions | **PASS for current objects** | No application views, additional custom application-schema functions, Storage buckets or Edge Functions were found. Managed Supabase internals were not treated as application code. |
| Security and performance advisors | **COMPLETED** | Findings and decisions are below. A clean advisor report is not claimed. |
| Inspected the current Supabase changelog and relevant release notes | **COMPLETED; maintenance remains** | Explicit grants already accommodate the Data API exposure change. PostgreSQL patch maintenance needs owner review. |

An initial `business_admins` HTTP probe incorrectly selected `id`; that table's key is `user_id`, so the request returned HTTP 400 / `42703`. That attempt did **not** verify access restrictions. The corrected `select=user_id&limit=0` request returned HTTP 401 / `42501` and is the result recorded above.

## Why the function warnings are intentional

- `public.is_business_admin()` is callable by `authenticated` and `service_role`, with anonymous execution denied. It returns only whether the caller's `auth.uid()` exists in the protected allowlist. It does not authorize from user-editable metadata or accept a supplied user ID.
- `public.rm_admin_status()` has the same execution restrictions and returns the caller's administrator boolean plus schema version. It contains no write or private-record output.
- `public.rm_public_site()` is intentionally callable by anonymous visitors. It first checks saved publication, then returns only selected homepage/contact fields, enabled services/FAQs/areas and published gallery items. It contains no customers, jobs, expenses, leads, allowlist entries or arbitrary columns in its returned projection.

All three functions are `STABLE SECURITY DEFINER` with `SET search_path TO ''` and schema-qualified application/auth references. Their inspected bodies contain no dynamic SQL or writes. The public website relies on the restricted content RPC because direct table access is intentionally denied. Removing its execute grant or switching blindly to an invoker would break CMS publication. The active unpublished result was exercised live; temporarily publishing CMS content was deliberately not attempted in this read-only audit.

[Public function advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) · [Authenticated function advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) · [RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

## Public source integration review

Files inspected: `supabase-config.js`, `public-cms.js`, the enquiry handler in `index.html`, and the established setup/enquiry documentation.

- The configured browser key has the publishable-key format. A successful anonymous HTTP RPC call verifies its current use; no elevated key was requested or added.
- `public-cms.js` rejects secret/service-role keys before requesting content, including legacy JWTs whose role is not `anon`.
- The public fetch sends the browser key only to the configured HTTPS project origin, omits cookies and referrer information, and does not load a stored administrator session. Modern publishable keys are not incorrectly used as bearer JWTs.
- CMS text is rendered with `textContent`/DOM creation. Gallery image URLs require HTTPS and an explicitly allowed hostname; URL credentials are rejected. CMS content is not inserted as arbitrary HTML.
- Invalid/unavailable/unpublished CMS responses retain the existing built-in content. The request has a 6.5-second abort deadline and does not block attachment of the enquiry handler.

No unsafe exposure requiring a JavaScript change was identified in this reviewed public integration. This source review is not a claim that every owner-authenticated admin workflow or every possible published CMS combination was run against production.

## Enquiry persistence: explicitly absent

The current enquiry form creates a WhatsApp draft and opens WhatsApp. Its existing text correctly tells the customer to press **Send** and says the website cannot confirm sending or receipt. It performs no database insert. The database has no public enquiry-submission RPC or anonymous insertion policy, and the project has no Edge Function receiving enquiries.

Therefore **website enquiries reaching the database are not confirmed working: that backend capture is not implemented**. WhatsApp delivery and receipt also cannot be inferred from opening the draft. The private administrator's manual job/enquiry records are a separate flow. Anonymous access to private business tables must not be relaxed to manufacture a passing enquiry test.

## Findings still requiring attention

### Database patch maintenance

The database itself reports `17.6`. Supabase's [25 September PostgreSQL release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) describes the rollout of `17.11` and upstream security fixes. Review the dashboard's upgrade availability and maintenance impact before scheduling it; this audit did not restart or upgrade the production database.

Read-only compatibility checks found no `ltree` index candidates, no GiST float-index candidates, no user-created operators with custom estimators, no public `bytea` columns, and no public function references to legacy PGP/cipher options. These checks do not inspect managed Vault secrets or prove that all provider-managed internals are unaffected.

### Password protection on the existing free plan

The security advisor reports leaked-password protection disabled. The connected organization is on the **Free** plan, and current [Supabase password documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) states that this feature requires Pro or above. No upgrade or paid feature was enabled. Use a strong unique administrator password and review owner sign-in/recovery in the actual browser. The advisor warning remains accurately reported.

### Owner/browser and configuration checks

- Actual administrator sign-in, password recovery, owner-browser writes and positive production record persistence remain unverified during this read-only audit. No credentials or private session were available or requested.
- The full configured Data API exposed-schema list and Auth URL/SMTP settings were not available through the connected management tools. The attempted SQL lookup of `pgrst.db_schemas` returned no setting. Check the dashboard configuration when reviewing future schema additions; do not interpret this limitation as a discovered extra exposure.
- Performance notices list three unused indexes: `rm_expenses_job`, `rm_jobs_schedule`, `rm_expenses_date`. These are reasonable foreign-key/scheduling/date indexes on a lightly used system; removing them solely because they are currently unused is not justified. No indexes were dropped.

## Change record

| What was checked | What was wrong or incomplete | Change made | Files changed | Verification | Manual follow-up |
| --- | --- | --- | --- | --- | --- |
| Live Supabase grants/RLS/functions, public HTTP access, Auth fields, advisors and public integration source | Existing evidence needed a current audit; public enquiries have no database capture; database patch level and Free-plan password limitation needed explicit reporting | Recorded current verified results, safe intentional warning decisions and precise limits; made no production database changes | `docs/supabase-security-audit.md` | Actual read-only SQL and HTTP results above; successful checks are distinguished from the corrected failed probe and untested flows | Review database patch maintenance, check owner login/recovery, and decide whether to add a protected enquiry-capture backend |

This document records the security subtask. Other project fixes, browser testing and deployment status are recorded in the full project audit. No deployment is implied by this documentation change.
