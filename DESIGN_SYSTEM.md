# DESIGN_SYSTEM.md — One Last Turn

The durable design contract. Consumed by build, stress, demo-video, deploy. Extracted from the
shipped editorial thin slice and elevated in design-forge (Tier A). The identity is **locked** —
this document formalizes it, it does not repaint it.

## Identity

- **World statement:** A quiet, considered space for one careful human moment after conflict — an
  editorial, letterpress-feeling document that happens to be alive. The opposite of an alerting AI
  moderation dashboard; it reads *community care / restorative justice*, not *SaaS*.
- **Accent color:** Dual-tone with a strict rule. **Moss `#42604f`** is the primary structural hue
  (nav, primary actions, complete/active timeline steps, section framing — carries calm and trust).
  **Clay `#a74f32`** is the *reserved* accent — it appears deliberately and rarely, at the A→B
  "remembered response" reveal and on `focus-visible` outlines. Clay must always feel earned.
- **Signature element:** the **reserved clay reveal**. Clay arrives exactly once in a case's
  lifecycle — the moment Mind B completes the remembered response (blockquote left-rule, the
  "remembered" evidence badge, and the turn in the A→B explainer). The one moment that proves the
  product is the one moment the warm accent appears.

## Tokens

All tokens are CSS custom properties in `globals.css` under `:root`.

### Color
```
--paper:        #f4f0e6   /* base surface */
--paper-ground: #ece5d5   /* page ground, one step deeper than paper */
--surface-2:    #faf7f0   /* raised card */
--surface-3:    #fffdf7   /* raised inner element */
--surface-4:    #ffffff   /* top / money-shot blockquote */
--ink:          #17231d   /* body text */
--muted:        #5c6b60   /* secondary text */
--moss:         #42604f   /* primary structural accent */
--clay:         #a74f32   /* reserved accent — money-shot + focus only */
--line:         #b9af99   /* hairline borders */
--danger:       #8b2c20   /* honest failure only */
```
One primary hue (moss). Surface variety comes from the paper elevation ladder + opacity, never a
second decorative color. Clay is a signal, not a palette member you reach for freely.

### Type scale (fluid, `clamp()`)
```
--fs-hero:  clamp(3rem, 9vw, 6.5rem)     /* Fraunces, line-height .88, tracking -.05em */
--fs-h2:    clamp(1.5rem, 3.5vw, 2.1rem)  /* Fraunces */
--fs-lead:  clamp(1.05rem, 1.6vw, 1.2rem) /* Public Sans, the hero subhead + measure text */
--fs-body:  1rem
--fs-small: .82rem
--fs-micro: .7rem                          /* eyebrows, timeline meta — uppercase .12em */
```
Fonts are loaded with `next/font/google` in `layout.tsx` and exposed as `--font-display`
(Fraunces), `--font-body` (Public Sans), `--font-mono` (IBM Plex Mono). **No macOS-only stacks** —
the previous `Avenir Next`/`Gill Sans`/`Georgia` stack collapsed off-Mac and is removed.

### Spacing
Base unit `8px`. Steps: 4, 8, 12, 16, 24, 32, 48, 64, 80. Section rhythm uses 32 / 48.

### Radius scale (tokenized — no ad-hoc values)
```
--r-sm: 12px   /* inputs, small chips edge */
--r-md: 16px   /* timeline cells, inner blocks */
--r-lg: 26px   /* the case card */
--r-pill: 999px /* badges, buttons */
```

### Shadow scale — philosophy: **soft-elevation** (one philosophy, warm-tinted)
```
--e-1: 0 1px 2px rgba(31,43,35,.06)
--e-2: 0 6px 18px rgba(31,43,35,.08)
--e-3: 0 18px 44px rgba(31,43,35,.10)
--e-4: 0 28px 70px rgba(31,43,35,.13)   /* the case card at rest */
```
Shadows are warm (ink-tinted, never pure black) to sit correctly on paper. Higher z = lighter
surface + larger softer shadow. No pixel-offset, no pure-glow.

## Craft

- **Radius (CF-1):** every corner uses a `--r-*` token. No inline `border-radius: 17px`.
- **Elevation ladder (CF-2):** paper-ground → paper → card (`--surface-2`, `--e-4`) → inner cells
  (`--surface-3`, `--e-1`) → money-shot blockquote (`--surface-4`, `--e-2`). Each z-level is a
  lighter paper tint with a token shadow.
- **Shadow philosophy:** soft-elevation (above). Named, single, tokenized.
- **Glass:** used once, restrained — the case card keeps a subtle `backdrop-filter: blur(6px)` over
  the ruled-paper ground with a `--surface-2` translucent fill. No blur elsewhere.
- **Hover recipe:** interactive elements lift `translateY(-1px)` + shift to the next shadow token +
  (buttons) ink→moss fill. 140ms ease. Never scale-jump.
- **Focus-visible recipe:** `outline: 3px solid var(--clay); outline-offset: 3px` — everywhere,
  unchanged from the shipped a11y baseline. Clay-on-focus is the one non-money-shot clay use, kept
  because it is an accessibility affordance, not decoration.
- **Signature element visibility:** the clay reveal is guaranteed to render on any `response_ready`
  or `closed` case (blockquote + badge) and is illustrated in the always-visible A→B explainer.

## Primitives

- **Card** (`.case-card`): `--surface-2`, `1px solid --line`, `--r-lg`, `--e-4`, blur(6px), fluid padding.
- **Button** (`button`): pill, ink fill, white text, weight 700; hover → moss + lift; disabled → muted grey; focus → clay outline.
- **Input** (`textarea`): white fill, `--line` border, `--r-sm`; focus → clay outline.
- **Badge / chip** (`.case-meta span`, `.evidence span`): pill, hairline border, `--surface-3` fill, micro type. The **"remembered" badge** and receipt badge carry a clay left-tick (signature).
- **Blockquote** (money-shot): `--surface-4`, clay left-rule `5px`, Fraunces italic, `--e-2`.
- **Timeline cell** (`.timeline li`): `--r-md`; state via icon + color, not opacity alone —
  `complete` = moss check, `current` = moss ring + soft pulse, `pending` = muted/dashed,
  `stopped` = danger.

## Motion

- **Vocabulary:** `f-rise` (fade + 6px up, 420ms) for card + section entrance; `f-tick` (timeline
  cells stagger in, 60ms step) ; `pulse-current` (2.4s soft opacity breathe on the current step).
- **Default transition:** `140ms ease` for interactive state; `420ms cubic-bezier(.2,.7,.2,1)` for entrances.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` disables all transitions/animations
  and reveals content in final state. Every animation degrades to a no-op — verified.

## References (research-cited)

- **Public Sans** — U.S. Web Design System humanist sans, built for public-trust civic interfaces;
  chosen for calm institutional-trust legibility.
- **Fraunces** — variable old-style editorial display serif for literary mastheads; carries warmth
  and letterpress character without the generic-Georgia default.
- **Editorial print layout** — ruled-paper ground, generous measure (~62ch), serif-display + sans-body.
- **Provenance / receipt UIs** — monospace digests (git-hash / certificate-fingerprint idiom) as a
  trust signal that private text is withheld but evidence is verifiable.
- **Restorative-justice / community-care material** — warm paper grounds, no alarm-red dashboards.
