# Customer browser audit — 9 October 2026

The final local code passed **58/58 customer browser checks** at 14:33:40 UTC. The existing live deployment at `https://www.rmsmalljobs.co.uk` passed **53/56 comparable checks** at 14:29:38 UTC. The three live failures below are fixed and verified locally. These local results do not establish that a deployment has occurred.

Evidence: [final local results](evidence/browser-audit/local-results.json), [live baseline results](evidence/browser-audit/live-baseline-results.json), [33 passing simulated business regression scenarios](evidence/browser-audit/business-mock-results.json).

## What was actually exercised

| Scope | Genuine result | Limits |
| --- | --- | --- |
| Homepage, next steps, signed-out private app | HTTP success, working assets after lazy loading, no horizontal overflow at 320×568, 375×667, 393×852, 430×932, 768×1024, 1440×900 and 852×393 | Chromium with touch/mobile viewport emulation; not physical Safari |
| Customer navigation | All five mobile navigation entries, home/header/hero section links, same-site link destinations and hash targets passed | External phone/email destinations were captured without contacting anyone |
| Mobile menu | Open, Escape/focus restoration, outside dismissal, desktop resize reset, landscape final link accessibility passed locally | Original live menu fails outside dismissal and clips its last item in landscape |
| Services | All six cards selected with Enter, service hint/focus, clear choice, and published CMS selection passed | Published CMS fixtures are simulated, never saved to the real database |
| Enquiry | Whitespace rejected; correctly encoded recipient/message; explicit manual-send explanation; retry preserves draft; edit retains typed fields; popup exception leaves retry available | Browser handoff intercepted. No WhatsApp message, email, call or real enquiry insert attempted |
| Disabled JavaScript | Visible phone/WhatsApp fallback and hidden nonfunctional form on homepage; next steps contact route remains usable | No browser script execution in these checks |
| Contact consistency | Customer phone, email and WhatsApp destinations agree across pages | Carrier, mailbox and WhatsApp receipt were not tested |
| Signed-out admin | Sign-in shown without private navigation, dashboard figures or business records | No real owner login, password email or authenticated customer reads |
| Public CMS | Real anonymous RPC returned HTTP success with `published:false`; complete fallback site shown | No actual published content changed; published behavior checked with isolated test fixtures |
| Errors/assets | No uncaught JavaScript errors, console errors, failed requests or HTTP error responses in final local and live baseline runs | Browser transport uses the verified proxy path described below |
| Private business app regression | 33 existing simulated scenarios passed, including admin authorization, CRUD, read/write failures, publication, account recovery and export | All records/auth are mock data; zero real Supabase requests in this suite |

## Meaningful changes and their verification

The production edits were made by the main audit and platform agents; this browser audit discovered/reproduced issues and verified the combined code.

| What was checked | What was wrong | Change and files | Actual verification | Manual work |
| --- | --- | --- | --- | --- |
| Menu at 852×393 and outside-click/resize behavior | Last WhatsApp entry clipped outside the live viewport; menu stayed open on outside click | Constrain menu height, allow scrolling, outside dismissal, reset state on desktop resize; `index.html` | Live failures reproduced; final local assertions passed | Recheck the deployed revision on an iPhone |
| Enquiry text fields and phone-sized usability | No input length bounds | 80/100/2000 character limits and explicit website-does-not-save explanation; `index.html` | All bounds matched; each input font at least 16px; whitespace/encoding/retry/edit tests passed | Send and confirm one genuine enquiry manually if checking WhatsApp receipt |
| Published service/area SEO | Built-in prices would remain in metadata after CMS content changed | Derive homepage title/description/sharing metadata from published services/areas; `public-cms.js` | Synthetic £99 service/Wishaw fixture rendered; stale £45/£30 metadata absent; structured telephone/area data matched fixture | Verify search indexing after deployment; JavaScript metadata changes do not guarantee every crawler executes them |
| Long published CMS questions/answers and selected service | An unbroken question expanded FAQ details to 1975px at 320px; selecting a long service expanded quote form to 1661px | Text wrapping and grid minimum-width fixes; `index.html` | Final 320/375/393 checks passed, including selected service hint | None for this fix |
| Image payload/loading | Existing live logo loaded 694840 bytes and favicon 88426 bytes | Responsive WebP logo and smaller favicon, supplied by PWA audit; `index.html`, `admin.html`, `thank-you/index.html`, image assets | All visible images loaded and rendered at all seven viewports; resource evidence shows `/logo-160.webp` and `/favicon-32.png` on final mobile homepage | Real-device loading speed should be checked after deployment |
| Repeatable audit evidence | No comparable customer browser regression script | Added `tests/production-audit.cjs`, this document and sanitized evidence | Final script exited 0 with 58/58 passed; live script exited 1 with three recorded baseline failures | Re-run after deployment or future changes |

## Screenshots inspected

[Final mobile homepage](evidence/browser-audit/home-mobile.png), [desktop homepage](evidence/browser-audit/home-desktop.png), [mobile next steps](evidence/browser-audit/next-steps-mobile.png), [signed-out admin](evidence/browser-audit/admin-signed-out-mobile.png), [synthetic long CMS text](evidence/browser-audit/long-cms-mobile.png).

## Enquiry delivery boundary

The current website creates a WhatsApp draft. It does not submit an enquiry to Supabase, and it cannot confirm whether the customer tapped Send or whether RM Small Jobs received the message. No database-delivery result is claimed. Customer details stay in the current page until the customer opens/sends the WhatsApp draft; reloading clears the form. The draft-retention check records `retained:false` as an observation, not a passing persistence feature.

The highest-value next development is a secure, spam-resistant enquiry intake that confirms a stored enquiry and makes it visible in the owner's private app. Verify the complete website → backend → database → owner workflow with clearly labelled test data before advertising guaranteed website submission.

## Reproduction and environment limits

From the repository:

```sh
node tests/production-audit.cjs
RM_AUDIT_LIVE=1 RM_AUDIT_OUTPUT=/tmp/rm-production-audit-live node tests/production-audit.cjs
node tests/business-system.cjs
```

The test script intercepts `window.open`, phone/email protocol handlers and popup links. It blocks every real mutation request except the existing read-only `rm_public_site` RPC. Headers and API keys are not recorded. Fixtures contain reserved test phone numbers and `example.invalid` email addresses.

The managed environment requires explicit network permission for listening on localhost and accessing its session proxy. Direct Chromium HTTPS initially failed because its certificate store did not trust the environment proxy. Automatic approval rejected adding the proxy CA to the persistent browser profile because that would broaden trust outside this audit. No persistent browser trust change was made. The successful runs fetch intercepted network resources through Playwright's Node request path, the configured proxy and the already configured CA trust, with TLS verification enabled. Browser TLS behavior itself was not tested by this transport. Synthetic/local timing numbers are observations, not a Lighthouse score or real-iPhone performance measurement.

Native iPhone home-screen installation/standalone behavior, Safari keyboard and real WhatsApp receipt still require a physical-device check. The PWA/security/deployment audit records cover those independent concerns. No money was spent, real customer records changed, password emails sent or business messages transmitted by this suite.
