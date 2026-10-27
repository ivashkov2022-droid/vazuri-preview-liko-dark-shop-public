import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url)), workspace = path.resolve(here, '../..');
const args = process.argv.slice(2), run = args.includes('--run'), live = args.includes('--live');
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const only = option('--profile', null), suite = option('--suite', 'all');
if (!['all', 'documents', 'cases'].includes(suite)) throw Error('Unknown suite');
const base = live ? 'https://vazuri.io' : 'http://127.0.0.1:4487';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const sortKeys = value => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
const canonical = value => JSON.stringify(sortKeys(value));
const same = (a, b) => canonical(a) === canonical(b);
const need = (value, message) => { if (!value) throw Error(message); };
const cleanPath = url => new URL(url, base).pathname.replace(/\/$/, '') || '/';
const helperSHA256 = sha(await fs.readFile(fileURLToPath(import.meta.url)));
const candidatePath = path.join(here, 'candidate.json');
let candidateBytes;
try { candidateBytes = await fs.readFile(candidatePath); }
catch (error) {
  if (!run && error.code === 'ENOENT') { console.log(JSON.stringify({ ready: false, missing: ['candidate.json'], browserStarted: false, network: false })); process.exit(0); }
  throw error;
}
const c = JSON.parse(candidateBytes), candidateSHA256 = sha(candidateBytes), sourceProjectsSHA256 = sha(canonical(c.sourceProjects));
const b = JSON.parse(await fs.readFile(path.join(here, 'baseline.json')));
const expected = { ...b.tree.files, ...c.intendedDelta };
const sourceRoot = path.resolve(workspace, c.sourceProject);
const legal = JSON.parse(await fs.readFile(path.join(sourceRoot, 'data/legal-documents.json')));
const originalFacts = JSON.parse(await fs.readFile(path.join(workspace, 'audit/legal-documents-20261027/OPERATOR_FACTS.json')));
const identityFields = ['name', 'shortName', 'inn', 'ogrn', 'phone', 'email'];
need(identityFields.every(key => legal.operator[key] === originalFacts.operator[key]), 'Approved company identity or retained contacts changed');
need(Array.isArray(legal.operator.addresses) && legal.operator.addresses.length === 2 && legal.operator.addresses.every(address => ['ru', 'en'].every(lang => typeof address[lang] === 'string' && address[lang].trim())), 'Two localized correspondence addresses are required');
need(typeof legal.company?.card === 'string' && typeof legal.company?.reporting === 'string', 'Company document URLs are required');
const mainRoutes = c.routes.filter(row => row.file?.startsWith('main/') && row.file.endsWith('/index.html'));
need(mainRoutes.length === 10 && new Set(mainRoutes.map(row => cleanPath(row.url))).size === 10, 'Ten distinct main routes are required');
const caseRoutes = (await Promise.all(['night', 'hotel'].map(async key => {
  const old = JSON.parse(await fs.readFile(path.join(workspace, 'audit/form-submit-arrow-20261026/cases', key + '.json')));
  return old.routes.map(row => ({ ...row, key }));
}))).flat();
const night = caseRoutes.find(row => row.key === 'night' && row.overlayLanguage === 'ru');
const generic = caseRoutes.find(row => row.key === 'hotel' && row.overlayLanguage === 'en');
need(night && generic, 'Representative React and generic case routes are required');

async function binding() {
  need(c.schema === 'vazuri/main-approved-forms-candidate/v1' && sha(await fs.readFile(candidatePath)) === candidateSHA256, 'Frozen candidate changed');
  need(Array.isArray(c.sourceProjects) && c.sourceProjects.length === 10, 'Ten frozen source projects are required');
  for (const project of c.sourceProjects) {
    const root = path.resolve(workspace, project.project);
    need(root.startsWith(path.join(workspace, 'projects') + path.sep), 'Source project escaped the workspace');
    for (const [file, digest] of Object.entries(project.sourceSHA256)) {
      const target = path.resolve(root, file);
      need(target.startsWith(root + path.sep) && sha(await fs.readFile(target)) === digest, 'Frozen source changed: ' + project.id + '/' + file);
    }
  }
  need(same(c.sourceProjects.find(item => item.id === 'main').sourceSHA256, c.sourceSHA256), 'Main source binding differs');
}
await binding();
if (live) {
  const proof = JSON.parse(await fs.readFile(path.join(here, 'live-verification.json')));
  need(proof.valid === true && proof.stage === 'complete' && proof.current === c.expectedRelease && proof.candidateSHA256 === candidateSHA256, 'Exact public byte proof is required before live browser QA');
}
const profiles = [];
for (const lang of ['ru', 'en']) for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) profiles.push({ name: 'documents-' + lang + '-' + width, suite: 'documents', lang, width, height });
profiles.push({ name: 'case-night-ru', suite: 'cases', lang: 'ru', width: 390, height: 844, row: night });
profiles.push({ name: 'case-hotel-en', suite: 'cases', lang: 'en', width: 1440, height: 900, row: generic });
const selected = profiles.filter(profile => (suite === 'all' || suite === profile.suite) && (!only || only === profile.name));
need(selected.length, 'No profiles selected');
if (!run) {
  console.log(JSON.stringify({ ready: true, base, candidateSHA256, sourceProjectsSHA256, consentVersion: legal.version, mainRoutes: mainRoutes.map(row => row.url), profiles: selected.map(row => row.name), browserStarted: false, network: false, actualLeadRequests: 0 }));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const output = path.join(here, 'qa-copy', live ? 'live' : 'local', stamp);
await fs.mkdir(output, { recursive: true });
const checks = [], results = [], coverage = new Set(), routeResponses = [];
let mockedLeadRequests = 0, blockedWriteRequests = 0, routesChecked = false;
const check = (profile, name, passed, detail = null) => checks.push({ profile, name, passed: Boolean(passed), detail });
check('binding', 'candidate and all ten source projects match frozen hashes', true, { candidateSHA256, sourceProjectsSHA256 });
check('binding', 'company identity and retained contacts are unchanged; two localized correspondence addresses are present', true, { identityFields, addresses: legal.operator.addresses });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });

async function settle(page, main = true) {
  if (main) await page.waitForFunction(() => window.__vzReactLeadReady === true, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(main ? 500 : 700);
}
async function visit(f, route, runtimeFile) {
  const response = await f.page.goto(base + route, { waitUntil: 'domcontentloaded' });
  if (!runtimeFile) runtimeFile = mainRoutes.find(row => cleanPath(row.url) === cleanPath(route))?.file;
  need(response?.status() === 200 && expected[runtimeFile] && sha(await response.body()) === expected[runtimeFile].sha256, 'Exact candidate HTML mismatch: ' + route);
  coverage.add(route);
  await settle(f.page, runtimeFile.startsWith('main/'));
}
async function pointer(f, locator, scroll = true) {
  await locator.waitFor({ state: 'visible' });
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect(), viewport = visualViewport;
    const left = Math.max(rect.left, viewport.offsetLeft), right = Math.min(rect.right, viewport.offsetLeft + viewport.width);
    const top = Math.max(rect.top, viewport.offsetTop), bottom = Math.min(rect.bottom, viewport.offsetTop + viewport.height);
    const x = (left + right) / 2, y = (top + bottom) / 2, hit = document.elementFromPoint(x, y);
    return { x: (x - viewport.offsetLeft) * viewport.scale, y: (y - viewport.offsetTop) * viewport.scale, hit: right > left && bottom > top && (element === hit || element.contains(hit)), hitTag: hit?.tagName };
  });
  need(point.hit && point.x >= 0 && point.y >= 0 && point.x < f.width && point.y < f.height, 'Physical click target is covered: ' + JSON.stringify(point));
  await f.page.mouse.click(point.x, point.y);
}
async function locks(page) {
  return page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, bodyOverflow: document.body.style.overflow, bodyPosition: document.body.style.position, rootLocked: document.documentElement.classList.contains('vz-lead-lock'), lenisStopped: document.documentElement.classList.contains('lenis-stopped'), menuActive: Boolean(document.querySelector('.mxd-menu__hamburger.active')), menuBlur: document.querySelector('.mxd-menu__backdrop') ? getComputedStyle(document.querySelector('.mxd-menu__backdrop')).backdropFilter : null }));
}
async function wheelMoves(f) {
  const samples = [];
  for (let index = 0; index < 40; index++) {
    samples.push(await f.page.evaluate(() => scrollY));
    if (samples.length >= 5 && Math.max(...samples.slice(-5)) - Math.min(...samples.slice(-5)) < .25) break;
    await f.page.waitForTimeout(80);
  }
  const before = await locks(f.page), direction = before.y > before.max * .6 ? -1 : 1;
  await f.page.mouse.move(f.width * .2, f.height * .4);
  await f.page.mouse.wheel(0, direction * 350);
  await f.page.waitForTimeout(650);
  const after = await locks(f.page);
  return { valid: direction * (after.y - before.y) > 25, samples, direction, before, after };
}
async function allMainRoutes(f) {
  for (const row of mainRoutes) {
    const parsed = new URL(row.url), response = await f.context.request.get(base + parsed.pathname + parsed.search);
    const body = await response.body(), value = { route: parsed.pathname, file: row.file, status: response.status(), sha256: sha(body), expectedSHA256: expected[row.file].sha256 };
    routeResponses.push(value);
    check('routes', row.file + ': direct SSR response is exact', value.status === 200 && value.sha256 === value.expectedSHA256, value);
    coverage.add(parsed.pathname);
  }
  routesChecked = true;
}
async function legalLinks(f) {
  const prefix = f.lang === 'en' ? '/en' : '';
  const value = await f.page.evaluate(() => {
    const footer = document.querySelector('footer .vz-legal-links'), menu = document.querySelector('.vz-legal-links--menu');
    const items = node => node ? [...node.querySelectorAll('a')].map(anchor => {
      const rect = anchor.getBoundingClientRect(), style = getComputedStyle(anchor);
      return { text: anchor.textContent.trim(), path: new URL(anchor.href).pathname, font: style.fontSize, weight: style.fontWeight, target: anchor.target, popup: anchor.hasAttribute('data-vz-privacy'), rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } };
    }) : [];
    return { footer: items(footer), menu: items(menu), footerSVG: footer?.querySelectorAll('svg').length, menuSVG: menu?.querySelectorAll('svg').length, footerOpacity: footer ? getComputedStyle(footer).opacity : null, viewport: innerWidth };
  });
  const labels = f.lang === 'en' ? ['Privacy', 'Consent', 'Company'] : ['Конфиденциальность', 'Согласие', 'Реквизиты'];
  const paths = [prefix + '/privacy', prefix + '/consent', prefix + '/company'];
  const footerGeometry = value.footer.length === 3 && value.footer.every(item => item.rect.left >= -1 && item.rect.right <= f.width + 1 && item.rect.width > 0 && item.rect.height > 0);
  const noOverlap = value.footer.every((item, index) => value.footer.slice(index + 1).every(other => {
    const a = item.rect, b = other.rect;
    return a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1;
  }));
  check(f.name, 'footer has three short text links without SVG decoration', same(value.footer.map(item => item.text), labels) && same(value.footer.map(item => item.path), paths) && value.footerSVG === 0, value);
  check(f.name, 'footer typography is quiet 12px regular with 0.7 opacity and fits its row or wrap', value.footer.every(item => item.font === '12px' && item.weight === '400' && !item.target && !item.popup) && Math.abs(Number(value.footerOpacity) - .7) < .001 && footerGeometry && noOverlap, value);
  check(f.name, 'menu retains only its two legal links and two existing arrows', value.menuSVG === 2 && same(value.menu.map(item => item.path), paths.slice(0, 2)) && value.menu.every(item => !item.target && !item.popup), { paths: value.menu.map(item => item.path), SVG: value.menuSVG });
}
async function legalPage(f, kind) {
  const route = (f.lang === 'en' ? '/en/' : '/') + kind;
  await visit(f, route);
  const value = await f.page.locator('.vz-legal-page').evaluate(element => {
    const rect = element.getBoundingClientRect(), inner = element.querySelector('.vz-legal-page__inner');
    const paragraphs = [...element.querySelectorAll('.vz-legal-page__paragraph')];
    const fits = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()].filter(box => box.width > 0).every(box => box.left >= rect.left - 1 && box.right <= Math.min(rect.right, innerWidth) + 1); };
    return { title: element.querySelector('h1').textContent, summary: element.querySelector('.vz-legal-page__summary').textContent, text: inner.textContent, sections: [...element.querySelectorAll('.vz-legal-page__section')].map(section => ({ id: section.id, title: section.querySelector('h2').textContent, paragraphs: [...section.querySelectorAll('.vz-legal-page__paragraph')].map(p => p.textContent), items: [...section.querySelectorAll('li')].map(li => li.textContent) })), font: paragraphs.map(p => getComputedStyle(p).fontSize), lineHeight: paragraphs.map(p => getComputedStyle(p).lineHeight), fits: paragraphs.every(fits) && fits(element.querySelector('h1')), width: rect.width, articleWidth: inner.getBoundingClientRect().width, viewport: innerWidth, documentScrollWidth: document.documentElement.scrollWidth, operator: element.querySelector('.vz-legal-page__operator').textContent, canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content, lang: document.documentElement.lang, switchPath: document.querySelector('.vz-language-switch')?.getAttribute('href'), pdf: element.querySelector('a[download]')?.getAttribute('href') };
  });
  const copy = legal.documents[kind][f.lang];
  const actualSections = value.sections.map(section => ({ id: section.id, title: normalized(section.title), paragraphs: section.paragraphs.map(normalized), items: section.items.map(normalized) }));
  const wantedSections = copy.sections.map(section => ({ id: section.id, title: normalized(section.title), paragraphs: section.paragraphs.map(normalized), items: (section.items || []).map(normalized) }));
  check(f.name, kind + ': exact concise approved text and section count', normalized(value.title) === normalized(copy.title) && normalized(value.summary) === normalized(copy.summary) && same(actualSections, wantedSections) && actualSections.length === (kind === 'privacy' ? 5 : 3), { sections: actualSections.length, exactText: same(actualSections, wantedSections) });
  check(f.name, kind + ': no case, demonstration or storage-API explanations', !/кейс|демонстрац|case stud|demonstration|localStorage|sessionStorage|PDF.{0,40}(?:тот же|same Russian)/i.test(value.text), { textLength: value.text.length });
  check(f.name, kind + ': current company and retained public contacts appear', ['name', 'inn', 'ogrn', 'phone', 'email'].every(key => normalized(value.operator).includes(normalized(legal.operator[key]))), { operator: value.operator });
  check(f.name, kind + ': 16px legal text fits the viewport', value.font.length > 0 && value.font.every(font => font === '16px') && value.lineHeight.every(height => Math.abs(parseFloat(height) - 25.6) < .1) && value.fits && value.width <= f.width + 1 && value.documentScrollWidth <= f.width + 1, value);
  const opposite = (f.lang === 'en' ? '/' : '/en/') + kind;
  check(f.name, kind + ': canonical, language switch, PDF revision and noindex remain correct', cleanPath(value.canonical) === route && cleanPath(value.switchPath) === opposite && value.lang === f.lang && /noindex/.test(value.robots) && value.pdf === legal.documents[kind].pdf, { route, canonical: value.canonical, switchPath: value.switchPath, pdf: value.pdf, robots: value.robots });
  await legalLinks(f);
  await f.page.screenshot({ path: path.join(output, f.name + '-' + kind + '.png') });
}
async function companyPage(f) {
  const route = (f.lang === 'en' ? '/en' : '') + '/company';
  await visit(f, route);
  const value = await f.page.locator('[data-vz-company-page]').evaluate(element => {
    const rect = element.getBoundingClientRect(), addresses = [...element.querySelectorAll('[data-vz-company-address]')];
    const fits = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()].filter(box => box.width > 0).every(box => box.left >= rect.left - 1 && box.right <= Math.min(rect.right, innerWidth) + 1); };
    const actions = [...element.querySelectorAll('.vz-legal-page__actions a')].map(anchor => ({ text: anchor.textContent.trim(), href: anchor.getAttribute('href'), target: anchor.target, rel: anchor.rel, download: anchor.hasAttribute('download') }));
    return { title: element.querySelector('h1').textContent, operator: element.querySelector('.vz-legal-page__operator').textContent, addresses: addresses.map(address => address.textContent), fonts: addresses.map(address => getComputedStyle(address).fontSize), text: element.textContent, embeddedDocuments: element.querySelectorAll('iframe,object,embed').length, fits: addresses.every(fits) && fits(element.querySelector('h1')), width: rect.width, scrollWidth: document.documentElement.scrollWidth, actions, canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content, lang: document.documentElement.lang, switchPath: document.querySelector('.vz-language-switch')?.getAttribute('href') };
  });
  const addresses = legal.operator.addresses.map(address => address[f.lang]);
  check(f.name, 'company page identifies the operator and lists both correspondence addresses in order', ['name', 'inn', 'ogrn', 'phone', 'email'].every(key => normalized(value.operator).includes(normalized(legal.operator[key]))) && same(value.addresses.map(normalized), addresses.map(normalized)), { operator: value.operator, addresses: value.addresses });
  check(f.name, 'company page remains minimal and does not render bank details', value.actions.length === 2 && value.embeddedDocuments === 0 && !/БИК|КПП|расч[её]тн|корреспондент|bank account|account number|\b\d{20}\b/i.test(value.text), { actionCount: value.actions.length, embeddedDocuments: value.embeddedDocuments });
  check(f.name, 'company addresses use 16px type and fit the viewport', value.fonts.every(font => font === '16px') && value.fits && value.width <= f.width + 1 && value.scrollWidth <= f.width + 1, { fonts: value.fonts, fits: value.fits, width: value.width, scrollWidth: value.scrollWidth });
  const card = value.actions.find(action => action.download), reporting = value.actions.find(action => !action.download);
  const reportURL = new URL(legal.company.reporting);
  check(f.name, 'company card and FNS actions use exact frozen URLs in safe new tabs', card?.href === legal.company.card && reporting?.href === legal.company.reporting && value.actions.every(action => action.target === '_blank' && action.rel.split(/\s+/).includes('noopener')) && reportURL.protocol === 'https:' && /(^|\.)nalog\.(?:gov\.)?ru$/.test(reportURL.hostname), value.actions);
  const opposite = (f.lang === 'en' ? '' : '/en') + '/company';
  check(f.name, 'company canonical and language switch preserve the company route', cleanPath(value.canonical) === route && cleanPath(value.switchPath) === opposite && value.lang === f.lang && /noindex/.test(value.robots), { route, canonical: value.canonical, switchPath: value.switchPath, robots: value.robots });
  await legalLinks(f);
  await f.page.screenshot({ path: path.join(output, f.name + '-company.png') });
}
const formState = root => root.evaluate(element => ({
  fields: [...element.querySelectorAll('.v2-brief__field input')].map(input => ({ name: input.name, value: input.value, required: input.required })),
  checked: element.querySelector('[name=consent]')?.checked, required: element.querySelector('[name=consent]')?.required, version: element.querySelector('[name=consent_version]')?.value,
  consent: (() => { const anchor = element.querySelector('.v2-brief__consent a'); return anchor ? { href: anchor.href, target: anchor.target, rel: anchor.rel } : null; })(),
}));
function pristine(value) { return same(value.fields.map(item => item.name), ['name', 'phone', 'contact']) && value.fields.every(item => !item.value && item.required) && value.required && !value.checked && value.version === legal.version; }
async function fillAndReadConsent(f, root, token) {
  await root.locator('[name=name]').fill('Legal Copy QA ' + token);
  await root.locator('[name=phone]').fill('+7 999 123-45-67');
  await root.locator('[name=contact]').fill('legal-copy-' + token + '@example.invalid');
  const before = await formState(root), pending = f.context.waitForEvent('page', { timeout: 12000 });
  await pointer(f, root.locator('.v2-brief__consent a'));
  const popup = await pending;
  await popup.waitForLoadState('domcontentloaded');
  const article = popup.locator('[data-vz-legal-document="consent"]');
  await article.waitFor();
  const opened = { path: cleanPath(popup.url()), text: await article.innerText() };
  await popup.close(); await f.page.bringToFront();
  const after = await formState(root), desired = (f.lang === 'en' ? '/en' : '') + '/consent';
  check(f.name, 'reading the current consent in a new tab preserves fields and unchecked consent', same(before, after) && !after.checked && before.consent?.target === '_blank' && before.consent.rel.split(/\s+/).includes('noopener') && opened.path === desired && opened.text.includes(legal.operator.inn) && opened.text.includes(legal.operator.ogrn), { before, after, openedPath: opened.path });
}
async function mockSubmit(f, root) {
  const previous = f.posts.length;
  await root.locator('[name=consent]').check();
  await pointer(f, root.locator('.v2-brief__submit'));
  await root.locator('.v2-brief__success:visible').waitFor();
  const post = f.posts.at(-1), payload = post?.payload;
  check(f.name, 'mocked request carries the exact current consent revision', f.posts.length === previous + 1 && payload?.consent_version === legal.version && payload?.consent === 'yes' && payload?.language === f.lang && String(payload?.message).includes('+7 999 123-45-67') && String(payload?.contact).endsWith('@example.invalid'), post);
  await pointer(f, root.locator('.v2-brief__success button'));
}
async function mainSmoke(f) {
  const prefix = f.lang === 'en' ? '/en' : '';
  await visit(f, prefix || '/');
  await pointer(f, f.page.locator('.mxd-menu__hamburger'), false);
  await f.page.waitForTimeout(1050);
  await pointer(f, f.page.locator('.mxd-menu .vz-legal-links__item').first());
  await f.page.waitForURL(url => cleanPath(url.href) === prefix + '/privacy');
  await settle(f.page);
  const state = await locks(f.page);
  check(f.name, 'menu legal navigation closes the menu without blur or form residue', !state.menuActive && (!state.menuBlur || state.menuBlur === 'none' || state.menuBlur === 'blur(0px)') && await f.page.locator('.v2-brief--main:not(.v2-brief--inline)').count() === 0, state);
  await f.page.locator('footer .vz-legal-footer').scrollIntoViewIfNeeded();
  await f.page.waitForTimeout(350);
  await f.page.screenshot({ path: path.join(output, f.name + '-footer.png') });
  await pointer(f, f.page.locator('footer .vz-legal-links__item').nth(1));
  await f.page.waitForURL(url => cleanPath(url.href) === prefix + '/consent');
  check(f.name, 'short footer consent link physically navigates to the document', await f.page.locator('[data-vz-legal-document="consent"]').count() === 1);
  await pointer(f, f.page.locator('footer .vz-legal-links__item').nth(2));
  await f.page.waitForURL(url => cleanPath(url.href) === prefix + '/company');
  check(f.name, 'short footer company link physically navigates to the company page', await f.page.locator('[data-vz-company-page]').count() === 1);
  await visit(f, prefix || '/');
  await pointer(f, f.page.locator('.mxd-socials-line__link[data-vz-lead-source="behance"]').first());
  const root = f.page.locator('.v2-brief--main:not(.v2-brief--inline)');
  await root.waitFor({ state: 'visible' }); await f.page.waitForTimeout(850);
  check(f.name, 'main form retains blank required fields and unchecked current consent', pristine(await formState(root)), await formState(root));
  await fillAndReadConsent(f, root, f.lang);
  await mockSubmit(f, root);
  await root.waitFor({ state: 'detached' });
  const after = await locks(f.page), movement = await wheelMoves(f);
  check(f.name, 'main form closes and page scrolling resumes', !after.rootLocked && !after.lenisStopped && after.bodyOverflow !== 'hidden' && after.bodyPosition !== 'fixed' && movement.valid, movement);
}
async function caseSmoke(f) {
  await visit(f, f.row.localPath, f.row.runtimeFile);
  const before = await locks(f.page), action = f.page.locator('.v2-console__actions button').first();
  await f.page.locator('.v2-console__toggle').waitFor({ state: 'visible' });
  if (!(await action.isVisible())) { await pointer(f, f.page.locator('.v2-console__toggle'), false); await f.page.waitForTimeout(250); }
  await pointer(f, action, false);
  const root = f.page.locator('.v2-brief:visible');
  await root.waitFor({ state: 'visible' }); await f.page.waitForTimeout(650);
  check(f.name, 'representative case exposes the current consent revision in its blank approved form', pristine(await formState(root)), await formState(root));
  await fillAndReadConsent(f, root, f.row.key);
  await f.page.screenshot({ path: path.join(output, f.name + '-form.png') });
  await mockSubmit(f, root);
  await root.waitFor({ state: 'hidden' });
  const after = await locks(f.page);
  check(f.name, 'representative case retains its original page lock state after close', before.bodyOverflow === after.bodyOverflow && before.bodyPosition === after.bodyPosition && before.rootLocked === after.rootLocked, { before, after });
}
async function pdfDownloads(f) {
  for (const kind of ['privacy', 'consent']) {
    const doc = legal.documents[kind], wanted = expected['main' + doc.pdf];
    const response = await f.context.request.get(base + doc.pdf), bytes = await response.body();
    check(f.name, kind + ': revised PDF response matches frozen bytes and MIME', response.status() === 200 && response.headers()['content-type']?.includes('application/pdf') && bytes.subarray(0, 5).toString() === '%PDF-' && sha(bytes) === wanted.sha256, { status: response.status(), sha256: sha(bytes), expected: wanted.sha256 });
    await visit(f, '/' + kind);
    const pending = f.page.waitForEvent('download', { timeout: 12000 });
    await pointer(f, f.page.locator('.vz-legal-page__header a[download]'));
    const download = await pending, destination = path.join(output, path.basename(doc.pdf));
    await download.saveAs(destination);
    check(f.name, kind + ': download control saves the exact revised PDF', sha(await fs.readFile(destination)) === wanted.sha256 && await download.failure() === null, { suggestedFilename: download.suggestedFilename(), sha256: sha(await fs.readFile(destination)) });
  }
  const wanted = expected['main' + legal.company.card];
  const response = await f.context.request.get(base + legal.company.card), bytes = await response.body();
  check(f.name, 'original company card response is the exact frozen PDF', response.status() === 200 && response.headers()['content-type']?.includes('application/pdf') && bytes.subarray(0, 5).toString() === '%PDF-' && sha(bytes) === wanted.sha256, { status: response.status(), sha256: sha(bytes), expected: wanted.sha256 });
  await visit(f, '/company');
  const pending = f.page.waitForEvent('download', { timeout: 12000 });
  await pointer(f, f.page.locator('[data-vz-company-page] a[download]'));
  const download = await pending, destination = path.join(output, path.basename(legal.company.card));
  await download.saveAs(destination);
  check(f.name, 'company card download control saves the unchanged original PDF', sha(await fs.readFile(destination)) === wanted.sha256 && await download.failure() === null, { suggestedFilename: download.suggestedFilename(), sha256: sha(await fs.readFile(destination)) });
}

try {
  for (const p of selected) {
    const context = await browser.newContext({ viewport: { width: p.width, height: p.height }, isMobile: p.width < 800, hasTouch: p.width < 800, acceptDownloads: true });
    const posts = [], blocked = [], errors = [], mirrored = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        const raw = request.postData() || '';
        if (method === 'POST' && url.pathname === '/lead.php' && ['vazuri.io', '127.0.0.1', 'localhost'].includes(url.hostname)) {
          let payload; try { payload = JSON.parse(raw); } catch { payload = Object.fromEntries(new URLSearchParams(raw)); }
          posts.push({ url: request.url(), method, payload, mocked: true }); mockedLeadRequests++;
          await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); return;
        }
        blocked.push({ url: request.url(), method, containsFixtureData: /legal-copy-|Legal Copy QA/.test(raw) }); blockedWriteRequests++;
        await route.abort('blockedbyclient'); return;
      }
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'Content-Type, Accept' } }); return; }
      if (request.resourceType() === 'media') { await route.abort('blockedbyclient'); return; }
      if (!live && url.hostname === 'vazuri.io') {
        try { const response = await route.fetch({ url: base + url.pathname + url.search }); mirrored.push(url.pathname); await route.fulfill({ response }); }
        catch { await route.abort('failed'); }
        return;
      }
      await route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    const f = { ...p, context, page, posts }, result = { profile: p.name, suite: p.suite, language: p.lang, width: p.width, height: p.height };
    try {
      if (p.suite === 'documents') {
        if (!routesChecked) await allMainRoutes(f);
        for (const kind of ['privacy', 'consent']) await legalPage(f, kind);
        await companyPage(f);
        if ((p.lang === 'ru' && p.width === 390) || (p.lang === 'en' && p.width === 1440)) await mainSmoke(f);
        if (p.lang === 'ru' && p.width === 1440) await pdfDownloads(f);
      } else await caseSmoke(f);
      check(p.name, 'no fixture data reached another write endpoint', blocked.every(row => !row.containsFixtureData), blocked);
      if (p.suite === 'documents') check(p.name, 'no main-page JavaScript errors', errors.length === 0, errors);
    } catch (error) {
      result.error = error.stack;
      check(p.name, 'profile completes', false, error.stack);
      await page.screenshot({ path: path.join(output, p.name + '-failure.png') }).catch(() => {});
    } finally {
      result.mockedLeadRequests = posts; result.blockedWrites = blocked; result.observedJavaScriptErrors = errors; result.mirroredPublicGETs = [...new Set(mirrored)];
      results.push(result); await context.close();
    }
    console.log(JSON.stringify({ profile: p.name, failed: checks.filter(row => row.profile === p.name && !row.passed).map(row => row.name) }));
  }
} finally { await browser.close(); }
try { await binding(); check('binding', 'candidate and all source projects remain unchanged after QA', true); }
catch (error) { check('binding', 'candidate and all source projects remain unchanged after QA', false, error.message); }
const failed = checks.filter(row => !row.passed), valid = checks.length > 0 && failed.length === 0;
const report = {
  schema: 'vazuri/main-approved-forms-browser-qa/v1', qaKind: 'concise-legal-copy-and-minimal-footer-v26', generatedAt: new Date().toISOString(),
  valid, localQAPassed: !live && valid, liveQAPassed: live && valid, mode: live ? 'live' : 'local', base, suite, only,
  candidateSHA256, sourceSHA256: c.sourceSHA256, sourceProjectsSHA256, helperSHA256, consentVersion: legal.version,
  summary: { profiles: results.length, checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
  intendedProfileCount: 8, visitedRoutes: [...coverage], routeResponses, mockedLeadRequests, realLeadRequestsSent: 0, blockedWriteRequests,
  limitations: ['Case motion, videos and legacy native forms are unchanged and are outside this copy-only smoke scope.', 'All writes are blocked or mocked. No email or real lead endpoint is invoked.', 'Case JavaScript errors are recorded without a blanket assertion about the legacy baseline.'],
  checks, failures: failed, results,
};
const bytes = JSON.stringify(report, null, 2) + '\n', rawPath = path.join(output, 'report.json');
await fs.writeFile(rawPath, bytes);
await fs.writeFile(path.join(here, live ? 'live-qa.json' : 'local-qa.json'), bytes);
console.log(JSON.stringify({ valid, ...report.summary, mockedLeadRequests, realLeadRequestsSent: 0, report: rawPath, sha256: sha(bytes) }));
process.exitCode = valid ? 0 : 1;
