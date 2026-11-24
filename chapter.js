import { escapeHtml, chapterNumber, chapterHref } from './markup.js';
import { needsSpecialist, renderChapterPlan } from './coverage.js';

function sourceLink(source) {
  try {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return `<li><a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">
      <span>${escapeHtml(source.label || url.hostname)}</span>
      <span class="ac-source-domain">${escapeHtml(url.hostname.replace(/^www\./, ''))}</span>
    </a></li>`;
  } catch {
    return '';
  }
}

function recordSection(id, title, contents) {
  return {
    id,
    title,
    html: `<section class="ac-section" aria-labelledby="ac-${id}">
      <h2 id="ac-${id}" tabindex="-1">${title}</h2>${contents}
    </section>`,
  };
}

function items(values, className) {
  return `<ul class="${className}">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function table(records, headers, keys, nameHref) {
  return `<table class="ac-table">
    <thead><tr>${headers.map((header) => `<th scope="col">${header}</th>`).join('')}</tr></thead>
    <tbody>${records
      .map(
        (record) =>
          `<tr>${keys
            .map((key, index) => {
              const value = escapeHtml(record[key] || '—');
              if (index > 0) return `<td>${value}</td>`;
              const name = nameHref
                ? `<a href="${escapeHtml(nameHref(record))}">${value}</a>`
                : value;
              const role = record.role
                ? `<span class="ac-equipment-role">${escapeHtml(record.role)}</span>`
                : '';
              return `<th scope="row">${name}${role}</th>`;
            })
            .join('')}</tr>`,
      )
      .join('')}</tbody>
  </table>`;
}

function sectionsFor(assay) {
  const sections = [];
  if (assay.tests.length) {
    sections.push(
      recordSection('measurements', 'What it measures', items(assay.tests, 'ac-measurements')),
    );
  }
  if (assay.instruments.length || assay.consumables.length) {
    const equipment = assay.instruments.length
      ? table(assay.instruments, ['Instrument', 'Manufacturer'], ['name', 'vendor'])
      : '';
    const consumables = assay.consumables.length
      ? `<h3 class="ac-subheading">Consumables</h3>${items(assay.consumables, 'ac-list')}`
      : '';
    sections.push(recordSection('equipment', 'Equipment &amp; materials', equipment + consumables));
  }
  if (assay.steps.length) {
    const steps = assay.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
    sections.push(
      recordSection('workflow', 'Workflow', `<ol class="ac-steps" role="list">${steps}</ol>`),
    );
  }
  if (assay.providers.length) {
    const providers = table(
      assay.providers,
      ['Provider', 'Region'],
      ['name', 'region'],
      (provider) => '#/providers?q=' + encodeURIComponent(provider.name),
    );
    sections.push(recordSection('providers', 'Providers', providers));
  }
  if (assay.marketNote || assay.capacityNote) {
    const notes = [
      ['Market', assay.marketNote],
      ['Capacity', assay.capacityNote],
    ]
      .filter(([, note]) => note)
      .map(([label, note]) => `<div><dt>${label}</dt><dd>${escapeHtml(note)}</dd></div>`)
      .join('');
    sections.push(
      recordSection('market', 'Market &amp; capacity', `<dl class="ac-notes">${notes}</dl>`),
    );
  }
  const sources = assay.sources.map(sourceLink).join('');
  if (sources) {
    sections.push(recordSection('sources', 'Sources', `<ul class="ac-sources">${sources}</ul>`));
  }
  return sections;
}

function adjacentLink(assays, index, label, rel) {
  const assay = assays[index];
  return `<a class="ac-adjacent" rel="${rel}" href="${escapeHtml(chapterHref(assay))}">
    <span class="ac-meta">${label} chapter <span aria-hidden="true">/</span> ${chapterNumber(index)}</span>
    <span class="ac-adjacent-name">${escapeHtml(assay.name)}</span>
  </a>`;
}

export function renderChapter({
  assay,
  assays,
  categories,
  modalities,
  catalogHref = '#/',
  coverage,
}) {
  const index = assays.findIndex((record) => record.id === assay.id);
  const returnHref = /^#\/(?:\?|providers(?:\?|$)|coverage(?:\?|$)|$)/.test(catalogHref)
    ? catalogHref
    : '#/';
  const record = coverage?.records.get(assay.id);
  if (!record) {
    return `<section class="plan-unavailable"><h1>Chapter assessment unavailable</h1>
      <p>The stage assessment for this chapter could not be loaded.</p>
      <button type="button" class="reader-trigger" data-retry-plan>Retry assessment</button>
      <a href="#/">Return to the catalog</a></section>`;
  }
  const specialist = needsSpecialist(record);
  const sections = specialist ? [] : sectionsFor(assay);
  sections.unshift(
    recordSection('coverage', 'Stage &amp; device plan', renderChapterPlan(coverage, record)),
  );
  const drugTypes = assay.drugTypes.map((id) => modalities[id] || id);
  let returnLabel = 'Assay catalog';
  if (returnHref.startsWith('#/providers')) returnLabel = 'Provider directory';
  if (returnHref.startsWith('#/coverage')) returnLabel = 'Stage &amp; device plan';
  const sectionMenu =
    sections.length > 1
      ? `<nav class="ac-contents" aria-label="In this chapter">
    <p class="ac-meta">In this chapter</p>
    <div class="ac-jumps">${sections.map((section) => `<button type="button" data-section="ac-${section.id}">${section.title}</button>`).join('')}</div>
    <select class="ac-mobile-contents" aria-label="Jump to a chapter section">
      <option value="">Jump to a section</option>
      ${sections.map((section) => `<option value="ac-${section.id}">${section.title}</option>`).join('')}
    </select>
  </nav>`
      : '';
  const paging =
    assays.length > 1
      ? `<nav class="ac-pagination" aria-label="Adjacent chapters">
    ${adjacentLink(assays, (index - 1 + assays.length) % assays.length, 'Previous', 'prev')}
    ${adjacentLink(assays, (index + 1) % assays.length, 'Next', 'next')}
  </nav>`
      : '';
  return `<article class="assay-chapter" aria-labelledby="ac-title">
    <nav class="ac-breadcrumb" aria-label="Breadcrumb">
      <a href="${escapeHtml(returnHref)}">${returnLabel}</a>
      <span aria-hidden="true">/</span><span aria-current="page">Chapter ${chapterNumber(index)}</span>
    </nav>
    <header class="ac-header">
      <p class="ac-category">${escapeHtml(categories[assay.category] || assay.category)}</p>
      <h1 id="ac-title">${escapeHtml(assay.name)}</h1>
      ${assay.tagline && !specialist ? `<p class="ac-lede">${escapeHtml(assay.tagline)}</p>` : ''}
      ${drugTypes.length ? `<div class="ac-modalities"><span class="ac-meta">Drug modalities</span>${items(drugTypes, 'ac-tags')}</div>` : ''}
    </header>
    <div class="ac-reader${sectionMenu ? '' : ' ac-reader-single'}">
      ${sectionMenu}
      <div class="ac-sections">${sections.map((section) => section.html).join('')}</div>
    </div>
    ${paging}
  </article>`;
}

export function initChapter(container) {
  function jumpTo(id) {
    if (!id) return;
    const heading = container.querySelector('#' + CSS.escape(id));
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }
  container.querySelector('.ac-jumps')?.addEventListener('click', (event) => {
    jumpTo(event.target.closest('button[data-section]')?.dataset.section);
  });
  container.querySelector('.ac-mobile-contents')?.addEventListener('change', (event) => {
    jumpTo(event.target.value);
    event.target.selectedIndex = 0;
  });
}
