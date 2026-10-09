# Private business app audit — 9 October 2026

This report covers code inspection of `admin.js`, `admin-business.js`,
`admin-tools.js` and `admin-leads.js`, and focused browser regressions. It does
not claim real owner sign-in, real password-reset email delivery or live private
database persistence. The browser checks use a simulated Supabase SDK,
fabricated records and intercepted remote requests. No customer records or live
accounts were changed.

## Changes and evidence

### 1. Remove old private information when the signed-in account changes

- Checked: auth state-change handling, cached CMS/business records, rendered
  dashboard and session/access verification.
- Wrong: a different account cleared JavaScript arrays but left the previous
  customer's private dashboard visible. Delayed startup and sign-in replies
  could reopen that dashboard after sign-out.
- Changed: account changes immediately show sign-in and clear private state.
  Async auth work checks its originating client, auth generation and active
  form before replacing the current screen. Startup clears old state and
  ignores superseded results/errors. Callbacks from replaced clients are
  ignored. Recovery events also clear previous private records.
- Files: `admin.js`, `tests/admin-auth-races.cjs`.
- Tested: three focused Playwright reproductions failed on the original code
  (old private DOM remained, late session check reopened it, late sign-in
  reopened it). The persistent regression suite then passed the same behaviors
  plus a newer same-account view, delayed password update, replaced-client
  callback and password recovery.
- Result: **passed in a simulated Chromium browser at 393 × 852 pixels**.
  This verifies the browser-side lifecycle fix, not live Supabase authorization.
- Manual: deploy the reviewed files together and verify normal owner sign-in
  and recovery with the existing account. Never publish owner credentials.

### 2. Preserve password recovery when an older reset-email request completes

- Checked: delayed reset-email response after a password recovery auth event.
- Wrong: the reset-email response replaced the newer “Set a new password”
  screen with “Check your email”, preventing completion of recovery.
- Changed: the reset-email request checks its client, auth generation and
  form before replacing the screen.
- Files: `admin.js`, `tests/admin-auth-races.cjs`.
- Tested: the new simulated reproduction failed before this guard; it passed
  afterwards and the recovery form remained visible.
- Result: **passed in simulated Chromium**. No real reset email was requested.
- Manual: real email delivery remains an owner/provider check.

### 3. Include leads in the full private backup

- Checked: the advertised business-record export against the private tables
  used by the current app.
- Wrong: the export included eight tables but omitted `leads`; opportunities,
  follow-up notes and recorded lead receipts therefore were not in that backup.
- Changed: `leads` is the ninth exported table. Export also checks that the
  original client/auth generation remains current before downloading. Any
  failed table read reports an error and prevents a partial download.
- Files: `admin.js`, `tests/admin-auth-races.cjs`.
- Tested: a fabricated saved lead appears in the downloaded JSON; it has nine
  tables and excludes the mock connection key and mock auth account ID. A
  simulated leads read failure displayed an error, re-enabled Export and
  produced no download.
- Result: **passed in simulated Chromium**. A private export is not an
  automatically restorable backup or a transactionally consistent snapshot.
- Manual: another/older Supabase project must complete
  `supabase/04_lead_tracker.sql` before using the full export. The current
  project's live schema verification is covered by the database audit, not
  these simulated browser tests. Keep exports private.

### 4. Use appropriately sized logo assets on auth and private app screens

- Checked: dynamic logo image references in `authCard()` and `shell()`.
- Wrong: both small on-screen logos requested the large original `logo.png`.
- Changed: use the generated lossless `logo-160.webp` / `logo-320.webp` assets
  with responsive source selection, original aspect ratio and async decoding.
  Existing branding and CSS size are retained.
- Files: `admin.js`; the assets are generated/documented by the performance
  audit.
- Tested: both referenced files exist, and the simulated browser auth screens
  and dashboard render during the focused suite without page errors. Exact
  transfer-size/browser asset checks are covered by the performance audit.
- Result: **syntax and browser rendering checks passed**; no claim of a
  measured production speed improvement is made here.
- Manual: deploy the two WebP assets alongside `admin.js`.

### 5. Correct calculator money arithmetic and excessive discounts

- Checked: all five service options, required/invalid inputs, travel/materials/
  other costs, quarter-hour labor, £5 rounding, discounts and recalculation.
- Wrong: £79.93 materials + £11.21 travel + £8.86 labor totals exactly £100,
  but floating-point arithmetic rounded that quote up to £105. A discount
  greater than the quote also displayed a negative customer quote.
- Changed: valid monetary inputs are converted to integer pennies. Labor
  targets use integer quarter-pennies to preserve quarter-hour fractions before
  £5 rounding. Excessive discounts display an error and clear the invalid
  estimate; a fully discounted £0 quote remains valid with the existing warning.
- Files: `admin-tools.js`, `tests/admin-tools.cjs`.
- Tested: the £100 example and excessive-discount regression failed before
  the fix and passed afterwards. Actual service floors match the current
  built-in public prices (£45/£30/£30/£30/£35). Inputs, normal rounding,
  discounted return-per-hour calculations, edits and tab reset were exercised.
- Result: **passed in simulated Chromium**. Calculator output remains a
  planning guide, and does not save quotes or confirm offer availability.
- Manual: owner still reviews real job scope/costs before agreeing a quote.

### 6. Keep clipboard replies safe when the owner leaves the tab

- Checked: reply templates, placeholder/blank rejection, edited WhatsApp draft,
  copy success, copy denial and pending clipboard operations during navigation.
- Wrong: a denied clipboard request after leaving Reply drafts dereferenced a
  removed input and caused `Cannot read properties of null (reading 'focus')`.
  A late successful copy also showed an irrelevant toast on the newer screen.
- Changed: clipboard completion retains references to the original controls
  and only updates them or the toast while they remain connected and their
  auth generation is current.
- Files: `admin-tools.js`, `tests/admin-tools.cjs`.
- Tested: the denied-copy/navigation case reproduced the page error before
  fixing; rejected and successful pending copies passed afterwards. Ordinary
  copy passed, and a denied copy selected the text with manual-copy guidance.
- Result: **passed with simulated clipboard outcomes**, with no page errors.
- Manual: clipboard permissions on a physical iPhone remain a device check.

### 7. Give a fallback when WhatsApp popup opening throws

- Checked: valid edited message encoding, popup arguments, manual-send copy and
  a browser popup exception.
- Wrong: an exception from `window.open()` was uncaught and gave no usable
  recovery guidance.
- Changed: display a message instructing the owner to copy/paste into the
  customer's chat and press Send.
- Files: `admin-tools.js`, `tests/admin-tools.cjs`.
- Tested: the simulated popup failure produced an uncaught error before fixing;
  afterwards it displayed the fallback and produced no page error. Normal
  opening preserved the exact edited draft and continued to require manual Send.
- Result: **passed with a simulated popup**. No real WhatsApp message was sent.
- Manual: installed WhatsApp/Safari behavior on the owner's iPhone remains a
  physical-device check.

## Other inspected behavior

Code inspection found the existing customer, job, expense and lead text rendering
uses HTML escaping; contact links constrain phone/email formats; gallery images
require HTTPS and approved hosts; the public connection validator rejects
secret/service-role/sign-in keys. Backend writes require approved admin state
and exactly one confirmed saved row, and new private records keep retry IDs.
These observations concern the code. Actual server permission/security results
belong to the separate Supabase audit.

Money calculations use integer pennies and distinguish final completed-job
revenue from received lead payments. Scotland job times handle missing/ambiguous
clock-change times. Reply tools open drafts and require the owner to send;
checklist ticks intentionally reset when leaving the screen. No changes were
needed in `admin-business.js` or `admin-leads.js` from this inspection. The
focused tools suite clicked every checklist box, verified progress/unchecking,
and verified navigation resets. All three tools tabs fit 320px and 393px
viewports. Leads/Website shortcuts and the public configuration download were
also exercised; the password-change link's destination was checked, with its
actual auth flow covered by the existing business suite.

The calculator still uses the built-in five service floors. Those match the
current public fallback; changing CMS prices later also requires reviewing
calculator floors. Published CMS price adaptation is not implemented here.

## Commands actually run

`node tests/admin-auth-races.cjs`: **11 PASS results**, exit code 0, using
Playwright and `/usr/bin/chromium`. The check intercepts every remote request;
it does not contact live Supabase.

`node tests/admin-tools.cjs`: **14 PASS results**, exit code 0, using the same
browser and remote interception. Popup/clipboard outcomes and record reads are
simulated. No real customer contact or database mutation occurred.

`node --check` on `admin.js`, `admin-business.js`, `admin-tools.js`,
`admin-leads.js`, `tests/admin-auth-races.cjs` and `tests/admin-tools.cjs`:
**passed**, exit code 0.

`git diff --check`: **passed**, exit code 0 at the time this report was written.

Current Supabase changelog and `auth.onAuthStateChange` documentation were
checked, including the documented danger of awaiting Supabase APIs inside an
auth callback. The callback remains synchronous and makes no Supabase API call.

The root project audit runs and records the final full mocked business suite,
live anonymous/read-only checks, deployed-versus-local distinctions and Notion
logging status separately.
