# RM Small Jobs enquiry improvement — 7 October 2026

Implemented and checked on `improve-enquiry-journey`. The owner authorised publication on 7 October 2026 through the existing GitHub Pages deployment from `main` at the repository root. Deployment verification is recorded separately with the release evidence.

## What changed

- Homepage, service cards, metadata and structured data now use the current prices and core areas recorded in `launch-playbook.md`: TV mounting from £45; shelves, furniture assembly and small household jobs from £30; light garden tidy-ups from £35. Core coverage is Motherwell, Wishaw and Bellshill; other locations need agreement.
- Preserved the existing static GitHub Pages site, logo, QR code and WhatsApp enquiry route. No backend, payment system or paid service added.
- Replaced the customer’s “I’ve sent my request” confirmation button with “What happens next?”. The site cannot verify WhatsApp delivery. Both the inline instructions and existing `thank-you/` page say that the customer must press Send, that an enquiry is not a booking, and that no payment is taken here.
- Kept a retry link containing the prepared message, phone fallback and an edit option which retains entered details. Repeated form or shortcut taps retain the current draft instead of opening another draft. The mobile quote action is in the sticky header so it does not cover page content.
- Hid the form until its JavaScript handler is attached, preventing a fallback GET submission from placing enquiry details in the website address. With JavaScript disabled, WhatsApp and phone links are shown instead.
- Improved button contrast, form-label readability, smaller service notes, focus outlines, mobile menu state, tap targets and reduced-motion behaviour.

## Page optimisation

Following the owner's request to optimise the site, the same working copy now has a shorter page and warmer copy. The hero uses the existing tagline and a brief price guide; compact service cards retain all services and prices. Removed the repeated hero price panel, four trust tiles and separate tall process/coverage sections. A short “Hi, I’m Reece” introduction, three booking steps and the core coverage now share one section. The quote heading is “What needs doing?”. The next-steps page is also shorter while preserving its delivery and booking caveats.

Kept the existing logo and colours. The owner explicitly asked to preserve the logo: `logo.png` is byte-for-byte identical to the original Git version. Its 2190 × 1210 resolution exceeds what the site's 68–105 px display sizes need, including 3× phone displays; the aspect ratio is preserved. Following the request to remove its background, an inline SVG colour-matrix filter makes low-red navy pixels transparent in the browser while retaining the original white-and-orange artwork. The same mask applies to the header, footer and next-steps logo. No generated replacement artwork is used. No portrait, testimonials, customer numbers, insurance badge or launch offer was invented. The QR route remains available on desktop and is hidden on phone layouts. Added image dimensions to reserve space and lazy loading for below-the-fold images.

At a 393 × 852 viewport, the homepage is 3,469 px tall versus 7,266 px in the corrected local version before this optimisation: **52% shorter**. Visible main-content words fell from 612 to 362 (**41% fewer**). The quote section begins at 2,108 px rather than 5,222 px. These figures compare local versions; they do not measure conversion improvement or loading speed.

## Verification

Before publication on 7 October 2026, the live homepage and `/thank-you/` returned HTTP 200 and the homepage still showed the old prices. The configured custom domain is `www.rmsmalljobs.co.uk`.

Local Chromium checks exercised: required-field and whitespace validation; WhatsApp message encoding with multiple lines, £ and &; retry after a blocked opening; opening exceptions; repeated taps; editing and retained values; navigation to next steps and back; direct visits including an editable `?success=true` URL; JavaScript-disabled fallback; mobile menu opening/closing and Escape; and no horizontal overflow at 320, 393, 768 and 1280 pixels. Screenshots were checked at 393 × 852, an iPhone 15-sized viewport. No browser script errors were recorded. `git diff --check` passed.

The WhatsApp opening was intercepted using clearly labelled test details. No messages were sent and no external requests occurred in those local flow tests. Sending, actual receipt and installed iPhone WhatsApp behaviour remain unverified. Chromium at a phone-sized viewport is not Safari on a physical iPhone.

Existing phone and WhatsApp destinations were preserved and checked for consistency with source files. On 7 October 2026, Reece confirmed that the business contact email is x7reecex@gmail.com. The contact card, footer links and structured data now use that address. WhatsApp account reachability and email delivery were not independently tested. No launch offer was added because its current availability is unverified.

## Review and release

Review `index.html`, `thank-you/index.html` and the screenshots. The owner authorised publication of the reviewed changes, including the logo background mask. Publish to `main` through the existing GitHub Pages route, verify the matching deployment and recheck the live homepage, mobile journey and `/thank-you/`. Actual sending and receipt require a separately authorised real-device enquiry.

Local evidence is saved separately in `/workspace/rm-small-jobs-review/`, including the original checks and the final `optimised-checks.json`, `optimisation-metrics.json`, `optimised-mobile-home.png`, `optimised-mobile-first-screen.png`, `optimised-mobile-next-steps.png` and `optimised-desktop.png`. No private handover details were added to the repository.
