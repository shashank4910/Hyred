# ATS adapter layout (Hyred extension)

## Co-founder / tech-lead model

**One detector, one adapter per ATS.** `content.js` stays a thin orchestrator:

```
detectAts() → adapter.fill(profile, filledSet, match)
           → adapter.fillGaps? (AI mapFields fallback)
```

Do **not** mix Workday selectors into Lever handlers or vice versa.

## Current state (v0.12.7)

| Layer | Role |
|--------|------|
| `content.js` `detectAts()` | Host/DOM detection → `workday` \| `greenhouse` \| `lever` \| `ashby` \| `generic` |
| `ats-config/*.js` | Declarative field recipes (CSS, profile paths) |
| `ats-fill.js` | Generic engine: runs recipes, arrays, dropdowns |
| `content.js` `fillWorkday*` | **Legacy** — Workday-only DOM (multiselect, Add rows, typeahead) |

Workday is split today: simple fields via `ats-fill` + `ats-config/workday.js`; complex flows still in `content.js`.

## Target structure (incremental migration)

```
extension/
  ats/
    registry.js          # detectAts + getAdapter(id)
    base.js                # shared: setFieldValue, filledSet, sleep
    workday/
      index.js             # export { id, detect, fill }
      experience.js        # rows, dates, currentlyWorkHere
      education.js         # school, GPA, degree
      multiselect.js       # skills, source (chip multiselect)
      languages.js         # Languages 1 panel: dropdown + fluent + proficiency
      screening.js         # application questions, EEO
    lever/index.js
    greenhouse/index.js
    successfactors/index.js   # when we add SF
```

**Migration rule:** when touching a Workday bug, move that function from `content.js` into `ats/workday/` and call it from `workday/index.js` only.

## Adding SuccessFactors / iCIMS / Taleo

1. Add `ats-config/successfactors.js` (recipes).
2. Add `ats/successfactors/index.js` (imperative fill).
3. Register in `registry.js` with `detect()` (host + DOM markers).
4. No changes to Workday module.

## Shared vs ATS-specific

| Shared | ATS-specific |
|--------|----------------|
| Profile JSON, AI mapFields, resume upload | Selectors, multiselect UX, step detection |
| `filledSet`, progress UI | "Add another job", Workday spinbutton dates |
| Auth, background API | SuccessFactors wizard steps |
