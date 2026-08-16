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
  assert.match(html, /Want a site like this/);
  assert.doesNotMatch(html, />\s*(Codex|ChatGPT|Your site is taking shape)\b/i);
});
