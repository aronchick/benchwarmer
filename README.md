# Benchwarmer

**It does not run benchmarks. It rehabilitates them.**

Benchwarmer turns a pasted, dropped, photographed, or uploaded benchmark image—or a CSV, JSON document, or simple Markdown table—into a decision-first chart that keeps its source, caveat, and interpretation attached. It runs locally in the browser; it does not upload your input.

Live: <https://bench.bac.al> (with <https://benchwarmer.aronchick.workers.dev> as the Cloudflare fallback).

## Clone-first install

```sh
git clone https://github.com/aronchick/benchwarmer.git
cd benchwarmer
npm test
npm run dev
```

Open the local URL that Wrangler prints. For production deployment, authenticate with Cloudflare and run `npm run deploy`.

## Portable specification and CLI

The public schema is [schemas/benchmark-spec.schema.json](schemas/benchmark-spec.schema.json). Start with [examples/sample.json](examples/sample.json):

```sh
node bin/benchwarmer.mjs examples/sample.json --out chart.html
```

The command validates the essential values and writes a self-contained HTML chart with the interpretation, source, and caveat. The website can export the same audit JSON plus SVG, PNG, and HTML.

## Screenshot workflow

On desktop, paste an image from the clipboard or drag it onto the intake box. On mobile, paste an image where supported, choose one from the photo library, or use **Take a photo**. Press **Extract table text** to run OCR in the browser, then edit the transcription before publishing.

The OCR library and English language model are downloaded on first use, but the benchmark image itself stays in the browser. Screenshots are not evidence: review every extracted value against the primary source. For agent-assisted extraction, use [skills/benchwarmer/SKILL.md](skills/benchwarmer/SKILL.md).

## Publishing rule

A clear layout is not a verified claim. Preserve the primary benchmark source, version, conditions, directionality, and material caveats before using a chart in a decision or public post.
