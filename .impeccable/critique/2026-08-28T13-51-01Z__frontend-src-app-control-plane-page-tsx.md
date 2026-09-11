---
target: frontend/src/app/(control-plane)/page.tsx
total_score: 18
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-08-28T13-51-01Z
slug: frontend-src-app-control-plane-page-tsx
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector/browser evidence, detector re-run in parent session after sub-agent's relative-path miss)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Contact form has a spinner/disabled state and error banner; no per-field validation state |
| 2 | Match System / Real World | 1 | Hero speaks guest-facing café language ("Coffee. The Best For You.") to a B2B buyer (café owners) |
| 3 | User Control and Freedom | 3 | Standard nav, mobile menu has explicit close; no dead-ends found |
| 4 | Consistency and Standards | 2 | "Log in" is a labeled link on mobile but hidden in an unlabeled icon menu on desktop; two different CTA button treatments |
| 5 | Error Prevention | 2 | Contact form email field only checks non-empty, not format — "asdf" passes client-side |
| 6 | Recognition Rather Than Recall | 3 | Icons paired with text labels throughout |
| 7 | Flexibility and Efficiency | n/a | Marketing/persuade surface, no power-user path expected |
| 8 | Aesthetic and Minimalist Design | 2 | Hero packs badge + quote mark + headline + subhead + CTA + 4 pills + photo + 2 floating cards + 4 animated blobs into the first viewport |
| 9 | Error Recovery | 2 | Contact form errors are one generic banner, not tied to the specific invalid field |
| 10 | Help and Documentation | n/a | Marketing/persuade surface |
| **Total** | | **18/32** | **Acceptable (56%)** |

## Design Specificity Verdict

**LLM assessment**: The hero reads as a generic coffee-shop template with a SaaS name pasted over it, not a page built to sell reservation software to café owners. The headline "Coffee. The Best For You." and feature pills ("Premium Beans," "Fast Service," "100% Organic," "Find Us Nearby") describe why a *diner* should visit a café — not why a *café owner* should buy booking software. The real product specificity does exist, but it's buried in the AboutSection ("table holds, walk-ins, and turn times that shift by the hour," "owners never overbook a table twice") — concrete, domain-literate copy that never makes it into the hero, which is the one section every visitor is guaranteed to read.

**Deterministic scan**: `detect.mjs --json` against `frontend/src/app/(control-plane)/page.tsx` and `frontend/src/components/marketing` returned `[]` — zero findings, exit code 0. The detector catches mechanical anti-patterns (not messaging/positioning problems like the one above, which is a judgment call outside its scope).

**Browser evidence**: Pixel screenshots weren't obtainable in this session — the Browser pane isn't visible/compositing in this environment (confirmed independently by both the sub-agent and a direct retry from this session). Real evidence gathered instead:
- **No horizontal overflow at 375px width** (mobile) — layout doesn't break at narrow viewports.
- **Repeated 500 errors on `GET /api/v1/auth/me`**, confirmed independently — but this is an environment artifact of this critique session (only the frontend dev server was running, not the backend), not a real product defect. Discount this finding.
- **Two `<main>` DOM landmarks detected** — investigated and confirmed as a Next.js Suspense/streaming fallback artifact (`hidden` parent, `id="S:1"`, zero-size second element), not an actual visual duplicate. A blunt a11y linter might flag this; a human wouldn't see it.

## Overall Impression

The page is competently built (clean detector scan, no layout breakage, working form interactions) but is pointed at the wrong audience in the one section that matters most. It's dressed as a coffee shop's own website when its actual job is convincing a café *owner* to adopt software — and the page only pivots to the real pitch after the hero, by which point a skeptical B2B visitor may have already decided this isn't relevant to them. The single biggest opportunity is simple: swap the hero's guest-facing coffee copy for the owner-facing software pitch that already exists (and is good) in the AboutSection.

## What's Working

- **AboutSection's value copy is specific and credible** — "table holds, walk-ins, and turn times that shift by the hour" and "owners never overbook a table twice" sound like they were written by someone who understands café operations. This is exactly the specificity the hero is missing.
- **The ambient blob-field motif is deliberately continued** across Hero → About → Contact, with documented rationale in code comments — genuine compositional thinking, not incidental reuse.
- **The contact form has real interaction polish**: icon-prefixed inputs, a loading spinner that swaps in on submit, disabled state, and toast + banner feedback on outcome.

## Priority Issues

**[P0] Hero sells coffee, not software, to the wrong audience.**
Why it matters: The headline and feature pills describe a café's own guest-facing pitch, not reservation software for the café owner who's the actual buyer here. This is the page's core job and it's currently missing it.
Fix: Replace the headline with an owner-facing value prop (e.g. "Never lose a table to a no-show again") and swap the pills for owner-relevant proof points (live table view, Razorpay payouts, no-show protection, minutes-to-set-up).
Suggested command: `/impeccable clarify` (copy) or `/impeccable shape` (if the hero's whole composition should be rethought around the new message)

**[P1] Visual hierarchy inverts message priority.**
Why it matters: The largest, boldest text on the page ("Coffee. The Best") is decorative filler; the real value proposition is a smaller paragraph underneath it. A scanning visitor absorbs the wrong headline first.
Fix: Make the actual software value proposition the h1; drop or shrink the "Coffee." framing.
Suggested command: `/impeccable layout`

**[P1] Contact form accepts invalid email addresses and gives only generic error messaging.**
Why it matters: The email field only checks for non-empty text ("asdf" passes client-side and gets submitted), and any validation failure shows one generic banner rather than pointing at the specific bad field.
Fix: Add `type="email"` pattern validation client-side and per-field inline error states.
Suggested command: `/impeccable harden`

**[P2] Desktop hides "Log in" behind an unlabeled icon; mobile shows it as a visible text link.**
Why it matters: A returning café owner has to guess that the circular icon opens a login option on desktop — no "Log in" text is visible anywhere in the desktop nav, while mobile shows it plainly.
Fix: Add a visible "Log in" text link next to the desktop CTA, matching mobile.
Suggested command: `/impeccable clarify`

**[P2] The page ends on a flat, CTA-less contact form, wasting the peak-end position.**
Why it matters: The last thing a scrolling visitor sees is an administrative form with no next-step framing, right after the page's actual emotional peak (the red "Bring nextBooq to your café" CTA panel) already happened mid-page.
Fix: Either reorder so Contact isn't the final beat, or add a "Get Started" CTA near the contact form so the page doesn't close on a low-energy note.
Suggested command: `/impeccable layout`

## Persona Red Flags

**Jordan (café owner, first-timer on this page)**: Lands on the hero, reads "Coffee. The Best For You." plus the four feature pills, and for several seconds can't tell if this is a café's own website or software being sold to *them*. The "Now accepting bookings" badge reinforces the wrong read (sounds like this business takes table bookings, not "our software handles bookings for your business"). Only reaches clarity once scrolling into the AboutSection.

**Casey (distracted mobile user)**: On mobile, the hero's circular photo, two floating product cards, four feature pills, badge, and decorative quote mark all stack into a long scroll before any real context registers — nothing collapses or simplifies at narrow widths, it's the same content just resized. A distracted scroller may bounce on the coffee-focused hero alone.

**Riley (stress-tester)**: Typing a non-email string into the contact form's email field and submitting is accepted client-side with no feedback until the async response returns. Three separate continuous CSS animations (`animate-blob-pulse` ×3 groups, `animate-float`) run across Hero/About/Contact with no `prefers-reduced-motion` guard anywhere — a motion-sensitive visitor gets no relief for the entire scroll.

## Minor Observations

- The decorative "❝" mark appears twice (hero and AboutSection), framing non-quote content once and an actual quote the second time — inconsistent use of the same visual device.
- The `Star` icon is used for "Premium Beans" — a rating icon paired with a quality claim is a slight mismatch, especially since the page just had its (fabricated) rating stat removed.
- No `prefers-reduced-motion` handling anywhere for the blob/float animations.
- Contact form's message textarea has no character limit or counter.

## Questions to Consider

- If a café owner can't tell within 3 seconds whether this is a coffee shop's site or software being sold to them, does keeping the latte photo and product cards (kept as-is per your earlier call) still make sense once the surrounding copy stops leaning into the coffee-shop aesthetic?
- The page's actual emotional peak (the red "Bring nextBooq to your café" panel) lands mid-page, before a low-energy contact form closes things out — was that ordering intentional, or just document order?
- There's no pricing or "how it works" anchor in the nav (`#about`, `#contact` only) — for a skeptical B2B buyer, is that a deliberate low-friction "just get started" funnel, or a gap worth filling?
