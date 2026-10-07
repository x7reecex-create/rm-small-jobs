# RM Small Jobs

Website: https://www.rmsmalljobs.co.uk/

Business app: https://www.rmsmalljobs.co.uk/admin.html

The project keeps the existing branding, mobile layout, prices, logo, QR and GitHub Pages hosting, using the existing Supabase project. There is no checkout or new paid service.

## The customer website

`index.html` contains the working website and built-in fallback content. The quote form prepares a WhatsApp message: the customer must press **Send in WhatsApp**. The website cannot confirm delivery, accept a booking or take payment. `thank-you/index.html` explains the next steps.

Once configured, `public-cms.js` reads the published homepage, contact details, services/prices, FAQs, areas and gallery from Supabase. Content edits appear on the customer's next page load without another GitHub deployment. Missing configuration, connection failures and invalid responses retain the built-in website. Successfully loaded empty collections keep disabled items hidden.

The homepage **Publish the CMS content** switch keeps unchecked old drafts off the public site. Review every Website tab before enabling it. The original QR points to `447365309553`. Changing the CMS WhatsApp number updates the quote/contact links and hides the old QR image; supply a matching QR before restoring it.

## The business app

Sign in with your existing Supabase account. The database must also approve that account as a business administrator. Registering an account alone does not grant access.

- **Home:** upcoming jobs, enquiries awaiting action, booked/completed jobs, customers and a money overview, with quick actions.
- **Jobs:** create/edit customer-linked jobs, descriptions, addresses, dates/times, quoted/final prices and status. Cancellation keeps history. Permanent deletion requires confirmation.
- **Customers:** names, phones, emails, addresses/postcodes and notes, current/previous jobs and Call/WhatsApp/Email actions.
- **Money:** create/edit/delete expenses with category, description and date. Revenue uses completed jobs' final prices; unknown final prices are flagged and excluded. Estimated profit is that revenue minus entered expenses, before tax and any costs not recorded. It does not prove payment was received.
- **More:** the existing quote calculator, WhatsApp reply drafts and checklist, plus website editing and public connection-file download.

Job times use Scotland time (**Europe/London**) regardless of the device timezone. Clock-change times that disappear or occur twice must be changed to an unambiguous time. New-record retry references prevent a connection failure/retry from creating another copy. Separate forms remain separate records.

The dashboard can export private JSON backups. Keep exports private. They exclude connection keys/tokens and do not provide automatic restoration.

## One-time Supabase setup

The existing project was inspected and upgraded on 7 October 2026. The owner is enrolled, the empty CMS was seeded as unpublished drafts, and this PR contains the corrected project URL and an enabled publishable key. Live database permission checks and anonymous HTTP checks passed. See [setup status](supabase/setup-status.md) for evidence and remaining Auth/deployment steps. The instructions below also cover setting up another existing project.

1. Open your project at [Supabase](https://supabase.com/dashboard) and keep a private database backup.
2. Open **SQL Editor → New query** and run [00_preflight.sql](supabase/00_preflight.sql). This only inspects the current setup.
3. Run [01_business_system.sql](supabase/01_business_system.sql). It adds missing fields and installs security rules. If compatibility checks fail, keep the complete error; do not delete data or disable security to bypass it.
4. Open **Authentication → Users**, copy your login's **User UID**, replace the all-zero example in [02_enrol_owner.sql](supabase/02_enrol_owner.sql), then run it in SQL Editor. Do not commit your personal UID to this public repository.
5. If the CMS tables are empty, run [03_seed_current_website.sql](supabase/03_seed_current_website.sql). It copies current public copy/prices/areas only into empty tables, never overwrites saved content and leaves publication off. No customers, reviews or photos are invented.
6. In **Authentication → URL Configuration**, set the site URL to `https://www.rmsmalljobs.co.uk` and allow `https://www.rmsmalljobs.co.uk/admin.html` as a redirect for password-reset emails. Disable public sign-ups for this private owner app.
7. In **Project Settings → API Keys**, copy the **publishable key** or legacy **anon key** into `supabaseKey` in [supabase-config.js](supabase-config.js), alongside the project URL. Deploy the file through GitHub Pages. Never use a secret/service-role key. The public key is meant for browser use; database permissions protect the records.
8. Sign in, review every Website tab, enable **Publish the CMS content**, then refresh the public site to check it.

If your device already remembers its connection, **More → Public connection file** downloads a safe configuration file ready to upload instead of copying the key manually. Gallery images must use HTTPS and your Supabase project host or a trusted hostname listed in `galleryImageHosts`. The app edits photo URLs; it does not add a new upload service. Review storage-bucket privacy separately.

Detailed setup/troubleshooting: [Supabase guide](supabase/README.md).

## Database, authentication and security

CMS tables: `site_settings`, `services`, `faqs`, `service_areas`, `gallery`. Private business tables: `customers`, `jobs`, `expenses`. `business_admins` holds approved login UIDs.

The migration preserves existing IDs, records and extra payment fields. `jobs.price` remains the quoted price and can be empty before a quote is known; `final_price` is separate. New jobs default to Enquiry. Saved prices and historical statuses are retained. Legacy expense notes are retained and can fill blank descriptions. Historical unfamiliar statuses/categories remain stored, but choose a current value before saving changes to those records.

**Row Level Security (RLS)** makes Supabase check who may access each row. After setup, only approved signed-in administrators can read/write these tables. The app cannot approve more admins. Public visitors receive only explicitly selected published CMS fields from the read-only `rm_public_site()` function. It never returns customers, jobs, expenses or extra private columns.

Isolated database tests do not prove which rules are installed in the live project. Review preflight results for old functions, views and integrations that could expose private data separately; also review storage buckets. Complete setup and check live access before relying on the system for private customer records.

## Deploying updates

GitHub Pages publishes `main` from the repository root. Keep `CNAME` as `www.rmsmalljobs.co.uk`. No build step is needed. Update HTML/JavaScript files together, wait for **pages build and deployment** to succeed, then refresh the site. Keep the previous version available for rollback.

Complete the database migration and owner enrolment before deploying the upgraded admin app. Until setup is complete, it shows a setup-required screen rather than loading private records without verified permissions. Normal content/customer/job/expense edits go to Supabase and do not require GitHub commits. Never put customer records, private exports, passwords or elevated keys in this repository.

## Development checks

`python3 supabase/tests/test_database.py` checks actual RLS/privileges in a disposable PostgreSQL 17 Docker container. It never contacts live Supabase.

`node tests/business-system.cjs` checks browser workflows with simulated records. It requires Playwright and Chromium; use `CHROMIUM_PATH` if needed. Screenshots/results go outside the repository, under `/tmp/rm-small-jobs-browser-checks` by default. Also run `node --check` on JavaScript files and `git diff --check`.

Browser simulations do not verify live email delivery, installed iPhone WhatsApp behaviour or real Supabase login/persistence. Those need the owner's configured access.
