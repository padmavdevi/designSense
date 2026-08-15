# designSense

**Catch dark patterns & usability issues before you ship.**

A browser bookmarklet that audits AI-generated HTML and React prototypes for deceptive design patterns and usability violations — instantly, in your browser, with zero data leaving your device.

---

## What it does

Click designSense on any prototype and get an instant report covering:

- **27 dark patterns** across 7 academic categories (De Souza & Avelar, 2021)
- **10 usability heuristics** via DOM and CSS inspection (Nielsen Norman Group)
- **13 accessibility checks** — WCAG-adjacent, screen reader & keyboard access
- Severity level for every finding (Critical / High / Medium / Low)
- A specific, actionable fix for each issue
- One-click jump to the flagged element on the page
- Full JSON export of the report

---

## Install in 30 seconds

1. Open [the designSense page](https://design-sense.vercel.app)
2. Drag the **designSense** button to your bookmarks bar
3. Navigate to any HTML or React prototype
4. Click the bookmark — an audit panel opens instantly

Click it again to dismiss. No refresh needed.

---

## What it checks

### Dark Patterns (27 checks)

| Category | Patterns |
|---|---|
| Urgency | Countdown timer, Limited time message |
| Scarcity | Low stock message, High demand message |
| Social Proof | Activity messages, Testimonials |
| Nagging | Repeated interruptions |
| Obstruction | Roach motel, Intermediate currency, Immortal accounts, Price comparison prevention |
| Sneaking | Sneak into basket, Hidden costs, Bait and switch, Hidden subscription |
| Interface Interference | Trick questions, Confirmshaming, False hierarchy, Toying with emotion, Preselection, Hidden information, Disguised ad, Cuteness |
| Forced Action | Forced registration, Privacy Zuckering, Friend spam, Gamification |

### Nielsen's 10 Heuristics

Every one of Nielsen Norman Group's 10 heuristics is represented, per the [source PDF](https://www.nngroup.com/articles/ten-usability-heuristics/). Checks that map directly to a WCAG concern (contrast, labels, keyboard access, ARIA, etc.) are broken out into their own **Accessibility** category below instead of being buried inside a heuristic — so H8's checks, for example, all live there now.

| Heuristic | Detection |
|---|---|
| H1 System Status | Loading states, progress indicators |
| H2 Real World Match | Technical jargon in UI copy |
| H3 User Control | Confirmation on destructive actions |
| H4 Consistency | Button style consistency |
| H5 Error Prevention | Field types, required indicators |
| H6 Recognition | Breadcrumb navigation |
| H7 Flexibility | Search on long lists |
| H8 Aesthetics | Tracked under Accessibility |
| H9 Error Recovery | Generic error messages |
| H10 Help | Password hints, empty state guidance |

### Accessibility (13 checks)

Its own numbering series (A1–A13) — deliberately not H-numbers, since these are cross-cutting WCAG concerns pulled out of several different heuristics, not one heuristic's sub-checks.

| Check | Detection |
|---|---|
| A1 Live Regions | Form submits with no aria-live/status |
| A2 Heading Structure | Skipped levels, multiple H1s |
| A3 Keyboard Access | Clickable elements missing role/tabindex |
| A4 Radio Groups | Missing fieldset/legend |
| A5 Icon Labels | Icon-only buttons missing aria-label |
| A6 Field Labels | Placeholder used as the only label |
| A7 Skip Link | No skip-to-content link found |
| A8 Autocomplete | Missing on email/name/phone fields |
| A9 Color Contrast | WCAG AA text contrast ratio |
| A10 Type Scale | Too many distinct font sizes |
| A11 Color Palette | Too many distinct text colors |
| A12 Error Association | Errors not linked via aria-describedby |
| A13 Invalid Fields | aria-invalid with no visible error message |

---

## Privacy & Security

| Guarantee | How it's enforced |
|---|---|
| Zero network calls | No `fetch` or `XMLHttpRequest` in the source |
| No data shared | All analysis runs inside the browser tab |
| No eval() | Fully self-contained IIFE — no dynamic execution |
| No CDN dependencies | No external libraries loaded at runtime |
| Works from file:// | Favicon and all assets are self-contained |
| Shadow DOM isolated | Panel is injected but never modifies the target page |
| Open source | Read every line before you drag it |

---

## How it works technically

The bookmarklet is a self-contained ES5 IIFE embedded in `<script type="text/plain">` in `index.html`. A loader script reads it and assigns it as the `href` of the drag button — so the page works from `file://`, GitHub Pages, or any static host with no build step.

The audit panel uses **Shadow DOM** so its styles are fully isolated from the page under review.

The scanner uses a **context-aware detection model** — text-based checks (urgency language, scarcity claims, etc.) only fire when the matched text is inside an active UI component like a button, modal, checkout flow, or product card. This prevents false positives on pages that describe dark patterns without using them.

```
src/
  bookmarklet.js      ES6 source (human-readable, kept in sync)
css/
  styles.css          Landing page styles
intents/
  designSense-design-intent.md   Full design intent document
index.html            Landing page + embedded ES5 bookmarklet
favicon.svg           Shield + user + checkmark icon
```

---

## Local development

No build step required. Open `index.html` directly in a browser:

```bash
open index.html
```

To test the bookmarklet, drag the button from the local page to your bookmarks bar. Changes to `index.html` take effect on next drag (the bookmark stores the full encoded source).

When editing detection logic, update both:
- `src/bookmarklet.js` — ES6 source for readability
- The embedded `<script id="bm-src" type="text/plain">` block in `index.html` — ES5 version that actually runs

---

## References

- [Deceptive Design — pattern types](https://deceptive.design/types)
- [Nielsen Norman Group — 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- De Souza, C. & Avelar, T. (2021). *A taxonomy of dark patterns in user interfaces.*

---

## License

MIT — see source for full text.

---

*Created and directed by Padmavathi Verroju. Powered by Claude.*
