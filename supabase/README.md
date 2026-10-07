# Connect the existing Supabase project

These files upgrade the existing database. They do not replace your Supabase project or create customer records. The website continues to show its current built-in content until you configure the public connection and explicitly publish the CMS content.

## Do this once

1. Open your existing project at [Supabase](https://supabase.com/dashboard). Keep a private database backup before changing the schema. The app's JSON export is useful, but is not a complete database/schema backup.
2. Open **SQL Editor → New query**. Paste and run `00_preflight.sql`. This only inspects table definitions, policies and permissions. Keep the results private. If you already have other apps, views or functions using these tables, review those results before changing access rules.
3. In another query, paste all of `01_business_system.sql` and run it. The whole change is a transaction: if a compatibility check fails, none of this migration is applied. Copy the error and preflight results for diagnosis; do not disable security or delete data to get past it.
4. Open **Authentication → Users**. Use your existing account, or create/invite your own account. Copy its **User UID**. In `02_enrol_owner.sql`, replace the example all-zero UID with that UID, then run it in SQL Editor. Only enrolled users can read or change private business data. Your public contact email is not automatically your login.
5. In **Authentication → URL Configuration**, use `https://www.rmsmalljobs.co.uk` as the site URL and add `https://www.rmsmalljobs.co.uk/admin.html` as an allowed redirect URL. This is needed for password recovery. Turn off public sign-ups for this private owner app. Even if sign-ups remain on, newly registered accounts do not become business administrators.
6. If the CMS tables are empty, run `03_seed_current_website.sql` to copy existing website copy/prices/areas without replacing saved content or publishing it.
7. In the project's API settings, copy the project URL and **publishable key** (or legacy **anon** key) into the two fields in `supabase-config.js`. These browser-safe values are intended to be public. **Never use a secret key or service-role key.** Deploy the changed file through the existing GitHub Pages route. The admin app can also remember its existing connection on your device.
8. Open `/admin.html`, sign in, and check all website tabs. Existing content was previously just stored drafts. In particular, review prices, service areas, contact details and photos before turning on **Publish website content** on the homepage tab. Disabled services/FAQs/areas and unpublished gallery images stay hidden. Saving subsequently updates the public content on the next page load; it does not need a GitHub deployment.

## What the migration changes

| Table | Purpose / main fields |
| --- | --- |
| `site_settings` | One homepage record: headline, intro, boundary, phone, WhatsApp, email, global `published` switch |
| `services` | Name, displayed price, description, enabled, featured, order |
| `faqs` | Question, answer, enabled, order |
| `service_areas` | Name, enabled, order |
| `gallery` | Image URL, title, description, published, created date |
| `customers` | Name, phone, email, address, postcode, notes |
| `jobs` | Customer, title, description, location, scheduled date/time, `price` (quote), `final_price`, status |
| `expenses` | Amount, category, description, expense date |
| `business_admins` | Authentication User UIDs allowed to manage the business |

New tables use UUID IDs. Existing IDs, records, extra columns and payment fields are preserved. `jobs.customer_id` uses the same type as the existing customer ID. Legacy expense `note` text is copied into a blank description; the original note is retained. Missing expense dates use the record's existing creation date in London time, which may need correcting to the actual purchase date.

New and edited jobs use Enquiry, Quote sent, Booked, In progress, Completed or Cancelled. Historical unfamiliar statuses are retained for review; choose a current status/category before saving changes to those older records. No old quote is automatically treated as a final price or received payment. Expenses use Tools, Materials, Fuel/travel, Advertising, Insurance or Other.

`client_request_id` is a unique retry identifier for each new job, customer or expense. Retrying the same form can find its original saved record instead of creating another. It does not merge separate records that happen to have the same details.

## How access is protected

All eight content/business tables use Row Level Security (RLS). The migration replaces existing policies on those tables and removes old anonymous table/column grants. Signed-in users can access them only when their User UID appears in `business_admins`. The app cannot add people to this list.

Public visitors get content only through the read-only `rm_public_site()` database function. It returns an explicit list of safe CMS fields and checks the global publication switch and item visibility switches. Visitors cannot directly read any of these tables. Customer data, jobs, expenses, extra table columns and unpublished CMS content are never returned by that function.

`rm_admin_status()` lets the app check whether the signed-in user is enrolled and whether schema version 1 is installed. `is_business_admin()` implements the allowlist check. Both have a fixed empty SQL search path and explicit table names. No secret keys are needed in the site.

The migration cannot inspect or fix unrelated old public views, database functions, storage buckets, integrations or security settings without seeing them. An old function/view that exposes private data must be reviewed separately using the preflight results. Do not advertise the live database as audited until its actual configuration and anonymous access have been checked.

## If setup stops with an error

The migration deliberately stops for incompatible existing column types, older status/category constraints, mismatched customer/job ID types, or multiple homepage settings records. This preserves existing data instead of guessing how to convert it. Extra required columns/triggers in an older database may also need adapting after reviewing the preflight results. Keep the complete error; never paste passwords, secret keys, customer records or full exports into a public issue.

After setup, verify a genuine record with your own account and check that a signed-out browser cannot access private records. Automated checks in this repository use a separate disposable PostgreSQL database; they do not prove what is configured in your live project.

## Developer checks

With Docker available, run `python3 supabase/tests/test_database.py`. It uses an isolated PostgreSQL 17 container, publishes no network ports and deletes the test container afterwards. It checks the actual database privileges/RLS, public projection, record constraints, owner access, repeated migration and legacy IDs. Test fixtures never contact the live Supabase project.
