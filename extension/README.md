# JobRadar Autofill — Browser Extension

Drops onto any job application page and auto-fills it with your JobRadar profile, injects the AI-generated cover letter, and answers screening questions using your resume.

Pairs with the JobRadar app deployed at your Vercel URL.

## Install (5 minutes, Chrome / Edge / Brave / Arc)

1. Clone this repo (or download the `extension/` folder as a zip).
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Toggle **"Developer mode"** on (top right).
4. Click **"Load unpacked"**.
5. Select the `extension/` folder.
6. Pin the JobRadar icon to your toolbar.

## Connect (10 seconds)

1. Click the JobRadar toolbar icon → popup opens.
2. Enter your **JobRadar URL** (e.g. `https://job-radar-xxx.vercel.app`).
3. Enter your **APP_PASSWORD** (the one you set in Vercel env vars).
4. Click **Connect**.

You should see "Connected to ..." with your name + email.

## Use

1. Open any job application page (Greenhouse, Lever, Ashby, Workable, Naukri, LinkedIn, company career pages, etc).
2. A floating green **JobRadar Autofill** button appears bottom-right.
3. Click it. In ~2 seconds:
   - Standard fields filled (name, email, phone, location, LinkedIn, GitHub, etc.)
   - Cover letter injected into the cover letter textarea (if a JobRadar match exists for this URL)
   - Screening questions answered ("Why this role?", "Tell us about your experience with X") via OpenAI
4. Review what got filled, manually upload your resume PDF, hit **Submit**.
5. The extension auto-marks the JobRadar match as **"applied"** when you click Submit.

## Supported sites

**Auto-detected:** Greenhouse, Lever, Ashby, Workable, **Workday** (`*.myworkdayjobs.com`), iCIMS, BambooHR, SmartRecruiters, Recruitee, TeamTailor, Jobvite, Taleo, Naukri, LinkedIn, Wellfound, Indeed, plus generic fallback.

### Workday (Page 1 — v0.8.9+)

Dedicated adapter in `content.js` — not regex-only. Verified on Cohesity careers.

1. **Text fields** — `data-automation-id` on wrapper divs (`formField-legalName--firstName`, city, postal, phone).
2. **Dropdowns** — click trigger → `ul[role="listbox"]` → option by text (Country, Phone device type).
3. **multiSelect prompts** (hardest) — scroll + click `promptIcon` → type filter → pick option → confirm **`selectedItem` chip**:
   - **How did you hear about us?** → always **LinkedIn** (exact match, not sub-variants).
   - **Country phone code** → profile country (e.g. India (+91)).
4. **Screening radios** — e.g. "previously employed" → **No** (safe default).

Full architecture + debug logs: `CONTEXT.md` → `### Workday autofill — Page 1 "My Information"`.

**Field detection** uses a layered strategy:
1. Match field name/id/placeholder/aria-label/label-text against a regex rule table (covers ~95% of standard fields).
2. For long open-ended textareas that look like screening questions, call OpenAI to answer based on your resume + the page text.

## Privacy

- Your APP_PASSWORD is exchanged once for a 90-day JWT, stored in `chrome.storage.local` (sandboxed to this extension).
- All API calls go to **your** JobRadar deployment. No third-party servers in the middle.
- The extension only reads form fields on pages where you click Autofill.

## Troubleshooting

| Problem | Fix |
|---|---|
| Button doesn't appear | Hard-refresh the page. SPAs sometimes hydrate after content script runs. |
| "Not connected" toast | Open the popup, click Refresh, or re-enter password. |
| "Session expired" | The JWT lives 90 days. Just reconnect in the popup. |
| Wrong field filled | The first-empty-field-only rule prevents overwrites; clear the field and click Autofill again. |
| Workday source field empty | Ensure extension **v0.8.9+**. Console (page context): `workday:ms confirm ok → LinkedIn`. Chip must appear, not just search text. |
| `workday:ms scan found 0` | Reload extension; `multiselectInputContainer` is on wrapper — fixed in v0.8.8+. |
| Console shows only `[JobRadar BG]` | DevTools context must be **top** / the Workday page, not `background.js`. |

## Roadmap

- [ ] Resume PDF upload via DataTransfer API
- [x] Workday Page 1 multiSelect (`promptIcon`, LinkedIn source, chip verify) — v0.8.9
- [ ] Workday Page 2+ (Experience, Application Questions, Voluntary Disclosures)
- [ ] Cache screening Q&A per match so you don't re-pay for re-applies
- [ ] Publish to Chrome Web Store ($5 fee, 3 day review)
