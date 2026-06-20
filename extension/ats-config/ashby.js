// Hyred ATS config — Ashby (jobs.ashbyhq.com).
(() => {
  'use strict';
  const R = (window.__JR_ATS = window.__JR_ATS || {});
  R.ashby = {
    id: 'ashby',
    method: 'react',
    fields: [
      { id: 'first_name', profile: 'first_name', css: ['input[name="firstName"]', 'input[autocomplete="given-name"]'] },
      { id: 'last_name', profile: 'last_name', css: ['input[name="lastName"]', 'input[autocomplete="family-name"]'] },
      { id: 'email', profile: 'email', css: ['input[name="email"]', 'input[type="email"]'] },
      { id: 'phone', profile: 'phone', css: ['input[name="phone"]', 'input[type="tel"]'] },
      { id: 'linkedin', profile: 'links.linkedin', css: ['input[name*="linkedin" i]'], urlOnly: true },
      { id: 'github', profile: 'links.github', css: ['input[name*="github" i]'], urlOnly: true },
      { id: 'resume', profile: '_resume', css: ['input[type="file"]'], kind: 'resume' },
    ],
    arrays: [
      {
        id: 'education',
        profile: 'education',
        max: 4,
        addCss: ['button[aria-label*="Add education" i]', '[data-testid*="add-education" i]'],
        rowCss: ['[data-testid*="education-entry" i]', '[class*="EducationForm" i]'],
        fields: [
          { id: 'school', profile: 'school', css: ['input[name*="school" i]'] },
          { id: 'degree', profile: 'degree', css: ['input[name*="degree" i]', 'button[role="combobox"]'] },
          { id: 'field', profile: 'field', css: ['input[name*="major" i]', 'input[name*="field" i]'] },
        ],
      },
    ],
    customQuestions: true,
  };
})();
