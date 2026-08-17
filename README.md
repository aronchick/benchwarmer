# Benchwarmer

**It does not run benchmarks. It stops their presentation from lying.**

Benchwarmer rehabilitates benchmark charts. Paste, drop, photograph, or upload a
benchmark image (or give it CSV, JSON, or Markdown), and it rebuilds the comparison
from the numbers instead of trusting whatever happened in the design file.

**Try it:** <https://benchwarm.ing>

![A rehabilitated benchmark matrix with row-by-row winners, runners-up, and missing-data markings](examples/chart-crime-corrected.png)

## Why this exists

Bold is not a ranking algorithm. Neither is “make our column green.”

Benchwarmer throws away the source chart's decorative opinions, recalculates every
winner in the declared direction, and gives the result a consistent visual hierarchy.
The original image and a chart-crime report stay beside the corrected chart, because
receipts are healthier than vibes.

Charts are allowed to be pretty. They are not allowed to freelance.

## What it does

- Accepts pasted, dropped, photographed, or selected images on desktop and mobile.
- Accepts CSV, JSON, and Markdown benchmark tables.
- Recomputes winners and runners-up row by row, including lower-is-better metrics.
- Calls out misleading emphasis, ties, and missing data.
- Keeps the source, caveats, conditions, and interpretation attached.
- Exports audit JSON, SVG, HTML, and a square 1600×1600 PNG that is useful even when
  you made it on a phone.

It does **not** decide whether the benchmark itself is honest. It fixes the presentation,
not the experimental design. A beautifully highlighted bad benchmark is still a bad
benchmark, just one with better posture.

## Run it locally

```sh
git clone https://github.com/aronchick/benchwarmer.git
cd benchwarmer
npm ci
npm run verify
npm run dev
```

Open the local address Wrangler prints. That is the entire ceremony.

## Screenshot workflow

On desktop, paste an image from the clipboard or drag it onto the intake box. On
mobile, paste where supported, choose an image from the photo library, or take a photo.
Press **Extract & rehabilitate**, then check every extracted value against the source.
OCR is a draft, not evidence. It is confident in the way only software can be.

For agent-assisted extraction, use [skills/benchwarmer/SKILL.md](skills/benchwarmer/SKILL.md).

## Table and CLI workflow

For CSV or Markdown matrices, use one benchmark per row and one model per column.
Optional `Detail`, `Group`, and `Direction` columns preserve context and handle
lower-is-better metrics:

```csv
Benchmark,Detail,Group,Direction,Model A,Model B
Accuracy,Eval v2,Quality,higher,91.2,93.4
Latency,p95,Speed,lower,120,95
```

The portable JSON schema supports both ranked series and multi-model matrices. Start
with [examples/chart-crime.json](examples/chart-crime.json), then generate a standalone
HTML comparison:

```sh
node bin/benchwarmer.mjs examples/chart-crime.json --out chart.html
```

## Privacy and security

- Images and benchmark data are processed locally in your browser. They are not
  uploaded to Benchwarmer.
- There are no accounts, cookies, or third-party product analytics.
- Cloudflare serves the static app and records ordinary request-level service metrics.
- Image OCR uses the pinned Tesseract.js 7.0.0 browser build. The OCR library and
  English language data download on first use; the image stays in the browser.
- Dependencies are locked, CI actions are pinned to immutable revisions, GitHub secret
  scanning and push protection are enabled, and dependency security updates are on.

Found a security problem? Please [report it privately](https://github.com/aronchick/benchwarmer/security/advisories/new)
instead of turning it into a surprise release note.

## Publishing rule

A highlight is a claim. It must follow the direction and numeric values for that row,
not the product team’s preferred ending. Preserve the primary source, versions,
conditions, directionality, and material caveats whenever you publish the result.

Pull requests run `npm run verify`. Changes from a repository owner or maintainer
automatically squash-merge after that check passes, with no review-approval ceremony.
The protected `main` branch deploys automatically to Cloudflare.

## Credit

Inspired by [@matsonj](https://x.com/matsonj), who helped provide the spark for a tool
that asks a radical question: what if the highlighted winner were the actual winner?

Coded with love by the [contributors](https://github.com/aronchick/benchwarmer/graphs/contributors)
and sponsored by [Expanso](https://expanso.io).
