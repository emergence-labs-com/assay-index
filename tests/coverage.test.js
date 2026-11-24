import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCoverageIndex,
  coverageHref,
  coverageResults,
  renderChapterPlan,
  renderCoverage,
} from '../coverage.js';
import { renderChapter } from '../chapter.js';

const assays = [
  { id: 'measurement', name: 'Protein measurement' },
  { id: 'review', name: 'Specialist topic' },
  { id: 'unmapped', name: 'Unmapped chapter' },
];
const plan = {
  stages: [
    { id: 'S1', label: 'Stage 1' },
    { id: 'S4', label: 'Stage 4' },
  ],
  statuses: {
    planned: 'Explicit hardware',
    'specialist-review': 'Specialist review',
    conditional: 'Option-dependent',
  },
  devices: [{ name: 'Reader', stage: 'S1', notes: ['Device register 6'] }],
  assays: [
    {
      id: 'measurement',
      status: 'planned',
      stage: 'S1',
      stageStatus: 'conditional',
      firmStage: 'S4',
      validated: false,
      deviceGroups: ['Reader'],
      steps: [
        {
          step: 'Read the sample',
          devices: ['Reader'],
          stage: 'S1',
          status: 'conditional',
          note: 'Check the optical configuration.',
        },
      ],
    },
    {
      id: 'review',
      status: 'specialist-review',
      stage: 'S1',
      validated: true,
      deviceGroups: ['SHOULD_BE_HIDDEN'],
      summary: 'SHOULD_BE_HIDDEN',
      steps: [{ step: 'SHOULD_BE_HIDDEN', devices: ['SHOULD_BE_HIDDEN'] }],
    },
  ],
  stageCoverage: [{ id: 'S1', planned: 0, conditional: 1, covered: 1, newCandidates: 1, total: 3 }],
};
const index = buildCoverageIndex(plan, assays);
const base = { type: 'coverage', view: 'assays', q: '', stage: '', status: '' };

test('assay, stage and equipment filters compose and preserve the case of chapter addresses', () => {
  const result = coverageResults(index, { ...base, q: 'reader', stage: 'S1', status: 'planned' });
  assert.equal(result.status, '1 assay of 3');
  assert.match(result.html, /href="#\/assay\/measurement\?section=coverage"/);
  assert.doesNotMatch(result.html, /Specialist topic|Unmapped chapter/);
  assert.equal(coverageResults(index, { ...base, stage: 'unassigned' }).status, '2 assays of 3');
  const devices = coverageResults(index, { ...base, view: 'devices', q: 'protein', stage: 'S1' });
  assert.match(devices.html, /Device register 6/);
  assert.equal(devices.status, '1 device group of 1');
  assert.equal(coverageHref({ ...base, q: 'X & Y', stage: 'S1' }), '#/coverage?q=X+%26+Y&stage=S1');
});

test('sensitive records have no equipment associations or operational chapter content even with stray input fields', () => {
  const row = plan.assays[1];
  const chapter = {
    ...assays[1],
    category: 'cat',
    drugTypes: ['modality'],
    tagline: 'SHOULD_BE_HIDDEN',
    tests: ['SHOULD_BE_HIDDEN'],
    instruments: [{ name: 'SHOULD_BE_HIDDEN' }],
    steps: ['SHOULD_BE_HIDDEN'],
    consumables: ['SHOULD_BE_HIDDEN'],
    providers: [{ name: 'SHOULD_BE_HIDDEN' }],
    sources: [],
  };
  const rendered = renderChapter({
    assay: chapter,
    assays: [chapter],
    categories: { cat: 'Category' },
    modalities: { modality: 'Modality' },
    coverage: index,
  });
  for (const html of [
    rendered,
    renderCoverage(index, base),
    renderChapterPlan(index, row),
    coverageResults(index, { ...base, view: 'devices' }).html,
  ]) {
    assert.doesNotMatch(html, /SHOULD_BE_HIDDEN/);
  }
  assert.match(rendered, /Specialist review/);
  assert.doesNotMatch(rendered, /ac-workflow|ac-equipment|ac-providers/);
  assert.equal(coverageResults(index, { ...base, q: 'SHOULD_BE_HIDDEN' }).status, '0 assays of 3');
});

test('a chapter shows its conditional candidate, first explicit match and separate validation status', () => {
  const html = renderChapterPlan(index, plan.assays[0]);
  assert.match(html, /Option-dependent/);
  assert.match(html, /First explicit equipment match<\/dt><dd>Stage 4/);
  assert.match(html, /End-to-end validation<\/dt><dd>Unverified/);
  assert.match(html, /Check the optical configuration/);
  assert.match(renderCoverage(index, base), /Cumulative coverage by stage/);
  assert.match(renderCoverage(null, base), /data-retry-plan/);
});

test('planned route stages keep their first-stage status separate from the final equipment match', () => {
  const stageFields = {
    stage: 'S1',
    stageStatus: 'conditional',
    firmStage: 'S4',
    status: 'planned',
  };
  const chapter = {
    ...plan.assays[0],
    routes: [{ label: 'Measurement route', requires: ['Reader'], ...stageFields }],
    routeRule: 'one',
    allVariants: stageFields,
    steps: [{ step: 'Read signal', devices: ['Reader'], ...stageFields }],
    examples: [
      {
        name: 'Example reader',
        vendor: 'Source vendor',
        match: 'Functional alternative',
        unitIds: ['R1'],
        models: ['Candidate reader'],
        stage: 'S1, S4',
        note: 'Configuration requires confirmation.',
      },
    ],
  };
  const html = renderChapterPlan(index, chapter);
  assert.match(html, /First stage · Stage 1 · Option-dependent/);
  assert.match(html, /Full build · Explicit hardware · explicit from Stage 4/);
  assert.match(html, /All named branches/);
  assert.match(html, /R1 · Candidate reader/);
  assert.match(html, /Cited BOM stages · S1, S4/);
  assert.doesNotMatch(html, /First stage · Stage 1 · Explicit hardware/);
});

test('a missing assessment offers recovery without rendering chapter content', () => {
  const assay = { id: 'unlisted', name: 'CHAPTER_CONTENT' };
  for (const coverage of [null, index]) {
    const html = renderChapter({ assay, assays: [assay], coverage });
    assert.match(html, /data-retry-plan/);
    assert.match(html, /href="#\/"/);
    assert.doesNotMatch(html, /CHAPTER_CONTENT|ac-equipment|ac-workflow|ac-providers|ac-sections/);
  }
});
