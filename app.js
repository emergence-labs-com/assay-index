import { prepareSearch, renderCatalog, renderResults } from './catalog.js';
import { renderChapter, initChapter } from './chapter.js';
import { renderProviders, renderProviderResults, renderReader } from './directory.js';
import { buildCoverageIndex, coverageHref, coverageResults, renderCoverage } from './coverage.js';

const siteTitle = 'Emergence Labs · Assay Index';
const main = document.getElementById('main');
const dialog = document.getElementById('reader');
const readerTrigger = document.querySelector('.reader-trigger');
const listingHistory = new Map();
let data;
let searchIndex;
let coverage;
let coverageRequest;
let page;
let currentHref;
let lastListingHref = '#/';
let readerIndex = 0;

function savedView() {
  try {
    return localStorage.getItem('assay-index-view') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function readRoute() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split(/\?(.*)/s);
  const params = new URLSearchParams(query);
  const state = {
    q: params.get('q') || '',
    category: Object.hasOwn(data.categories, params.get('category')) ? params.get('category') : '',
    modality: Object.hasOwn(data.modalities, params.get('modality')) ? params.get('modality') : '',
    view: savedView(),
  };
  if (path === '/') return { type: 'catalog', ...state };
  if (path === '/providers') return { type: 'providers', q: state.q };
  if (path === '/coverage') {
    return {
      type: 'coverage',
      view: params.get('view') === 'devices' ? 'devices' : 'assays',
      q: state.q,
      stage: params.get('stage') || '',
      status: params.get('status') || '',
    };
  }
  if (path.startsWith('/assay/')) {
    try {
      const id = decodeURIComponent(path.slice('/assay/'.length));
      const index = data.assays.findIndex((assay) => assay.id === id);
      if (index !== -1)
        return {
          type: 'chapter',
          index,
          section: params.get('section') === 'coverage' ? 'coverage' : '',
        };
    } catch {
      /* An invalid URL uses the missing-chapter view. */
    }
  }
  return { type: 'missing' };
}

function filterHref() {
  if (page.type === 'coverage') return coverageHref(page);
  const params = new URLSearchParams();
  for (const key of ['q', 'category', 'modality']) if (page[key]) params.set(key, page[key]);
  const suffix = params.size ? '?' + params.toString() : '';
  return (page.type === 'providers' ? '#/providers' : '#/') + suffix;
}

function replaceFilters() {
  currentHref = filterHref();
  history.replaceState(null, '', currentHref);
  lastListingHref = currentHref;
}

function updateCatalog() {
  const { facets, results, count } = renderResults(data, page, searchIndex);
  const activeCategory = document.activeElement?.dataset.category;
  document.getElementById('category-facets').innerHTML = facets;
  if (activeCategory !== undefined)
    [...document.querySelectorAll('[data-category]')]
      .find((button) => button.dataset.category === activeCategory)
      ?.focus({ preventScroll: true });
  document.getElementById('catalog-results').innerHTML = results;
  document.getElementById('result-total').textContent =
    count === data.assays.length
      ? count + ' assays'
      : count + ' of ' + data.assays.length + ' assays';
  document.getElementById('clear-filters').hidden = !(page.q || page.category || page.modality);
  document.getElementById('mobile-category').value = page.category;
  document.getElementById('modality').value = page.modality;
  document
    .querySelectorAll('[data-view]')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.view === page.view)),
    );
}

function loadCoverage() {
  if (!coverageRequest) {
    coverageRequest = fetch('./data/coverage.json')
      .then((response) => {
        if (!response.ok) throw new Error('Stage plan unavailable');
        return response.json();
      })
      .then((plan) => buildCoverageIndex(plan, data.assays))
      .catch(() => null);
  }
  return coverageRequest;
}

function updateCoverage() {
  const { status, html } = coverageResults(coverage, page);
  document.getElementById('coverage-count').textContent = status;
  document.getElementById('coverage-results').innerHTML = html;
}

async function route() {
  const prior = page;
  if (currentHref && ['catalog', 'providers', 'coverage'].includes(prior?.type)) {
    const expandedProviders = new Set(
      [...main.querySelectorAll('details[data-provider][open]')].map(
        (entry) => entry.dataset.provider,
      ),
    );
    const expandedDevices = new Set(
      [...main.querySelectorAll('details[data-device][open]')].map((entry) => entry.dataset.device),
    );
    listingHistory.set(currentHref, { scrollY, expandedProviders, expandedDevices });
  }
  if (dialog.open) dialog.close();
  currentHref = location.hash || '#/';
  page = readRoute();
  const previousVisit = listingHistory.get(currentHref);
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === page.type) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  if (['catalog', 'providers', 'coverage'].includes(page.type)) lastListingHref = currentHref;
  if ((page.type === 'coverage' || page.type === 'chapter') && coverage === undefined) {
    const activePage = page;
    main.innerHTML = '<p class="loading-message" role="status">Loading the stage plan…</p>';
    coverage = await loadCoverage();
    if (page !== activePage) return;
  }
  if (page.type === 'catalog') {
    document.title = siteTitle;
    main.innerHTML = renderCatalog(data, page);
    updateCatalog();
  } else if (page.type === 'providers') {
    document.title = 'Provider directory · ' + siteTitle;
    main.innerHTML = renderProviders({ assays: data.assays, query: page.q });
    if (previousVisit) {
      main.querySelectorAll('details[data-provider]').forEach((entry) => {
        entry.open = previousVisit.expandedProviders.has(entry.dataset.provider);
      });
    }
  } else if (page.type === 'coverage') {
    document.title = 'Stage & device plan · ' + siteTitle;
    if (coverage) {
      if (page.stage !== 'unassigned' && !coverage.stages.has(page.stage)) page.stage = '';
      const hasStatus =
        page.view === 'devices'
          ? coverage.deviceStatuses.includes(page.status)
          : Object.hasOwn(coverage.statuses, page.status);
      if (!hasStatus) page.status = '';
    }
    main.innerHTML = renderCoverage(coverage, page);
    if (previousVisit) {
      main.querySelectorAll('details[data-device]').forEach((entry) => {
        entry.open = previousVisit.expandedDevices.has(entry.dataset.device);
      });
    }
  } else if (page.type === 'chapter') {
    const assay = data.assays[page.index];
    const title = coverage?.records.has(assay.id) ? assay.name : 'Chapter assessment unavailable';
    document.title = title + ' · ' + siteTitle;
    readerIndex = page.index;
    main.innerHTML = renderChapter({ ...data, assay, catalogHref: lastListingHref, coverage });
    initChapter(main);
  } else {
    document.title = 'Page unavailable · ' + siteTitle;
    main.innerHTML =
      '<section class="empty-state loading-message"><h1>Page unavailable</h1><p>This address does not match a chapter in the index.</p><a class="text-button" href="#/">Open the catalog</a></section>';
  }
  if (prior) main.focus({ preventScroll: true });
  window.scrollTo(0, previousVisit?.scrollY || 0);
  if (page.section === 'coverage') {
    const heading = document.getElementById('ac-coverage');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  } else if (page.type === 'coverage' && !previousVisit && (page.q || page.status || page.stage)) {
    const heading = document.getElementById('plan-list-heading');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }
}

function refreshReader() {
  const active = dialog.contains(document.activeElement) ? document.activeElement : null;
  const action = active?.dataset.readerAction;
  dialog.innerHTML = renderReader({ ...data, index: readerIndex });
  if (action) dialog.querySelector('[data-reader-action="' + action + '"]')?.focus();
  else if (active?.id === 'reader-chapter') dialog.querySelector('#reader-chapter')?.focus();
}

function openReader() {
  refreshReader();
  dialog.showModal();
}

readerTrigger.addEventListener('click', openReader);
dialog.addEventListener('click', (event) => {
  const action = event.target.closest('[data-reader-action]')?.dataset.readerAction;
  if (action === 'previous' || action === 'next') {
    readerIndex =
      (readerIndex + (action === 'previous' ? -1 : 1) + data.assays.length) % data.assays.length;
    refreshReader();
  } else if (action === 'close' || action === 'open') dialog.close();
  else if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  }
});
dialog.addEventListener('change', (event) => {
  if (event.target.id === 'reader-chapter') {
    readerIndex = Number(event.target.value);
    refreshReader();
  }
});

main.addEventListener('input', (event) => {
  if (event.target.id === 'assay-query') {
    page.q = event.target.value;
    replaceFilters();
    updateCatalog();
  } else if (event.target.id === 'provider-query') {
    page.q = event.target.value;
    replaceFilters();
    document.getElementById('provider-results').innerHTML = renderProviderResults({
      assays: data.assays,
      query: page.q,
    });
  } else if (event.target.id === 'coverage-query') {
    page.q = event.target.value;
    replaceFilters();
    updateCoverage();
  }
});

main.addEventListener('change', (event) => {
  if (event.target.id === 'coverage-status' || event.target.id === 'coverage-stage') {
    page[event.target.id === 'coverage-status' ? 'status' : 'stage'] = event.target.value;
    replaceFilters();
    updateCoverage();
    return;
  }
  if (event.target.id === 'modality') page.modality = event.target.value;
  else if (event.target.id === 'mobile-category') page.category = event.target.value;
  else return;
  replaceFilters();
  updateCatalog();
});

main.addEventListener('click', (event) => {
  if (event.target.closest('[data-retry-plan]')) {
    coverage = undefined;
    coverageRequest = undefined;
    route();
    return;
  }
  if (page?.type !== 'catalog') return;
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-category')) page.category = button.dataset.category;
  else if (button.hasAttribute('data-view')) {
    page.view = button.dataset.view;
    try {
      localStorage.setItem('assay-index-view', page.view);
    } catch {
      /* The current session still changes layout. */
    }
  } else if (button.hasAttribute('data-reset')) {
    page.q = page.category = page.modality = '';
    const search = document.getElementById('assay-query');
    search.value = '';
    search.focus();
  } else return;
  replaceFilters();
  updateCatalog();
});

document.getElementById('skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
  main.scrollIntoView();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key !== '/' ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    dialog.open
  )
    return;
  if (event.target.closest('input,select,textarea,[contenteditable]')) return;
  const search = main.querySelector('input[type=search]');
  if (search) {
    event.preventDefault();
    search.focus();
  }
});

async function start() {
  try {
    const response = await fetch('./data/catalog.json');
    if (!response.ok) throw new Error('Catalog unavailable');
    data = await response.json();
    searchIndex = prepareSearch(data);
    history.scrollRestoration = 'manual';
    window.addEventListener('hashchange', route);
    route();
    readerTrigger.disabled = false;
  } catch {
    main.innerHTML =
      '<section class="empty-state loading-message"><h1>The catalog could not load</h1><p>Reload this page to try again.</p><button type="button" class="text-button">Reload catalog</button></section>';
    main.querySelector('button').addEventListener('click', () => location.reload());
  }
}
start();
