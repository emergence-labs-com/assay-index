import { escapeHtml, chapterNumber, chapterHref } from './markup.js';

const byName = (left, right) =>
  left.name.localeCompare(right.name, 'en', { sensitivity: 'base', numeric: true });
const searchIcon =
  '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const closeIcon =
  '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 6 12 12M18 6 6 18"/></svg>';

function indexProviders(assays) {
  const providers = new Map();
  for (const assay of assays) {
    for (const provider of assay.providers || []) {
      if (!provider.name) continue;
      if (!providers.has(provider.name)) {
        providers.set(provider.name, {
          name: provider.name,
          regions: new Set(),
          chapters: new Set(),
        });
      }
      const entry = providers.get(provider.name);
      if (provider.region) entry.regions.add(provider.region);
      entry.chapters.add(assay);
    }
  }
  return [...providers.values()].sort(byName);
}

function renderProvider(entry, expanded) {
  const regions = [...entry.regions].sort().join(' · ');
  const chapters = [...entry.chapters].sort(byName);
  return `<details class="directory-entry" data-provider="${escapeHtml(entry.name)}"${expanded ? ' open' : ''}>
    <summary>
      <span class="directory-name">${escapeHtml(entry.name)}</span>
      <span class="directory-region">${escapeHtml(regions)}</span>
      <span class="directory-count">${chapters.length} ${chapters.length === 1 ? 'assay' : 'assays'}</span>
      <span class="directory-toggle" aria-hidden="true"></span>
    </summary>
    <ul class="directory-chapters">${chapters.map((assay) => `<li><a href="${chapterHref(assay)}">${escapeHtml(assay.name)}</a></li>`).join('')}</ul>
  </details>`;
}

export function renderProviderResults({ assays, query = '' }) {
  const providers = indexProviders(assays);
  const term = query.trim().toLocaleLowerCase('en');
  const matches = providers.filter((provider) =>
    [provider.name, ...provider.regions].join(' ').toLocaleLowerCase('en').includes(term),
  );
  const groups = new Map();
  for (const provider of matches) {
    const initial = provider.name.charAt(0).toLocaleUpperCase('en');
    if (!groups.has(initial)) groups.set(initial, []);
    groups.get(initial).push(provider);
  }
  const status = term
    ? `${matches.length} of ${providers.length} provider listings`
    : `${providers.length} provider listings`;
  const exactMatch = matches.length === 1 && matches[0].name.toLocaleLowerCase('en') === term;
  return (
    `<p class="directory-status" role="status">${status}</p>` +
    (matches.length
      ? [...groups]
          .map(
            ([
              initial,
              entries,
            ]) => `<section class="directory-group" aria-label="Providers starting with ${escapeHtml(initial)}">
        <h2>${escapeHtml(initial)}</h2>
        <div class="directory-entries">${entries.map((entry) => renderProvider(entry, exactMatch)).join('')}</div>
      </section>`,
          )
          .join('')
      : '<p class="directory-empty">No providers match this search. Try another name or region.</p>')
  );
}

export function renderProviders({ assays, query = '' }) {
  return `<div class="provider-directory">
    <header class="directory-heading">
      <h1 tabindex="-1">Provider directory</h1>
      <p>Find the providers listed for each assay and explore the chapters where they appear.</p>
    </header>
    <label class="directory-search">
      ${searchIcon}<span class="directory-sr">Search providers by name or region</span>
      <input id="provider-query" type="search" autocomplete="off" placeholder="Search by provider or region" value="${escapeHtml(query)}">
    </label>
    <div id="provider-results">${renderProviderResults({ assays, query })}</div>
  </div>`;
}

export function renderReader({ assays, categories, index = 0 }) {
  const close = `<button type="button" data-reader-action="close" class="reader-close" aria-label="Close chapter reader">${closeIcon}</button>`;
  if (!assays.length)
    return `<div class="reader-bar"><h2 id="reader-title">Chapter reader</h2>${close}</div><p class="reader-empty">No chapters are available.</p>`;
  const safeIndex = Number.isInteger(index) && index >= 0 && index < assays.length ? index : 0;
  const assay = assays[safeIndex];
  const category = categories[assay.category] || assay.category;
  const name =
    typeof category === 'string' ? category : category.label || category.name || assay.category;
  return `<div class="reader-bar"><span id="reader-title">Chapter reader</span>${close}</div>
    <div class="reader-spread">
      <div class="reader-cover">
        <span class="reader-cover-label">Chapter</span>
        <span class="reader-folio">${chapterNumber(safeIndex)}</span>
        <img src="./assets/mark.svg" width="32" height="32" alt="">
      </div>
      <article class="reader-page">
        <span class="reader-category">${escapeHtml(name)}</span>
        <h2>${escapeHtml(assay.name)}</h2>
        <p>${escapeHtml(assay.tagline)}</p>
        <a href="${chapterHref(assay)}" data-reader-action="open" class="reader-read">Read full chapter</a>
      </article>
    </div>
    <div class="reader-controls">
      <label class="reader-jump" for="reader-chapter"><span>Jump to chapter</span>
        <select id="reader-chapter">${assays.map((chapter, i) => `<option value="${i}"${i === safeIndex ? ' selected' : ''}>${chapterNumber(i)} · ${escapeHtml(chapter.name)}</option>`).join('')}</select>
      </label>
      <div class="reader-turns">
        <button type="button" data-reader-action="previous" aria-label="Previous chapter">Previous</button>
        <button type="button" data-reader-action="next" aria-label="Next chapter">Next</button>
      </div>
    </div>`;
}
