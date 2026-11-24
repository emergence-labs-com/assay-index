const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

export function chapterHref(assay) {
  return '#/assay/' + encodeURIComponent(assay.id);
}

export function chapterNumber(index) {
  return String(index + 1).padStart(3, '0');
}
