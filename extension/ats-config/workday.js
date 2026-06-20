// Hyred ATS config — Workday (recipe-driven fill; inspired by open Workday DOM patterns).
(() => {
  'use strict';
  const R = (window.__JR_ATS = window.__JR_ATS || {});
  R.workday = {
    id: 'workday',
    method: 'react',
    fields: [
      { id: 'first_name', profile: 'first_name', css: ['input[data-automation-id*="firstName" i]', 'input[name*="firstName" i]'] },
      { id: 'last_name', profile: 'last_name', css: ['input[data-automation-id*="lastName" i]', 'input[name*="lastName" i]'] },
      { id: 'email', profile: 'email', css: ['input[data-automation-id="email"]', 'input[type="email"]'] },
      { id: 'phone', profile: 'phone', css: ['input[data-automation-id*="phoneNumber" i]', 'input[data-automation-id*="phone" i][type="text"]'] },
      { id: 'city', profile: 'location.city', css: ['input[data-automation-id*="city" i]'] },
      { id: 'postal', profile: 'zip_code', css: ['input[data-automation-id*="postal" i]', 'input[data-automation-id*="zip" i]'] },
      {
        id: 'linkedin',
        profile: 'links.linkedin',
        css: ['input[data-automation-id="linkedinQuestion"]', 'input[name="linkedInAccount"]'],
        urlOnly: true,
      },
    ],
    dropdowns: [
      { id: 'country', profile: 'location.country', triggerCss: ['button[data-automation-id*="country" i]', 'button[id*="country" i]'] },
      { id: 'phone_type', profile: '_const:Mobile', triggerCss: ['button[data-automation-id*="phoneDeviceType" i]'] },
    ],
    // Work experience + education on "My Experience" are filled by content.js
    // (Workday typeahead / Add-button flows need legacy helpers).
    arrays: [
      {
        id: 'websites',
        profile: 'links',
        max: 3,
        addCss: ['button[aria-label*="Add Website" i]', 'button[aria-label*="Add Another Website" i]'],
        rowCss: ['div[data-automation-id^="websitePanelSet-"]'],
        fields: [{ id: 'url', profile: '_website_url', css: ['input[data-automation-id="website"]', 'input[name="url"]'], urlOnly: true }],
      },
    ],
    degreeSynonyms: {
      bachelor: ['Bachelor', 'B.S.', 'Bachelor of Science', 'B.A.', 'B.Tech', 'B.E.', 'University/Bachelors Degree'],
      master: ['Master', "Master's", 'M.S.', 'MBA', 'Masters Degree'],
      associate: ['Associate', 'Associates', 'A.A.'],
      doctorate: ['Doctorate', 'PhD', 'Ph.D.', 'Doctor'],
    },
  };
})();
