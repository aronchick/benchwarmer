import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, app, css] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
]);

test("offers explicit image download and clipboard actions", () => {
  assert.match(html, />Download image<\/button\s*>/);
  assert.match(html, /id="copyImage">Copy image<\/button\s*>/);
  assert.match(app, /new ClipboardItem\(\{ "image\/png": imagePromise \}\)/);
});

test("uses a stacked mobile matrix without page-level horizontal overflow", () => {
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.matrix \{[\s\S]*?min-width: 0/);
  assert.match(css, /\.matrix td::before \{[\s\S]*?content: attr\(data-column\)/);
  assert.match(app, /data-column="\$\{escapeHtml\(next\.columns\[index\]\)\}"/);
});
