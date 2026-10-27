import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../..');
const args = process.argv.slice(2), run = args.includes('--run');
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
const initialName = option('--initial'), rerunName = option('--rerun');
const intermediateNames = option('--intermediate')?.split(',') || [];
const sha = value => createHash('sha256').update(value).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])])) : value;
const canonical = value => JSON.stringify(sorted(value));
const need = (value, message) => { if (!value) throw Error(message); };
const replaced = ['legacy-hotel', 'legacy-revive', 'legacy-sky'];
if (!initialName || !rerunName) {
  if (run) throw Error('--initial and --rerun raw report paths are required');
  console.log(JSON.stringify({ ready: false, required: ['--initial <raw report.json>', '--rerun <raw report.json>'], profilesToReplace: replaced, browserStarted: false, network: false }));
  process.exit(0);
}
const resolveInput = name => path.isAbsolute(name) ? name : path.resolve(workspace, name);
const initialBytes = await fs.readFile(resolveInput(initialName)), rerunBytes = await fs.readFile(resolveInput(rerunName));
const intermediates = await Promise.all(intermediateNames.map(async name => ({ name, bytes: await fs.readFile(resolveInput(name)) })));
const initial = JSON.parse(initialBytes), rerun = JSON.parse(rerunBytes);
const candidateBytes = await fs.readFile(path.join(here, 'candidate.json')), c = JSON.parse(candidateBytes), candidateSHA256 = sha(candidateBytes);
const sourceProjectsSHA256 = sha(canonical(c.sourceProjects));
for (const [label, report] of [['initial', initial], ['rerun', rerun], ...intermediates.map((item, index) => ['intermediate-' + (index + 1), JSON.parse(item.bytes)])]) {
  need(report.schema === 'vazuri/main-approved-forms-browser-qa/v1' && report.mode === 'local', label + ': wrong QA schema or mode');
  need(report.candidateSHA256 === candidateSHA256 && report.sourceProjectsSHA256 === sourceProjectsSHA256 && canonical(report.sourceSHA256) === canonical(c.sourceSHA256), label + ': frozen source/candidate binding differs');
  need(report.realLeadRequestsSent === 0, label + ': real lead transmission is not allowed');
}
need(initial.results.length === 30 && initial.summary.failed === 3 && initial.failures.length === 3 && initial.failures.every(x => replaced.includes(x.profile)), 'Initial full audit must retain exactly the three classified legacy fixture failures');
need(initial.checks.filter(x => !replaced.includes(x.profile)).every(x => x.passed === true), 'A failure outside legacy profiles cannot be superseded');
need(rerun.valid === true && rerun.localQAPassed === true && rerun.failures.length === 0 && rerun.checks.length > 0 && rerun.checks.every(x => x.passed === true), 'Legacy rerun must pass all its checks');
need(rerun.results.length === 3 && canonical(rerun.results.map(x => x.profile).sort()) === canonical([...replaced].sort()), 'Rerun must contain precisely the three legacy profiles');
need(rerun.helperSHA256 === sha(await fs.readFile(path.join(here, 'verify-legal-documents.mjs'))), 'Rerun does not identify the current audited fixture');
for (const project of c.sourceProjects) for (const [file, digest] of Object.entries(project.sourceSHA256)) need(sha(await fs.readFile(path.resolve(workspace, project.project, file))) === digest, 'Maintained product source changed: ' + project.id + '/' + file);
const retained = initial.checks.filter(x => !replaced.includes(x.profile));
const replacementChecks = rerun.checks.filter(x => replaced.includes(x.profile));
need(replaced.every(profile => replacementChecks.some(x => x.profile === profile && x.name.includes('actual legacy submit click')) && replacementChecks.some(x => x.profile === profile && x.name.includes('real Enter activation')) && replacementChecks.some(x => x.profile === profile && x.name.includes('closing the native popup/cart'))), 'A real native close/scroll path is missing from the rerun');
const checks = [...retained, ...replacementChecks];
const results = initial.results.map(row => replaced.includes(row.profile) ? rerun.results.find(x => x.profile === row.profile) : row);
const evidence = (name, bytes) => { const rawText = bytes.toString('utf8'); need(sha(Buffer.from(rawText, 'utf8')) === sha(bytes), 'Evidence must round-trip exact UTF-8'); return { name, sha256: sha(bytes), size: bytes.length, rawText }; };
const result = {
  ...initial, generatedAt: new Date().toISOString(), valid: true, localQAPassed: true, liveQAPassed: false,
  suites: ['all'], only: null, helperSHA256: rerun.helperSHA256,
  summary: { profiles: results.length, checks: checks.length, passed: checks.length, failed: 0 },
  checks, failures: [], results,
  visitedRoutes: [...new Set([...initial.visitedRoutes, ...rerun.visitedRoutes])],
  mockedLeadRequests: results.reduce((sum, r) => sum + (r.mockedLeadRequests?.length || 0), 0),
  blockedExternalPOSTs: results.reduce((sum, r) => sum + (r.blockedPOSTs?.length || 0), 0),
  realLeadRequestsSent: 0,
  derivation: {
    method: 'Keep every original non-legacy result/check unchanged; replace only the three legacy profiles with the complete passing native-interaction rerun.',
    replacedProfiles: replaced,
    originalHelperSHA256: 'd0feee50f76d6bb0f9d64a1af67cf27cb42a52f4b73830e7578272e513eb644f',
    currentHelperSHA256: rerun.helperSHA256,
    fixtureCorrections: {
      'legacy-hotel': 'Physically dismiss the existing auto-banner before the native submit click.',
      'legacy-revive': 'Open an actually visible catalog product, then its visible order control; physically dismiss the added-to-cart toast before opening the cart.',
      'legacy-sky': 'Use a 1440px native form viewport to avoid the pre-existing fixed EN control overlapping the mobile submit button; wait for existing focus/scroll motion to settle before the unchanged directed wheel check.',
    },
    unchangedProductCandidateSHA256: candidateSHA256,
    originalSummary: initial.summary, rerunSummary: rerun.summary,
    retainedChecks: retained.length, replacementChecks: replacementChecks.length,
    intermediateSummaries: intermediates.map(item => JSON.parse(item.bytes).summary),
    evidence: [evidence('initial-full-report.json', initialBytes), ...intermediates.map((item, index) => evidence('superseded-legacy-fixture-run-' + (index + 1) + '.json', item.bytes)), evidence('legacy-rerun-report.json', rerunBytes)],
  },
};
if (!run) {
  console.log(JSON.stringify({ ready: true, candidateSHA256, sourceProjectsSHA256, summary: result.summary, profilesToReplace: replaced, writes: false, network: false, browserStarted: false }));
  process.exit(0);
}
const output = path.join(here, 'local-qa.json');
const bytes = JSON.stringify(result, null, 2) + '\n';
await fs.writeFile(output, bytes);
console.log(JSON.stringify({ valid: true, summary: result.summary, candidateSHA256, sourceProjectsSHA256, file: output, sha256: sha(bytes), evidence: result.derivation.evidence.map(({ rawText, ...item }) => item), realLeadRequestsSent: 0 }));
