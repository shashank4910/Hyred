const params = new URLSearchParams(location.search);
const previewId = params.get('id');

function showError(message) {
  const status = document.getElementById('status');
  if (status) status.textContent = message;
}

if (!previewId) {
  showError('Missing preview id.');
} else {
  chrome.storage.session.get([previewId], (data) => {
    const item = data?.[previewId];
    if (!item?.base64) {
      showError('Preview expired or not found. Close this tab and click Preview again.');
      return;
    }
    const mime = item.contentType || 'application/pdf';
    const embed = document.createElement('embed');
    embed.src = `data:${mime};base64,${item.base64}`;
    embed.type = mime;
    document.title = item.filename || 'Resume Preview';
    const status = document.getElementById('status');
    if (status) status.remove();
    document.body.appendChild(embed);
    setTimeout(() => chrome.storage.session.remove(previewId), 120_000);
  });
}
