import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/nightshift/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the complete NIGHTSHIFT preview", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /NIGHTSHIFT/);
  assert.match(html, /RUN/);
  assert.match(html, /AFTER/);
  assert.match(html, /DARK/);
  assert.match(html, /Discuss project/);
  assert.match(html, /<title>NIGHTSHIFT — E-commerce Concept Case \| VAZURI<\/title>/i);
  assert.match(html, /rel="canonical"[^>]+https:\/\/vazuri\.io\/nightshift\//i);
  assert.match(html, /rel="(?:shortcut )?icon"[^>]+nightshift\/favicon\.svg/i);
  assert.match(html, /<h1\b/i);
  assert.match(html, /application\/ld\+json/i);
  assert.match(html, /class="v2-console v2-console--nightshift"/i);
  assert.match(html, /CASE[\s\S]*\/[\s\S]*01/i);
  assert.match(html, /<html[^>]+lang="en"[^>]+translate="no"/i);
  assert.match(html, /<meta[^>]+name="google"[^>]+content="notranslate"/i);
  assert.match(html, /Все проекты/i);
  assert.match(html, /Обсудить проект/i);
  assert.match(html, /href="https:\/\/vazuri\.io\/#projects"/i);
  assert.doesNotMatch(html, /E-commerce design built around product character/i);
  assert.match(html, /"isPartOf":\{"@type":"WebSite","name":"VAZURI"/i);
  assert.doesNotMatch(html, /Want a site like this/);
  assert.doesNotMatch(html, />\s*(Codex|ChatGPT|Your site is taking shape)\b/i);
  assert.doesNotMatch(html, /https:\/\/vazuri\.ru/i);
});

test("uses the approved progress console and brief instead of the legacy popup", async () => {
  const [page, dock, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CaseDock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/case-console.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dock, /v2-console__meter/);
  assert.match(dock, /data-puzzle-piece/);
  assert.doesNotMatch(dock, /data-puzzle-arrow/);
  assert.match(dock, /arrowCellIndexes/);
  assert.match(dock, /v2-console__outline/);
  assert.match(dock, /v2-console__outline-runner/);
  assert.match(styles, /stroke-dasharray: \.12 \.88/);
  assert.match(dock, /remaining <= Math\.max\(32, viewportHeight \* 0\.04\)/);
  assert.match(page, /v2-brief__drawer/);
  assert.match(page, /Опишите/);
  assert.match(page, /Ответим лично/);
  assert.match(page, /Что нужно сделать\?/);
  assert.match(page, /autoComplete="off"/);
  assert.doesNotMatch(page, /brief-poster|ХОТИТЕ РАЗОБРАТЬ|Материалы по кейсу/);
  assert.match(styles, /bottom: calc\(20dvh/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*bottom: calc\(35dvh/);
  assert.match(styles, /v2-console__panel \{ width: min\(332px, calc\(100vw - 40px\)\); \}/);
  assert.match(styles, /v2-console__mark small[^}]+gap: 2px/);
});

test("self-hosts every display font without a render-blocking Google Fonts request", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /fonts\.(?:googleapis|gstatic)\.com/i);
  for (const filename of [
    "archivo-black-latin.woff2",
    "dm-mono-300-latin.woff2",
    "dm-mono-400-latin.woff2",
    "dm-mono-500-latin.woff2",
    "inter-latin.woff2",
  ]) {
    assert.match(css, new RegExp(`/nightshift/fonts/${filename.replaceAll(".", "\\.")}`));
    const info = await stat(new URL(`../public/fonts/${filename}`, import.meta.url));
    assert.ok(info.size > 10_000, `${filename} is unexpectedly small`);
  }
});
