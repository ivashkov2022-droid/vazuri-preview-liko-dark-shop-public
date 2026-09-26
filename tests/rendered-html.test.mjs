import assert from "node:assert/strict";
import test from "node:test";
async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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
  assert.match(html, /Case notes/);
  assert.match(html, /<title>NIGHTSHIFT — E-commerce Concept Case \| VAZURI<\/title>/i);
  assert.match(html, /rel="canonical"[^>]+vazuri-preview-liko-dark-shop-public\//i);
  assert.match(html, /rel="(?:shortcut )?icon"[^>]+vazuri-preview-liko-dark-shop-public\/favicon\.svg/i);
  assert.match(html, /<h1\b/i);
  assert.match(html, /application\/ld\+json/i);
  assert.match(html, /E-commerce design built around product character/i);
  assert.match(html, /href="https:\/\/vazuri\.ru\/en#projects"/i);
  assert.match(html, /"isPartOf":\{"@type":"WebSite","name":"VAZURI"/i);
  assert.doesNotMatch(html, /Want a site like this/);
  assert.doesNotMatch(html, />\s*(Codex|ChatGPT|Your site is taking shape)\b/i);
});
