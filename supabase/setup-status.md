# Supabase setup status — updated 8 October 2026

The existing **RM Small Jobs** project is `metquqdynxwkplojlhwq`, with API URL `https://metquqdynxwkplojlhwq.supabase.co`. PR #1 is merged and the deployed site configures an enabled publishable key. Secret and service-role keys are not used in the website.

## Completed

- Inspected all eight existing application tables before changing them. All were empty, with UUID primary keys. There were no unrelated public views/functions, application triggers or storage buckets. A private preflight snapshot is kept outside the repository.
- Applied `20261007205653_rm_small_jobs_business_system_v1`: additive fields, constraints, approved-admin RLS, explicit grants and the restricted public-content RPC. Existing table policies previously allowed every signed-in account to manage private records.
- Enrolled the existing confirmed login selected by the owner. Its UID is not committed to this public repository.
- Adjusted the legacy required quote price/default and default status: unknown prices are NULL, new jobs default to Enquiry, and saved values remain unchanged.
- Applied `20261007210108_rm_small_jobs_legacy_expense_link_index` to cover the existing expense-to-job foreign key. The repeatable setup SQL includes this conditional index too.
- Seeded one homepage, six services and three service areas without publishing them. FAQs/gallery and all customer/job/expense tables remain empty.
- Corrected the extra letter in the project URL in `supabase-config.js` and the admin connection fallback.

## Live verification

Owner-role SQL checks passed for create/read/update/delete of customers, jobs and expenses, optional quote values, default Enquiry status, validation constraints, clearing expense links after job deletion, and protection against editing the admin allowlist. These checks used temporary records inside rolled-back transactions.

Unapproved-user SQL checks returned no private/content rows, rejected inserts and changed no rows on updates/deletes. Anonymous SQL checks rejected direct reads of all nine application tables and the admin RPCs. A temporary publication check verified that the public projection includes only enabled/published CMS items and excludes private business records; it was rolled back without publishing the site.

HTTP checks with the configured publishable key passed: `rm_public_site()` returned `{"published":false}`; all nine direct table reads and both admin RPCs returned permission errors. A subsequent database read confirmed one enrolled admin, the saved CMS seed, no test records and publication still off.

The final isolated PostgreSQL 17 suite also passed, including the legacy required-price/default-status regression and repeatable schema/seed checks. All 28 simulated browser scenarios passed after making their connection configuration independent of the real publishable key. JavaScript syntax and whitespace checks passed.

## Publication decision

The owner authorised publishing the verified application code with CMS publication off. The live permission checks support this rollout: public signup does not add an account to the business-admin allowlist, and password recovery configuration does not affect password sign-in or private-table permissions. The public website continues to use its built-in content until the owner reviews and publishes the CMS.

## Deployment and Auth follow-up

PR #1 and the subsequent connection/password-recovery fixes are deployed through GitHub Pages. The password-recovery release at commit `b52a1ee7a7e55da513f92dc2a9e80919960090e0` completed successfully; deployed pages, application scripts, connection file, logo and QR matched the repository bytes.

Read-only HTTP checks on 8 October confirmed public signup is disabled, all nine direct table reads and both admin RPCs remain denied to anonymous visitors, and the public CMS RPC still returns `{"published":false}`. A database count confirmed one approved administrator, zero customers/jobs/expenses and no published homepage.

Auth logs showed a reset link was accepted, later reused links were invalid, and subsequent email requests reached the email limit. There was no successful password-update request in the inspected logs. The owner has not yet confirmed a completed password change and sign-in.

The app now offers `/admin.html?change-password=1` and **More → Change password**. A valid stored owner session can open the password form without requesting another email. The direct route verifies the administrator/schema RPC before showing the form and loads no private records first. Signed-out and unapproved accounts cannot use this route. The user chooses and saves their own password; this route cannot bypass an expired session.

The original project-address typo is repaired when found in saved browser settings. Network failures explain connection recovery and offer an explicit **Use website connection** action; it sends no email until the user retries.

Remaining owner checks:

1. Save a new password and confirm sign-in in the owner's actual browser. If the stored session is gone, use the newest valid reset link in the same browser.
2. Complete a real-device check of record persistence and WhatsApp behaviour when the owner is available.
3. Review every CMS tab before enabling publication.

The user updated Auth URL configuration in the dashboard; the screenshot and accepted reset redirect do not independently prove every current URL setting. The connected tools cannot edit Auth service settings. See [URL configuration](https://supabase.com/dashboard/project/metquqdynxwkplojlhwq/auth/url-configuration) if recovery redirects still fail.

Supabase's built-in mail provider permits only two Auth emails per hour across the project. A reliable production email setup needs custom SMTP or an email-sending hook; provider selection and credentials are not available in this workspace. See [rate limits](https://supabase.com/docs/guides/auth/rate-limits). No password or elevated key is requested or stored in this repository, and the assistant has not sent a reset email.

## Advisor findings reviewed

The allowlist has RLS with no client policies or grants by design: clients cannot read or enrol administrators. Security Advisor also flags the explicitly granted SECURITY DEFINER RPCs. The public RPC intentionally returns a fixed published-content projection; the admin functions return the caller's allowlist status. Their search paths are fixed and anonymous execution is denied for the admin functions. These intentional findings are documented rather than disabling the required access controls: [RLS with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [public RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated RPC review](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Auth's [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) remains disabled and should be reviewed in the dashboard. The missing foreign-key index finding was fixed. Remaining performance notices concern unused indexes on new/empty tables and do not justify removing them before the app is used.

Database-role and anonymous HTTP checks do not prove owner browser login, recovery email delivery, device-specific WhatsApp behaviour or an owner password change.
