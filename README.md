# Benchwarmer

**It does not run benchmarks. It rehabilitates them.**

Benchwarmer turns a benchmark CSV, JSON document, or simple Markdown table into a decision-first chart that keeps its source, caveat, and interpretation attached. It runs locally in the browser; it does not upload your input.

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

Screenshots are not evidence. Attach the chart to an agent with [skills/benchwarmer/SKILL.md](skills/benchwarmer/SKILL.md), review every extracted value against the primary source, then import the result as JSON.

## Publishing rule

A clear layout is not a verified claim. Preserve the primary benchmark source, version, conditions, directionality, and material caveats before using a chart in a decision or public post.
