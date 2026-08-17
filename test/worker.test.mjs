import assert from "node:assert/strict";
import test from "node:test";
import worker, { browserSafeHeaders } from "../worker.js";

test("removes an upstream CSP that blocks the app's own assets", async () => {
  const upstream = new Response("<link rel=stylesheet href=styles.css>", {
    headers: {
      "content-security-policy": "default-src 'none'",
      "content-type": "text/html; charset=utf-8",
    },
  });
  const env = { ASSETS: { fetch: async () => upstream } };

  const response = await worker.fetch(new Request("https://benchwarm.ing"), env);

  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000",
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "geolocation=(), microphone=(), payment=(), usb=()",
  );
});

test("preserves ordinary upstream headers", () => {
  const headers = browserSafeHeaders(
    new Headers({ etag: '"abc"', "cache-control": "public, max-age=300" }),
  );

  assert.equal(headers.get("etag"), '"abc"');
  assert.equal(headers.get("cache-control"), "public, max-age=300");
});
