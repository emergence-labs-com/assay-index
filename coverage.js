import { chapterHref, escapeHtml } from './markup.js';

const reviewStatus = 'specialist-review';
const unassigned = 'unassigned';

export function needsSpecialist(record) {
  return record?.status === reviewStatus;
}

export function coverageHref({ view = 'assays', q = '', stage = '', status = '' } = {}) {
  const params = new URLSearchParams();
  if (view === 'devices') params.set('view', view);
  if (q) params.set('q', q);
  if (stage) params.set('stage', stage);
  if (status) params.set('status', status);
  return '#/coverage' + (params.size ? '?' + params.toString() : '');
}

export function buildCoverageIndex(plan, assays) {
  if (!plan || !Array.isArray(plan.assays) || !Array.isArray(plan.stages)) {
    throw new Error('Invalid stage plan');
  }
  const records = new Map(plan.assays.map((record) => [record.id, record]));
  const stages = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const rows = assays.map((assay) => ({ assay, record: records.get(assay.id) }));
  const devices = new Map(
    (plan.devices || []).map((device) => [device.name, { ...device, assays: [] }]),
  );
  for (const { assay, record } of rows) {
    if (!record || needsSpecialist(record)) continue;
    for (const name of new Set(record.deviceGroups || [])) {
      if (!devices.has(name)) devices.set(name, { name, assays: [] });
      devices.get(name).assays.push(assay);
    }
  }
  return {
    basis: plan.basis || '',
    hasWorkbook: plan.hasWorkbook !== false,
    stageCoverage: plan.stageCoverage || [],
    bomStageTotals: new Map((plan.bomStageTotals || []).map((stage) => [stage.id, stage])),
    statuses: plan.statuses || {},
    deviceStatusLabels: plan.deviceStatuses || {},
    stages,
    records,
    rows,
    devicesByName: devices,
    deviceStatuses: [
      ...new Set([...devices.values()].map((device) => device.status).filter(Boolean)),
    ].sort(),
    devices: [...devices.values()].sort(
      (a, b) => (b.unlockCount || 0) - (a.unlockCount || 0) || a.name.localeCompare(b.name),
    ),
  };
}

function statusLabel(index, value) {
  return index.statuses[value] || value || 'Unassessed';
}

function stageLabel(index, value) {
  return index.stages.get(value)?.label || value || 'Unassigned';
}

function chapterPlanLink(assay) {
  return chapterHref(assay) + '?section=coverage';
}

function options(entries, selected) {
  return entries
    .map(
      ([id, label]) =>
        `<option value="${escapeHtml(id)}"${selected === id ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
}

function queryMatches(parts, terms) {
  const haystack = parts.filter(Boolean).join(' ').toLocaleLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function stageMatches(value, filter) {
  return !filter || (filter === unassigned ? !value : value === filter);
}

function counted(count, singular, plural) {
  return count + ' ' + (count === 1 ? singular : plural);
}

function stageNotes(index) {
  if (!index.stages.size) return '';
  return `<details class="plan-stages">
    <summary>Stages and planning assumptions</summary>
    <dl>${[...index.stages.values()]
      .map(
        (stage) =>
          `<div><dt>${escapeHtml(stage.label)}</dt><dd>${stage.timing ? `<strong>${escapeHtml(stage.timing)}</strong> ` : ''}${escapeHtml(stage.note || '')}</dd></div>`,
      )
      .join('')}</dl>
  </details>`;
}

function stageTable(index) {
  if (!index.stageCoverage.length) return '';
  const hasBom = index.stageCoverage.every((row) => index.bomStageTotals.has(row.id));
  const allBranches = index.stageCoverage.every(
    (row) =>
      Number.isInteger(row.allVariantsCovered) ||
      (Number.isInteger(row.allVariantsPlanned) && Number.isInteger(row.allVariantsConditional)),
  );
  const rows = index.stageCoverage
    .map(
      (row) => `<tr>
    <th scope="row">${escapeHtml(stageLabel(index, row.id))}</th>
    ${hasBom ? `<td data-label="BOM additions">${index.bomStageTotals.get(row.id).positions} positions<small class="plan-cell-note">BOM quantity ${index.bomStageTotals.get(row.id).units}</small></td>` : ''}
    <td data-label="Explicit equipment">${escapeHtml(row.planned)}</td>
    <td data-label="Option-dependent">${escapeHtml(row.conditional)}</td>
    <td data-label="Total candidates">${escapeHtml(row.covered)} of ${escapeHtml(row.total)}</td>
    <td data-label="New candidates">${escapeHtml(row.newCandidates)}</td>
    ${allBranches ? `<td data-label="All named branches">${row.allVariantsCovered ?? row.allVariantsPlanned + row.allVariantsConditional} of ${escapeHtml(row.total)}${Number.isInteger(row.allVariantsPlanned) ? ` <small class="plan-cell-note">${row.allVariantsPlanned} explicit · ${row.allVariantsConditional} conditional</small>` : ''}</td>` : ''}
    </tr>`,
    )
    .join('');
  return `<section class="plan-stage-table"><h2>Cumulative coverage by stage</h2>
    <p>Counts include equipment carried forward from earlier stages. Option-dependent routes require a specific configuration or assumption.${allBranches ? ' The last column requires an equipment route for every named branch of a chapter.' : ''}</p>
    <table class="plan-table"><caption class="sr-only">Cumulative equipment coverage for each stage</caption>
      <thead><tr><th scope="col">Build stage</th>${hasBom ? '<th scope="col">BOM additions this stage</th>' : ''}<th scope="col">Explicit equipment</th><th scope="col">Option-dependent</th><th scope="col">Total candidates</th><th scope="col">New candidates</th>${allBranches ? '<th scope="col">All named branches</th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></section>`;
}

function earliestStatus(record, index) {
  if (!record?.stage) return '';
  return [
    stageLabel(index, record.stage),
    record.stageStatus && statusLabel(index, record.stageStatus),
  ]
    .filter(Boolean)
    .join(' · ');
}

function finalStatus(record, index, label) {
  const final = label || statusLabel(index, record.status);
  return record.firmStage
    ? final + ' · explicit from ' + stageLabel(index, record.firmStage)
    : final;
}

function metrics(index, byDevice) {
  const mapped = index.rows.filter(({ record }) => record);
  const reviewed = mapped.filter(({ record }) => !needsSpecialist(record));
  const deviceFigures = [
    [index.devices.length, 'Device groups'],
    [index.devices.filter((d) => d.status === 'planned').length, 'Explicit by full build'],
    [index.devices.filter((d) => d.status === 'conditional').length, 'Configuration dependent'],
    [index.devices.filter((d) => d.status === 'gap').length, 'Missing requirements'],
  ];
  const figures = byDevice
    ? deviceFigures
    : [
        [mapped.length, 'Catalog chapters mapped'],
        [reviewed.filter(({ record }) => record.stage).length, 'Assays with a candidate route'],
        [reviewed.filter(({ record }) => record.validated === true).length, 'Validated end to end'],
        [mapped.length - reviewed.length, 'Specialist review'],
      ];
  return `<dl class="plan-metrics">${figures
    .map(([number, label]) => `<div><dt>${escapeHtml(label)}</dt><dd>${number}</dd></div>`)
    .join('')}</dl>`;
}

function resultMessage(message, state) {
  return `<div class="plan-empty"><p>${escapeHtml(message)}</p><a href="${coverageHref({ view: state.view })}">Clear filters</a></div>`;
}

function stageAndStatus(record, index) {
  if (!record) return ['Unassessed', ''];
  if (needsSpecialist(record)) return [statusLabel(index, reviewStatus), ''];
  return [finalStatus(record, index), earliestStatus(record, index) || 'Unassigned'];
}

function assayList(index, state, terms) {
  const rows = index.rows.filter(({ assay, record }) => {
    const [label] = stageAndStatus(record, index);
    const searchable = [assay.name, assay.id, label];
    const specialist = needsSpecialist(record);
    if (record && !specialist) searchable.push(record.summary, ...(record.deviceGroups || []));
    return (
      queryMatches(searchable, terms) &&
      stageMatches(specialist ? null : record?.stage, state.stage) &&
      (!state.status || state.status === (record?.status || 'unassessed'))
    );
  });
  const status = counted(rows.length, 'assay', 'assays') + ' of ' + index.rows.length;
  if (!rows.length) return { status, html: resultMessage('No assays match these filters.', state) };
  const body = rows
    .map(({ assay, record }) => {
      const [status, stage] = stageAndStatus(record, index);
      return `<tr>
      <th scope="row"><a href="${escapeHtml(chapterPlanLink(assay))}">${escapeHtml(assay.name)}</a></th>
      <td data-label="Final equipment status">${escapeHtml(status)}</td>
      <td data-label="Earliest planned stage">${escapeHtml(stage || '—')}</td>
      <td data-label="Validation">${needsSpecialist(record) || !record ? 'Unassessed' : record.validated === true ? 'Validated' : 'Unverified'}</td>
    </tr>`;
    })
    .join('');
  return {
    status,
    html: `<table class="plan-table plan-assays"><caption class="sr-only">Equipment coverage and validation by assay</caption>
    <thead><tr><th scope="col">Assay chapter</th><th scope="col">Final equipment status</th><th scope="col">Earliest planned stage</th><th scope="col">Validation</th></tr></thead>
    <tbody>${body}</tbody></table>`,
  };
}

function bomTable(device, index) {
  if (!device.units?.length) return '';
  const rows = device.units
    .map(
      (unit) => `<tr><th scope="row">${escapeHtml(unit.id)}</th>
    <td data-label="Model or position">${escapeHtml(unit.model)}</td>
    <td data-label="Quantity">${escapeHtml(unit.qty)}</td>
    <td data-label="BOM stage">${escapeHtml(stageLabel(index, unit.stage))}</td></tr>`,
    )
    .join('');
  return `<table class="plan-table"><caption>Mapped bill of materials positions</caption>
    <thead><tr><th scope="col">Position</th><th scope="col">Model or position</th><th scope="col">Quantity</th><th scope="col">BOM stage</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function deviceList(index, state, terms) {
  const devices = index.devices.filter(
    (device) =>
      stageMatches(device.stage, state.stage) &&
      (!state.status || device.status === state.status) &&
      queryMatches(
        [
          device.name,
          device.note,
          device.recommendation,
          ...(device.units || []).flatMap((unit) => [unit.id, unit.model]),
          ...(Array.isArray(device.notes) ? device.notes : [device.notes]),
          ...device.assays.map((assay) => assay.name),
        ],
        terms,
      ),
  );
  const status =
    counted(devices.length, 'device group', 'device groups') + ' of ' + index.devices.length;
  if (!devices.length)
    return { status, html: resultMessage('No device groups match these filters.', state) };
  const html = devices
    .map((device) => {
      const first = earliestStatus(device, index);
      const detail = [
        first && 'First stage · ' + first,
        device.status &&
          'Full build · ' + finalStatus(device, index, index.deviceStatusLabels[device.status]),
      ].filter(Boolean);
      const provenance = Array.isArray(device.notes) ? device.notes.join(' · ') : device.notes;
      const chapters = device.assays
        .map(
          (assay) =>
            `<li><a href="${escapeHtml(chapterPlanLink(assay))}">${escapeHtml(assay.name)}</a></li>`,
        )
        .join('');
      return `<details class="plan-device" data-device="${escapeHtml(device.name)}">
      <summary><span>${escapeHtml(device.name)}</span><small>${escapeHtml(detail.join(' · '))}</small><span class="plan-device-count">${counted(device.assays.length, 'assay', 'assays')}</span></summary>
      ${device.note ? `<p>${escapeHtml(device.note)}</p>` : ''}
      ${provenance && provenance !== device.note ? `<p>${escapeHtml(provenance)}</p>` : ''}
      ${device.proposedStage ? `<p><strong>Proposed review stage</strong> · ${escapeHtml(stageLabel(index, device.proposedStage))}</p>` : ''}
      ${device.recommendation ? `<p>${escapeHtml(device.recommendation)}</p>` : ''}
      ${Number.isInteger(device.unlockCount) ? `<p><strong>Blocked chapters gaining a modeled route with this addition alone</strong> · ${device.unlockCount}</p>` : ''}
      ${bomTable(device, index)}
      ${chapters ? `<ul>${chapters}</ul>` : '<p>This device has no linked assay in the catalog mapping.</p>'}
    </details>`;
    })
    .join('');
  return { status, html };
}

export function coverageResults(index, state) {
  const terms = (state.q || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return state.view === 'devices'
    ? deviceList(index, state, terms)
    : assayList(index, state, terms);
}

export function renderCoverage(index, state) {
  if (!index)
    return `<div class="plan-unavailable"><h1>Stage &amp; device plan</h1><p>The planning data could not be loaded.</p>
    <button type="button" class="reader-trigger" data-retry-plan>Retry</button> <a href="#/">Return to the catalog</a></div>`;
  const byDevice = state.view === 'devices';
  const statusChoices = byDevice
    ? index.deviceStatuses.map((status) => [
        status,
        index.deviceStatusLabels[status] || statusLabel(index, status),
      ])
    : Object.entries(index.statuses);
  const choices = [...index.stages.values()].map((stage) => [stage.id, stage.label]);
  const { status, html } = coverageResults(index, state);
  const statusCounts = new Map();
  for (const { record } of index.rows) {
    if (record) statusCounts.set(record.status, (statusCounts.get(record.status) || 0) + 1);
  }
  const breakdown = Object.entries(index.statuses)
    .filter(([key]) => statusCounts.has(key))
    .map(
      ([key, label]) =>
        `<li><a href="${escapeHtml(coverageHref({ status: key }))}">${escapeHtml(label)} <strong>${statusCounts.get(key)}</strong></a></li>`,
    )
    .join('');
  return `<article class="plan-page">
    <header class="plan-header"><div><h1>Stage &amp; device plan</h1>
      <p>Compare the equipment each assay requires with the stage plan and the evidence for running it in the lab.</p></div>
      ${index.hasWorkbook ? '<a class="plan-download" href="./data/assay-plan.xlsx" download>Download workbook</a>' : ''}</header>
    <nav class="plan-tabs" aria-label="Planning views">
      <a href="#/coverage"${!byDevice ? ' aria-current="page"' : ''}>Assay coverage</a>
      <a href="#/coverage?view=devices"${byDevice ? ' aria-current="page"' : ''}>Device groups</a>
    </nav>
    ${metrics(index, byDevice)}
    ${!byDevice && breakdown ? `<ul class="plan-breakdown" aria-label="Chapters by final equipment status">${breakdown}</ul>` : ''}
    ${!byDevice && index.basis ? `<p class="plan-basis">${escapeHtml(index.basis)}</p>` : ''}
    ${!byDevice ? stageTable(index) + stageNotes(index) : ''}
    <h2 class="plan-list-heading" id="plan-list-heading" tabindex="-1">${byDevice ? 'Device groups' : 'Assay-by-assay assessment'}</h2>
    <div class="plan-filters">
      <label class="plan-search"><span>${byDevice ? 'Search devices or assays' : 'Search assays or device groups'}</span>
        <input id="coverage-query" type="search" value="${escapeHtml(state.q || '')}" placeholder="${byDevice ? 'Device group or assay' : 'Assay, device group, or status'}"></label>
      <label><span id="coverage-stage-label">${byDevice ? 'Device stage' : 'Earliest planned stage'}</span>
        <select id="coverage-stage" aria-labelledby="coverage-stage-label">${options([['', 'All stages'], ...choices, [unassigned, 'Unassigned']], state.stage)}</select></label>
      ${statusChoices.length ? `<label><span id="coverage-status-label">${byDevice ? 'Device status' : 'Final equipment status'}</span><select id="coverage-status" aria-labelledby="coverage-status-label">${options([['', 'All statuses'], ...statusChoices], state.status)}</select></label>` : ''}
    </div>
    ${byDevice && index.devices.some((device) => device.unlockCount > 0) ? '<p class="plan-basis">Device groups are ordered by how many blocked assays would gain a modeled route from that addition alone.</p>' : ''}
    <p class="plan-result-count"  id="coverage-count" role="status">${escapeHtml(status)}</p>
    <div id="coverage-results">${html}</div>
  </article>`;
}

function routeOptions(record, index) {
  if (!record.routes?.length) return '';
  const rules = {
    one: 'One suitable route supports the chapter-level candidate.',
    all: 'The chapter-level assessment requires every listed route.',
    'scope-dependent': 'Define the intended endpoints before selecting routes.',
  };
  const rows = record.routes
    .map(
      (route) => `<tr><th scope="row">${escapeHtml(route.label)}</th>
    <td data-label="Requirements">${escapeHtml((route.requires || []).join(' · '))}</td>
    <td data-label="Earliest stage">${escapeHtml(earliestStatus(route, index) || '—')}</td>
    <td data-label="Full-build status">${escapeHtml(finalStatus(route, index))}${route.note ? ' · ' + escapeHtml(route.note) : ''}</td></tr>`,
    )
    .join('');
  return `<details class="plan-route-options"><summary>Measurement routes</summary>
    ${record.routeRule ? `<p>${escapeHtml(rules[record.routeRule] || record.routeRule)}</p>` : ''}
    ${record.allVariants ? `<p><strong>All named branches</strong> · ${record.allVariants.stage ? 'First stage · ' + escapeHtml(earliestStatus(record.allVariants, index)) + '. ' : ''}Full build · ${escapeHtml(finalStatus(record.allVariants, index))}.</p>` : ''}
    <table class="plan-table"><caption class="sr-only">Equipment requirements by measurement route</caption>
    <thead><tr><th scope="col">Route</th><th scope="col">Required groups</th><th scope="col">Earliest stage</th><th scope="col">Full-build status</th></tr></thead>
    <tbody>${rows}</tbody></table></details>`;
}

function referenceExamples(examples) {
  if (!examples?.length) return '';
  const rows = examples
    .map((example) => {
      const units = (example.unitIds || []).map((id, i) =>
        [id, example.models?.[i]].filter(Boolean).join(' · '),
      );
      const modelMatches = units.length ? units : example.models || [];
      return `<tr><th scope="row">${escapeHtml(example.name)}${example.vendor ? `<small class="plan-cell-note">${escapeHtml(example.vendor)}</small>` : ''}</th>
      <td data-label="Model match">${escapeHtml(example.match || 'Unassessed')}</td>
      <td data-label="Planned equipment">${modelMatches.length ? modelMatches.map(escapeHtml).join('<br>') : '—'}${example.stage ? `<small class="plan-cell-note">Cited BOM stages · ${escapeHtml(example.stage)}</small>` : ''}</td>
      <td data-label="Evidence">${escapeHtml(example.note || '—')}</td></tr>`;
    })
    .join('');
  return `<details class="plan-route-options"><summary>Catalog instrument examples</summary>
    <p>The catalog includes alternative instruments and supporting tools. These rows compare models. The workflow assessment also tests the required capabilities at each step.</p>
    <table class="plan-table"><caption class="sr-only">Catalog example instruments compared with stage-plan BOM positions</caption>
    <thead><tr><th scope="col">Catalog instrument</th><th scope="col">Model match</th><th scope="col">Planned equipment</th><th scope="col">Evidence</th></tr></thead><tbody>${rows}</tbody></table>
  </details>`;
}

function stepDeviceList(names, index) {
  if (!names?.length) return '—';
  return `<ul class="plan-step-devices">${names
    .map((name) => {
      const device = index.devicesByName.get(name);
      const units = device?.units || [];
      const examples = units
        .map(
          (unit) =>
            `<li>${escapeHtml(unit.id)} · ${escapeHtml(unit.model)} · ${escapeHtml(stageLabel(index, unit.stage))}</li>`,
        )
        .join('');
      return `<li><a href="${escapeHtml(coverageHref({ view: 'devices', q: name }))}">${escapeHtml(name)}</a>
      ${
        examples
          ? `<details><summary>${counted(units.length, 'candidate BOM position', 'candidate BOM positions')}</summary><ul>${examples}</ul></details>`
          : device?.status === 'gap'
            ? '<small class="plan-cell-note">Equipment gap</small>'
            : ''
      }</li>`;
    })
    .join('')}</ul>`;
}

function stepsTable(record, index) {
  const steps = record.steps;
  if (!steps?.length) return '';
  const planningAuthored = record.hasSourceSteps === false && steps.every((step) => step.origin === 'planning');
  return `<h3 class="plan-subhead">Step coverage</h3>
    ${planningAuthored ? '<p class="plan-record-summary"><strong>Planning-authored steps</strong> · The reference chapter supplies no workflow.</p>' : ''}
    <p class="plan-record-summary">Each step's stage assumes its input sample or data is available. The chapter stage accounts for all steps required by the selected measurement route.</p>
    <table class="plan-table plan-steps">
    <caption class="sr-only">Assay steps, required equipment, stage and remaining gaps</caption>
    <thead><tr><th scope="col">Workflow step</th><th scope="col">Equipment or capability</th><th scope="col">Stage and status</th><th scope="col">Evidence or gap</th></tr></thead>
    <tbody>${steps
      .map(
        (step, i) => `<tr>
      <th scope="row"><span class="plan-step-index">${escapeHtml(step.number || i + 1)}.</span> ${escapeHtml(step.step)}</th>
      <td data-label="Equipment">${stepDeviceList(step.devices, index)}</td>
      <td data-label="Stage and status">${step.stage ? `<span class="plan-milestone">First stage · ${escapeHtml(earliestStatus(step, index))}</span>` : ''}<span class="plan-milestone">Full build · ${escapeHtml(finalStatus(step, index))}</span></td>
      <td data-label="Evidence or gap">${escapeHtml(step.note || '—')}</td></tr>`,
      )
      .join('')}</tbody></table>`;
}

export function renderChapterPlan(index, record) {
  const link =
    '<a class="plan-return" href="#/coverage">Compare all assays in the stage &amp; device plan</a>';
  if (!index || !record) return `<p>A stage assessment is unavailable for this chapter.</p>${link}`;
  if (needsSpecialist(record)) return `<p class="plan-record-status">Specialist review</p>${link}`;
  return `<dl class="plan-record-metrics">
    <div><dt>Final equipment status</dt><dd>${escapeHtml(statusLabel(index, record.status))}</dd></div>
    <div><dt>Earliest planned stage</dt><dd>${escapeHtml(stageLabel(index, record.stage))}</dd></div>
    ${record.stage && record.stageStatus ? `<div><dt>Status at first stage</dt><dd>${escapeHtml(statusLabel(index, record.stageStatus))}</dd></div>` : ''}
    ${record.firmStage ? `<div><dt>First explicit equipment match</dt><dd>${escapeHtml(stageLabel(index, record.firmStage))}</dd></div>` : ''}
    <div><dt>End-to-end validation</dt><dd>${record.validated === true ? 'Validated' : 'Unverified'}</dd></div>
    </dl>
    ${record.summary ? `<p class="plan-record-summary">${escapeHtml(record.summary)}</p>` : ''}
    ${
      record.deviceGroups?.length
        ? `<h3 class="plan-subhead">Device groups</h3><ul class="plan-device-links">${record.deviceGroups
            .map(
              (name) =>
                `<li><a href="${escapeHtml(coverageHref({ view: 'devices', q: name }))}">${escapeHtml(name)}</a></li>`,
            )
            .join('')}</ul>`
        : ''
    }
    ${routeOptions(record, index)}${stepsTable(record, index)}${referenceExamples(record.examples)}${link}`;
}
