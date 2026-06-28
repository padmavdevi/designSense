# designSense — Design Intent

**Version:** 1.0  
**Product:** designSense  
**Scope:** Full experience — landing page + audit panel + detection engine

---

## 1. What This Is

designSense is a browser bookmarklet that audits AI-generated HTML and React prototypes for dark patterns and usability issues. It runs entirely inside the user's browser, produces instant findings with actionable fixes, and shares zero data with any server.

It exists because AI-generated UI is fast to produce and frequently ships without a design review pass. The patterns that harm users — fake urgency, hidden costs, guilt-based dismissals — appear as readily in AI output as they do in deliberately deceptive design. designSense gives the designer or developer a single click to catch those problems before a prototype becomes a product.

---

## 2. Who It Is For

**Primary:** Product designers and UX engineers using AI tools (Figma AI, v0, Bolt, Lovable, Cursor) to scaffold prototypes. They produce HTML fast and need a fast feedback loop on ethical and usability quality.

**Secondary:** QA engineers and developers doing a design review pass before handoff. They want a structured report, not an opinion.

**Not for:** Security auditors, accessibility specialists (no ARIA deep-scan), or performance engineers. The tool's scope is intentionally narrow.

---

## 3. Core Constraints That Shaped Every Design Decision

These are non-negotiable. Every UX and technical decision flows from them.

| Constraint | Reason |
|---|---|
| No backend | Users must be able to trust it with proprietary prototypes |
| No network calls | Proof of no-exfiltration must be verifiable in DevTools |
| No eval() | eval() is a security surface; its absence is auditable |
| No CDN dependencies | Loading from a third-party CDN at runtime would be an attack surface |
| Works from file:// | Designers often open local HTML files directly — no server required |
| Open source | Transparency is the trust mechanism, not a promise |

The product's tagline "No Data Sharing · No Backend" is architecture, not marketing copy.

---

## 4. The Two Surfaces

designSense has two distinct surfaces that a user moves through in order.

### 4.1 Surface 1 — Landing Page (`index.html`)

**Purpose:** Install and educate. The only user action that matters here is dragging the bookmarklet to the bookmarks bar.

**Design decisions:**

**Single CTA, immediate.** The bookmarklet button is the first actionable element after the headline. Everything else — stats, how-it-works, what-it-checks — exists to earn trust *after* the CTA, not before it. Users who already trust it can drag immediately without scrolling.

**Stats strip as proof, not decoration.** The four-cell horizontal grid (27 dark patterns / 10 heuristics / 0 data shared / 0 backend needed) uses the same numeric boldness as a financial dashboard. The zeros for "Data Shared" and "Backend Needed" are the most important numbers on the page. They confirm the core constraint before the user reads a sentence of explanation.

**Eyebrow sets the context without polluting the headline.** "For AI-generated prototypes & designs" is set in small muted text above the H1. The H1 ("Catch dark patterns & usability issues before you ship.") carries the value proposition; the eyebrow narrows the audience without cluttering the primary message.

**Three-step row, not a section.** The installation steps (drag / open prototype / click) are rendered inline below the CTA button as a 12px metadata row — not a dedicated section with icons. They answer the question "what do I actually do?" without asking the user to scroll.

**CSP warning inline.** Some sites block bookmarklets via Content Security Policy. Rather than hiding this or putting it in an FAQ, the warning lives directly below the CTA as a small amber note. Users who hit this edge case were informed before they were frustrated.

**`data-ds-ignore` on the checks section.** The "What it checks" section lists every dark pattern by name. When designSense runs on its own landing page, it must not flag these descriptions as live design patterns. The `data-ds-ignore` attribute on the section is the explicit escape hatch — an architectural decision surfaced as an HTML attribute.

**Favicon from data URI.** The shield icon in the bookmarks bar uses an inline SVG data URI rather than an external `favicon.svg` file. External favicon requests fail from `file://` protocol pages. The data URI approach makes the favicon work without a server.

---

### 4.2 Surface 2 — Audit Panel (bookmarklet)

**Purpose:** Instant analysis of a live page. The panel appears on any site the user navigates to, surfaces issues by severity, and links each finding to an actionable fix.

**Design decisions:**

**Shadow DOM isolation.** The panel is injected into a Shadow DOM host attached to `document.body`. This means the target page's CSS cannot affect the panel's appearance, and the panel's CSS cannot pollute the target page. The tool's presence is completely contained. The target page's DOM is read-only — nothing is written to it.

**Toggle on second click.** Clicking the bookmarklet a second time removes the panel. This makes the bookmarklet feel like a mode toggle rather than a one-shot injection. Users who want to compare before/after can dismiss and re-run without refreshing.

**Accordion minimize to bottom.** When minimized, the panel collapses to a single header bar and repositions to `bottom: 0` of the viewport. This keeps it accessible without blocking the page under review. The broken-square icon communicates "collapse" rather than "close" — the user is reducing, not discarding.

**Severity cascade.** Every issue carries one of four levels: Critical → High → Medium → Low. The cascade is not decorative — Critical findings (trick questions, hidden costs appearing in checkout) are things that can cause measurable financial harm to users. Low findings (comparison prevention, cuteness patterns) are real but unlikely to cause immediate harm. Severity drives triage, not just ranking.

**Every finding has a fix.** Each issue card includes a `recommendation` string — a specific, actionable instruction. The intent is that a developer reading the panel should be able to fix the issue without leaving the tab.

**Element jump.** Each issue card identifies its source DOM element. Clicking the finding highlights the element on-page so the reviewer can see exactly what triggered it in visual context.

**JSON export.** The full report is exportable as structured JSON. This supports async review workflows — a designer runs the scan, exports the JSON, and attaches it to a Jira ticket or design review doc.

---

## 5. Detection Engine Design

The audit engine is the core of the product. Its design has two distinct problems to solve: *what to check* and *when to flag*.

### 5.1 What to Check

**Dark patterns — 27 checks across 7 academic categories**  
Source: De Souza & Avelar (2021). Categories: Urgency, Scarcity, Social Proof, Nagging, Obstruction, Sneaking, Interface Interference, Forced Action.

Each category maps to patterns that have observable DOM or text signatures. A countdown timer with `[class*="countdown"]` is reliable. A "limited time offer" string in a banner is reliable with context. A heading that says "Urgency" is not a pattern — it is a label.

**Nielsen heuristics — 10 checks via DOM and CSS inspection**  
Source: Nielsen Norman Group's 10 Usability Heuristics.

Heuristics are split by detection confidence:
- **High confidence** — H1 (loading states), H3 (user control), H4 (heading hierarchy), H5 (error prevention), H6 (recognition), H8 (WCAG AA contrast) — reliable DOM and CSS queries
- **Best effort** — H2 (real-world language), H7 (flexibility), H9 (error recovery), H10 (help) — text heuristics that require contextual judgement by the reviewer

### 5.2 When to Flag — The Context Gate

The scanner's hardest design problem is false positives. Text-based checks are powerful but naive: a page *about* dark patterns contains every keyword the scanner looks for.

The solution has two layers:

**Layer 1 — `data-ds-ignore`**  
Any element can carry `data-ds-ignore`. The scanner skips all text nodes that descend from a `[data-ds-ignore]` element. This is the explicit opt-out — used on designSense's own "What it checks" section, and available for any page that contains reference or documentation content.

**Layer 2 — `contextSelector` parameter on `scanText`**  
Every text-based check passes a CSS selector list describing what a *live UI component* looks like for that pattern type. The check only fires if the matched text is inside one of those selectors.

```
Fake Urgency    → button, banner, CTA, offer, checkout, countdown, dialog
Fake Scarcity   → product card, stock/inventory, cart, shop/store
Confirmshaming  → button, dialog, modal, newsletter/subscribe UI
Hidden Costs    → checkout, cart, order summary, billing
Trick Wording   → pricing, plan, offer, promo, cart, CTA
Sneaking        → offer, promo, deal, price, checkout, plan
Fake Social     → hero, banner, testimonial, metric counter
Currency        → store, shop, game, purchase, reward, market
Addictive       → dialog, modal, permission prompt, notification
```

The rule: if the text "hurry, act now" appears in a `<p class="cta-banner">`, that is a design pattern. If it appears in an `<li class="dp-list">`, it is documentation. The scanner knows the difference.

---

## 6. Visual Design Language

The landing page uses a minimal, high-credibility aesthetic. The intent is to feel like a professional tool, not a startup marketing page.

### Color

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0a0a0a` | Primary text, dark UI elements |
| `--ink-mid` | `#374151` | Body text |
| `--ink-muted` | `#6b7280` | Metadata, hints, labels |
| `--surface` | `#ffffff` | Default background |
| `--surface-2` | `#f9fafb` | Alt section background |
| `--border` | `#e5e7eb` | Dividers, card borders |
| `--accent` | `#6366f1` | Indigo — links, badges, logo accent |
| `--accent-dk` | `#4338ca` | Hover states, emphasis |

Severity colors (`--critical`, `--high`, `--medium`, `--low`) are used only in the issue report panel and the "What it checks" tags. They do not appear in the landing page chrome — mixing severity red into navigation or hero elements would undermine trust.

### Typography

- H1: `clamp(40px, 6vw, 64px)`, weight 800, tracking `-.03em` — scales fluidly between mobile and large desktop
- Body: 15px base, 1.6 line-height
- Labels, metadata: 11–13px, weight 500–700, letter-spacing positive
- No custom typefaces — system-ui stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`) for zero render cost and native platform feel

### Structural Grid Patterns

**Bordered horizontal grid** — used for stats, how-it-works steps, privacy cards. Each cell has a right border; the last cell drops it. This pattern communicates parallel, equal-weight items without requiring background fills or shadows. It is the same visual grammar used by Stripe, Vercel, and Linear for feature grids.

**Auto-fill card grid** — used for dark pattern categories. `grid-template-columns: repeat(auto-fill, minmax(185px, 1fr))` — responsive without breakpoint management. Works equally at 320px and 1600px.

**Two-column heuristic grid** — fixed two-column on desktop, single column on mobile. Each item is a labeled item with a badge and an em-dash definition format. The em-dash format is a deliberate pattern — it signals documentation, and the scanner uses the presence of badge + em-dash as a signal to skip list items.

### The Logo

`design` in regular weight, `Sense` in accent color. No icon. The icon (shield + user + checkmark) is reserved for the bookmarklet button and favicon — it is the *tool*, not the *brand*. Mixing the icon into the wordmark would conflate the two identities.

### Severity Badges

Five badge types: `.critical`, `.high`, `.medium`, `.low`, `.hc` (high-confidence heuristic), `.be` (best-effort heuristic). Pill shape (border-radius 10px), color-coded backgrounds at 20% opacity with fully saturated foreground text. The badge system is shared between the landing page's "What it checks" grid and the audit panel's issue cards — same semantic layer, two surfaces.

---

## 7. Privacy Architecture as Design

Privacy is not a section in this product — it is the architecture. The design decisions that enforce it:

- **No `<script src>` tags** — no third-party code loaded at any point
- **No `fetch` or `XMLHttpRequest`** — verified by the absence of network calls in DevTools
- **No `eval()`** — the bookmarklet is a fully self-contained IIFE; dynamic execution is structurally impossible
- **No cookies, no localStorage writes** — the tool reads DOM state and exits; it leaves no trace
- **Shadow DOM** — panel injection does not persist after the user dismisses it or navigates away
- **ES5 in embedded bookmarklet** — the `<script type="text/plain">` block uses ES5 to maximize cross-browser compatibility without a transpile step

The Privacy section on the landing page is intentionally placed last — after the user has seen what the tool does and decided to install it. By that point, the privacy architecture is a confirmation, not a sales pitch.

---

## 8. What This Is Not

Scoping constraints matter as much as scope:

- **Not an accessibility auditor.** It checks WCAG AA contrast and some heuristics adjacent to accessibility, but it does not replace axe, Lighthouse, or a screen-reader pass.
- **Not a security scanner.** Shadow DOM isolation protects the tool's own panel; it does not audit the target page for security vulnerabilities.
- **Not a grammar or content checker.** Copy quality, tone, and brand consistency are out of scope.
- **Not persistent.** The tool has no memory of prior scans. Each click is a fresh, independent audit of the current DOM state.
- **Not a substitute for user research.** It detects structural patterns that correlate with known deceptive or usability-degrading designs. It cannot detect patterns that only emerge in observed user behavior.

---

## 9. Guiding Principles

These five principles governed every design and engineering decision in the project.

**1. Zero friction, zero trust required**  
One drag to install. No account, no email, no OAuth. Users should not need to trust designSense — they can inspect every line of its source before dragging it.

**2. Architecture enforces the promise**  
"No data sharing" is not a policy statement — it is a structural fact. If the architecture cannot enforce it, the promise is not real.

**3. Context-aware, not keyword-aware**  
The scanner detects patterns as design decisions in live UI, not as words appearing anywhere on a page. A page *describing* dark patterns is not a page *using* them. The detection engine must know the difference.

**4. Every finding has a fix**  
A finding without a recommendation is an accusation. Every issue the tool surfaces includes a specific, actionable instruction. The designer reading the panel should be able to act without additional research.

**5. Severity is information, not alarm**  
Critical findings are not styled to provoke panic — they are styled to enable triage. The goal is a calm, structured review, not an anxiety-producing wall of red.
