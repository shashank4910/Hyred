// Hyred ATS config — Lever (jobs.lever.co).
(() => {
  'use strict';
  const R = (window.__JR_ATS = window.__JR_ATS || {});
  R.lever = {
    id: 'lever',
    method: 'react',
    fields: [
      { id: 'name', profile: 'full_name', css: ['input[name="name"]', 'input[data-qa="name-input"]'] },
      { id: 'email', profile: 'email', css: ['input[name="email"]', 'input[type="email"]'] },
      { id: 'phone', profile: 'phone', css: ['input[name="phone"]', 'input[type="tel"]'] },
      { id: 'location', profile: 'location.full', css: ['input[name="location"]', 'input[data-qa="location-input"]'], typeahead: true },
      { id: 'linkedin', profile: 'links.linkedin', css: ['input[name="urls[LinkedIn]"]', 'input[name*="LinkedIn" i]'], urlOnly: true },
      { id: 'github', profile: 'links.github', css: ['input[name="urls[GitHub]"]', 'input[name*="GitHub" i]'], urlOnly: true },
      { id: 'portfolio', profile: 'links.portfolio', css: ['input[name="urls[Portfolio]"]', 'input[name*="Portfolio" i]'], urlOnly: true },
      { id: 'resume', profile: '_resume', css: ['input[type="file"][name="resume"]', 'input.resume-upload-input'], kind: 'resume' },
      { id: 'company', profile: 'latest_company', css: ['input[name="org"]', 'input[name="company"]'] },
      { id: 'title', profile: 'current_title', css: ['input[name="title"]', 'input[name="currentTitle"]'] },
    ],
    arrays: [
      {
        id: 'experience',
        profile: 'work_history',
        max: 6,
        addCss: ['a.add-another-posting[data-source="posting"]', 'a[data-source="posting"]'],
        rowCss: ['.postings-group .posting', '.additional-resume-section'],
        fields: [
          { id: 'company', profile: 'company', css: ['input[name*="company" i]'] },
          { id: 'title', profile: 'title', css: ['input[name*="title" i]'] },
          { id: 'summary', profile: 'summary', css: ['textarea[name*="summary" i]', 'textarea'] },
        ],
      },
    ],
    customQuestions: true,
  };
})();
