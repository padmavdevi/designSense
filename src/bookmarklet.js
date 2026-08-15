(function () {
  'use strict';

  // Toggle: remove panel if already open
  const PANEL_ID = '__dv-root__';
  const existing = document.getElementById(PANEL_ID);
  if (existing) { existing.remove(); return; }

  // ──────────────────────────────────────────────────────────────
  // ISSUE STORE
  // ──────────────────────────────────────────────────────────────
  const issues = [];

  function addIssue(category, type, severity, el, message, recommendation, confidence) {
    issues.push({ category, type, severity, el, message, recommendation, confidence });
  }

  // ──────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────

  function parseRGB(color) {
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }

  function luminance(rgb) {
    return rgb.map(c => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  }

  function contrastRatio(c1, c2) {
    const rgb1 = parseRGB(c1);
    const rgb2 = parseRGB(c2);
    if (!rgb1 || !rgb2) return 21;
    const l1 = luminance(rgb1);
    const l2 = luminance(rgb2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  // getComputedStyle().backgroundColor is transparent (rgba(0,0,0,0)) whenever an element
  // doesn't paint its own background, which is most text. Measuring contrast against that
  // literal value scores text against black. Walk up to the first ancestor that actually
  // paints a background; fall back to white if the whole chain is transparent.
  function effectiveBackground(el) {
    let node = el;
    while (node) {
      const bg = window.getComputedStyle(node).backgroundColor;
      if (!/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg) && bg !== 'transparent') return bg;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }

  // Walk text nodes and flag pattern matches against their parent element
  // contextSelector (optional): only flag text found inside these UI container types.
  // Ensures we detect design patterns in live UI — not text that describes design patterns.
  function scanText(pattern, category, type, severity, msgPrefix, recommendation, confidence, contextSelector) {
    const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','CODE','PRE','SVG']);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new WeakSet();
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      if (!el || SKIP.has(el.tagName) || el.closest('script,style,noscript,textarea,code,pre')) continue;

      // Skip sections explicitly marked as reference/informational content
      if (el.closest('[data-ds-ignore]')) continue;

      // Skip documentation-style containers
      if (el.closest('[class*="check-list"],[class*="pattern-list"],[class*="feature-list"],[class*="glossary"],[class*="legend"],[class*="dp-cat"],[class*="dp-list"],[class*="check-block"],[class*="heuristic"],[class*="cat-label"]')) continue;

      // Skip <li> items in "Term — definition" format (badge + em-dash = documentation)
      const li = el.closest('li');
      if (li && li.querySelector('[class*="tag"],[class*="badge"],[class*="chip"]') && /[—–]/.test(li.textContent)) continue;

      // Context gate: only flag if text lives inside an active UI component
      if (contextSelector && !el.closest(contextSelector)) continue;

      const text = node.textContent.trim();
      if (!text || !pattern.test(text)) continue;
      if (seen.has(el)) continue;
      seen.add(el);
      const m = text.match(pattern);
      const snippet = m ? `"${m[0].trim().substring(0, 60)}"` : `"${text.substring(0, 60)}"`;
      addIssue(category, type, severity, el, `${msgPrefix}: ${snippet}`, recommendation, confidence);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // DECEPTIVE PATTERNS  (deceptive.design/types — all 18)
  // ──────────────────────────────────────────────────────────────

  // 1. PRESELECTION — pre-checked opt-in boxes
  function checkPreselection() {
    document.querySelectorAll('input[type="checkbox"]:checked, input[type="radio"]:checked').forEach(el => {
      const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
      const text = label ? label.textContent.trim() : (el.name || '');
      if (/newsletter|subscribe|offer|deal|promotion|marketing|opt.?in|updates?|consent/i.test(text)) {
        addIssue('Deceptive Pattern', 'Preselection', 'High', el,
          `Pre-checked opt-in: "${text.substring(0, 60)}"`,
          'Uncheck by default. Users must actively opt in to marketing or additional services.',
          'high');
      }
    });
  }

  // 2. SNEAKING — delayed disclosure / pre-checked paid extras
  function checkSneaking() {
    document.querySelectorAll('input[type="checkbox"]:checked').forEach(el => {
      const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
      if (!label) return;
      const text = label.textContent.trim();
      if (/insurance|protection|warranty|add.?on|bundle|extra|donation|premium/i.test(text)) {
        addIssue('Deceptive Pattern', 'Sneaking', 'Critical', el,
          `Pre-checked paid add-on: "${text.substring(0, 60)}"`,
          'Never pre-check paid extras. Users must consciously choose to add them.',
          'high');
      }
    });
    scanText(
      /\*\s*(terms|conditions|apply|see|restrictions)|see\s+terms\s+for\s+details|conditions\s+apply/i,
      'Deceptive Pattern', 'Sneaking', 'Medium',
      'Material conditions buried in a footnote asterisk on an offer or checkout element',
      'Disclose all conditions directly alongside the offer — not buried in small print. Sneaking means hiding pertinent information until it is too late for users to make an informed decision.',
      'high',
      'form,[class*="offer"],[class*="promo"],[class*="deal"],[class*="price"],[class*="product"],[class*="checkout"],[class*="cart"],[class*="plan"],[class*="pricing"]'
    );
  }

  // 3. FAKE URGENCY — countdown timers, false time pressure
  function checkFakeUrgency() {
    document.querySelectorAll('[class*="countdown"],[class*="timer"],[id*="countdown"],[id*="timer"]').forEach(el => {
      addIssue('Deceptive Pattern', 'Fake Urgency', 'High', el,
        'Countdown timer pressures users with an artificial time limit',
        'Only use countdown timers for genuine, fixed-end deadlines. Fake timers are a deceptive pattern that erodes user trust.',
        'high');
    });
    scanText(
      /limited.?time\s+offer|offer.?expires?|ends?.?soon|hurry|act\s+now|last\s+chance|today\s+only|\d+\s*(hours?|minutes?|mins?)\s*(left|remaining)/i,
      'Deceptive Pattern', 'Fake Urgency', 'Medium',
      'Urgency language in a live UI element',
      'Verify this deadline is real. Fake urgency pressures users into rushed decisions. If genuine, state the exact end date/time clearly.',
      'high',
      'button,a,[role="button"],[role="dialog"],[role="alert"],[role="banner"],[class*="banner"],[class*="cta"],[class*="offer"],[class*="promo"],[class*="deal"],[class*="sale"],[class*="checkout"],[class*="cart"],[class*="timer"],[class*="countdown"],[class*="alert"],[class*="notification"],[class*="toast"]'
    );
  }

  // 4. FAKE SCARCITY — false stock or availability limits
  function checkFakeScarcity() {
    scanText(
      /only\s+\d+\s+(left|remaining|in\s+stock|available)|almost\s+gone|selling\s+fast|low\s+stock|limited\s+(stock|availability|supply|spots?)/i,
      'Deceptive Pattern', 'Fake Scarcity', 'High',
      'Scarcity claim on a product or inventory element',
      'Ensure stock or availability claims reflect real data. Fabricated scarcity is a deceptive pattern. Only show live, accurate inventory counts.',
      'high',
      '[class*="product"],[class*="item"],[class*="stock"],[class*="inventory"],[class*="availability"],[class*="cart"],[class*="checkout"],[class*="price"],[class*="listing"],[class*="card"],[class*="shop"],[class*="store"]'
    );
  }

  // 5. CONFIRMSHAMING — shaming users for declining
  function checkConfirmshaming() {
    scanText(
      /no,?\s*i\s+don.?t\s+want|i\s+don.?t\s+want\s+to\s+save|i\s+prefer\s+not\s+to|i\s+hate\s+saving|no,?\s*i\s+like\s+(paying|being|missing)/i,
      'Deceptive Pattern', 'Confirmshaming', 'High',
      'Confirmshaming: dismiss option uses guilt or shame',
      'Replace shame-based dismiss text with a neutral option like "No thanks" or "Maybe later".',
      'high',
      'button,a,[role="button"],[role="dialog"],[role="alertdialog"],[class*="modal"],[class*="popup"],[class*="overlay"],[class*="dialog"],[class*="newsletter"],[class*="subscribe"],[class*="opt-"]'
    );
    document.querySelectorAll('button,[role="button"],a').forEach(el => {
      const t = el.textContent.trim();
      if (/i\s+don.?t\s+want|no\s+thanks,?\s+i\s+prefer|i\s+prefer\s+to\s+(miss|lose|stay\s+broke)/i.test(t)) {
        addIssue('Deceptive Pattern', 'Confirmshaming', 'High', el,
          `Shame-based button label: "${t.substring(0, 60)}" — emotionally manipulates users into accepting`,
          'Replace with a neutral decline label such as "No thanks" that respects user autonomy.',
          'high');
      }
    });
  }

  // 6. TRICK WORDING — double negatives, misleading copy
  function checkTrickWording() {
    document.querySelectorAll('label, legend').forEach(el => {
      const t = el.textContent;
      if (/don.?t\s+not|uncheck\s+to\s+not|tick\s+if\s+you\s+don.?t|check\s+if\s+you\s+do\s+not/i.test(t)) {
        addIssue('Deceptive Pattern', 'Trick Wording', 'Critical', el,
          `Double-negative label misleads users into the wrong choice: "${t.trim().substring(0, 80)}"`,
          'Rewrite as a single, clear statement. Double negatives exploit confusion to trick users into unintended actions — a deceptive pattern.',
          'high');
      }
    });
    scanText(
      /free\*|free.{0,20}conditions?\s+apply|free.{0,30}then\s+\$|free.{0,30}after\s+trial/i,
      'Deceptive Pattern', 'Trick Wording', 'Medium',
      '"Free" claim with hidden conditions in a pricing or offer element',
      'State all conditions immediately alongside the word "Free". Burying them in footnotes misleads users about what they are agreeing to.',
      'high',
      '[class*="price"],[class*="plan"],[class*="pricing"],[class*="offer"],[class*="promo"],[class*="checkout"],[class*="cart"],[class*="product"],[class*="cta"],[class*="banner"]'
    );
  }

  // 7. HIDDEN COSTS — fees revealed late in checkout
  function checkHiddenCosts() {
    scanText(
      /processing\s+fee|service\s+fee|booking\s+fee|convenience\s+fee|admin\s+fee|handling\s+fee|surcharge/i,
      'Deceptive Pattern', 'Hidden Costs', 'Critical',
      'Extra fee appearing in a checkout or order summary element',
      'Disclose all fees upfront, before users invest time in the checkout process. Revealing charges at the last step exploits sunk-cost bias.',
      'high',
      'form,[class*="checkout"],[class*="cart"],[class*="order"],[class*="payment"],[class*="price"],[class*="total"],[class*="summary"],[class*="billing"],[class*="basket"]'
    );
  }

  // 8. HARD TO CANCEL — asymmetric sign-up vs cancel
  function checkHardToCancel() {
    const signups = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(el => /sign.?up|get.?started|start.?free|subscribe|join.?now|create.?account/i.test(el.textContent));
    const cancels = [...document.querySelectorAll('button,a,[role="button"]')]
      .filter(el => /cancel|unsubscribe|delete.?account|close.?account|end\s+subscription/i.test(el.textContent));
    if (signups.length > 0 && cancels.length === 0) {
      addIssue('Deceptive Pattern', 'Hard to Cancel', 'High', signups[0],
        'Sign-up is easy but no visible way to cancel or unsubscribe on this page',
        'Cancellation must be as easy to find as sign-up. Not providing a clear cancel path is a deceptive pattern — it traps users in subscriptions they no longer want.',
        'medium');
    }
  }

  // 9. HIDDEN SUBSCRIPTION — recurring charge without disclosure
  function checkHiddenSubscription() {
    document.querySelectorAll('[class*="price"],[class*="plan"],[class*="billing"],[class*="cost"]').forEach(el => {
      const hasPrice = /\$[\d,.]+|£[\d,.]+|€[\d,.]+/.test(el.textContent);
      const hasBillingPeriod = /per\s+(month|year|week|mo|yr|day)|monthly|annually|recurring|auto.?renew/i.test(el.textContent);
      if (hasPrice && !hasBillingPeriod) {
        addIssue('Deceptive Pattern', 'Hidden Subscription', 'Medium', el,
          'Price displayed without disclosing the billing period or recurring charge',
          'Always show the billing frequency (e.g. "£9/month") directly next to the price. Hiding recurring charges enrolls users in payments they did not knowingly agree to.',
          'medium');
      }
    });
  }

  // 10. NAGGING — persistent interruptions
  // Only flag modals that are currently VISIBLE. Hidden/click-triggered modals are normal UX.
  function checkNagging() {
    const candidates = [...document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="popup"],[class*="overlay"],[class*="lightbox"]')]
      .filter(el => {
        if (el.getAttribute('aria-hidden') === 'true') return false;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
    // Keep only outermost elements — a backdrop + inner dialog = one modal, not two.
    const visibleModals = candidates.filter(el =>
      !candidates.some(other => other !== el && other.contains(el))
    );
    if (visibleModals.length > 1) {
      addIssue('Deceptive Pattern', 'Nagging', 'Medium', visibleModals[0],
        `${visibleModals.length} separate popups or dialogs are interrupting the user at the same time`,
        'Show only one dialog at a time. Stacking interruptions is a nagging pattern — it stops users from completing their task and damages trust. Always provide a clear, permanent dismiss option.',
        'high');
    }
    const fixed = [...document.querySelectorAll('*')].filter(el => {
      if (el === document.body || el === document.documentElement) return false;
      const s = window.getComputedStyle(el);
      return s.position === 'fixed' || s.position === 'sticky';
    });
    if (fixed.length > 4) {
      addIssue('Deceptive Pattern', 'Nagging', 'Low', fixed[0],
        `${fixed.length} fixed or sticky elements compete for the user's attention simultaneously`,
        'Audit all persistent UI. A cookie banner, live chat widget, newsletter bar, and sticky header all at once overwhelm the user and prevent them from focusing on their task.',
        'medium');
    }
  }

  // 11. VISUAL INTERFERENCE — obscured dismiss, hidden opt-outs
  function checkVisualInterference() {
    document.querySelectorAll('[class*="close"],[aria-label*="close"],[aria-label*="Close"],[aria-label*="dismiss"]').forEach(el => {
      const s = window.getComputedStyle(el);
      if (parseFloat(s.fontSize) < 10 || parseFloat(s.opacity) < 0.4) {
        addIssue('Deceptive Pattern', 'Visual Interference', 'High', el,
          `Close/dismiss button visually obscured (fontSize: ${s.fontSize}, opacity: ${s.opacity})`,
          'Close buttons must be clearly visible — minimum 16px, full opacity.',
          'high');
      }
    });
    document.querySelectorAll('a[href]').forEach(el => {
      if (/unsubscribe|cancel|opt.?out|remove\s+me/i.test(el.textContent)) {
        const s = window.getComputedStyle(el);
        if (parseFloat(s.fontSize) < 11) {
          addIssue('Deceptive Pattern', 'Visual Interference', 'High', el,
            `Opt-out link is visually tiny (${s.fontSize})`,
            'Opt-out links must have the same prominence as opt-in actions. Never hide them.',
            'high');
        }
      }
    });
  }

  // 12. OBSTRUCTION — unnecessary friction barriers
  function checkObstruction() {
    document.querySelectorAll('[class*="captcha"],[id*="captcha"],iframe[src*="recaptcha"]').forEach(el => {
      const form = el.closest('form');
      if (form && /contact|feedback|newsletter|comment/i.test(form.className + form.id)) {
        addIssue('Deceptive Pattern', 'Obstruction', 'Low', el,
          'CAPTCHA on a low-risk form adds unnecessary friction',
          'Use honeypot fields or server-side rate-limiting on low-risk forms. Reserve CAPTCHA for high-risk actions.',
          'medium');
      }
    });
  }

  // 13. DISGUISED ADS — ads styled as content or navigation
  function checkDisguisedAds() {
    document.querySelectorAll('[class*="sponsored"],[class*="ad-"],[class*="-ad"],[data-ad]').forEach(el => {
      const hasLabel = el.querySelector('[class*="label"],[class*="badge"],[aria-label]') ||
        /sponsored|advertisement|\bad\b/i.test(el.textContent.substring(0, 30));
      if (!hasLabel) {
        addIssue('Deceptive Pattern', 'Disguised Ads', 'Medium', el,
          'Ad/sponsored element lacks a clear "Sponsored" or "Ad" label',
          'Label all paid content clearly and visibly as "Ad" or "Sponsored".',
          'medium');
      }
    });
    document.querySelectorAll('a[href*="click"],a[href*="track"],a[href*="/ad/"]').forEach(el => {
      if (/continue|skip|next|download|free/i.test(el.textContent)) {
        addIssue('Deceptive Pattern', 'Disguised Ads', 'High', el,
          `"${el.textContent.trim()}" button links to tracking URL — may be a disguised ad`,
          'Never style ads as primary navigation. Label them distinctly.',
          'medium');
      }
    });
  }

  // 14. FAKE SOCIAL PROOF — unverified reviews, inflated numbers
  function checkFakeSocialProof() {
    document.querySelectorAll('[class*="review"],[class*="testimonial"],[class*="rating"]').forEach(el => {
      const hasVerified = /verified|purchase|confirmed|source/i.test(el.textContent);
      const hasDate = /\d{4}|\d+\s+(days?|weeks?|months?)\s+ago/i.test(el.textContent);
      if (!hasVerified && !hasDate) {
        addIssue('Deceptive Pattern', 'Fake Social Proof', 'Medium', el,
          'Review or testimonial lacks verification status and date',
          'Add verified purchase badge and timestamp to all reviews.',
          'medium');
      }
    });
    scanText(
      /\b(10,?000|100,?000|1,?000,?000)\+?\s+(users?|customers?|members?|people|downloads?)/i,
      'Deceptive Pattern', 'Fake Social Proof', 'Low',
      'Suspiciously round social proof number in a marketing element',
      'Use real, tracked numbers. Perfect round numbers signal fabrication.',
      'medium',
      '[class*="hero"],[class*="banner"],[class*="testimonial"],[class*="review"],[class*="trust"],[class*="social"],[class*="proof"],[class*="stat"],[class*="counter"],[class*="metric"],[class*="cta"]'
    );
  }

  // 15. COMPARISON PREVENTION — complex pricing to prevent comparison
  function checkComparisonPrevention() {
    document.querySelectorAll('[class*="pricing"],table').forEach(el => {
      if (el.querySelectorAll('li,td').length > 12) {
        addIssue('Deceptive Pattern', 'Comparison Prevention', 'Low', el,
          'Complex pricing table — verify features use consistent naming across all plans',
          'Use identical feature names across tiers. Renaming per plan deliberately obscures comparison.',
          'low');
      }
    });
  }

  // 16. CURRENCY CONFUSION — virtual currency that obscures real spend
  // All virtual currency words require a number prefix ("500 coins", "100 tokens")
  // to avoid false positives on common English words:
  //   "design tokens", "hidden gem", "coin a phrase", "photo credits", "bullet points"
  // V-Bucks is a proprietary brand name — always flag regardless of number.
  function checkCurrencyConfusion() {
    scanText(
      /\b\d[\d,]*\s*(coins?|tokens?|gems?|credits?|points?)\b|\bv.?bucks?\b/i,
      'Deceptive Pattern', 'Currency Confusion', 'High',
      'Virtual currency in a store or purchase element — real cost is unclear',
      'Always show real-money equivalent alongside virtual currency. Never hide the actual spend.',
      'high',
      '[class*="store"],[class*="shop"],[class*="product"],[class*="item"],[class*="purchase"],[class*="buy"],[class*="cart"],[class*="price"],[class*="reward"],[class*="game"],[class*="inventory"],[class*="market"]'
    );
  }

  // 17. ADDICTIVE DESIGN — infinite scroll, autoplay, notification hooks
  function checkAddictiveDesign() {
    const infiniteEl = document.querySelector('[class*="infinite"],[class*="endless"],[data-infinite]');
    if (infiniteEl) {
      addIssue('Deceptive Pattern', 'Addictive Design', 'Medium', infiniteEl,
        'Infinite scroll pattern detected',
        'Offer pagination as an alternative. Let users control where content ends.',
        'high');
    }
    document.querySelectorAll('video[autoplay],audio[autoplay]').forEach(el => {
      addIssue('Deceptive Pattern', 'Addictive Design', 'Medium', el,
        `Autoplay ${el.tagName.toLowerCase()} without user consent`,
        'Default media to paused. Autoplay (especially with sound) is disruptive and jarring.',
        'high');
    });
    scanText(
      /enable\s+notifications?|allow\s+notifications?|don.?t\s+miss\s+(out|updates?)/i,
      'Deceptive Pattern', 'Addictive Design', 'Low',
      'Notification push prompt in a dialog or permission UI',
      'Request notification permission only after the user has experienced clear value — never on first load.',
      'high',
      'button,a,[role="button"],[role="dialog"],[role="alertdialog"],[class*="modal"],[class*="popup"],[class*="permission"],[class*="notification"],[class*="prompt"],[class*="banner"]'
    );
  }

  // 18. FORCED ACTION — mandatory extras before completing a task
  function checkForcedAction() {
    const socialCount = document.querySelectorAll('[class*="social-login"],[class*="oauth"],[href*="accounts.google"],[href*="facebook.com/login"]').length;
    // Only flag if the page has clear auth UI: social buttons inside a form, or a password field.
    // Without this gate, landing/content pages that happen to link to Google/GitHub get false positives.
    const hasAuthContext = document.querySelector('input[type="password"]')
      || document.querySelector('form [class*="social-login"],form [class*="oauth"]');
    const hasEmailInput = document.querySelector('input[type="email"]');
    if (socialCount > 0 && hasAuthContext && !hasEmailInput) {
      addIssue('Deceptive Pattern', 'Forced Action', 'High', document.body,
        'Only social login available — no email/password alternative',
        'Always offer email signup. Mandatory social login forces unwanted third-party data sharing.',
        'medium');
    }
    document.querySelectorAll('input[type="tel"]').forEach(el => {
      if (el.required) {
        addIssue('Deceptive Pattern', 'Forced Action', 'Medium', el,
          'Phone number is a required field',
          'Make phone optional unless the service genuinely requires it (e.g. SMS 2FA).',
          'high');
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // NIELSEN'S 10 HEURISTICS
  // Confidence labels:
  //   "high"        = reliable DOM/CSS detection
  //   "medium"      = structural inference, moderately reliable
  //   "best-effort" = text/pattern heuristic, context-dependent
  // ──────────────────────────────────────────────────────────────

  // H1: Visibility of System Status — HIGH CONFIDENCE
  function checkH1() {
    document.querySelectorAll('form').forEach(form => {
      const submit = form.querySelector('[type="submit"],button:not([type="button"]):not([type="reset"])');
      if (!submit) return;
      const hasLoader =
        form.querySelector('[class*="spinner"],[class*="loading"],[class*="loader"]') ||
        submit.dataset.loading !== undefined ||
        submit.getAttribute('aria-busy');
      if (!hasLoader) {
        addIssue('Nielsen Heuristic', 'H1: System Status', 'Medium', submit,
          'Submit button has no visible loading/processing state',
          'Disable the button and show a spinner or "Processing…" label on submit to confirm the action was received.',
          'high');
      }
    });
    const hasMultiStep = document.querySelectorAll('[class*="step"],[data-step],[class*="wizard"]').length > 1;
    const hasProgress = document.querySelector('[class*="progress"],[role="progressbar"],[aria-valuenow]');
    if (hasMultiStep && !hasProgress) {
      addIssue('Nielsen Heuristic', 'H1: System Status', 'High', document.body,
        'Multi-step flow detected but no progress indicator found',
        'Add a step counter ("Step 1 of 3") or progress bar so users always know where they are.',
        'medium');
    }
  }

  // H2: Match Between System and Real World — BEST EFFORT
  function checkH2() {
    const jargonPattern = /\b(api|sdk|payload|endpoint|webhook|cron|regex|boolean|null|undefined|404|500|401|403|422|503)\b/gi;
    document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,label,button,a,li,td,span').forEach(el => {
      if (el.children.length > 0) return;
      const text = el.textContent.trim();
      const matches = text.match(jargonPattern);
      if (matches) {
        addIssue('Nielsen Heuristic', 'H2: Real World Match', 'Low', el,
          `Technical jargon in UI copy: "${matches.slice(0, 3).join('", "')}"`,
          'Replace technical terms with plain language your users already know.',
          'best-effort');
      }
    });
  }

  // H3: User Control & Freedom — HIGH CONFIDENCE
  function checkH3() {
    document.querySelectorAll('button,[role="button"],a').forEach(el => {
      if (/\b(delete|remove|clear\s+all|reset|destroy|purge|wipe)\b/i.test(el.textContent)) {
        const hasConfirm =
          el.getAttribute('onclick')?.includes('confirm') ||
          el.dataset.confirm ||
          el.dataset.modal ||
          el.closest('[role="dialog"]');
        if (!hasConfirm) {
          addIssue('Nielsen Heuristic', 'H3: User Control', 'High', el,
            `Destructive action "${el.textContent.trim()}" has no confirmation`,
            'Show a confirmation dialog that names exactly what will be permanently lost.',
            'high');
        }
      }
    });
    document.querySelectorAll('form').forEach(form => {
      const hasSubmit = form.querySelector('[type="submit"]');
      const hasEscape = form.querySelector('a,button[type="button"]');
      if (hasSubmit && !hasEscape) {
        addIssue('Nielsen Heuristic', 'H3: User Control', 'Low', form,
          'Form has a submit but no cancel or back option',
          'Always give users an exit path so they can abandon without committing.',
          'high');
      }
    });
  }

  // H4: Consistency & Standards — HIGH CONFIDENCE
  function checkH4() {
    let prevLevel = 0;
    let headingSkipped = false;
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      const lvl = +h.tagName[1];
      if (prevLevel > 0 && lvl > prevLevel + 1) headingSkipped = true;
      prevLevel = lvl;
    });
    if (headingSkipped) {
      addIssue('Nielsen Heuristic', 'H4: Consistency', 'Medium', document.body,
        'Heading levels are skipped (e.g. H1 → H3)',
        'Use sequential heading levels. Skipping levels breaks screen reader navigation.',
        'high');
    }
    const h1s = document.querySelectorAll('h1');
    if (h1s.length > 1) {
      addIssue('Nielsen Heuristic', 'H4: Consistency', 'Medium', h1s[1],
        `${h1s.length} H1 elements on page — only one should exist`,
        'Use a single H1 as the primary page title. Use H2–H6 for sections.',
        'high');
    }
    // Detect wildly inconsistent button styles (border-radius + font-family fingerprint)
    const buttons = document.querySelectorAll('button,[role="button"]');
    const buttonStyles = new Set();
    buttons.forEach(btn => {
      const s = window.getComputedStyle(btn);
      buttonStyles.add(`${s.borderRadius}|${s.fontFamily}`);
    });
    if (buttonStyles.size > 4 && buttons.length > 6) {
      addIssue('Nielsen Heuristic', 'H4: Consistency', 'Low', buttons[0],
        `${buttonStyles.size} distinct button style variants detected`,
        'Standardise button styles using a design system. Inconsistent buttons confuse users.',
        'medium');
    }
  }

  // H5: Error Prevention — HIGH CONFIDENCE
  function checkH5() {
    document.querySelectorAll('input,textarea,select').forEach(el => {
      // Email field not typed as email
      if (el.type === 'text' && /email/i.test(el.name + el.id + (el.placeholder || ''))) {
        addIssue('Nielsen Heuristic', 'H5: Error Prevention', 'Medium', el,
          'Email field uses type="text" instead of type="email"',
          'Switch to type="email" for format validation and the right mobile keyboard.',
          'high');
      }
      // Required fields without a visual marker
      if (el.required) {
        const label = document.querySelector(`label[for="${el.id}"]`) || el.closest('label');
        if (label && !/\*|required/i.test(label.textContent)) {
          addIssue('Nielsen Heuristic', 'H5: Error Prevention', 'Medium', el,
            'Required field has no visual indicator (* or "Required")',
            'Mark required fields with * and explain the convention at the top of the form.',
            'high');
        }
      }
      // Password with no show/hide
      if (el.type === 'password') {
        const parent = el.closest('div,fieldset') || el.parentElement;
        const hasToggle = parent && (
          /show|hide|reveal/i.test(parent.textContent) ||
          parent.querySelector('[class*="toggle"],[type="checkbox"]')
        );
        if (!hasToggle) {
          addIssue('Nielsen Heuristic', 'H5: Error Prevention', 'Low', el,
            'Password field has no show/hide toggle',
            'Add a show/hide toggle to reduce typos — especially on mobile.',
            'high');
        }
      }
    });
  }

  // H6: Recognition Rather than Recall — HIGH CONFIDENCE
  function checkH6() {
    document.querySelectorAll('button,[role="button"]').forEach(el => {
      const hasText = el.textContent.trim().length > 0;
      const hasLabel = el.getAttribute('aria-label') || el.getAttribute('title');
      const hasIcon = el.querySelector('svg,img,i,[class*="icon"]');
      if (hasIcon && !hasText && !hasLabel) {
        addIssue('Nielsen Heuristic', 'H6: Recognition', 'High', el,
          'Icon-only button with no accessible label (missing aria-label or title)',
          'Add aria-label to every icon-only button. Icons alone are ambiguous without labels.',
          'high');
      }
    });
    // Skip on file:// — the path there is the local folder structure, not site
    // navigation depth, so it says nothing about whether breadcrumbs are needed.
    if (window.location.protocol !== 'file:') {
      const depth = window.location.pathname.split('/').filter(Boolean).length;
      if (depth > 2 && !document.querySelector('[aria-label*="breadcrumb"],[class*="breadcrumb"]')) {
        addIssue('Nielsen Heuristic', 'H6: Recognition', 'Low', document.body,
          'Deep page URL but no breadcrumb navigation found',
          'Add breadcrumbs on deep pages so users know where they are and can navigate up the hierarchy.',
          'medium');
      }
    }
  }

  // H7: Flexibility & Efficiency of Use — BEST EFFORT
  function checkH7() {
    const skipLink = document.querySelector(
      'a[href="#main"],a[href="#content"],a[href="#maincontent"],a[href="#main-content"],[class*="skip-"]'
    );
    if (!skipLink) {
      addIssue('Nielsen Heuristic', 'H7: Flexibility', 'Medium', document.body,
        'No skip-to-content link found',
        'Add a visually hidden "Skip to main content" as the first focusable element — essential for keyboard users.',
        'high');
    }
    const listCount = Array.from(document.querySelectorAll('li,tr,[class*="card"],[class*="item"]'))
      .filter(el => !el.closest('[data-ds-ignore]')).length;
    const longList = listCount > 20;
    const hasSearch = document.querySelector('[type="search"],[role="search"],[class*="search-input"]');
    if (longList && !hasSearch) {
      addIssue('Nielsen Heuristic', 'H7: Flexibility', 'Low', document.body,
        'Long list/grid with no search or filter control',
        'Add search or filter to help power users find items quickly without scrolling everything.',
        'best-effort');
    }
  }

  // H8: Aesthetic & Minimalist Design — HIGH CONFIDENCE
  function checkH8() {
    let lowContrastCount = 0;
    const reported = new WeakSet();

    document.querySelectorAll('p,span,label,a,button,h1,h2,h3,h4,h5,h6,li,td').forEach(el => {
      if (el.children.length > 0 || reported.has(el)) return;
      const s = window.getComputedStyle(el);
      const bg = effectiveBackground(el);
      const ratio = contrastRatio(s.color, bg);
      const isLargeText = parseFloat(s.fontSize) >= 18 ||
        (parseFloat(s.fontSize) >= 14 && +s.fontWeight >= 700);
      const minRatio = isLargeText ? 3 : 4.5;

      if (ratio < minRatio) {
        lowContrastCount++;
        reported.add(el);
        if (lowContrastCount <= 5) {
          addIssue('Nielsen Heuristic', 'H8: Aesthetics', ratio < 2 ? 'Critical' : 'High', el,
            `Contrast ratio ${ratio.toFixed(1)}:1 (WCAG AA minimum ${minRatio}:1)`,
            `Increase contrast. Text: ${s.color} on ${bg}`,
            'high');
        }
      }
    });

    if (lowContrastCount > 5) {
      addIssue('Nielsen Heuristic', 'H8: Aesthetics', 'High', document.body,
        `${lowContrastCount} total low-contrast text elements (showing first 5 above)`,
        'Run a full WCAG AA contrast audit across all text in this design.',
        'high');
    }

    // Too many font sizes = no type scale
    const fontSizes = new Set();
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
    document.body.querySelectorAll('*').forEach(el => {
      if (SKIP_TAGS.has(el.tagName) || el.closest('script,style,noscript,template')) return;
      if (el.children.length || !el.textContent.trim() || el.getClientRects().length === 0) return;
      fontSizes.add(window.getComputedStyle(el).fontSize);
    });
    if (fontSizes.size > 8) {
      addIssue('Nielsen Heuristic', 'H8: Aesthetics', 'Low', document.body,
        `${fontSizes.size} distinct font sizes in use`,
        'Limit to 4–6 type scale steps. Too many sizes signal no consistent design system.',
        'high');
    }
  }

  // H9: Help Users Recognize, Diagnose & Recover from Errors — BEST EFFORT
  function checkH9() {
    document.querySelectorAll('[class*="error"],[class*="alert"],[role="alert"],[aria-live]').forEach(el => {
      if (/something\s+went\s+wrong|an?\s+error\s+(has\s+)?occurred|oops|try\s+again\s+later/i.test(el.textContent)) {
        addIssue('Nielsen Heuristic', 'H9: Error Recovery', 'High', el,
          `Generic error message: "${el.textContent.trim().substring(0, 60)}"`,
          'Explain what failed specifically and tell the user exactly what to do next.',
          'best-effort');
      }
      // Error not linked to a specific field
      const isLinkedToField = el.id && document.querySelector(`[aria-describedby="${el.id}"]`);
      const isInlineWithField = el.closest('label,fieldset,[class*="field"],[class*="form-group"]');
      if (!isLinkedToField && !isInlineWithField) {
        addIssue('Nielsen Heuristic', 'H9: Error Recovery', 'Medium', el,
          'Error element not associated with a specific input field',
          'Use aria-describedby to link errors to fields. Place errors immediately adjacent to the failing input.',
          'medium');
      }
    });
  }

  // H10: Help & Documentation — BEST EFFORT
  function checkH10() {
    document.querySelectorAll('input[type="password"]').forEach(el => {
      const parent = el.closest('div,fieldset') || el.parentElement;
      const hasRequirementsHint = parent &&
        /character|uppercase|lowercase|number|special|length|least|minimum/i.test(parent.textContent);
      if (!hasRequirementsHint) {
        addIssue('Nielsen Heuristic', 'H10: Help', 'Medium', el,
          'Password field shows no requirements hint',
          'Display password rules before the user submits. Never wait for failure to communicate the rules.',
          'high');
      }
    });
    ['[class*="empty-state"]', '[class*="no-data"]', '[class*="zero-state"]', '[class*="no-results"]'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const hasAction = el.querySelector('button,a');
        const hasCopy = el.textContent.trim().length > 20;
        if (!hasAction || !hasCopy) {
          addIssue('Nielsen Heuristic', 'H10: Help', 'Medium', el,
            'Empty state lacks descriptive copy or a next-step action',
            'Empty states should explain why nothing is here and offer a clear CTA.',
            'best-effort');
        }
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // RUN ALL CHECKS
  // ──────────────────────────────────────────────────────────────
  function runAnalysis() {
    // 18 Deceptive Patterns
    checkPreselection();
    checkSneaking();
    checkFakeUrgency();
    checkFakeScarcity();
    checkConfirmshaming();
    checkTrickWording();
    checkHiddenCosts();
    checkHardToCancel();
    checkHiddenSubscription();
    checkNagging();
    checkVisualInterference();
    checkObstruction();
    checkDisguisedAds();
    checkFakeSocialProof();
    checkComparisonPrevention();
    checkCurrencyConfusion();
    checkAddictiveDesign();
    checkForcedAction();
    // Nielsen's 10 Heuristics
    checkH1();
    checkH2();
    checkH3();
    checkH4();
    checkH5();
    checkH6();
    checkH7();
    checkH8();
    checkH9();
    checkH10();
  }

  // ──────────────────────────────────────────────────────────────
  // UI — Shadow DOM side panel (read-only, no DOM modification)
  // ──────────────────────────────────────────────────────────────

  function severityColor(s) {
    return { Critical: '#dc2626', High: '#ea580c', Medium: '#d97706', Low: '#65a30d' }[s] || '#6b7280';
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderPanel() {
    // Host element — position:fixed wrapper
    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = [
      'all:initial',
      'position:fixed',
      'top:0',
      'right:0',
      'z-index:2147483647',
      'width:440px',
      'height:100vh',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'closed' });

    // Tally severity counts
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    issues.forEach(i => { counts[i.severity] = (counts[i.severity] || 0) + 1; });
    const total = issues.length;

    const deceptive = issues.filter(i => i.category === 'Deceptive Pattern');
    const heuristics = issues.filter(i => i.category === 'Nielsen Heuristic');


    const panel = document.createElement('div');
    panel.style.cssText = [
      'all:initial',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'font-size:13px',
      'line-height:1.5',
      'color:#1f2937',
      'background:#ffffff',
      'width:440px',
      'height:100vh',
      'box-shadow:-4px 0 28px rgba(0,0,0,0.18)',
      'display:flex',
      'flex-direction:column',
      'pointer-events:all',
      'overflow:hidden'
    ].join(';');

    panel.innerHTML = `
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:#f3f4f6}
        ::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px}

        .hd{background:#0f172a;color:#fff;padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0}
        .hd-title{font-size:14px;font-weight:700;letter-spacing:.02em}
        .hd-sub{font-size:11px;color:#94a3b8;margin-top:2px}
        .close{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:20px;padding:0 4px;line-height:1;border-radius:4px}
        .close:hover{color:#fff;background:#1e293b}
        .minimize{background:none;border:none;color:#94a3b8;cursor:pointer;padding:0 5px;display:inline-flex;align-items:center;border-radius:4px;margin-right:2px}
        .minimize:hover{color:#fff;background:#1e293b}

        .summary{padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;flex-shrink:0}
        .score-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .score-num{font-size:26px;font-weight:800}
        .score-label{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
        .badges{display:flex;gap:6px;flex-wrap:wrap}
        .badge{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#fff}
        .bar{height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden;margin-top:8px}
        .bar-fill{height:100%;border-radius:2px;transition:width .4s}

        .tabs{display:flex;border-bottom:1px solid #e2e8f0;background:#fff;flex-shrink:0}
        .tab{flex:1;padding:9px 4px;font-size:11px;font-weight:500;border:none;background:none;cursor:pointer;color:#6b7280;border-bottom:2px solid transparent;transition:all .15s}
        .tab:hover{color:#0f172a}
        .tab.on{color:#0f172a;border-bottom-color:#6366f1;font-weight:700}

        .list{flex:1;overflow-y:auto;padding:8px}

        .card{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:6px;cursor:pointer;transition:border-color .15s,box-shadow .15s}
        .card:hover{border-color:#a5b4fc;box-shadow:0 2px 8px rgba(99,102,241,.12)}
        .card.open{border-color:#6366f1;background:#fafafe}
        .card-top{display:flex;align-items:flex-start;gap:8px}
        .dot{width:8px;min-width:8px;height:8px;border-radius:50%;margin-top:4px}
        .card-title{font-size:12px;font-weight:600;color:#1f2937;flex:1}
        .card-meta{font-size:10px;color:#6b7280;margin-top:1px}
        .card-body{display:none;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9}
        .card.open .card-body{display:block}
        .msg{font-size:11px;color:#374151;margin-bottom:6px;word-break:break-word}
        .rec{font-size:11px;color:#065f46;background:#ecfdf5;border-left:3px solid #10b981;padding:6px 8px;border-radius:0 4px 4px 0;margin-bottom:6px}
        .foot-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        .conf{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:500}
        .ch{background:#dcfce7;color:#15803d}
        .cm{background:#e0f2fe;color:#0369a1}
        .cb{background:#fef9c3;color:#854d0e}
        .jump{font-size:10px;padding:2px 8px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc;color:#374151;cursor:pointer;margin-left:auto}
        .jump:hover{background:#6366f1;color:#fff;border-color:#6366f1}

        .empty{text-align:center;padding:40px 20px;color:#6b7280}
        .empty-icon{font-size:36px;margin-bottom:8px}

        .footer{padding:10px 16px;border-top:1px solid #e2e8f0;flex-shrink:0}
        .export{width:100%;padding:7px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:11px;cursor:pointer;color:#374151;margin-bottom:6px}
        .export:hover{background:#0f172a;color:#fff;border-color:#0f172a}
        .privacy{font-size:10px;color:#9ca3af;text-align:center}
      </style>

      <div class="hd">
        <div>
          <div class="hd-title">designSense</div>
          <div class="hd-sub">18 dark patterns · Nielsen's 10 heuristics</div>
        </div>
        <div style="display:flex;gap:0;align-items:center">
          <button class="minimize" id="dv-min" title="Minimize" aria-label="Minimize"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="12" height="12" rx="3"/><line x1="4" y1="9.5" x2="10" y2="9.5"/></svg></button>
          <button class="close" id="dv-close" aria-label="Close panel">✕</button>
        </div>
      </div>

      <div class="summary">
        <div style="font-size:12px;font-weight:700;color:#1f2937;margin-bottom:8px">${total} violation${total !== 1 ? 's' : ''} found</div>
        <div class="badges">
          ${Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) =>
            `<span class="badge" style="background:${severityColor(k)}">${v} ${escapeHtml(k)}</span>`
          ).join('')}
          ${total === 0 ? '<span class="badge" style="background:#16a34a">✓ No issues found</span>' : ''}
        </div>
      </div>

      <div class="tabs">
        <button class="tab on" data-tab="all">All (${total})</button>
        <button class="tab" data-tab="deceptive">Dark Patterns (${deceptive.length})</button>
        <button class="tab" data-tab="heuristic">Heuristics (${heuristics.length})</button>
      </div>

      <div class="list" id="dv-list"></div>

      <div class="footer">
        <button class="export" id="dv-export">Copy full report as JSON</button>
        <div class="privacy">No data leaves your browser · Shadow DOM isolated · Read-only analysis</div>
      </div>
    `;

    shadow.appendChild(panel);

    let activeTab = 'all';
    let highlightedEl = null;

    function getFilteredIssues(tab) {
      if (tab === 'deceptive') return deceptive;
      if (tab === 'heuristic') return heuristics;
      return issues;
    }

    function renderList(tab) {
      const listEl = shadow.getElementById('dv-list');
      const filtered = getFilteredIssues(tab);

      if (filtered.length === 0) {
        listEl.innerHTML = `
          <div class="empty">
            <div class="empty-icon">✓</div>
            <strong>No issues in this category</strong>
            <p style="margin-top:6px;font-size:11px">This section looks clean!</p>
          </div>`;
        return;
      }

      listEl.innerHTML = filtered.map((issue, i) => {
        const confClass = issue.confidence === 'high' ? 'ch' : issue.confidence === 'best-effort' ? 'cb' : 'cm';
        const confLabel = issue.confidence === 'high' ? '✓ High confidence'
          : issue.confidence === 'best-effort' ? '⚠ Best effort'
          : '~ Medium confidence';
        const rect = issue.el ? issue.el.getBoundingClientRect() : null;
        const canJump = issue.el && issue.el !== document.body && rect && (rect.width > 0 || rect.height > 0);
        return `
          <div class="card" data-i="${i}" data-tab="${tab}">
            <div class="card-top">
              <div class="dot" style="background:${severityColor(issue.severity)}"></div>
              <div style="flex:1">
                <div class="card-title">${escapeHtml(issue.type)}</div>
                <div class="card-meta">${escapeHtml(issue.category)} · ${escapeHtml(issue.severity)}</div>
              </div>
            </div>
            <div class="card-body">
              <div class="msg">${escapeHtml(issue.message)}</div>
              <div class="rec">Fix: ${escapeHtml(issue.recommendation)}</div>
              <div class="foot-row">
                <span class="conf ${confClass}">${confLabel}</span>
                ${canJump ? `<button class="jump" data-jump="${i}" data-tab="${tab}">↗ Jump to element</button>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    }

    // Tab switching
    shadow.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        shadow.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
        tab.classList.add('on');
        activeTab = tab.dataset.tab;
        renderList(activeTab);
      });
    });

    // Card expand / jump
    shadow.getElementById('dv-list').addEventListener('click', e => {
      // Jump to element
      const jumpBtn = e.target.closest('[data-jump]');
      if (jumpBtn) {
        e.stopPropagation();
        const idx = +jumpBtn.dataset.jump;
        const issue = getFilteredIssues(jumpBtn.dataset.tab)[idx];
        if (issue && issue.el) {
          if (highlightedEl) {
            highlightedEl.style.outline = '';
            highlightedEl.style.outlineOffset = '';
          }
          highlightedEl = issue.el;
          issue.el.style.outline = '3px solid #6366f1';
          issue.el.style.outlineOffset = '2px';
          issue.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            if (highlightedEl === issue.el) {
              issue.el.style.outline = '';
              issue.el.style.outlineOffset = '';
            }
          }, 3000);
        }
        return;
      }

      // Expand/collapse card
      const card = e.target.closest('.card');
      if (!card) return;
      const isOpen = card.classList.contains('open');
      shadow.querySelectorAll('.card.open').forEach(c => c.classList.remove('open'));
      if (!isOpen) card.classList.add('open');
    });

    // Minimize / restore — accordion style
    let dvMinimized = false;
    shadow.getElementById('dv-min').addEventListener('click', () => {
      dvMinimized = !dvMinimized;
      const btn = shadow.getElementById('dv-min');
      const secs = [
        shadow.querySelector('.summary'),
        shadow.querySelector('.tabs'),
        shadow.getElementById('dv-list'),
        shadow.querySelector('.footer'),
      ];
      if (dvMinimized) {
        secs.forEach(el => { if (el) el.style.display = 'none'; });
        panel.style.height = 'auto';
        host.style.height = 'auto';
        host.style.top = 'auto';
        host.style.bottom = '0';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="12" height="12" rx="3"/><line x1="4.5" y1="7" x2="9.5" y2="7"/><line x1="7" y1="4.5" x2="7" y2="9.5"/></svg>';
        btn.title = 'Restore'; btn.setAttribute('aria-label', 'Restore');
      } else {
        secs.forEach(el => { if (el) el.style.display = ''; });
        panel.style.height = '100vh';
        host.style.height = '100vh';
        host.style.bottom = 'auto';
        host.style.top = '0';
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="12" height="12" rx="3"/><line x1="4" y1="9.5" x2="10" y2="9.5"/></svg>';
        btn.title = 'Minimize'; btn.setAttribute('aria-label', 'Minimize');
      }
    });

    // Close panel
    shadow.getElementById('dv-close').addEventListener('click', () => {
      if (highlightedEl) {
        highlightedEl.style.outline = '';
        highlightedEl.style.outlineOffset = '';
      }
      host.remove();
    });

    // Export JSON
    shadow.getElementById('dv-export').addEventListener('click', () => {
      const exportBtn = shadow.getElementById('dv-export');
      const report = {
        url: location.href,
        timestamp: new Date().toISOString(),
        summary: counts,
        total,
        issues: issues.map(issue => ({
          category: issue.category,
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          recommendation: issue.recommendation,
          confidence: issue.confidence,
          element: issue.el === document.body ? 'document.body'
            : issue.el
              ? (issue.el.id ? '#' + issue.el.id
                : issue.el.tagName.toLowerCase() +
                  (issue.el.className ? '.' + String(issue.el.className).trim().split(/\s+/).join('.') : ''))
              : 'unknown'
        }))
      };
      const json = JSON.stringify(report, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json)
          .then(() => {
            exportBtn.textContent = '✓ Copied to clipboard!';
            setTimeout(() => { exportBtn.textContent = 'Copy full report as JSON'; }, 2500);
          })
          .catch(() => {
            exportBtn.textContent = 'Clipboard blocked — see console';
            console.log('[designSense] Report:\n' + json);
          });
      } else {
        console.log('[designSense] Report:\n' + json);
        exportBtn.textContent = 'Report logged to console';
        setTimeout(() => { exportBtn.textContent = 'Copy full report as JSON'; }, 2500);
      }
    });

    renderList('all');
  }

  // ──────────────────────────────────────────────────────────────
  // MAIN
  // ──────────────────────────────────────────────────────────────
  runAnalysis();
  renderPanel();

})();
