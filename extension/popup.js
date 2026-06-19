// Popup UI for JobRadar Autofill
// Storage keys (kept in chrome.storage.local):
//   jr_url:    base URL of the JobRadar deployment, e.g. https://...
//   jr_token:  long-lived JWT issued by /api/extension/auth

const $ = (sel) => document.querySelector(sel);
const VERSION = chrome.runtime.getManifest().version;
$('#ver').textContent = VERSION;

async function getStored() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jr_url', 'jr_token'], (v) => resolve(v || {}));
  });
}
async function setStored(o) {
  return new Promise((resolve) => chrome.storage.local.set(o, resolve));
}
async function clearStored() {
  return new Promise((resolve) =>
    chrome.storage.local.remove(['jr_url', 'jr_token'], resolve),
  );
}

function host(u) {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

function showConnectIntro() {
  $('#connected').classList.add('hidden');
  $('#setup').classList.add('hidden');
  $('#connect-intro').classList.remove('hidden');
  $('#connect-status').textContent = '';
  $('#error').textContent = '';
}
function showSetup() {
  $('#connected').classList.add('hidden');
  $('#connect-intro').classList.add('hidden');
  $('#setup').classList.remove('hidden');
  $('#error').textContent = '';
}
let lastProfile = null;
let currentMatch = null;
let resumeVariant = 'default';

function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== `panel-${name}`);
  });
}

function renderStructuredProfile(profile) {
  const badge = $('#profile-structure-badge');
  const el = $('#profile-structured');
  const markBtn = $('#btn-mark-reviewed');
  const saveBtn = $('#btn-save-edits');
  if (!el) return;
  const p = profile ?? {};
  const ps = p.profile_structure ?? {};
  const readiness = ps.readiness ?? 'empty';

  if (badge) {
    const labels = {
      ready: { text: 'Ready for autofill', cls: 'ok' },
      review: { text: 'Review work history before autofill', cls: 'warn' },
      empty: { text: 'No work history — refresh from resume', cls: 'warn' },
    };
    const b = labels[readiness] || labels.empty;
    badge.className = `structure-badge ${b.cls}`;
    badge.textContent = b.text;
    if (ps.source) {
      badge.textContent += ` · ${ps.source}`;
    }
  }
  if (markBtn) {
    markBtn.disabled = readiness === 'ready' || !(ps.work_count > 0);
    markBtn.textContent = readiness === 'ready' ? 'Reviewed ✓' : 'Mark as reviewed';
  }
  if (saveBtn) {
    saveBtn.disabled = !(ps.work_count > 0);
  }

  const contact = [
    p.full_name,
    p.location?.full,
    p.email,
    p.phone,
  ]
    .filter(Boolean)
    .map((v) => escape(String(v)))
    .join('<br/>');

  const jobs = (p.structured_work_history?.length ? p.structured_work_history : p.work_history) ?? [];
  const edu = (p.structured_education?.length ? p.structured_education : p.education) ?? [];
  const skills = (p.skills ?? []).slice(0, 24);
  const languages = (p.languages ?? ['English', 'Hindi']).slice(0, 12);
  const links = [
    p.links?.linkedin && `LinkedIn: ${p.links.linkedin}`,
    p.links?.github && `GitHub: ${p.links.github}`,
  ].filter(Boolean);

  const jobHtml = jobs.length
    ? jobs
        .map(
          (j, i) => `
      <div class="prof-block editable" data-job-index="${i}">
        <label class="prof-label">Job title</label>
        <input class="prof-input" data-field="title" value="${escape(j.title || '')}" placeholder="Senior Performance Engineer" />
        <label class="prof-label">Company</label>
        <input class="prof-input" data-field="company" value="${escape(j.company || '')}" placeholder="Employer name" />
        <label class="prof-label">Location</label>
        <input class="prof-input" data-field="location" value="${escape(j.location || '')}" placeholder="City, State" />
        <div class="prof-row-2">
          <div>
            <label class="prof-label">Start</label>
            <input class="prof-input" data-field="start" value="${escape(j.start || '')}" placeholder="Sep 2024" />
          </div>
          <div>
            <label class="prof-label">End</label>
            <input class="prof-input" data-field="end" value="${escape(j.end || '')}" placeholder="Present" />
          </div>
        </div>
        <label class="prof-label">Role description (used in Workday / ATS)</label>
        <textarea class="prof-textarea" data-field="summary" rows="5" placeholder="Achievements, clients, metrics…">${escape(j.summary || '')}</textarea>
      </div>`,
        )
        .join('')
    : '<p class="muted">No jobs yet. Click Refresh from resume.</p>';

  const eduHtml = edu.length
    ? edu
        .map(
          (e, i) => `
      <div class="prof-block compact editable" data-edu-index="${i}">
        <label class="prof-label">School</label>
        <input class="prof-input" data-field="school" value="${escape(e.school || '')}" />
        <div class="prof-row-2">
          <div>
            <label class="prof-label">Degree</label>
            <input class="prof-input" data-field="degree" value="${escape(e.degree || '')}" />
          </div>
          <div>
            <label class="prof-label">Field</label>
            <input class="prof-input" data-field="field" value="${escape(e.field || '')}" />
          </div>
        </div>
        <div class="prof-row-2">
          <div>
            <label class="prof-label">From year</label>
            <input class="prof-input" data-field="start" value="${escape(e.start || '')}" />
          </div>
          <div>
            <label class="prof-label">Grad year</label>
            <input class="prof-input" data-field="end" value="${escape(e.end || '')}" />
          </div>
        </div>
        <label class="prof-label">Overall GPA / result (e.g. 8.2 or 8.2/10)</label>
        <input class="prof-input" data-field="gpa" value="${escape(e.gpa || '')}" placeholder="Leave blank if not on resume" />
      </div>`,
        )
        .join('')
    : '<p class="muted">No education extracted.</p>';

  el.innerHTML = `
    <div class="prof-section">
      <div class="section-label">Contact</div>
      <div class="prof-contact">${contact || '<span class="muted">—</span>'}</div>
      <p class="muted" style="margin-top:4px">Edit name, email, phone on Hyred Settings → Application Profile.</p>
    </div>
    <div class="prof-section">
      <div class="section-label">Experience (${jobs.length}) — editable</div>
      ${jobHtml}
    </div>
    <div class="prof-section">
      <div class="section-label">Education — editable</div>
      ${eduHtml}
    </div>
    <div class="prof-section">
      <div class="section-label">Skills (comma-separated)</div>
      <textarea id="prof-skills-input" class="prof-textarea" rows="2" placeholder="JMeter, LoadRunner, AppDynamics…">${escape(skills.join(', '))}</textarea>
    </div>
    <div class="prof-section">
      <div class="section-label">Languages (comma-separated)</div>
      <textarea id="prof-languages-input" class="prof-textarea" rows="2" placeholder="English, Hindi">${escape(languages.join(', '))}</textarea>
      <p class="muted" style="margin-top:4px">Saved with Save edits — used for Workday language multiselect.</p>
    </div>
    ${
      links.length
        ? `<div class="prof-section"><div class="section-label">Links</div><div class="prof-links">${links.map((l) => `<div>${escape(l)}</div>`).join('')}</div></div>`
        : ''
    }
    ${
      ps.warnings?.length
        ? `<div class="prof-warnings"><div class="section-label">Check</div><ul>${ps.warnings.map((w) => `<li>${escape(w)}</li>`).join('')}</ul></div>`
        : ''
    }
  `;
}

function collectStructuredEditsFromForm() {
  const work = [];
  document.querySelectorAll('[data-job-index]').forEach((block) => {
    const row = {};
    block.querySelectorAll('[data-field]').forEach((input) => {
      const key = input.dataset.field;
      row[key] = input.value.trim();
    });
    if (row.company || row.title) work.push(row);
  });
  const education = [];
  document.querySelectorAll('[data-edu-index]').forEach((block) => {
    const row = {};
    block.querySelectorAll('[data-field]').forEach((input) => {
      const key = input.dataset.field;
      row[key] = input.value.trim();
    });
    if (row.school || row.degree) education.push(row);
  });
  const skillsRaw = $('#prof-skills-input')?.value || '';
  const skills = skillsRaw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 32);
  const languagesRaw = $('#prof-languages-input')?.value || '';
  const languages = languagesRaw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  return { structured_work_history: work, structured_education: education, skills, languages };
}

function renderProfileCopy(profile) {
  renderStructuredProfile(profile);
}

function getSelectedResumeVariant() {
  const picked = document.querySelector('input[name="resume-variant"]:checked');
  return picked?.value === 'tailored' ? 'tailored' : 'default';
}

async function renderResumePicker(match) {
  const picker = $('#resume-picker');
  if (!picker) return;
  currentMatch = match;
  if (!match?.id || !match.has_tailored_resume) {
    picker.classList.add('hidden');
    resumeVariant = 'default';
    return;
  }
  picker.classList.remove('hidden');
  const choice = await sendBg('getResumeChoice', {
    match_id: match.id,
    has_tailored_resume: match.has_tailored_resume,
  });
  resumeVariant =
    choice.ok && choice.variant === 'tailored' ? 'tailored' : 'default';
  const tailoredRadio = picker.querySelector('input[value="tailored"]');
  const defaultRadio = picker.querySelector('input[value="default"]');
  if (tailoredRadio) tailoredRadio.checked = resumeVariant === 'tailored';
  if (defaultRadio) defaultRadio.checked = resumeVariant === 'default';
}

async function saveResumeChoice() {
  if (!currentMatch?.id) return;
  resumeVariant = getSelectedResumeVariant();
  await sendBg('setResumeChoice', {
    match_id: currentMatch.id,
    variant: resumeVariant,
  });
}

async function previewResumeVariant(variant) {
  if (!currentMatch?.id) return;
  const errEl = $('#autofill-error');
  if (errEl) errEl.textContent = '';
  const res = await sendBg('previewResume', {
    match_id: currentMatch.id,
    variant,
    preview_url:
      variant === 'tailored' ? currentMatch.tailored_resume_url : null,
  });
  if (!res.ok && errEl) {
    errEl.textContent = res.error || 'Could not open preview';
  }
}

function renderMatchCard(match) {
  const card = $('#match-card');
  if (!card) return;
  if (!match?.job) {
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="match-title">${escape(match.job.title)}</div>
    <div class="match-sub">${escape(match.job.company || '')} · score ${match.score ?? '—'}</div>
  `;
}

function renderInsights(match) {
  const el = $('#insights-body');
  if (!el) return;
  if (!match?.job) {
    el.innerHTML =
      '<p class="muted">No Hyred match for this page. Import the job in Hyred first for keyword insights.</p>';
    return;
  }
  const matched = (match.matched_skills || []).slice(0, 12);
  const missing = (match.missing_skills || []).slice(0, 12);
  el.innerHTML = `
    <div class="insight-block">
      <div class="insight-head">${escape(match.job.title)} @ ${escape(match.job.company || '')}</div>
      <div class="insight-score">Match score: <strong>${match.score ?? '—'}</strong></div>
    </div>
    ${
      matched.length
        ? `<div class="insight-block"><div class="section-label">Matched skills</div><div class="chips">${matched.map((s) => `<span class="chip ok">${escape(s)}</span>`).join('')}</div></div>`
        : ''
    }
    ${
      missing.length
        ? `<div class="insight-block"><div class="section-label">Missing keywords (add to resume)</div><div class="chips">${missing.map((s) => `<span class="chip warn">${escape(s)}</span>`).join('')}</div></div>`
        : '<p class="muted">No missing-skill gaps recorded for this match.</p>'
    }
    <p class="muted" style="margin-top:8px">Like Simplify Copilot — tailor your resume for missing keywords in Hyred.</p>
  `;
}

async function loadTabContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    renderMatchCard(null);
    renderInsights(null);
    return;
  }
  const res = await sendBg('matchByUrl', { url: tab.url });
  const match = res.ok ? res.match : null;
  renderMatchCard(match);
  await renderResumePicker(match);
  renderInsights(match);
}

function showConnected(url, profile) {
  $('#connect-intro').classList.add('hidden');
  $('#setup').classList.add('hidden');
  $('#connected').classList.remove('hidden');
  $('#connected-host').textContent = host(url);
  lastProfile = profile ?? null;
  const p = profile ?? {};
  $('#profile-summary').innerHTML = [
    p.full_name && `<div class="row-kv"><span class="label">Name</span>${escape(p.full_name)}</div>`,
    p.email && `<div class="row-kv"><span class="label">Email</span>${escape(p.email)}</div>`,
    p.phone && `<div class="row-kv"><span class="label">Phone</span>${escape(p.phone)}</div>`,
    p.location?.full && `<div class="row-kv"><span class="label">Location</span>${escape(p.location.full)}</div>`,
  ]
    .filter(Boolean)
    .join('') || '<span class="label">Complete Application Profile in Hyred Settings.</span>';
  renderProfileCopy(profile);
  loadTabContext();
}

function canonicalHyredUrl(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (parsed.hostname === 'hyred.in' || parsed.hostname === 'www.hyred.in') {
      return 'https://www.hyred.in';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return u;
  }
}

function escape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Refresh connected state via background (avoids popup CORS edge cases).
async function refreshConnected() {
  const { jr_url, jr_token } = await getStored();
  if (!jr_url || !jr_token) {
    showConnectIntro();
    return;
  }

  const verify = await sendBg('ping');
  if (!verify.connected) {
    await clearStored();
    await tryAutoConnect();
    return;
  }

  const prof = await sendBg('profile');
  if (prof.ok) {
    showConnected(jr_url, prof.profile);
  } else {
    showConnected(jr_url, null);
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { ok: res.ok, status: res.status, data };
}

// Send a message to the background service worker and await a response.
// Always reads chrome.runtime.lastError (otherwise Chrome logs an "Unchecked
// runtime.lastError: Could not establish connection" warning) and retries once
// when the MV3 worker was briefly asleep / the channel closed mid-flight.
const sendBg = (type, payload, _retried) =>
  new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          const transient =
            /Receiving end does not exist|message channel closed|message port closed/i.test(
              err.message || '',
            );
          if (transient && !_retried) {
            setTimeout(() => done(sendBg(type, payload, true)), 150);
            return;
          }
          done({ ok: false, error: err.message || 'no response' });
          return;
        }
        done(res ?? { ok: false, error: 'no response' });
      });
    } catch (e) {
      done({ ok: false, error: String(e?.message ?? e) });
    }
  });

// Try to auto-connect via background.js strategies:
//   1. Stored token → verify
//   2. getCookieToken (tab localStorage → fallback to cookies → exchange)
// If all fail, show the "Connect to Hyred" intro page.
async function tryAutoConnect() {
  const { jr_url, jr_token } = await getStored();

  // Strategy 1: stored token → show connected optimistically (instant), then
  // verify in the background. Only revert if verification actually fails.
  if (jr_url && jr_token) {
    showConnected(jr_url, lastProfile);
    const verify = await sendBg('ping');
    if (verify.connected) {
      const prof = await sendBg('profile');
      showConnected(jr_url, prof.ok ? prof.profile : null);
      return;
    }
    await clearStored();
  }

  // Strategy 2: try reading session from open tab or cookies
  const bg = await sendBg('getCookieToken');
  if (bg.ok && bg.data?.token) {
    const { jr_url } = await getStored();
    showConnected(jr_url || 'https://www.hyred.in', bg.data.profile || null);
    return;
  }

  // All auto-connect strategies failed — show the connect-intro page
  showConnectIntro();
}

// Initiate the auth tab flow: opens hyred.in/auth/extension in a new tab,
// background.js will inject a script to read the JWT from localStorage.
// We poll every 2s for the stored token.
async function initiateConnect() {
  const statusEl = $('#connect-status');
  const btn = $('#btn-connect-extension');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  statusEl.textContent = 'Opening Hyred — sign in if prompted…';

  const bg = await sendBg('connectExtension');

  btn.disabled = false;
  btn.textContent = 'Connect to Hyred';

  if (bg.ok && bg.data?.token) {
    statusEl.textContent = '';
    await refreshConnected();
    return;
  }

  // Token may have been saved even if the message response was lost (popup closed).
  const { jr_token } = await getStored();
  if (jr_token) {
    statusEl.textContent = '';
    await refreshConnected();
    return;
  }

  statusEl.textContent =
    bg.error === 'auth timeout or no token found'
      ? 'Not connected. Log into Hyred in the tab that opened, then try again.'
      : bg.error || 'Connection failed. Try again or use app password.';
}

// -------------------------------------------------------------------
// Event wiring
// -------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', tryAutoConnect);

// If the background saves a token while the popup is still open (e.g. the auth
// tab finished after the user reopened the popup), reflect it live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.jr_token && changes.jr_token.newValue) {
    refreshConnected();
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
});

$('#resume-picker')?.addEventListener('change', (e) => {
  if (e.target?.name === 'resume-variant') saveResumeChoice();
});
$('#resume-picker')?.addEventListener('click', (e) => {
  const btn = e.target?.closest?.('.btn-preview');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  previewResumeVariant(btn.dataset.preview || 'default');
});

// Primary connect button
$('#btn-connect-extension').addEventListener('click', initiateConnect);

// Show APP_PASSWORD setup form
$('#btn-show-setup').addEventListener('click', showSetup);

// Back button from setup to connect-intro
$('#btn-back-connect').addEventListener('click', showConnectIntro);

// Setup form (APP_PASSWORD)
$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#error').textContent = '';
  const btn = $('#btn-connect');
  btn.disabled = true;
  btn.textContent = 'Connecting…';
  let url = canonicalHyredUrl($('#url').value);
  const password = $('#password').value;

  try {
    const auth = await fetchJson(`${url}/api/extension/auth`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!auth.ok || !auth.data.token) {
      throw new Error(auth.data.error || `Auth failed (${auth.status})`);
    }
    await setStored({ jr_url: url, jr_token: auth.data.token });
    await refreshConnected();
  } catch (err) {
    $('#error').textContent = err.message || 'Connection failed';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Connect';
  }
});

$('#btn-recheck').addEventListener('click', refreshConnected);

$('#btn-refresh-structure')?.addEventListener('click', async () => {
  const msg = $('#profile-structure-msg');
  const btn = $('#btn-refresh-structure');
  if (!btn) return;
  msg.textContent = '';
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Extracting…';
  try {
    const res = await sendBg('refreshStructure');
    if (!res.ok) {
      const err =
        res.error === 'no_resume_text'
          ? 'Upload a resume in Hyred first.'
          : res.error || 'Refresh failed';
      throw new Error(err);
    }
    if (res.profile) {
      lastProfile = res.profile;
      renderStructuredProfile(res.profile);
    } else {
      const prof = await sendBg('profile');
      if (prof.ok) {
        lastProfile = prof.profile;
        renderStructuredProfile(prof.profile);
      }
    }
    const n = res.work_count ?? 0;
    msg.textContent = n
      ? `Found ${n} job${n === 1 ? '' : 's'}. Review below, then Mark as reviewed.`
      : 'No jobs found — check resume or edit on Hyred.';
    msg.classList.remove('error');
    msg.classList.add('ok');
  } catch (e) {
    msg.textContent = e.message ?? 'Refresh failed';
    msg.classList.add('error');
    msg.classList.remove('ok');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

$('#btn-mark-reviewed')?.addEventListener('click', async () => {
  const msg = $('#profile-structure-msg');
  const btn = $('#btn-mark-reviewed');
  if (!btn || btn.disabled) return;
  msg.textContent = '';
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Saving…';
  try {
    const edits = collectStructuredEditsFromForm();
    const res = await sendBg('saveStructure', {
      ...edits,
      mark_reviewed: true,
    });
    if (!res.ok) throw new Error(res.error || 'Save failed');
    if (res.profile) {
      lastProfile = res.profile;
      renderStructuredProfile(res.profile);
    }
    msg.textContent = 'Work history confirmed — autofill will use these jobs.';
    msg.classList.remove('error');
    msg.classList.add('ok');
  } catch (e) {
    msg.textContent = e.message ?? 'Save failed';
    msg.classList.add('error');
    msg.classList.remove('ok');
    btn.disabled = false;
    btn.textContent = prev;
  }
});

$('#btn-save-edits')?.addEventListener('click', async () => {
  const msg = $('#profile-structure-msg');
  const btn = $('#btn-save-edits');
  if (!btn || btn.disabled) return;
  msg.textContent = '';
  btn.disabled = true;
  const prev = btn.textContent;
  btn.textContent = 'Saving…';
  const wasReady = lastProfile?.profile_structure?.readiness === 'ready';
  try {
    const edits = collectStructuredEditsFromForm();
    const res = await sendBg('saveStructure', {
      ...edits,
      mark_reviewed: wasReady,
    });
    if (!res.ok) throw new Error(res.error || 'Save failed');
    if (res.profile) {
      lastProfile = res.profile;
      renderStructuredProfile(res.profile);
    }
    msg.textContent = wasReady
      ? 'Profile saved — autofill will use your edits.'
      : 'Saved. Mark as reviewed when ready for autofill.';
    msg.classList.remove('error');
    msg.classList.add('ok');
  } catch (e) {
    msg.textContent = e.message ?? 'Save failed';
    msg.classList.add('error');
    msg.classList.remove('ok');
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
});

$('#btn-disconnect').addEventListener('click', async () => {
  await clearStored();
  showConnectIntro();
});

$('#btn-autofill-tab').addEventListener('click', async () => {
  const errEl = $('#autofill-error');
  errEl.textContent = '';
  const btn = $('#btn-autofill-tab');
  btn.disabled = true;
  btn.textContent = 'Filling…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
      throw new Error('Open a job application page (https) first.');
    }
    // Make sure the engine + content script are injected (no-op if already
    // loaded). autofill-engine.js MUST load first — content.js depends on it.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['autofill-engine.js', 'content.js'],
      });
    } catch (e) {
      throw new Error(
        `Cannot run on this page: ${e?.message ?? 'restricted URL'}`,
      );
    }
    const options = {
      resume: $('#opt-resume')?.checked !== false,
      coverLetter: $('#opt-cover')?.checked !== false,
      commonFields: $('#opt-common')?.checked !== false,
      aiQuestions: $('#opt-ai')?.checked !== false,
      resumeVariant: currentMatch?.has_tailored_resume
        ? getSelectedResumeVariant()
        : 'default',
      matchId: currentMatch?.id || null,
    };
    await saveResumeChoice();
    const res = await sendBg('fanOutAutofill', { tabId: tab.id, options });
    if (!res?.ok) {
      throw new Error(res?.error || 'Autofill failed');
    }
    if ((res.filled || 0) === 0) {
      errEl.textContent =
        'No fields filled — open page Console (F12), filter [JobRadar], retry after page loads.';
    } else {
      window.close();
    }
  } catch (e) {
    errEl.textContent = e.message ?? 'Failed';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Autofill this page';
  }
});
