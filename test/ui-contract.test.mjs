import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, app, css, readme, wrangler] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("README.md", root), "utf8"),
  readFile(new URL("wrangler.jsonc", root), "utf8"),
]);

test("offers explicit image download and clipboard actions", () => {
  assert.match(html, /id="downloadImage"[\s\S]*download="benchwarmer-chart\.png"/);
  assert.doesNotMatch(html, /data-export="png"/);
  assert.match(app, /preparePngDownload\(\)/);
  assert.match(app, /link\.href = pngDownloadUrl/);
  assert.match(html, /id="copyImage">Copy image<\/button\s*>/);
  assert.match(app, /new ClipboardItem\(\{ "image\/png": imagePromise \}\)/);
  assert.match(app, /const PNG_SIZE = 1600/);
  assert.match(app, /canvas\.width = PNG_SIZE/);
  assert.match(app, /canvas\.height = PNG_SIZE/);
  assert.match(app, /width="\$\{PNG_SOURCE_WIDTH\}"/);
});

test("uses Gemini as the only image extraction path", () => {
  assert.match(app, /async function extractImageWithAi\(\)/);
  assert.doesNotMatch(app, /Tesseract|ocrReadyImage|extractImage\(\)|matrixFromTsv|parseOcrText/);
  assert.doesNotMatch(html, /id="extract"/);
  assert.match(html, /Extract &amp; rehabilitate with AI/);
});

test("uses a stacked mobile matrix without page-level horizontal overflow", () => {
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.matrix \{[\s\S]*?min-width: 0/);
  assert.match(css, /\.matrix td::before \{[\s\S]*?content: attr\(data-column\)/);
  assert.match(app, /data-column="\$\{escapeHtml\(next\.columns\[index\]\)\}"/);
});

test("credits contributors and Expanso in the footer", () => {
  assert.match(
    html,
    /href="https:\/\/github\.com\/aronchick\/benchwarmer\/graphs\/contributors"/,
  );
  assert.match(html, /Sponsored by <a href="https:\/\/expanso\.io">expanso\.io<\/a>/);
});

test("keeps benchwarm.ing canonical and credits the inspiration", () => {
  assert.match(readme, /https:\/\/benchwarm\.ing/);
  assert.match(readme, /https:\/\/x\.com\/matsonj/);
  assert.doesNotMatch(`${readme}\n${wrangler}`, /bench\.bac\.al|workers\.dev/);
});

test("places the chart-crime report between source evidence and corrected chart", () => {
  assert.match(
    html,
    /id="sourceEvidence"[\s\S]*id="crimeReport"[\s\S]*id="chart"/,
  );
  assert.match(app, /report\.innerHTML = renderCrimeReport\(auditMatrix\(spec\)\)/);
  assert.doesNotMatch(app, /<aside class="crime-report">/);
});
