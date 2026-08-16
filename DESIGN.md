---
name: Hyred Lime
description: Career listing dashboard. Dark forest-teal filter slab, grey job cards on a white page, lime used only as accent.
colors:
  lime-brand: "#72D35F"
  forest-teal: "#003F3B"
  canvas: "#FFFFFF"
  card: "#F3F4F6"
  ink: "#111111"
  secondary-text: "#555555"
  muted-text: "#888888"
  white: "#FFFFFF"
  divider: "#E5E7EB"
  shadow: "rgba(0, 0, 0, 0.05)"
typography:
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
  display:
    size: "clamp(2rem, 5vw, 3.5rem)"
    weight: 800
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    size: "32px"
    weight: 700
    lineHeight: 1.2
  title:
    size: "20px"
    weight: 700
    lineHeight: 1.3
  body:
    size: "16px"
    weight: 400
    lineHeight: 1.5
  label:
    size: "12px"
    weight: 600
    letterSpacing: "0.02em"
---

# Design System: Hyred Lime

## Colors
- **Lime Brand (#72D35F)**: Accent only — active chips, small highlights. Never fill the filter slab or the page.
- **Forest Teal (#003F3B)**: Filter sidebar fill, Apply now, logo mark. White text on forest.
- **Canvas (#FFFFFF)**: Page and shell background.
- **Card fill (#F3F4F6)**: Slightly grey job cards so they read as lifted on white.
- **Ink (#111111)**: Headings, job titles, salary/score on cards. Never use pure #000 for body text.
- **Secondary Text (#555555)**: Used for sub-headings, meta-data labels, and active navigation links.
- **Muted Text (#888888)**: Used for descriptions, blurbs, and inactive meta-data.
- **White (#FFFFFF)**: Used for card backgrounds, the top navigation header, and input field backgrounds.

## Typography
- **Primary Face**: Geometric Sans-Serif (Inter or equivalent).
- **Scale**:
  - **Display**: 800 weight. Used for the job-search heading (role or “Matches”).
  - **Headline**: 700 weight, 32px. Used for page titles and job titles on cards.
  - **Title**: 700 weight, 20px. Used for section headers (e.g., "Filters", "Key Requirements").
  - **Body**: 400 weight, 16px (14px for compact meta). Used for all job descriptions and meta row info.
  - **Label**: 600 weight, 12px. Used for navigation tabs, filter labels, and card tags.

## Spacing
- **Base Grid**: 8-point system (8 / 16 / 24 / 32 / 48 / 64).
- **Card Padding**: Fixed 24px internal padding.
- **Page Margin**: Max-width 1440px on the dashboard. Forest filter slab ~280px.
- **Gaps**: 16px between cards in a grid; 32px between major page sections.

## Radius
- **Cards & Panels**: 16px (Large).
- **Buttons & Inputs**: 12px (Medium).
- **Pills**: 9999px (Full).
- **Avatars**: 16px (Matching cards).

## Shadows
- **Resting Card**: layered, offset depth — `0 1px 2px rgba(17,17,17,0.06), 0 10px 28px rgba(17,17,17,0.08)`. Cards sit above the canvas.
- **Hover Card**: `0 6px 12px rgba(17,17,17,0.08), 0 20px 44px rgba(17,17,17,0.12)` plus 6px lift.
- **Floating Sidebar**: `0 0 40px rgba(0, 0, 0, 0.04)`. Soft depth.

## Motion
- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` (Out-Expo).
- **Page Entrance**: 200ms fade-in + 8px slide up for content.
- **Sidebar Entrance**: 320ms slide-in from left (16px) with fade.
- **Card Stagger**: 60ms delay per card, max 8 cards animating at once.
- **Card Hover**: 200ms transition for `-6px translateY` and shadow deepening.
- **Score Count**: 400ms linear count-up for numbers on card load.

## Components
- **Filled Button**: Forest teal, white text. Apply now is a full-width pill (9999px). One filled button per card.
- **Match Card**: Slightly grey `#F3F4F6` on a white page, ~24px radius, offset shadow. Top-left is real salary only. Score is a lime number tile. Heart top-right. Blurb expands with **see more** (not CSS-clamped). Matched = lime checks; unmatched = red, including when the list query has no JD. Build Custom Resume on every card. One forest Apply now pill.
- **Chip**: Lime for matched skills and active Inbox/Saved. Red for unmatched skills.
- **Filter Sidebar**: Tall **sticky** forest slab `#003F3B` (viewport height, internal scroll). Score slider + freshness ticks at the top. White labels. Lime never fills this panel.
- **Dropdowns**: `PremiumSelect` (Hyred listbox), not the OS menu.
- **Run Scan**: Forest `SpecularButton` with lime rim shine (one WebGL control).
- **Scan live HUD**: After **Run Scan**, a radar pill appears bottom-right. It does not overlay or lock the page. Stop lives on that pill.

## Do / Don't
### Do
- **Do** use white text on the forest filter slab.
- **Do** use the signature 8-point spacing rhythm for all margins.
- **Do** prioritize scannability; keep job titles bold and clear.
- **Do** use exactly one filled Teal button per view region.

### Don't
- **Don't** use purple, blue, or neon gradients. This is a Lime and Teal system.
- **Don't** use the name CareerFlow, fake applicant counts, or fake salaries.
- **Don't** use bounce or elastic easing; stick to the specified Out-Expo.
- **Don't** add footers to the logged-in app shell.
