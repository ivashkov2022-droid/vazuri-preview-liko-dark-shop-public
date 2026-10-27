import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(here, '../..');
const args = process.argv.slice(2), run = args.includes('--run'), live = args.includes('--live');
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const suites = option('--suite', 'all').split(','), only = option('--profile', null);
if (suites.some(x => !['all', 'documents', 'pdf', 'main', 'cases', 'legacy'].includes(x))) throw Error('Unknown suite');
const base = live ? 'https://vazuri.io' : 'http://127.0.0.1:4486';
const sha = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(sortKeys(value));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sortKeys(value[key])])) : value;
}
const normalized = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cleanPath = url => new URL(url, base).pathname.replace(/\/$/, '') || '/';
const candidateFile = path.join(here, 'candidate.json');
const helperSHA256 = sha(await fs.readFile(fileURLToPath(import.meta.url)));
let candidateBytes;
try { candidateBytes = await fs.readFile(candidateFile); }
catch (error) { if (!run && error.code === 'ENOENT') { console.log(JSON.stringify({ ready: false, missing: ['candidate.json'], network: false, browserStarted: false })); process.exit(0); } throw error; }
const c = JSON.parse(candidateBytes), candidateSHA256 = sha(candidateBytes);
const sourceProjectsSHA256 = sha(canonical(c.sourceProjects));
const sourceRoot = path.resolve(workspace, c.sourceProject);
const legal = JSON.parse(await fs.readFile(path.join(sourceRoot, 'data/legal-documents.json')));
if (legal.version !== '2026-10-27' || legal.operator.inn !== '2225231152' || legal.operator.ogrn !== '1232200018170' || !legal.operator.name.includes('ТОРГСЕРВИС 122')) throw Error('Final approved corporate operator/version is required');
const routeData = await Promise.all(['night', 'hotel', 'altera', 'slides', 'urban', 'revive', 'sky', 'sync', 'relief'].map(async key => {
  const old = JSON.parse(await fs.readFile(path.join(workspace, 'audit/form-submit-arrow-20261026/cases', key + '.json')));
  return old.routes.map(row => ({ ...row, key }));
}));
const caseRoutes = routeData.flat();
async function binding() {
  if (c.schema !== 'vazuri/main-approved-forms-candidate/v1') throw Error('Invalid candidate schema');
  if (sha(await fs.readFile(candidateFile)) !== candidateSHA256) throw Error('Frozen candidate changed');
  if (!Array.isArray(c.sourceProjects) || c.sourceProjects.length !== 10) throw Error('Ten frozen source projects are required');
  for (const project of c.sourceProjects) for (const [file, digest] of Object.entries(project.sourceSHA256)) {
    if (sha(await fs.readFile(path.resolve(workspace, project.project, file))) !== digest) throw Error('Frozen project source changed: ' + project.id + '/' + file);
  }
  const main = c.sourceProjects.find(item => item.id === 'main');
  if (!same(main.sourceSHA256, c.sourceSHA256)) throw Error('Main/source-project hash maps differ');
}
await binding();
if (live) {
  const proof = JSON.parse(await fs.readFile(path.join(here, 'live-verification.json')));
  if (!proof.valid || proof.stage !== 'complete' || proof.current !== c.expectedRelease || proof.candidateSHA256 !== candidateSHA256) throw Error('Exact public byte verification is required');
}

const profiles = [];
for (const lang of ['ru', 'en']) for (const [width, height] of [[1440, 900], [768, 1024], [390, 667], [320, 568]]) profiles.push({ name: `documents-${lang}-${width}`, suite: 'documents', lang, width, height });
profiles.push({ name: 'pdf-downloads', suite: 'pdf', lang: 'ru', width: 1440, height: 900 });
for (const lang of ['ru', 'en']) profiles.push({ name: `main-form-${lang}`, suite: 'main', lang, width: lang === 'ru' ? 1440 : 390, height: lang === 'ru' ? 900 : 667 });
for (const row of caseRoutes) profiles.push({ name: `case-${row.key}-${row.overlayLanguage}`, suite: 'cases', lang: row.overlayLanguage, width: row.overlayLanguage === 'ru' ? 390 : 1440, height: row.overlayLanguage === 'ru' ? 667 : 900, row });
for (const key of ['hotel', 'revive', 'sky']) profiles.push({ name: `legacy-${key}`, suite: 'legacy', lang: 'ru', width: key === 'hotel' ? 390 : 1440, height: key === 'hotel' ? 667 : 900, row: caseRoutes.find(row => row.key === key && row.overlayLanguage === 'ru') });
const selected = profiles.filter(p => (suites.includes('all') || suites.includes(p.suite)) && (!only || p.name === only));
if (!selected.length) throw Error('No profiles selected');
if (!run) {
  console.log(JSON.stringify({ ready: true, base, candidateSHA256, sourceProjectsSHA256, profiles: selected.map(p => p.name), caseLanguages: caseRoutes.length, suites, only, network: false, browserStarted: false, realLeadRequestsSent: 0 }));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const output = path.join(here, 'qa-legal', live ? 'live' : 'local', stamp);
await fs.mkdir(output, { recursive: true });
const checks = [], results = [], coverage = new Set();
let mockedLeadRequests = 0, blockedExternalPOSTs = 0;
const check = (profile, name, passed, detail = null) => checks.push({ profile, name, passed: Boolean(passed), detail });
check('binding', 'candidate and all ten maintained source projects match frozen hashes', true, { candidateSHA256, sourceProjectsSHA256 });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });

async function settle(page, main = true) {
  if (main) await page.waitForFunction(() => window.__vzReactLeadReady === true, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(main ? 500 : 700);
}
async function visit(f, route, runtimeFile) {
  const response = await f.page.goto(base + route, { waitUntil: 'domcontentloaded' });
  if (!runtimeFile) runtimeFile = c.routes.find(row => row.url && cleanPath(row.url) === cleanPath(base + route))?.file;
  const expected = c.intendedDelta[runtimeFile];
  if (response?.status() !== 200 || !expected || sha(await response.body()) !== expected.sha256) throw Error('Exact candidate HTML mismatch: ' + route);
  coverage.add(route);
  await settle(f.page, runtimeFile.startsWith('main/'));
}
async function pointer(f, locator, scroll = true) {
  await locator.waitFor({ state: 'visible' });
  if (scroll) await locator.scrollIntoViewIfNeeded();
  const point = await locator.evaluate(e => {
    const r = e.getBoundingClientRect(), v = visualViewport;
    const left = Math.max(r.left, v.offsetLeft), right = Math.min(r.right, v.offsetLeft + v.width);
    const top = Math.max(r.top, v.offsetTop), bottom = Math.min(r.bottom, v.offsetTop + v.height);
    const x = (left + right) / 2, y = (top + bottom) / 2, hit = document.elementFromPoint(x, y);
    return { x: (x - v.offsetLeft) * v.scale, y: (y - v.offsetTop) * v.scale, hit: right > left && bottom > top && (e === hit || e.contains(hit)), hitTag: hit?.tagName, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
  if (!point.hit || point.x < 0 || point.y < 0 || point.x >= f.width || point.y >= f.height) throw Error('Physical click target is not visible: ' + JSON.stringify(point));
  await f.page.mouse.click(point.x, point.y);
}
async function locks(page) {
  return page.evaluate(() => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight, bodyOverflow: document.body.style.overflow, bodyPosition: document.body.style.position, rootLocked: document.documentElement.classList.contains('vz-lead-lock'), lenisStopped: document.documentElement.classList.contains('lenis-stopped'), menuActive: !!document.querySelector('.mxd-menu__hamburger.active'), menuBlur: document.querySelector('.mxd-menu__backdrop') ? getComputedStyle(document.querySelector('.mxd-menu__backdrop')).backdropFilter : null }));
}
async function stableScroll(f) {
  const samples = [];
  for (let index = 0; index < 40; index++) {
    samples.push(await f.page.evaluate(() => scrollY));
    if (samples.length >= 5 && Math.max(...samples.slice(-5)) - Math.min(...samples.slice(-5)) < .25) return { valid: true, samples };
    await f.page.waitForTimeout(80);
  }
  return { valid: false, samples };
}
async function wheelMoves(f, waitForStable = false) {
  const settling = waitForStable ? await stableScroll(f) : null;
  const before = await locks(f.page), direction = before.y > before.max * .6 ? -1 : 1;
  if (settling && !settling.valid) return { valid: false, settling, before, direction };
  await f.page.mouse.move(f.width * .2, f.height * .4);
  await f.page.mouse.wheel(0, direction * 350);
  await f.page.waitForTimeout(600);
  const after = await locks(f.page);
  return { valid: direction * (after.y - before.y) > 25, settling, direction, before, after };
}
const formState = root => root.evaluate(e => ({
  fields: [...e.querySelectorAll('.v2-brief__field input')].map(x => ({ name: x.name, value: x.value, required: x.required })),
  checked: e.querySelector('[name=consent]')?.checked, required: e.querySelector('[name=consent]')?.required,
  version: e.querySelector('[name=consent_version]')?.value,
  consent: (() => { const a = e.querySelector('.v2-brief__consent a'); return a ? { href: a.href, target: a.target, rel: a.rel, popupHook: a.hasAttribute('data-vz-privacy') } : null; })(),
}));
function pristine(s) { return same(s.fields.map(x => x.name), ['name', 'phone', 'contact']) && s.fields.every(x => x.value === '' && x.required) && s.required && !s.checked && s.version === legal.version; }
function consentLinkOK(s, lang) { return !!s.consent && cleanPath(s.consent.href) === (lang === 'en' ? '/en/consent' : '/consent') && s.consent.target === '_blank' && s.consent.rel.split(/\s+/).includes('noopener') && !s.consent.popupHook; }
async function fill(root, token) {
  await root.locator('[name=name]').fill('Legal QA ' + token);
  await root.locator('[name=phone]').fill('+7 999 123-45-67');
  await root.locator('[name=contact]').fill('legal-qa-' + token + '@example.invalid');
}
async function newTabPreserves(f, root, token) {
  await fill(root, token);
  const before = await formState(root), popupPromise = f.context.waitForEvent('page', { timeout: 12000 });
  await pointer(f, root.locator('.v2-brief__consent a'));
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('[data-vz-legal-document="consent"]').waitFor();
  const opened = { path: cleanPath(popup.url()), text: await popup.locator('.vz-legal-page__header').innerText() };
  await popup.close();
  await f.page.bringToFront();
  const after = await formState(root);
  check(f.name, token + ': consent opens a separate current document without changing fields or checkbox', same(before, after) && !after.checked && opened.path === (f.lang === 'en' ? '/en/consent' : '/consent') && opened.text.includes(legal.operator.inn) && opened.text.includes(legal.operator.ogrn), { before, after, openedPath: opened.path });
}
async function mockSubmit(f, root, token) {
  const previous = f.posts.length;
  await pointer(f, root.locator('.v2-brief__submit'));
  await f.page.waitForTimeout(150);
  check(f.name, token + ': unselected required consent blocks submission', f.posts.length === previous && !(await root.locator('[name=consent]').isChecked()));
  await root.locator('[name=consent]').check();
  await pointer(f, root.locator('.v2-brief__submit'));
  await root.locator('.v2-brief__success:visible').waitFor();
  const post = f.posts.at(-1), payload = post?.payload;
  check(f.name, token + ': mocked JSON submission includes the exact current consent version', f.posts.length === previous + 1 && payload?.consent_version === legal.version && payload?.consent === 'yes' && payload?.language === f.lang && String(payload?.message).includes('+7 999 123-45-67') && String(payload?.contact).endsWith('@example.invalid'), post);
}
async function sourceLinks(f) {
  const prefix = f.lang === 'en' ? '/en' : '';
  const values = await f.page.locator('.vz-legal-links').evaluateAll(elements => elements.map(e => ({ menu: !!e.closest('.mxd-menu'), links: [...e.querySelectorAll('a')].map(a => ({ path: new URL(a.href).pathname, target: a.target, section: a.hasAttribute('data-vz-section-link'), popup: a.hasAttribute('data-vz-privacy') })) })));
  check(f.name, 'menu and footer expose both normal legal page links', values.length === 2 && values.every(e => same(e.links.map(a => a.path), [prefix + '/privacy', prefix + '/consent']) && e.links.every(a => !a.target && a.section && !a.popup)), values);
}
async function legalPage(f, kind) {
  const route = (f.lang === 'en' ? '/en/' : '/') + kind;
  await visit(f, route);
  const value = await f.page.locator('.vz-legal-page').evaluate(e => {
    const box = e.getBoundingClientRect(), inner = e.querySelector('.vz-legal-page__inner'), pdf = e.querySelector('.vz-legal-page__header a[download]'), r = pdf?.getBoundingClientRect();
    const paragraphs = [...e.querySelectorAll('.vz-legal-page__paragraph')], bodies = [...e.querySelectorAll('.vz-legal-page__paragraph,.vz-legal-page__list li')];
    const fits = node => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()].filter(x => x.width > 0).every(x => x.left >= box.left - 1 && x.right <= Math.min(box.right, innerWidth) + 1); };
    return { title: e.querySelector('h1').textContent, summary: e.querySelector('.vz-legal-page__summary').textContent, text: e.textContent, sections: [...e.querySelectorAll('.vz-legal-page__section')].map(s => ({ id: s.id, title: s.querySelector('h2').textContent, paragraphs: [...s.querySelectorAll('.vz-legal-page__paragraph')].map(p => p.textContent), items: [...s.querySelectorAll('li')].map(li => li.textContent) })), paragraphFont: paragraphs.map(p => getComputedStyle(p).fontSize), paragraphLineHeight: paragraphs.map(p => getComputedStyle(p).lineHeight), fits: bodies.every(fits) && fits(e.querySelector('h1')), width: box.width, innerWidth: inner.getBoundingClientRect().width, layoutViewport: { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyMinWidth: getComputedStyle(document.body).minWidth }, pdf: pdf ? { href: pdf.getAttribute('href'), target: pdf.target, download: pdf.hasAttribute('download'), rect: { top: r.top, bottom: r.bottom, right: r.right } } : null, mailto: [...e.querySelectorAll('a[href^="mailto:"]')].map(a => ({ text: a.textContent, href: a.getAttribute('href') })), other: [...e.querySelectorAll('.vz-legal-page__actions a')].map(a => ({ href: a.getAttribute('href'), target: a.target })), canonical: document.querySelector('link[rel=canonical]')?.href, robots: document.querySelector('meta[name=robots]')?.content, lang: document.documentElement.lang, alternate: [...document.querySelectorAll('link[rel=alternate][hreflang]')].map(a => ({ lang: a.hreflang, href: a.href })), switchPath: document.querySelector('.vz-language-switch')?.getAttribute('href') };
  });
  const copy = legal.documents[kind][f.lang];
  const actual = value.sections.map(s => ({ id: s.id, title: normalized(s.title), paragraphs: s.paragraphs.map(normalized), items: s.items.map(normalized) }));
  const expected = copy.sections.map(s => ({ id: s.id, title: normalized(s.title), paragraphs: s.paragraphs.map(normalized), items: (s.items || []).map(normalized) }));
  check(f.name, kind + ': exact localized document text and current corporate operator', normalized(value.title) === normalized(copy.title) && normalized(value.summary) === normalized(copy.summary) && same(actual, expected) && value.text.includes(legal.operator.name) && value.text.includes(legal.operator.inn) && value.text.includes(legal.operator.ogrn) && !/Савицк|Savitsk|ОГРНИП|OGRNIP/i.test(value.text), { sections: actual.length, company: legal.operator.shortName, exactText: same(actual, expected) });
  check(f.name, kind + ': legal text fits the viewport with 16px body typography', value.fits && value.width <= f.width + 1 && value.paragraphFont.every(x => x === '16px') && value.paragraphLineHeight.every(x => Math.abs(parseFloat(x) - 25.6) < .1), { width: value.width, innerWidth: value.innerWidth, fits: value.fits, paragraphFont: [...new Set(value.paragraphFont)], paragraphLineHeight: [...new Set(value.paragraphLineHeight)], layoutViewport: value.layoutViewport });
  check(f.name, kind + ': current download and mail links are present', value.pdf?.href === legal.documents[kind].pdf && value.pdf.download && value.mailto.length > 0 && value.mailto.every(a => a.text === legal.operator.email && a.href === 'mailto:' + legal.operator.email), { pdf: value.pdf, mailto: value.mailto });
  const opposite = (f.lang === 'en' ? '/' : '/en/') + kind;
  check(f.name, kind + ': canonical, locale switch and noindex are correct', cleanPath(value.canonical) === route && value.lang === f.lang && /noindex/.test(value.robots) && cleanPath(value.switchPath) === opposite && ['ru', 'en'].every(lang => value.alternate.some(x => x.lang === lang && cleanPath(x.href) === (lang === 'en' ? '/en/' : '/') + kind)), { canonical: value.canonical, robots: value.robots, lang: value.lang, switchPath: value.switchPath, alternate: value.alternate });
  await sourceLinks(f);
  await f.page.screenshot({ path: path.join(output, f.name + '-' + kind + '.png') });
  if (kind === 'consent') {
    await pointer(f, f.page.locator('.vz-language-switch'), false);
    await f.page.waitForURL(url => cleanPath(url.href) === opposite);
    check(f.name, 'language control actually preserves the consent document route', cleanPath(f.page.url()) === opposite);
  }
}
async function mainForms(f) {
  const home = f.lang === 'en' ? '/en' : '/', contact = f.lang === 'en' ? '/en/contact' : '/contact';
  await visit(f, home);
  await sourceLinks(f);
  await pointer(f, f.page.locator('.mxd-menu__hamburger'), false);
  await f.page.waitForTimeout(1050);
  await pointer(f, f.page.locator('.mxd-menu .vz-legal-links__item').first());
  await f.page.waitForURL(url => cleanPath(url.href) === (f.lang === 'en' ? '/en/privacy' : '/privacy'));
  await settle(f.page);
  const menuState = await locks(f.page);
  check(f.name, 'hamburger legal link navigates in the same tab without leaving menu blur or a form overlay', !menuState.menuActive && (!menuState.menuBlur || menuState.menuBlur === 'blur(0px)' || menuState.menuBlur === 'none') && await f.page.locator('.v2-brief--main:not(.v2-brief--inline)').count() === 0, menuState);
  await pointer(f, f.page.locator('footer .vz-legal-links__item').nth(1));
  await f.page.waitForURL(url => cleanPath(url.href) === (f.lang === 'en' ? '/en/consent' : '/consent'));
  check(f.name, 'footer consent link actually navigates to the full document', await f.page.locator('[data-vz-legal-document="consent"]').count() === 1);
  for (const surface of ['modal', 'inline']) {
    await visit(f, surface === 'modal' ? home : contact);
    if (surface === 'modal') await pointer(f, f.page.locator('.mxd-socials-line__link[data-vz-lead-source="behance"]').first());
    const root = f.page.locator(surface === 'modal' ? '.v2-brief--main:not(.v2-brief--inline)' : '.v2-brief--inline');
    await root.waitFor({ state: 'visible' }); await f.page.waitForTimeout(850);
    const initial = await formState(root);
    check(f.name, surface + ': clean required fields and separate consent with current hidden version', pristine(initial) && consentLinkOK(initial, f.lang), initial);
    await newTabPreserves(f, root, surface + '-' + f.lang);
    await mockSubmit(f, root, surface + '-' + f.lang);
    if (surface === 'modal') {
      await pointer(f, root.locator('.v2-brief__success button'));
      await root.waitFor({ state: 'detached' });
    }
    const after = await locks(f.page), movement = await wheelMoves(f);
    check(f.name, surface + ': page scroll is active after completing the mocked form', !after.rootLocked && !after.lenisStopped && after.bodyOverflow !== 'hidden' && after.bodyPosition !== 'fixed' && movement.valid, movement);
  }
}
async function openCase(f) {
  const action = f.page.locator('.v2-console__actions button').first();
  await f.page.locator('.v2-console__toggle').waitFor({ state: 'visible' });
  if (!(await action.isVisible())) { await pointer(f, f.page.locator('.v2-console__toggle'), false); await f.page.waitForTimeout(250); }
  await pointer(f, action, false);
  const root = f.page.locator('.v2-brief:visible');
  await root.waitFor({ state: 'visible' }); await f.page.waitForTimeout(650);
  return root;
}
async function caseForm(f) {
  await visit(f, f.row.localPath, f.row.runtimeFile);
  const before = await locks(f.page), root = await openCase(f), initial = await formState(root);
  check(f.name, 'case keeps a clean approved form with current hidden consent and localized new-tab link', pristine(initial) && consentLinkOK(initial, f.lang), initial);
  await newTabPreserves(f, root, f.row.key + '-' + f.lang);
  await f.page.screenshot({ path: path.join(output, f.name + '-open.png') });
  await mockSubmit(f, root, f.row.key + '-' + f.lang);
  await pointer(f, root.locator('.v2-brief__success button'));
  await root.waitFor({ state: 'hidden' });
  const after = await locks(f.page);
  check(f.name, 'case form closes and restores its existing page lock state', before.bodyOverflow === after.bodyOverflow && before.bodyPosition === after.bodyPosition && before.rootLocked === after.rootLocked, { before, after });
}
async function legacy(f) {
  await visit(f, f.row.localPath, f.row.runtimeFile);
  const dismissCasePanel = async () => {
    const panel = f.page.locator('.v2-console__panel');
    if (await panel.isVisible()) {
      await pointer(f, f.page.locator('.v2-console__toggle'), false);
      await panel.waitFor({ state: 'hidden' });
    }
  };
  const prepareControl = async locator => {
    await locator.waitFor({ state: 'visible' });
    await locator.evaluate(e => e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    await f.page.waitForTimeout(350);
    await dismissCasePanel();
  };
  let nativeForm;
  if (f.row.key === 'hotel') {
    const opener = f.page.locator('a[href="#popup:myform"]').first();
    await prepareControl(opener);
    await pointer(f, opener, false);
    nativeForm = f.page.locator('.t-popup[data-tooltip-hook="#popup:myform"] form.t-form.js-form-proccess');
  } else if (f.row.key === 'revive') {
    nativeForm = f.page.locator('.t706__cartwin form.t-form.js-form-proccess').first();
    if (!(await nativeForm.isVisible())) {
      const product = f.page.locator('a.js-product-link[href="#prodpopup"]:visible').first();
      await prepareControl(product);
      await pointer(f, product, false);
      const order = f.page.locator('.t-popup:visible a[href="#order"]:visible').first();
      await prepareControl(order);
      await pointer(f, order, false);
      await f.page.waitForTimeout(350);
      if (!(await nativeForm.isVisible())) {
        const toast = f.page.locator('.t706__bubble_visible');
        if (await toast.isVisible()) {
          const closeToast = toast.locator('.t706__bubble-close');
          if (await closeToast.isVisible()) await pointer(f, closeToast, false);
          await toast.waitFor({ state: 'hidden', timeout: 7000 });
        }
        const cart = f.page.locator('.t706__carticon-wrapper').first();
        await prepareControl(cart);
        await pointer(f, cart, false);
      }
    }
  } else nativeForm = f.page.locator('.footer-newsletter-form form').first();
  await nativeForm.waitFor({ state: 'visible' });
  const nativeInput = nativeForm.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio])').first();
  await nativeInput.fill('legacy-marker-' + f.row.key + '@example.invalid');
  const beforePosts = f.outboundForms.length;
  const nativeSubmit = nativeForm.locator('button[type=submit], input[type=submit], button:not([type])').first();
  await prepareControl(nativeSubmit);
  await pointer(f, nativeSubmit, false);
  const root = f.page.locator('.v2-brief:visible'); await root.waitFor({ state: 'visible' });
  await f.page.waitForTimeout(650);
  const initial = await formState(root);
  check(f.name, 'actual legacy submit click opens an empty approved form without vendor submission', pristine(initial) && f.outboundForms.length === beforePosts, { state: initial, outboundForms: f.outboundForms.slice(beforePosts), nativeForm: await nativeForm.getAttribute('class') });
  await f.page.screenshot({ path: path.join(output, f.name + '-guard.png') });
  await pointer(f, root.locator('.v2-brief__close'));
  await root.waitFor({ state: 'hidden' });
  const returned = await nativeForm.evaluate(form => ({ visible: !!form.getClientRects().length && getComputedStyle(form).visibility !== 'hidden', focusInside: form.contains(document.activeElement), focusTag: document.activeElement?.tagName, approvedVisible: [...document.querySelectorAll('.v2-brief')].some(e => !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length) }));
  check(f.name, 'closing the approved form returns to the visible native form without an invisible approved overlay', returned.visible && !returned.approvedVisible && returned.focusInside, returned);
  await prepareControl(nativeSubmit);
  await nativeSubmit.focus();
  await f.page.keyboard.press('Enter');
  await root.waitFor({ state: 'visible' });
  check(f.name, 'real Enter activation of the native submit opens an empty approved form without vendor submission', pristine(await formState(root)) && f.outboundForms.length === beforePosts, { keyboard: 'Enter on native submit', outboundForms: f.outboundForms.slice(beforePosts) });
  await pointer(f, root.locator('.v2-brief__close'));
  await root.waitFor({ state: 'hidden' });
  if (f.row.key === 'hotel') await pointer(f, f.page.locator('.t-popup[data-tooltip-hook="#popup:myform"] .t-popup__close-wrapper').first());
  if (f.row.key === 'revive') {
    await pointer(f, f.page.locator('.t706__cartwin-close button, .t706__close-wrapper').first());
    await f.page.waitForTimeout(350);
    const productClose = f.page.locator('.t-popup:visible .t-popup__close-wrapper:visible').first();
    if (await productClose.isVisible()) await pointer(f, productClose);
  }
  await f.page.waitForTimeout(500);
  const cleanup = await f.page.evaluate(() => ({ bodyPosition: getComputedStyle(document.body).position, bodyOverflow: getComputedStyle(document.body).overflowY, bodyFilter: getComputedStyle(document.body).filter, recordsFilter: document.querySelector('.t-records') ? getComputedStyle(document.querySelector('.t-records')).filter : null, approvedVisible: [...document.querySelectorAll('.v2-brief')].some(e => !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length), nativePopupVisible: [...document.querySelectorAll('.t-popup,.t706__cartwin')].some(e => getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length) }));
  const movement = await wheelMoves(f, true);
  check(f.name, 'closing the native popup/cart then restores visible page scrolling with no fixed body or blur', !cleanup.approvedVisible && !cleanup.nativePopupVisible && cleanup.bodyPosition !== 'fixed' && cleanup.bodyOverflow !== 'hidden' && cleanup.bodyFilter === 'none' && (!cleanup.recordsFilter || cleanup.recordsFilter === 'none') && movement.valid, { cleanup, movement });
  await f.page.screenshot({ path: path.join(output, f.name + '-closed.png') });
}
async function pdfDownloads(f) {
  for (const kind of ['privacy', 'consent']) {
    const doc = legal.documents[kind], expected = c.intendedDelta['main' + doc.pdf];
    const response = await f.context.request.get(base + doc.pdf);
    const body = await response.body();
    check(f.name, kind + ': PDF response is the exact frozen PDF', response.status() === 200 && response.headers()['content-type']?.includes('application/pdf') && body.subarray(0, 5).toString() === '%PDF-' && sha(body) === expected?.sha256, { status: response.status(), sha256: sha(body), expected: expected?.sha256, bytes: body.length });
    await visit(f, '/' + kind);
    const pending = f.page.waitForEvent('download', { timeout: 12000 });
    await pointer(f, f.page.locator('.vz-legal-page__header a[download]'));
    const download = await pending, filename = kind + '-' + path.basename(doc.pdf), destination = path.join(output, filename);
    await download.saveAs(destination);
    const saved = await fs.readFile(destination);
    check(f.name, kind + ': actual download control saves the same PDF bytes', sha(saved) === expected?.sha256, { file: filename, sha256: sha(saved), suggestedFilename: download.suggestedFilename(), failure: await download.failure() });
  }
}

for (const p of selected) {
  const context = await browser.newContext({ viewport: { width: p.width, height: p.height }, isMobile: p.width < 800, hasTouch: p.width < 800, acceptDownloads: true });
  const posts = [], outboundForms = [], blocked = [], mirrored = [], errors = [];
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const raw = request.postData() || '';
      if (method === 'POST' && url.pathname === '/lead.php' && ['vazuri.io', '127.0.0.1', 'localhost'].includes(url.hostname)) {
        let payload; try { payload = JSON.parse(raw); } catch { payload = Object.fromEntries(new URLSearchParams(raw)); }
        posts.push({ url: request.url(), method, payload, mocked: true }); mockedLeadRequests++;
        await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"ok":true}' }); return;
      }
      blocked.push({ url: request.url(), method, containsFixtureData: /legal-qa-|legacy-marker-|Legal QA/.test(raw) });
      blockedExternalPOSTs++;
      if (/legal-qa-|legacy-marker-|Legal QA/.test(raw)) outboundForms.push(blocked.at(-1));
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
  const f = { ...p, context, page, posts, outboundForms }, result = { profile: p.name, suite: p.suite, language: p.lang, width: p.width, height: p.height };
  try {
    if (p.suite === 'documents') for (const kind of ['privacy', 'consent']) await legalPage(f, kind);
    else if (p.suite === 'pdf') await pdfDownloads(f);
    else if (p.suite === 'main') await mainForms(f);
    else if (p.suite === 'cases') await caseForm(f);
    else await legacy(f);
    check(p.name, 'no fixture data attempted an external non-VAZURI form POST', !outboundForms.length, outboundForms);
    if (['documents', 'pdf', 'main'].includes(p.suite)) check(p.name, 'no main-site JavaScript errors', !errors.length, errors);
  } catch (error) {
    result.error = error.stack;
    check(p.name, 'profile completes', false, error.stack);
    await page.screenshot({ path: path.join(output, p.name + '-failure.png') }).catch(() => {});
  } finally {
    result.mockedLeadRequests = posts; result.blockedPOSTs = blocked; result.observedJavaScriptErrors = errors; result.mirroredPublicGETs = [...new Set(mirrored)];
    results.push(result); await context.close();
  }
  console.log(JSON.stringify({ profile: p.name, failed: checks.filter(x => x.profile === p.name && !x.passed).map(x => x.name) }));
}
await browser.close();
try { await binding(); check('binding', 'frozen candidate and all project sources remain unchanged after QA', true); }
catch (error) { check('binding', 'frozen candidate and all project sources remain unchanged after QA', false, error.message); }
const failed = checks.filter(x => !x.passed), valid = checks.length > 0 && failed.length === 0;
const report = {
  schema: 'vazuri/main-approved-forms-browser-qa/v1', qaKind: 'legal-documents-and-consent-v25', generatedAt: new Date().toISOString(),
  valid, localQAPassed: !live && valid, liveQAPassed: live && valid, mode: live ? 'live' : 'local', base, suites, only,
  candidateSHA256, sourceSHA256: c.sourceSHA256, sourceProjectsSHA256, helperSHA256,
  summary: { profiles: results.length, checks: checks.length, passed: checks.length - failed.length, failed: failed.length },
  visitedRoutes: [...coverage], cases: [...new Set(results.filter(x => x.suite === 'cases').map(x => x.profile.split('-')[1]))].length,
  mockedLeadRequests, realLeadRequestsSent: 0, blockedExternalPOSTs,
  limitations: ['Video media requests are blocked; this audit checks legal links, consent and form guards, not case playback or motion.', 'The pre-existing 360px body minimum is recorded; legal article text itself must fit the real 320px viewport.', 'No backend email or live lead endpoint is invoked. Exact lead.php requests are mocked; all other write requests are blocked.', 'Case JavaScript errors are recorded without a blanket baseline assertion; each requested legal/form action must still complete.'],
  checks, failures: failed, results,
};
const rawPath = path.join(output, 'report.json');
const bytes = JSON.stringify(report, null, 2) + '\n';
await fs.writeFile(rawPath, bytes);
await fs.writeFile(path.join(here, live ? 'live-qa.json' : 'local-qa.json'), bytes);
console.log(JSON.stringify({ valid, ...report.summary, mockedLeadRequests, realLeadRequestsSent: 0, report: rawPath, sha256: sha(bytes) }));
process.exitCode = valid ? 0 : 1;
