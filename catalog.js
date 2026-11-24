import { escapeHtml, chapterNumber, chapterHref } from './markup.js';

const icons = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  filters:
    '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  binding:
    '<path d="m4.5 14 3.8-6.6 6.8 0 3.8 6.6"/><circle cx="4.5" cy="16.5" r="2.2"/><circle cx="9.5" cy="6" r="2.2"/><circle cx="16" cy="6" r="2.2"/><circle cx="19.5" cy="16.5" r="2.2"/>',
  cell: '<path d="M20 12c0 5-4 8-8 8s-9-3-9-8 4-8 9-8 8 3 8 8Z"/><circle cx="12" cy="12" r="3"/>',
  safety: '<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  bioanalysis: '<path d="M3 20h18M4 16h3l3-11 3 13 3-7 2 5h3"/>',
  qc: '<path d="m7 3 10 0m-8 0v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M7 15h10"/>',
  adme: '<path d="M3 18c3 0 4-13 8-13s3 13 10 13M3 21h18"/>',
  genomics: '<path d="M5 3c0 8 14 10 14 18M19 3c0 8-14 10-14 18M7 6h10M9 9h6M8 16h8M6 19h12"/>',
  immunology: '<path d="m4 3 8 8 8-8M6 2l6 6 6-6M10 10v11m4-11v11"/>',
  ionchannel: '<path d="M3 6h6v13H3m18-13h-6v13h6m-9-17v8m0 4v7"/>',
  developability: '<path d="M4 18V9m5 9V5m5 13v-6m5 6V3M3 21h18"/>',
  cgt: '<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>',
  peptide:
    '<path d="m5 15 5-8 8 8"/><circle cx="4" cy="17" r="2"/><circle cx="11" cy="5" r="2"/><circle cx="20" cy="17" r="2"/>',
};

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.bioanalysis}</svg>`;
}

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—/]/g, ' ');
}

export function prepareSearch({ assays, categories, modalities }) {
  return assays.map((assay) =>
    normalize(
      [
        assay.name,
        assay.id,
        assay.tagline,
        categories[assay.category],
        ...assay.tests,
        ...assay.drugTypes.map((type) => modalities[type]),
        ...assay.providers.map((provider) => provider.name),
        ...assay.instruments.map((instrument) =>
          [instrument.name, instrument.vendor, instrument.role].filter(Boolean).join(' '),
        ),
      ].join(' '),
    ),
  );
}

function catalogSummary({ assays, modalities }) {
  const providerCount = new Set(
    assays.flatMap((assay) => assay.providers.map((provider) => provider.name)),
  ).size;
  const metrics = [
    [assays.length, 'Assays'],
    [providerCount, 'Provider listings'],
    [Object.keys(modalities).length, 'Drug modalities'],
  ];
  return `<section class="cover" aria-labelledby="cover-title">
    <div class="cover-content">
      <h1 id="cover-title">The Assay <em>Index</em></h1>
      <p>A field guide to drug discovery assays, the instruments they use, and the providers who run them.</p>
      <dl class="cover-metrics">${metrics.map(([value, label]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    </div>
  </section>`;
}

function options(labels, selected, first) {
  return (
    `<option value="">${escapeHtml(first)}</option>` +
    Object.entries(labels)
      .map(
        ([key, label]) =>
          `<option value="${escapeHtml(key)}"${key === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`,
      )
      .join('')
  );
}

export function renderCatalog(data, state) {
  return `${catalogSummary(data)}
  <section class="catalog-section" aria-labelledby="catalog-title">
    <div class="catalog-heading"><h2 id="catalog-title" tabindex="-1">Assay catalog</h2><span class="result-total" id="result-total" role="status" aria-live="polite"></span><button type="button" id="clear-filters" class="clear-filters" data-reset hidden>Clear filters</button></div>
    <div class="catalog-tools">
      <div class="search-field">${icon('search', 20)}<input type="search" id="assay-query" aria-label="Search assays, instruments, or providers" placeholder="Search assays, instruments, or providers" value="${escapeHtml(state.q)}"><kbd aria-hidden="true">/</kbd></div>
      <label class="select-field"><span class="sr-only">Drug modality</span>${icon('filters', 17)}<select id="modality">${options(data.modalities, state.modality, 'All modalities')}</select>${icon('chevron', 14)}</label>
      <label class="select-field mobile-category"><span class="sr-only">Assay category</span><select id="mobile-category">${options(data.categories, state.category, 'All categories')}</select>${icon('chevron', 14)}</label>
      <div class="view-switch" role="group" aria-label="Catalog layout">${['grid', 'list'].map((view) => `<button type="button" data-view="${view}" aria-label="${view === 'grid' ? 'Card' : 'List'} view" title="${view === 'grid' ? 'Card' : 'List'} view" aria-pressed="${state.view === view}">${icon(view)}</button>`).join('')}</div>
    </div>
    <div class="catalog-layout">
      <aside class="facet-panel" aria-label="Filter by assay category"><h3>Categories</h3><div id="category-facets"></div></aside>
      <div id="catalog-results"></div>
    </div>
  </section>`;
}

function card(assay, index, modalities) {
  const labels = assay.drugTypes.map((type) => modalities[type] || type);
  const remaining = labels.slice(2);
  const chips = labels
    .slice(0, 2)
    .map((label) => `<span>${escapeHtml(label)}</span>`)
    .join('');
  return `<a class="assay-card" href="${chapterHref(assay)}">
    <div class="card-meta"><span class="assay-symbol" data-family="${escapeHtml(assay.category)}">${icon(assay.category, 19)}</span><span class="chapter-no">Ch. ${chapterNumber(index)}</span></div>
    <div class="card-copy"><h4>${escapeHtml(assay.name)}</h4><p>${escapeHtml(assay.tagline)}</p></div>
    <div class="modality-tags">${chips}${remaining.length ? `<span class="more-tags" title="${escapeHtml(remaining.join(', '))}" aria-label="${escapeHtml(remaining.join(', '))}">+${remaining.length}</span>` : ''}</div>
  </a>`;
}

export function renderResults(data, state, searchIndex) {
  const terms = normalize(state.q).trim().split(/\s+/).filter(Boolean);
  const groups = Object.fromEntries(Object.keys(data.categories).map((key) => [key, []]));
  data.assays.forEach((assay, index) => {
    if (state.modality && !assay.drugTypes.includes(state.modality)) return;
    if (terms.every((term) => searchIndex[index].includes(term)))
      groups[assay.category].push(index);
  });
  const allCount = Object.values(groups).reduce((count, group) => count + group.length, 0);
  const showing = state.category ? groups[state.category].length : allCount;
  const facetEntries = [
    ['', 'All categories', allCount],
    ...Object.entries(data.categories).map(([key, label]) => [key, label, groups[key].length]),
  ];
  const facets = facetEntries
    .map(
      ([key, label, count]) =>
        `<button type="button" class="facet" data-category="${escapeHtml(key)}" aria-pressed="${key === state.category}"><span>${escapeHtml(label)}</span><span class="facet-count">${count}</span></button>`,
    )
    .join('');
  let results = Object.entries(data.categories)
    .map(([key, label]) => {
      if (!groups[key].length || (state.category && state.category !== key)) return '';
      return `<section class="assay-group"><div class="group-heading"><h3>${escapeHtml(label)}</h3><span>${groups[key].length}</span></div>
      <div class="assay-grid ${state.view === 'list' ? 'list-view' : ''}">${groups[key].map((index) => card(data.assays[index], index, data.modalities)).join('')}</div></section>`;
    })
    .join('');
  if (!showing)
    results =
      '<div class="empty-state"><h3>No matching assays</h3><p>Try a different search or clear the filters to see all chapters.</p><button type="button" class="text-button" data-reset>Clear filters</button></div>';
  return { facets, results, count: showing };
}
