// Hyred ATS config — Greenhouse (boards.greenhouse.io).
(() => {
  'use strict';
  const R = (window.__JR_ATS = window.__JR_ATS || {});
  R.greenhouse = {
    id: 'greenhouse',
    method: 'react',
    fields: [
      { id: 'first_name', profile: 'first_name', css: ['#first_name', 'input[name="job_application[first_name]"]'] },
      { id: 'last_name', profile: 'last_name', css: ['#last_name', 'input[name="job_application[last_name]"]'] },
      { id: 'email', profile: 'email', css: ['#email', 'input[name="job_application[email]"]', 'input[type="email"]'] },
      { id: 'phone', profile: 'phone', css: ['#phone', 'input[name="job_application[phone]"]', 'input[type="tel"]'] },
      {
        id: 'linkedin',
        profile: 'links.linkedin',
        css: ['input[name*="linkedin" i]', 'input[id*="linkedin" i]'],
        urlOnly: true,
      },
      {
        id: 'github',
        profile: 'links.github',
        css: ['input[name*="github" i]', 'input[id*="github" i]'],
        urlOnly: true,
      },
      {
        id: 'portfolio',
        profile: 'links.portfolio',
        css: ['input[name*="website" i]', 'input[name*="portfolio" i]'],
        urlOnly: true,
      },
      { id: 'resume', profile: '_resume', css: ['#resume', 'input[type="file"][name*="resume" i]'], kind: 'resume' },
    ],
    arrays: [
      {
        id: 'experience',
        profile: 'work_history',
        max: 6,
        addCss: ['#add_employment', 'a.add-another-button', 'a[data-source="employment"]', '.add-another-employment'],
        rowCss: ['.employment', '#employment_fields .field', '.education--container ~ .employment'],
        fields: [
          { id: 'company', profile: 'company', css: ['input[name*="company_name" i]', 'input.employment-company'] },
          { id: 'title', profile: 'title', css: ['input[name*="title" i]', 'input.employment-title'] },
          { id: 'start', profile: '_start_month_year', css: ['input[name*="start_date" i]', 'select[name*="start_date" i]'] },
          { id: 'end', profile: '_end_month_year', css: ['input[name*="end_date" i]', 'select[name*="end_date" i]'] },
          { id: 'current', profile: '_currently_working', css: ['input[name*="current" i][type="checkbox"]'], kind: 'checkbox' },
        ],
      },
      {
        id: 'education',
        profile: 'education',
        max: 4,
        addCss: ['#add_education', 'a.add-another-education', 'a[data-source="education"]'],
        rowCss: ['.education', '#education_fields .field'],
        fields: [
          { id: 'school', profile: 'school', css: ['input[name*="school_name" i]', 'input.education-school'] },
          { id: 'degree', profile: 'degree', css: ['input[name*="degree" i]', 'select[name*="degree" i]'] },
          { id: 'discipline', profile: 'field', css: ['input[name*="discipline" i]', 'input[name*="major" i]'] },
          { id: 'end', profile: '_grad_year', css: ['input[name*="end_date" i]', 'select[name*="end_date" i]'] },
        ],
      },
    ],
    customQuestions: true,
  };
})();
