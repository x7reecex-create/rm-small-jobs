# RM Small Jobs production audit — 9 October 2026

Audited the existing project for a local handyman business serving Motherwell, Wishaw and Bellshill. Baseline: `main` commit `d9c663761eb43fd33e01f4ca77589c942fea003c`. The live homepage at `https://www.rmsmalljobs.co.uk/` was downloaded and compared byte-for-byte with that baseline before editing. Work is on `codex/production-audit-2026-10-09`; publication status is recorded below.

No customer records, credentials or session tokens appear in this report. No production rows, database schema, DNS records, billing, paid services or CMS publication settings were changed.

## Change and verification record

Each row records a meaningful change. Detailed test evidence and limits are in the linked reports; simulations are never described as real owner writes or actual customer delivery.

| What was checked | What was wrong | What changed | Files changed | How tested / genuine result | Manual action |
| --- | --- | --- | --- | --- | --- |
| Admin account switching, startup, sign-in, recovery and delayed replies | A changed account cleared arrays but left previous private records visible in the DOM; delayed responses could restore an obsolete session/view | Clear private UI immediately on account switch and reject replies/callbacks belonging to an obsolete connection, auth state or form | `admin.js`, `tests/admin-auth-races.cjs` | Three original regressions reproduced before fixing. Repeatable fabricated-SDK lifecycle checks verify the fix; see [admin evidence](admin-audit.md). This is local verification, not an owner login | Check actual owner login/recovery after deployment |
| Complete private-record download | Newer lead-tracker records were omitted from the backup | Include the installed `leads` table; keep failed reads as a visible complete-export failure, with no partial file | `admin.js`, `tests/admin-auth-races.cjs`, `tests/business-system.cjs`, `README.md` | Downloaded and parsed a simulated nine-table export containing a fabricated lead and excluding connection keys/auth identifiers | Keep real exports private; older installations need the documented lead-tracker setup |
| Quote calculator arithmetic and discounts | £79.93 materials + £11.21 travel + one hour at £8.86 could round a mathematically £100 total to £105; excessive discounts could produce a negative quote | Calculate with integer pennies/quarter-hour units and reject a discount greater than the quote | `admin-tools.js`, `tests/admin-tools.cjs` | Both failures reproduced before the fix. Focused simulated tools checks verify exact £100, starting prices, valid discounts and excessive-discount rejection; see [admin evidence](admin-audit.md) | Review the actual job before agreeing a price; calculator estimates are not saved bookings |
| Reply copy/draft errors and changing screens while copying | A delayed clipboard error after navigating away dereferenced a removed field; popup exceptions became uncaught errors | Ignore stale clipboard completions and provide an in-page copy fallback when a popup fails | `admin-tools.js`, `tests/admin-tools.cjs` | Failures reproduced before fixing. Deferred clipboard and blocked-popup scenarios pass without page errors; reply text is retained | Sending a real reply still requires the owner to choose the customer and press Send |
| Mobile navigation, contact links, keyboard access, landscape and long CMS copy | Final mobile menu action clipped below short screens; contact targets were small; long saved service/price/FAQ/selected-service strings could overflow narrow screens | Scroll menu within viewport, dismiss on outside click/Escape and desktop resize, increase link targets, add skip-to-content, wrap saved text and constrain quote-grid minimum widths | `index.html`, `tests/production-audit.cjs` | Local browser checks at 320/375/393/430/768/1440 pixels and 852×393 landscape; live landscape menu defect reproduced before fix. Long FAQ and selected-service overflows reproduced and verified fixed. See [browser evidence](browser-audit.md) | Real iPhone/VoiceOver check after publication |
| Home-screen manifests, names, favicon, app icons and safe areas | No manifests or Apple home-screen metadata; oversized favicon; missing notch-aware spacing | Separate customer and private-business manifests/start URLs, 192/512/maskable/180px icons, 32px favicon, Apple names and safe-area padding | `manifest.webmanifest`, `admin.webmanifest`, `icons/*`, `favicon-32.png`, `index.html`, `admin.html`, `thank-you/index.html` | Manifest/asset and browser checks in [PWA evidence](pwa-performance-audit.md). Parsing and assets passed. Actual headless standalone launch did **not** report standalone mode, so real installation/standalone behavior is **unverified** | Add homepage and business app to a real iPhone home screen; check names, icon, safe areas, launch and WhatsApp handoff |
| Logo transfer size and responsive decoding | A 694,840-byte logo was downloaded for 68–105px slots | Add responsive 160/320px lossless WebP derivatives and use them in all three pages and dynamic admin UI. Keep the original artwork/assets for sharing and rollback | `logo-160.webp`, `logo-320.webp`, `index.html`, `admin.html`, `admin.js`, `thank-you/index.html` | Browser decoded new assets. 320px response is 35,176 bytes (94.9% smaller); 32px favicon is 1,262 versus 88,426 bytes (98.6% smaller). Original assets preserved. This is a measured asset reduction, not a claimed field speed/Core Web Vitals score | Monitor actual visitor loading after publication |
| Local SEO and published-CMS consistency | Title lacked a clear service term; fixed starting prices in metadata became stale after CMS edits, including for share crawlers that do not run JavaScript; robots blocked crawling the next-steps page's `noindex` | Add natural handyman/location title and price-free static descriptions; derive rendered homepage metadata from published services/areas; allow the existing next-steps `noindex` to be crawled | `index.html`, `public-cms.js`, `robots.txt` | Canonical, sitemap, metadata/schema, contact/area/price consistency and simulated published-CMS checks; price-free static descriptions inspected separately; see browser evidence | Search/share platforms may cache old metadata; Search Console/indexing not verified. Confirm the existing launch offer remains valid |
| Enquiry validation and delivery claims | Unbounded input could create excessive draft URLs; customers could assume a form submit was saved on the website | Bound name/area/job lengths and explicitly say the form does not save an enquiry on the website. Preserve service choice, entered details, retry and WhatsApp send instructions | `index.html` | Required/whitespace validation, special-character encoding, correct recipient, retry/edit and JavaScript-disabled fallback passed in browser tests. No message sent and no database insert claimed | Send and receive one real test enquiry from an iPhone after publication |
| Supabase project, RLS, grants, functions, API, Auth fields and advisors | Needed current evidence; enquiry capture is absent; patch maintenance and password-protection limits remain | Record actual SQL/HTTP checks and precise limitations; preserve existing security and data | `docs/supabase-security-audit.md` | Live read-only checks passed: all ten tables deny anonymous access, non-admin RLS returns no private rows, admin RPCs deny anonymous callers, public CMS RPC returns unpublished, public signup disabled | Review PostgreSQL patch maintenance and owner authentication. No paid password feature enabled |
| Apex domain routing | `rmsmalljobs.co.uk` resolves to `18.199.108.153`; bare-domain HTTPS fails although `www` responds 200 | Diagnose and document exact correction; no DNS access available to apply it | This report | System DNS and Google DNS-over-HTTPS independently returned the same A record; two HTTPS attempts returned proxy upstream connection-timeout 503, HTTP timed out. The observed error is from the test proxy, not a claimed application-generated 503 | Correct apex DNS at one.com as below |

## Confirmed content and SEO baseline

Public prices remain TV mounting from £45; shelves/wall hanging from £30; furniture assembly from £30; small home jobs from £30; light garden tidy-ups from £35; grouped jobs by quote. Quotes remain subject to scope/materials/travel agreement. Phone/WhatsApp use the existing business number consistently; email stays unchanged. Motherwell, Wishaw and Bellshill remain the core coverage. No customer testimonials, credentials, insurance claims, opening hours or street address were invented.

The canonical homepage, sitemap homepage URL, business structured data and social URL agree on `https://www.rmsmalljobs.co.uk/`. The private app remains excluded from indexing. Sitemap/robots HTTP availability and metadata checks do not establish Google indexing or rankings. Published-CMS metadata uses browser rendering; crawlers that do not render JavaScript still see the built-in HTML until deployment updates it.

## Enquiries and actual persistence

The existing form prepares a WhatsApp draft. Opening the draft does not prove a message was sent or received, and the form has no backend submission endpoint. **Public enquiry capture in Supabase is not implemented.** Live RLS correctly prevents anonymous inserts into private tables. This audit did not weaken those rules or create a spam-prone public insert policy.

Owner-authenticated job/customer/expense/lead CRUD passed with a simulated SDK. Actual owner login, email recovery and positive production write/readback remain unverified because no owner session was available. No password email, account, customer record or booking was created during testing.

The highest-value next development is a protected website enquiry inbox: validated server-side submission, abuse controls, idempotent retries, clear saved/not-saved response and a private owner view, with an actual browser-to-database test using a clearly labelled test enquiry. Keep WhatsApp as an option. This is proposed work, not completed functionality.

## DNS action for the owner

The nameservers are `ns01.one.com` and `ns02.one.com`. Review the apex (`@`, or blank host) A record in one.com's DNS settings. The inspected value `18.199.108.153` differs from GitHub Pages' documented `185.199.108.153`.

For the existing GitHub Pages hosting, set the apex A records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`, preserving unrelated mail/TXT records and the working `www` configuration. Check GitHub Pages' custom-domain/HTTPS status and re-test bare-domain redirects after DNS propagation. Do not move hosting or purchase another service. [GitHub's current custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Verification commands and limits

- `CHROMIUM_PATH=/usr/bin/chromium node tests/business-system.cjs`: simulated business workflows; no live Supabase writes.
- `CHROMIUM_PATH=/usr/bin/chromium node tests/admin-auth-races.cjs`: fabricated auth/session races and private export.
- `CHROMIUM_PATH=/usr/bin/chromium node tests/admin-tools.cjs`: calculator, reply/copy errors, navigation and all checklist controls with fabricated data and intercepted contact actions.
- `node tests/pwa-assets.cjs`: ten manifest, file-header, dimension and original-asset preservation checks.
- `CHROMIUM_PATH=/usr/bin/chromium node tests/production-audit.cjs`: local code, actual anonymous CMS reads; contact handlers intercepted.
- `RM_AUDIT_LIVE=1 CHROMIUM_PATH=/usr/bin/chromium node tests/production-audit.cjs`: deployed baseline with read-only requests; expected old landscape defect is recorded.
- `node --check` for application/test JavaScript and inline HTML scripts; `git diff --check`.

Sanitized customer-neutral browser summaries and selected screenshots are committed under `docs/evidence/browser-audit/`. Full temporary harness outputs remain outside the repository under `/tmp/rm-production-audit-local-final`, `/tmp/rm-production-audit-live`, `/tmp/rm-small-jobs-browser-checks` and the PWA report's documented paths. Tests use the session's existing trusted Node/proxy transport for remote resources. TLS verification stayed enabled; browser/system trust settings were not modified. Synthetic fields and intercepted contact actions are distinguished from real-device delivery.

## Final results

- Customer browser: **58/58 passed** locally; deployed baseline **53/56**, with the three recorded differences corrected locally.
- Business workflow regression: **33/33 passed**, simulated SDK only.
- Auth/backup regressions: **11/11 passed**, simulated SDK only.
- Calculator/reply/checklist controls: **14/14 passed**, simulated SDK only.
- Manifest/asset checks: **10/10 passed**.
- Application/test/inline JavaScript syntax and whitespace checks: **passed**.
- Static price-free search/share metadata: **passed** after the final review correction.
- Live Supabase permissions/public RPC/Auth settings: verified read-only results in the security report.
- Physical iPhone standalone launch, actual WhatsApp receipt, owner login/recovery and positive private database persistence: **unverified**.

## Publication and handover

These fixes have not been merged or deployed. The live read-only audit tests the existing baseline; local passing checks test the proposed code. Review and merge the draft change through the existing GitHub Pages route, wait for the deployment to succeed, then rerun the live audit and real-iPhone/owner checks. Notion logging is acknowledged only after the existing activity-log entry is written and read back successfully.
