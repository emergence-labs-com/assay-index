import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const app = new URL('./', import.meta.url);
const dist = new URL('dist/', app);
const [catalog, coverage] = await Promise.all(
  ['catalog', 'coverage'].map(async name =>
    JSON.parse(await readFile(new URL('data/' + name + '.json', app), 'utf8')),
  ),
);

const statusById = new Map(coverage.assays.map(row => [row.id, row.status]));
catalog.assays = catalog.assays.map(assay => {
  const status = statusById.get(assay.id);
  if (!status) throw Error('Missing assessment for ' + assay.id);
  if (status !== 'specialist-review') return assay;

  const { id, name, category, drugTypes } = assay;
  return {
    id, name, category, drugTypes,
    tagline: 'Specialist review required.',
    tests: [],
    instruments: [],
    consumables: [],
    steps: [],
    providers: [],
    sources: [],
    marketNote: '',
    capacityNote: '',
  };
});

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('data/', dist), { recursive: true });
await Promise.all([
  ...[
    'index.html', 'app.js', 'catalog.js', 'chapter.js', 'coverage.js', 'directory.js', 'markup.js',
    'style.css', 'chapter.css', 'coverage.css', 'directory.css', 'assets',
    'data/coverage.json',
    ...(coverage.hasWorkbook === false ? [] : ['data/assay-plan.xlsx']),
  ].map(path => cp(new URL(path, app), new URL(path, dist), { recursive: path === 'assets' })),
  writeFile(new URL('data/catalog.json', dist), JSON.stringify(catalog)),
]);
