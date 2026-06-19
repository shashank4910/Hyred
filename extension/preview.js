const params = new URLSearchParams(location.search);
const previewId = params.get('id');

function showError(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.classList.add('error');
  }
}

function sendBg(type, payload) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type, payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          resolve({ ok: false, error: err.message || 'no response' });
          return;
        }
        resolve(res ?? { ok: false, error: 'no response' });
      });
    } catch (e) {
      resolve({ ok: false, error: String(e?.message ?? e) });
    }
  });
}

function renderPdf({ base64, contentType, filename }) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType || 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);
  document.title = filename || 'Resume Preview';
  const status = document.getElementById('status');
  if (status) status.remove();
  const frame = document.createElement('iframe');
  frame.src = blobUrl;
  frame.title = filename || 'Resume Preview';
  document.body.appendChild(frame);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000);
}

async function loadPreview() {
  if (!previewId) {
    showError('Missing preview id.');
    return;
  }
  const res = await sendBg('getPreviewPdf', { previewId });
  if (!res.ok || !res.base64) {
    showError(res.error || 'Could not load preview.');
    return;
  }
  try {
    renderPdf(res);
  } catch (e) {
    showError(`Could not render PDF: ${e?.message ?? e}`);
  }
}

loadPreview();
