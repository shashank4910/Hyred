---
name: Hyred Luminous
description: A calm, teal-forward career intelligence dashboard — light surfaces, scored clarity, premium SaaS craft.
colors:
  primary: "#006a65"
  primary-container: "#2cc9c0"
  primary-fixed: "#6bf8ee"
  secondary: "#006c4b"
  secondary-container: "#64f9bc"
  background: "#f9f9ff"
  on-background: "#111c2d"
  on-surface: "#111c2d"
  on-surface-variant: "#3c4948"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f0f3ff"
  surface-container: "#e7eeff"
  surface-container-high: "#dee8ff"
  outline-variant: "#bbcac7"
  text-muted: "#6c7a78"
  match-success: "#2cc9c0"
  error: "#ba1a1a"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.01em"
rounded:
  field: "12px"
  btn: "12px"
  card: "16px"
  badge: "9999px"
spacing:
  stack-sm: "8px"
  stack-md: "16px"
  stack-lg: "32px"
  card-pad: "24px"
  sidebar: "260px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #006a65 0%, #2cc9c0 100%)"
    textColor: "#ffffff"
    rounded: "12px"
    padding: "10px 16px"
  button-primary-hover:
    opacity: "0.9"
  button-secondary:
    backgroundColor: "#006c4b"
    textColor: "#ffffff"
    rounded: "12px"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#3c4948"
    rounded: "12px"
    padding: "8px 12px"
  input-default:
    backgroundColor: "#ffffff"
    textColor: "#111c2d"
    rounded: "12px"
    padding: "10px 12px"
  card-default:
    backgroundColor: "#ffffff"
    rounded: "16px"
    padding: "24px"
  badge-primary:
    backgroundColor: "rgba(0, 106, 101, 0.1)"
    textColor: "#006a65"
    rounded: "9999px"
    padding: "2px 10px"
---

# Design System: Hyred Luminous

## Overview

**Creative North Star: "The Luminous Compass"**

Hyred's interface is a calm navigation instrument for a noisy job market. The Luminous system (Google Stitch, May 2026) favors cool off-white atmospheres, deep ink typography, and a disciplined teal accent that signals action and match quality without shouting. Surfaces feel airy and trustworthy — a professional SaaS dashboard, not a generic AI landing page.

Density is medium: cards breathe with 24px padding, lists scan quickly, and data (match scores, skill pills, status counts) is always visible. Motion is subtle — short fades and lifts on hover, never bounce or elastic easing. The product reads as **intelligent, grounded, and premium-accessible**.

**Key Characteristics:**
- Teal gradient (`#006a65` → `#2cc9c0`) for primary CTAs and brand moments
- Cool off-white canvas (`#f9f9ff`) with white cards and blue-tinted surface containers
- Plus Jakarta Sans throughout — no Inter, no purple gradients
- Fixed 260px sidebar + glass header on desktop; bottom nav on mobile
- Match score ring and left-border cards as signature data patterns
- Soft teal-tinted shadows, not heavy gray drop shadows

## Colors

A cool, blue-tinted neutral field with a deep teal primary and mint secondary accents. Color communicates match quality and hierarchy, not decoration.

### Primary
- **Deep Luminous Teal** (`#006a65`): Brand anchor, links, active accents, score thresholds, form focus rings, selection highlight base.
- **Mint Signal** (`#2cc9c0` / `primary-container`): Gradient end, high match scores (75%+), active nav/tab fills, success-adjacent highlights.
- **Aqua Spark** (`#6bf8ee` / `primary-fixed`): Rare sparkle accents; skeleton shimmer hints.

### Secondary
- **Forest Action** (`#006c4b`): Secondary buttons, premium nav items (e.g. Top MNCs).
- **Spring Mint** (`#64f9bc` / `secondary-container`): Secondary container fills, mid-tier score band accents.

### Neutral
- **Cool Canvas** (`#f9f9ff`): Page background and base surface.
- **Ink Headline** (`#111c2d` / `on-surface`): Primary text, headings, high-contrast body.
- **Slate Body** (`#3c4948` / `on-surface-variant`): Secondary text, nav inactive labels.
- **Mist Muted** (`#6c7a78` / `text-muted`): Metadata, placeholders, low scores.
- **Paper Card** (`#ffffff` / `surface-container-lowest`): Cards, inputs, sidebar shell.
- **Blue Mist** (`#f0f3ff` / `surface-container-low`): Hover fills, input backgrounds, subtle panels.
- **Periwinkle Wash** (`#e7eeff` / `surface-container`): Badges, skeleton shimmer, inactive chip backgrounds.
- **Soft Divider** (`#bbcac7` / `outline-variant`): Borders, scrollbar thumb, card dividers.

### Semantic
- **Match Success** (`#2cc9c0`): Score ring 90%+, success badges, positive insight borders.
- **Error** (`#ba1a1a`): Destructive states, validation errors.

### Named Rules
**The Teal Rarity Rule.** The primary teal gradient appears on one main CTA per view region (e.g. Run Scan, Save, Generate). Accent teal in borders, rings, and score data — not flooded across every element.

**The Cool Canvas Rule.** Backgrounds stay in the blue-tinted off-white family (`#f9f9ff`–`#e7eeff`). Pure gray `#f5f5f5` or warm beige breaks the system.

## Typography

**Display / Headline / Body Font:** Plus Jakarta Sans (Google Fonts, weights 400–800)  
**Label Font:** Plus Jakarta Sans (semibold, tight tracking)  
**Mono Font:** Geist (code snippets only, rare)

**Character:** Geometric, friendly, and confident — rounded terminals without feeling childish. One family keeps the dashboard cohesive.

### Hierarchy
- **Display** (800, `clamp(2rem, 5vw, 3rem)`, lh 1.1): Dashboard greeting, hero moments on marketing pages.
- **Headline** (700, 32px / 24px mobile, lh 1.2): Page titles, job titles on cards.
- **Title** (600, 20px, lh 1.3): Section headers, card subheads.
- **Body** (400–500, 16px / 14px `body-md`, lh 1.5): Paragraphs, descriptions; keep ~65–75ch on long prose.
- **Label** (600, 12px, ls 0.01em): Nav items, tab labels, uppercase micro copy on score ring ("MATCH").
- **Stat** (700, 32px, lh 1): Dashboard stat values, large numerics.

### Named Rules
**The One Voice Rule.** Plus Jakarta Sans only for UI. No Inter, Arial, or system-ui as a deliberate display choice.

**The Weight Ladder Rule.** Headlines gain authority through weight (700–800) and tight tracking, not through oversized purple gradients or all-caps shouting.

## Layout

**Desktop shell:** Fixed `260px` left sidebar (`lg+`), full-width header (`h-20`, `z-60`) with `lg:pl-[284px]` content offset. Header holds dashboard search (home only), Run Scan CTA, and avatar.

**Dashboard:** At `xl+`, main match list flexes beside a `xl:w-72` insights column; below `xl`, stacks vertically.

**Status workflow:** Seven-column grid tabs (Inbox → Saved) in a single row — no horizontal scroll on desktop.

**Spacing rhythm:** 8px (`stack-sm`) / 16px (`stack-md`) / 24px (`card-pad`) / 32px (`stack-lg`). Section gaps up to 96px on marketing surfaces.

**Max content width:** `1200px` (`page` / `container-max`).

**Mobile:** Bottom nav (`lg:hidden`), 16px gutters, toasts bottom-right above nav.

## Elevation & Depth

Hybrid: **tonal layering first**, soft teal-tinted shadows second. Cards rest on white with `shadow-card`; hover promotes to `shadow-elevated` with a 4px upward translate. Header and mobile nav use `backdrop-blur-md` on semi-transparent surfaces.

Flat at rest; depth responds to hover, focus, and "new" match emphasis (ring + elevated shadow).

### Shadow Vocabulary
- **Card** (`0px 8px 32px rgba(0, 106, 101, 0.04)`): Default card, button outline variant.
- **Elevated** (`0px 12px 48px rgba(0, 106, 101, 0.08)`): Hover cards, new inbox items.
- **Glass** (`0px 4px 24px rgba(0, 106, 101, 0.03)`): Sidebar shell.
- **Primary Glow** (`0 8px 24px rgba(0, 106, 101, 0.2)`): Primary gradient buttons.

### Named Rules
**The Lift-on-Hover Rule.** Interactive cards translate `-4px` on hover with elevated shadow. Static panels do not float by default.

## Shapes

Generously rounded, approachable geometry — not sharp corporate, not bubbly consumer.

- **Cards & panels:** `16px` (`rounded-2xl` / `card`)
- **Buttons & inputs:** `12px` (`rounded-xl` / `btn` / `field`)
- **Nav items & tabs:** `16px` active containers inside `16px` outer shells
- **Badges & pills:** Full pill (`9999px`)
- **Avatar / company tile:** `16px` square with soft border
- **Match cards:** Left accent border `4px` (teal for new/high-fit, muted otherwise)

Borders use `outline-variant` at 30–50% opacity; focus uses `ring-4 ring-primary/15`.

## Components

### Buttons
- **Shape:** Rounded-xl (12px)
- **Primary:** Teal gradient, white text, `shadow-primary-glow`, hover opacity 90%, active scale 98%
- **Secondary:** Solid forest green (`#006c4b`), white text
- **Default / outline:** White fill, subtle border, `shadow-card`, hover border tints primary
- **Ghost:** Transparent, muted text, hover primary text + `surface-container-low` fill

### Chips / Badges
- **Default:** `surface-container` bg, `on-surface-variant` text, pill shape
- **Primary:** `primary/10` bg, primary text
- **Success:** `match-success/10` bg, success text
- **Skill pills:** Compact, on match cards; green tint for matched, muted for missing

### Cards / Containers
- **Corner:** 16px
- **Background:** White (`surface-container-lowest`)
- **Padding:** 24px (`p-6`)
- **Border:** Optional left-4 accent on match cards; subtle `outline-variant` on tiles
- **Hover:** `-translate-y-1`, `shadow-elevated`, primary-tinted border

### Inputs / Fields
- **Style:** White bg, `outline-variant` border, 12px radius, 14–16px text
- **Focus:** Primary border + `ring-4 ring-primary/15`
- **Select:** Custom chevron SVG; chevron turns primary on focus
- **Radio/checkbox/range:** `accent-color: #006a65`

### Navigation
- **Sidebar:** White panel, 260px, `shadow-glass`; active item = `primary-container` fill + `on-primary-container` text + `shadow-card`
- **Header:** Frosted `surface/80`, border-b `outline-variant/20`, fixed top
- **Mobile bottom nav:** Icon + label, active = primary color
- **Status tabs:** 7-col grid in white shell; active tab = `primary-container` fill

### Match Score Ring (signature)
- **Size:** 80×80px SVG ring, 8px stroke
- **Track:** `primary/10`
- **Fill color by band:** 90+ success mint, 75+ primary-container, 60+ secondary-fixed-dim, else muted
- **Center:** Bold score + tiny "MATCH" label

## Do's and Don'ts

### Do:
- **Do** use the teal gradient for the single primary action in a header or form footer.
- **Do** keep cards white on the cool canvas; use `surface-container-low` only for hover and nested panels.
- **Do** show match scores with the ring + left-border card pattern on dashboard lists.
- **Do** use Plus Jakarta Sans at weights 600–800 for labels and headlines.
- **Do** animate with `fade-in` (0.2s) and subtle `translateY` lifts — ease-out only.

### Don't:
- **Don't** use Inter, Arial, or generic purple-to-blue gradients — the pre-Luminous Indigo era is retired.
- **Don't** nest cards inside cards without a clear tonal step (white inside `surface-container-low` only).
- **Don't** use bounce, elastic, or playful overshoot easing on UI transitions.
- **Don't** put gray (`#888`) text on teal or colored backgrounds — use white or `on-primary` on fills.
- **Don't** use pure black (`#000`) for text; ink is `#111c2d`.
- **Don't** add footer legal links inside the logged-in app shell (sign-up only).
