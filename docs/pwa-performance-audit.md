# PWA and performance audit — 9 October 2026

The code and assets below are present in the local working tree. Deployment of
these changes was not attempted during this part of the audit. Browser checks
used a local HTTP server and Chromium 151 at a 393 × 852 CSS-pixel viewport with
device pixel ratio 3. Public CMS configuration was disabled and the admin SDK
was replaced with an empty script for these asset/layout checks; they do not
verify Supabase, owner sign-in or customer enquiries. Those are separate audit
checks.

## Change record

### 1. Separate public and private home-screen configurations

- **Checked:** all three HTML page heads, app identity/start URL/scope, manifest
  resolution from the nested thank-you page, favicon and Apple icon declarations.
- **Wrong:** no manifest or Apple home-screen name/icon existed. The private
  business app could not declare a different app identity or launch page. Every
  page used the 88,426-byte 512-pixel icon as its browser favicon.
- **Changed:** added public `RM Small Jobs` and private `RM Small Jobs Business`
  manifests with distinct IDs, public `/` and private `/admin.html` start URLs,
  standalone display, navy theme and appropriate icon declarations. The private
  manifest has a narrow `/admin.html` scope. Added the `RM Business` Apple title
  for the owner app and `RM Small Jobs` for the public pages, a 32-pixel favicon,
  180-pixel Apple icon, 192/512-pixel app icons and a separately padded maskable
  icon. Artwork comes from the existing favicon. The manifest is public
  configuration and contains no private records, credentials or access grants.
- **Files:** `manifest.webmanifest`, `admin.webmanifest`, `favicon-32.png`,
  `icons/apple-touch-icon.png`, `icons/icon-192.png`, `icons/icon-512.png`,
  `icons/icon-maskable-512.png`, `index.html`, `admin.html`,
  `thank-you/index.html`.
- **Tested:** `node tests/pwa-assets.cjs` resolved each page's manifest/Apple/icon
  URLs, checked actual PNG header dimensions against declarations and verified
  distinct app identities, valid scopes and correct start pages. Chromium
  `Page.getAppManifest` fetched both manifests from the local server with zero
  parser errors. PNGs were also opened with Pillow and the icon artwork visually
  inspected.
- **Result:** the manifest/asset checks genuinely passed. No service worker was
  added; the browser reported zero registrations. Private/API/session content is
  not placed in an offline cache by this change.
- **Manual:** after publishing, install each app from its correct page on an
  actual iPhone and check the icon, displayed name and launch page. This audit
  has not confirmed physical-device installation or standalone behavior.

### 2. Reduce oversized logo and favicon requests

- **Checked:** image dimensions, original and derived file sizes, rendered logo
  slots and actual resource bytes in the mobile browser.
- **Wrong:** a 2190 × 1210, 694,840-byte logo was requested for slots only
  68–105 CSS pixels wide. The browser favicon was 88,426 bytes.
- **Changed:** produced 160 × 88 and 320 × 177 lossless WebP versions of the
  original logo; selected them through responsive image sources on public and
  private screens. Kept the original SVG cutout filter and the original
  artwork/QR files. Used a 32 × 32, 1,262-byte favicon in page heads.
- **Files:** `logo-160.webp`, `logo-320.webp`, `favicon-32.png`, `index.html`,
  `admin.html`, `admin.js`, `thank-you/index.html`.
- **Tested:** Pillow decoded both logos and confirmed their pixels exactly
  match the resized original before lossless compression. The repeatable Node
  check verifies lossless WebP file/header validity, preserved aspect ratio,
  transfer budget and original asset SHA-256 hashes. The browser decoded logos
  on the homepage, thank-you page and admin setup screen without broken images.
  At DPR 3, it selected `logo-320.webp` and measured 35,176 encoded bytes for the
  logo; the favicon request measured 1,262 encoded bytes. The 393-pixel thank-you
  screenshot was visually inspected.
- **Result:** genuinely passed. Logo transfer decreased by 94.9% and favicon
  transfer by 98.6% compared with their original files. These are measured asset
  bytes, not a claim that production load time or Core Web Vitals improved by
  the same percentage.
- **Manual:** publish all HTML/JavaScript and new assets together, then check
  their live URLs. No asset-only upload should leave the page references missing.

### 3. Allow content to clear device edges

- **Checked:** mobile viewport declarations, zoom permission, page width and
  header/footer/bottom-navigation spacing.
- **Wrong:** viewport declarations did not opt into safe-area-aware layout.
  Some edge padding did not account for a device notch/home indicator when
  launched from the home screen or used in landscape.
- **Changed:** added `viewport-fit=cover` and safe-area padding to public headers,
  content/footer, thank-you layout and private app header/content/navigation,
  while retaining browser zoom.
- **Files:** `index.html`, `admin.html`, `thank-you/index.html`.
- **Tested:** Node checked all three viewport declarations and the absence of
  zoom-blocking settings. Local Chromium mobile checks found no horizontal
  overflow on all three pages; the thank-you home button was clicked and
  returned to `/`. No page JavaScript exceptions occurred in this harness.
- **Result:** genuinely passed for the local 393-pixel browser checks. Desktop
  Chromium emulation does not reproduce an iPhone notch, keyboard, Safari status
  bar or home indicator, so their physical clearance remains unverified.
- **Manual:** check portrait and landscape on an actual iPhone, including an
  open keyboard, page scrolling and the signed-in admin bottom navigation.

## Repeatable evidence

`node tests/pwa-assets.cjs` passed ten checks. It uses built-in Node modules and
does not make network requests, install dependencies, write customer data or
access private sessions. `node --check tests/pwa-assets.cjs` and
`git diff --check` also passed after the edits.

The temporary browser harness was `/tmp/rm-pwa-check.cjs`; its session artifacts
were `/tmp/rm-pwa-results.json` and `/tmp/rm-thankyou-393.png`. These temporary
files are not committed or durable across a replacement workspace. The committed
production browser audit can verify the deployed page/asset requests separately.

An actual Chromium DevTools `PWA.install`/`PWA.launch` attempt in a temporary
browser profile completed those API calls for the public app, but the launched
headless page reported `matchMedia('(display-mode: standalone)').matches ===
false`. The standalone assertion **did not pass**. That attempt is not recorded
as confirmed installation behavior. The private app's actual installation and
both apps' physical iPhone home-screen launches remain unverified.

No service worker or offline mode is included. The business app continues to
require a network connection for authentication and records; adding an icon to
the home screen does not grant access or prove backend connectivity.

Original assets were compared with their committed versions and preserved:

| File | SHA-256 |
| --- | --- |
| `logo.png` | `8a85c3d2bb2a95270383777f180352a64e7c81012ff08b94e6ce09012c5025d1` |
| `favicon.png` | `e7dce898cd7f882597c0421368187bd1d4eda9f66ed5827d8f6350ee30ca4665` |
| `whatsapp-qr.png` | `5252d94382b0ab47e1df204ffa2a92f93926097e992eaa479b23c37556642b05` |

If branding or the WhatsApp QR is deliberately replaced later, update the
explicit preservation baseline in `tests/pwa-assets.cjs` after checking the new
artwork and destination.
