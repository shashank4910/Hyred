// Hyred ATS config — Universal / long-tail career sites (Phenom, custom domains, unknown ATS).
(() => {
  'use strict';
  const R = (window.__JR_ATS = window.__JR_ATS || {});
  R.universal = {
    id: 'universal',
    method: 'react',
    // Vendor attribute hints used by fillByVendorAttributes in content.js — listed for docs.
    vendorAttrs: ['data-ph-at-id', 'data-ph-id', 'data-field', 'data-field-id', 'data-qa', 'data-testid'],
    fields: [
      { id: 'first_name', profile: 'first_name', css: ['input[autocomplete="given-name"]', 'input[name*="first" i][name*="name" i]'] },
      { id: 'last_name', profile: 'last_name', css: ['input[autocomplete="family-name"]', 'input[name*="last" i][name*="name" i]'] },
      { id: 'full_name', profile: 'full_name', css: ['input[name="name"]', 'input[autocomplete="name"]'] },
      { id: 'email', profile: 'email', css: ['input[type="email"]', 'input[name*="email" i]'] },
      { id: 'phone', profile: 'phone', css: ['input[type="tel"]', 'input[name*="phone" i]', 'input[name*="mobile" i]'] },
      { id: 'city', profile: 'location.city', css: ['input[name*="city" i]', 'input[autocomplete="address-level2"]'] },
      { id: 'state', profile: 'location.region', css: ['input[name*="state" i]', 'input[autocomplete="address-level1"]'] },
      { id: 'country', profile: 'location.country', css: ['input[name*="country" i]', 'select[name*="country" i]'] },
      { id: 'postal', profile: 'zip_code', css: ['input[name*="zip" i]', 'input[name*="postal" i]', 'input[autocomplete="postal-code"]'] },
      { id: 'linkedin', profile: 'links.linkedin', css: ['input[name*="linkedin" i]'], urlOnly: true },
      { id: 'github', profile: 'links.github', css: ['input[name*="github" i]'], urlOnly: true },
      { id: 'portfolio', profile: 'links.portfolio', css: ['input[name*="portfolio" i]', 'input[name*="website" i]'], urlOnly: true },
      { id: 'title', profile: 'current_title', css: ['input[name*="jobtitle" i]', 'input[name*="job_title" i]', 'input[name*="current_title" i]'] },
      { id: 'company', profile: 'latest_company', css: ['input[name*="company" i]', 'input[name*="employer" i]', 'input[name="org"]'] },
      { id: 'notice_period', profile: 'notice_period', css: ['select[name*="notice" i]', 'select[id*="notice" i]'], kind: 'dropdown' },
      { id: 'total_experience', profile: 'years_experience', css: ['select[name*="experience" i]', 'select[id*="experience" i]'], kind: 'dropdown' },
      { id: 'current_ctc', profile: 'total_ctc', css: ['input[name*="ctc" i]', 'input[name*="salary" i][name*="current" i]', 'input[id*="current" i][id*="ctc" i]'] },
      { id: 'expected_ctc', profile: 'expected_ctc', css: ['input[name*="expected" i][name*="ctc" i]', 'input[name*="expected" i][name*="salary" i]', 'input[id*="expected" i][id*="ctc" i]'] },
      { id: 'resume', profile: '_resume', css: ['input[type="file"][name*="resume" i]', 'input[type="file"][name*="cv" i]'], kind: 'resume' },
    ],
    arrays: [],
    customQuestions: true,
  };
})();
