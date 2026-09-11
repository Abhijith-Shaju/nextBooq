---
target: frontend/src/app/(control-plane)/page.tsx
total_score: 20
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
timestamp: 2026-08-28T14-09-52Z
slug: frontend-src-app-control-plane-page-tsx
---
Method: dual-agent (A: general-purpose design review · B: general-purpose detector/browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Contact form has spinner/toast; no field-level state |
| 2 | Match System / Real World | 2 | Hero now nails café-owner language, but About/CTA-panel/metadata revert to diner-facing copy |
| 3 | User Control and Freedom | 3 | No traps, standard nav |
| 4 | Consistency and Standards | 2 | Audience-voice split (hero vs. About); desktop "Log in" still hidden behind an unlabeled icon while mobile shows it as text |
| 5 | Error Prevention | 2 | Contact form still has no email-format validation, only non-empty check |
| 6 | Recognition Rather Than Recall | 3 | Icons + labels throughout |
| 7 | Flexibility and Efficiency | n/a | Marketing surface |
| 8 | Aesthetic and Minimalist Design | 3 | Hero is disciplined now; About is a bit copy-dense but not cluttered |
| 9 | Error Recovery | 2 | One generic error banner, not tied to the specific field |
| 10 | Help and Documentation | n/a | Marketing surface |
| **Total** | | **20/32 (62.5%)** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment**: The hero fix landed cleanly — badge, headline, sub-tagline, and pills all now speak directly to a café owner buying software. But the fix was scoped to the hero only, and the rest of the page wasn't touched. AboutSection.tsx reverts to diner-facing language ("delight guests from the first tap to the last sip," "Guest experience first," "give your guests a booking experience as good as the coffee"). The page's meta description has the same split: title says "for Modern Businesses" (owner-facing) while the description still promises "unforgettable guest experiences" (diner-facing) — and that description is often the first thing a prospective owner reads, in a Google snippet or shared link, before the corrected hero ever loads.

**Deterministic scan**: clean — `[]`, exit 0, same as the first run.

**Browser evidence**: screenshots still weren't obtainable in this environment (confirmed independently again), but live page text was pulled directly and confirms the new hero copy is genuinely live ("Reservation software for café owners," "Never Lose A Table Again.", the four owner-facing pills), with no occurrence of the old copy anywhere. No horizontal overflow at 375px mobile width. Console showed repeated 500s on `/api/v1/auth/me` — a known environment artifact (backend not running in this critique session), not a page defect.

## Overall Impression

Real progress — the single highest-visibility problem (the hero) is fixed and verified live. But it's a half-finished pivot: a café owner who feels "this is for me" in the hero gets re-confused one scroll later when the page starts talking about their guests again. The fix needs to follow through to About and the metadata to actually close out the original finding.

## What's Working

- The hero rewrite is well-executed and verified live — not just source-level, actually rendering with the new copy.
- Accessibility basics are handled with care in places that often get skipped (44×44px mobile tap targets, `aria-expanded`/`aria-controls`, `aria-labelledby`).
- The visual system (blob motif, glass cards, wave divider) stays consistent and on-brand rather than reading as a generic template.

## Priority Issues

**[P1] Audience voice is inconsistent past the hero — About section and metadata still speak to/about the diner.**
Why it matters: this is the same class of problem the last critique flagged, now half-fixed: the hero pivoted, the rest of the page didn't. A café owner re-encounters "this page talks about my customers, not to me" one scroll past the hero.
Fix: rewrite About's value props and CTA panel around owner pain points (fewer no-shows, staff time saved, payout reliability); align the metadata description with the owner-facing title.
Suggested command: /impeccable clarify

**[P1] Desktop "Log in" is still hidden behind an unlabeled icon; mobile shows it as visible text.**
Why it matters: unchanged from the first pass — a returning café owner (the actual target user) has no textual login affordance on desktop.
Fix: surface a visible "Log in" text link/button next to "Get Started" on desktop, matching mobile.
Suggested command: /impeccable clarify

**[P1] Contact form still has no real field-level validation.**
Why it matters: only a non-empty check; no email-format validation, no per-field error, no aria-invalid/aria-describedby linking the error to the input.
Fix: add type="email" pattern validation client-side and per-field inline error states.
Suggested command: /impeccable harden

**[P2] Metadata description contradicts the page's own hero and title.**
Why it matters: this is often the first thing a prospective owner reads (Google snippet / shared link preview) — first impression risk.
Fix: align description with the hero's owner-facing pitch.
Suggested command: /impeccable clarify

**[P3] No reassurance microcopy near the final CTA** (pricing, setup time, no-credit-card) before the highest-stakes action on the page.
Suggested command: /impeccable clarify

## Persona Red Flags

**Jordan** (confused first-timer café owner): Reads the hero, believes "this is for me," then hits "Guest experience first" in About and re-second-guesses whether this is actually a diner-facing tool.
**Casey** (distracted mobile user): Long scroll with two near-identical "Get Started" CTAs and no quick pricing/setup-time answer.
**Riley** (stress-tester): Contact form still accepts a garbage email string client-side with no inline warning.

## Minor Observations

- Nav has no "Pricing" or "Features" anchor — conspicuous for a SaaS trying to convert a skeptical buyer.
- "Secure Razorpay Payouts" name-drops the payment processor directly — fine for India-market credibility, worth a quick check against Razorpay's brand-usage guidelines.

## Questions to Consider

- Was About intentionally left as a follow-up, or should "fix the hero" have meant "fix the whole page's audience voice"?
- Is desktop "Log in" being deliberately de-emphasized as a growth funnel tactic, and is that worth the cost to returning users?
- With no pricing anywhere on the page, is "Get Started" (full registration) really the right primary CTA, or would "See pricing" convert better first?
