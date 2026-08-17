import {
  auditMatrix,
  clean,
  matrixFromTsv,
  normalize,
  parseOcrText,
  parseTable,
  rankRow,
  toEditableTable,
} from "./lib/benchmark.mjs";

export {
  auditMatrix,
  matrixFromTsv,
  normalize,
  parseOcrText,
  parseTable,
  rankRow,
};

const $ = (id) => document.getElementById(id);
let spec = {};
let imageFile = null;
let imageUrl = null;
let pngDownloadUrl = null;
let pngDownloadPromise = null;
let pngGeneration = 0;
const PNG_SIZE = 1600;
const PNG_PADDING = 64;
const PNG_CARD_WIDTH = 1400;
const PNG_SOURCE_WIDTH = 1440;

export function fileKind(file) {
  const type = clean(file?.type).toLowerCase();
  const name = clean(file?.name).toLowerCase();
  if (
    type.startsWith("image/") ||
    /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/.test(name)
  )
    return "image";
  if (type === "text/csv" || name.endsWith(".csv")) return "table";
  if (type === "application/json" || name.endsWith(".json")) return "table";
  return "unknown";
}

function escapeHtml(value) {
  return clean(value).replace(
    /[&<>\"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" })[char],
  );
}

function status(message, error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}

function receipt(next) {
  return `<div class="receipt">
    ${next.interpretation ? `<p><strong>Interpretation:</strong> ${escapeHtml(next.interpretation)}</p>` : ""}
    ${next.source ? `<p><strong>Source:</strong> ${escapeHtml(next.source)}</p>` : ""}
    ${next.caveat ? `<p><strong>Caveat:</strong> ${escapeHtml(next.caveat)}</p>` : ""}
  </div>`;
}

function renderSeries(next) {
  const ordered = [...next.series].sort((a, b) =>
    next.higherIsBetter ? b.value - a.value : a.value - b.value,
  );
  const min = Math.min(...ordered.map((row) => row.value), 0);
  const max = Math.max(...ordered.map((row) => row.value));
  const width = (value) =>
    max === min ? 100 : Math.max(4, ((value - min) / (max - min)) * 100);
  return `<article class="chart-card corrected-card">
    <p class="rehab-label">REHABILITATED</p>
    <h2>${escapeHtml(next.title)}</h2>
    <p class="meta">${escapeHtml(next.metric)}${next.unit ? ` · ${escapeHtml(next.unit)}` : ""} · ${next.higherIsBetter ? "higher" : "lower"} is better</p>
    ${ordered.map((row, index) => `<div class="bar-row ${index === 0 ? "winner-bar" : ""}"><strong>${escapeHtml(row.label)}</strong><div class="bar" style="width:${width(row.value)}%"></div><b>${row.value}</b>${index === 0 ? '<span class="winner-label">WINNER</span>' : ""}</div>`).join("")}
    ${receipt(next)}
  </article>`;
}

function renderCrimeReport(audit) {
  const findings = audit.findings
    .map(
      (finding) =>
        `<li class="${finding.severity}">${escapeHtml(finding.text)}</li>`,
    )
    .join("");
  return `<strong>Chart-crime report</strong><ul>${findings}</ul>`;
}

function renderMatrix(next) {
  const audit = auditMatrix(next);
  let previousGroup = null;
  const body = next.rows
    .map((row) => {
      const group =
        row.group && row.group !== previousGroup
          ? `<tr class="group-row"><th colspan="${next.columns.length + 1}">${escapeHtml(row.group)}</th></tr>`
          : "";
      if (row.group) previousGroup = row.group;
      const rank = rankRow(row);
      const cells = row.values
        .map((value, index) => {
          const winner = rank.winners.includes(index);
          const runner = rank.runnersUp.includes(index);
          const classes = [
            winner ? "winner" : "",
            runner ? "runner" : "",
            value === null ? "missing" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return `<td class="${classes}" data-column="${escapeHtml(next.columns[index])}"><span class="value">${value ?? "—"}</span>${winner ? '<span class="rank-label">WINNER</span>' : runner ? '<span class="rank-label">2ND</span>' : value === null ? '<span class="rank-label">NO DATA</span>' : ""}</td>`;
        })
        .join("");
      return `${group}<tr class="benchmark-row"><th scope="row"><strong>${escapeHtml(row.label)}</strong>${row.detail ? `<span>${escapeHtml(row.detail)}</span>` : ""}<small>${row.higherIsBetter ? "↑ higher" : "↓ lower"} is better</small></th>${cells}</tr>`;
    })
    .join("");
  const headers = next.columns
    .map(
      (column, index) =>
        `<th scope="col"><strong>${escapeHtml(column)}</strong><span>${audit.wins[index]} win${audit.wins[index] === 1 ? "" : "s"}</span></th>`,
    )
    .join("");
  return `<article class="chart-card corrected-card matrix-card">
    <div class="matrix-heading"><div><p class="rehab-label">REHABILITATED</p><h2>${escapeHtml(next.title)}</h2><p class="meta">${escapeHtml(next.metric)}${next.unit ? ` · ${escapeHtml(next.unit)}` : ""} · winners recomputed per row</p></div><div class="legend"><span class="legend-winner">WINNER</span><span class="legend-runner">2ND</span><span class="legend-missing">NO DATA</span></div></div>
    <div class="matrix-scroll"><table class="matrix"><thead><tr><th scope="col">Benchmark</th>${headers}</tr></thead><tbody>${body}</tbody></table></div>
    ${receipt(next)}
  </article>`;
}

function render() {
  $("chart").innerHTML =
    spec.kind === "matrix" ? renderMatrix(spec) : renderSeries(spec);
  const report = $("crimeReport");
  if (spec.kind === "matrix") {
    report.innerHTML = renderCrimeReport(auditMatrix(spec));
    report.hidden = false;
  } else {
    report.innerHTML = "";
    report.hidden = true;
  }
  const sourcePanel = $("sourceEvidence");
  if (imageUrl) {
    $("sourceEvidenceImage").src = imageUrl;
    sourcePanel.hidden = false;
    $("comparison").classList.add("has-source");
  } else {
    sourcePanel.hidden = true;
    $("comparison").classList.remove("has-source");
  }
  preparePngDownload();
}

function fromEditor() {
  const parsed = parseTable($("values").value);
  return normalize({
    ...parsed,
    title: $("title").value,
    metric: $("metric").value,
    unit: $("unit").value,
    higherIsBetter: $("direction").value === "higher",
    source: $("sourceUrl").value,
    caveat: $("caveat").value,
    interpretation: $("interpretation").value,
    sourceHighlight: parsed.kind === "matrix" ? $("sourceHighlight").value : "",
  });
}

function toEditor(next) {
  $("title").value = next.title;
  $("metric").value = next.metric;
  $("unit").value = next.unit;
  $("direction").value = next.higherIsBetter ? "higher" : "lower";
  $("sourceUrl").value = next.source;
  $("caveat").value = next.caveat;
  $("interpretation").value = next.interpretation;
  $("sourceHighlight").value = next.sourceHighlight || "";
  $("values").value = toEditableTable(next);
  $("sourceHighlightWrap").hidden = next.kind !== "matrix";
}

function apply(
  next,
  message = "Benchmark rehabilitated. Highlights now follow the data.",
) {
  spec = normalize(next);
  toEditor(spec);
  render();
  status(message);
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(name, type, content) {
  downloadBlob(name, new Blob([content], { type }));
}

function exportCss() {
  return [...document.styleSheets]
    .flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
}

function svg() {
  const card = $("chart").firstElementChild;
  const bounds = card.getBoundingClientRect();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${exportCss()}</style>${card.outerHTML}</div></foreignObject></svg>`;
}

async function pngBlob() {
  const card = $("chart").firstElementChild;
  const sourceHeight = Math.min(
    16384,
    Math.max(2400, Math.ceil(card.getBoundingClientRect().height) + 400),
  );
  const graphic = `<svg xmlns="http://www.w3.org/2000/svg" width="${PNG_SOURCE_WIDTH}" height="${sourceHeight}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${PNG_CARD_WIDTH}px;margin:20px"><style>${exportCss()}</style>${card.outerHTML}</div></foreignObject></svg>`;
  const image = new Image();
  // A blob URL gives an SVG containing foreignObject an opaque origin in
  // Chromium, which taints the canvas and blocks PNG export. A self-contained
  // data URL keeps the render exportable without sending the chart anywhere.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(graphic)}`;
  await image.decode();
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceContext)
    throw new Error("This browser cannot create an image canvas.");
  sourceContext.drawImage(image, 0, 0);
  const pixels = sourceContext.getImageData(
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
  ).data;
  let lastOpaqueRow = 0;
  for (let index = pixels.length - 1; index >= 3; index -= 4) {
    if (pixels[index] !== 0) {
      lastOpaqueRow = Math.floor(index / 4 / sourceCanvas.width);
      break;
    }
  }
  const contentHeight = Math.max(1, lastOpaqueRow + 1);
  const canvas = document.createElement("canvas");
  canvas.width = PNG_SIZE;
  canvas.height = PNG_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot create an image canvas.");
  context.fillStyle = "#f7f2e8";
  context.fillRect(0, 0, PNG_SIZE, PNG_SIZE);
  const scale = Math.min(
    (PNG_SIZE - PNG_PADDING * 2) / sourceCanvas.width,
    (PNG_SIZE - PNG_PADDING * 2) / contentHeight,
  );
  const width = sourceCanvas.width * scale;
  const height = contentHeight * scale;
  context.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    contentHeight,
    (PNG_SIZE - width) / 2,
    (PNG_SIZE - height) / 2,
    width,
    height,
  );
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The corrected chart could not be encoded.")),
      "image/png",
    ),
  );
}

function preparePngDownload() {
  const generation = ++pngGeneration;
  const link = $("downloadImage");
  if (pngDownloadUrl) {
    const staleUrl = pngDownloadUrl;
    setTimeout(() => URL.revokeObjectURL(staleUrl), 1000);
  }
  pngDownloadUrl = null;
  link.removeAttribute("href");
  link.setAttribute("aria-disabled", "true");
  link.textContent = "Preparing image…";
  pngDownloadPromise = Promise.resolve()
    .then(pngBlob)
    .then((blob) => {
      if (generation !== pngGeneration) return blob;
      pngDownloadUrl = URL.createObjectURL(blob);
      link.href = pngDownloadUrl;
      link.removeAttribute("aria-disabled");
      link.textContent = "Download image";
      return blob;
    })
    .catch((error) => {
      if (generation === pngGeneration) {
        link.textContent = "Image unavailable";
        status(`Could not prepare the image: ${error.message}`, true);
      }
      return null;
    });
}

async function copyChartImage() {
  const imagePromise = (pngDownloadPromise || pngBlob()).then((blob) => {
    if (!blob) throw new Error("The PNG image is unavailable.");
    return blob;
  });
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return status("Image copying is not supported here. Use Download image.", true);
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": imagePromise }),
    ]);
    status("Corrected chart copied as a square PNG image.");
  } catch {
    status("Clipboard access was blocked. Use Download image instead.", true);
  }
}

async function exportFile(kind) {
  if (kind === "json")
    return download(
      "benchwarmer-spec.json",
      "application/json",
      JSON.stringify(spec, null, 2),
    );
  if (kind === "html")
    return download(
      "benchwarmer-chart.html",
      "text/html",
      `<!doctype html><meta charset="utf-8"><style>${exportCss()}</style>${$("chart").innerHTML}`,
    );
  const graphic = svg();
  if (kind === "svg")
    return download("benchwarmer-chart.svg", "image/svg+xml", graphic);
}

function clearImage() {
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageFile = null;
  imageUrl = null;
  $("previewImage").removeAttribute("src");
  $("imagePreview").hidden = true;
  $("file").value = "";
  $("camera").value = "";
  render();
}

async function showImage(file, origin = "image") {
  clearImage();
  imageFile = file;
  imageUrl = URL.createObjectURL(file);
  const preview = $("previewImage");
  preview.src = imageUrl;
  await preview.decode().catch(() => {});
  $("imageMeta").textContent =
    `${file.name || origin} · ${preview.naturalWidth || "?"}×${preview.naturalHeight || "?"}`;
  $("imagePreview").hidden = false;
  render();
  status(
    "Source image ready. Extract its values; its original styling will not be trusted.",
  );
}

async function importFile(file, origin = "file") {
  if (!file) return;
  const kind = fileKind(file);
  if (kind === "image") return showImage(file, origin);
  if (kind === "table")
    return apply(
      parseTable(await file.text()),
      `Imported ${origin}. Winners recomputed from values.`,
    );
  throw new Error("Choose an image, CSV, or JSON file.");
}

async function ocrReadyImage(file) {
  if (typeof createImageBitmap !== "function") return file;
  const source = await createImageBitmap(file);
  const scale = source.width < 1800 ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = source.width * scale;
  canvas.height = source.height * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return file;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    // Selected columns often use pale blue fills. Flattening every light fill
    // to white preserves the dark glyphs without allowing the fill to erase a
    // whole model column during OCR.
    const isInk = Math.min(red, green, blue) < 115;
    const output = isInk ? 0 : 255;
    pixels.data[index] = output;
    pixels.data[index + 1] = output;
    pixels.data[index + 2] = output;
  }
  context.putImageData(pixels, 0, 0);
  return await new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob || file), "image/png"),
  );
}

async function extractImage() {
  if (!imageFile)
    return status("Paste, drop, choose, or photograph an image first.", true);
  const button = $("extract");
  button.disabled = true;
  try {
    status("Preparing the source for local OCR…");
    const preparedImage = await ocrReadyImage(imageFile);
    status("Loading local OCR…");
    const { default: Tesseract } = await import(
      "https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js"
    );
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: ({ status: phase, progress }) =>
        status(
          `${phase || "Reading image"}${Number.isFinite(progress) ? ` · ${Math.round(progress * 100)}%` : ""}`,
        ),
    });
    let result;
    try {
      result = await worker.recognize(preparedImage, {}, { text: true, tsv: true });
    } finally {
      await worker.terminate();
    }
    $("source").value = clean(result.data.text);
    try {
      const extracted = result.data.tsv
        ? matrixFromTsv(result.data.tsv)
        : parseOcrText(result.data.text);
      apply(
        extracted,
        "Values extracted and restyled. Verify the transcription before publishing.",
      );
    } catch (error) {
      status(error.message, true);
      $("source").focus();
    }
  } catch (error) {
    status(`Could not read that image: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function extractImageWithAi() {
  if (!imageFile)
    return status("Paste, drop, choose, or photograph an image first.", true);
  const button = $("extractAi");
  button.disabled = true;
  button.textContent = "Reading table…";
  try {
    status("Sending the selected image to Gemini for table extraction…");
    const [response] = await Promise.all([
      fetch("/api/extract-table", {
        method: "POST",
        headers: { "content-type": imageFile.type || "image/png" },
        body: imageFile,
      }),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI extraction failed.");
    apply(
      result,
      "AI table extracted. Verify every value against the source before publishing.",
    );
  } catch (error) {
    status(error.message, true);
  } finally {
    button.textContent = "AI table extraction";
    button.disabled = false;
  }
}

if (typeof document !== "undefined" && document.querySelectorAll) {
  $("parse").addEventListener("click", () => {
    try {
      apply(parseTable($("source").value));
    } catch (error) {
      try {
        apply(parseOcrText($("source").value));
      } catch {
        status(error.message, true);
      }
    }
  });
  $("update").addEventListener("click", () => {
    try {
      apply(fromEditor());
    } catch (error) {
      status(error.message, true);
    }
  });
  $("demo").addEventListener("click", async () => {
    try {
      apply(
        await fetch("examples/chart-crime.json").then((response) =>
          response.json(),
        ),
        "Loaded the chart-crime example. The source column emphasis is now audited and corrected.",
      );
    } catch (error) {
      status(error.message, true);
    }
  });
  document
    .querySelectorAll("[data-export]")
    .forEach((button) =>
      button.addEventListener("click", async () => {
        try {
          await exportFile(button.dataset.export);
        } catch (error) {
          status(`Could not export that file: ${error.message}`, true);
        }
      }),
    );
  $("downloadImage").addEventListener("click", (event) => {
    if (!event.currentTarget.href) {
      event.preventDefault();
      return status("The image is still being prepared. Try again in a moment.");
    }
    status("Corrected chart downloaded as a PNG image.");
  });
  $("copyImage").addEventListener("click", async () => {
    try {
      await copyChartImage();
    } catch (error) {
      status(`Could not copy that image: ${error.message}`, true);
    }
  });
  $("file").addEventListener("change", async (event) => {
    try {
      await importFile(event.target.files[0]);
    } catch (error) {
      status(error.message, true);
    }
  });
  $("cameraButton").addEventListener("click", () => $("camera").click());
  $("camera").addEventListener("change", async (event) => {
    try {
      await importFile(event.target.files[0], "photo");
    } catch (error) {
      status(error.message, true);
    }
  });
  $("extract").addEventListener("click", extractImage);
  $("extractAi").addEventListener("click", extractImageWithAi);
  $("clearImage").addEventListener("click", () => {
    clearImage();
    status("Source image cleared.");
  });
  $("dropzone").addEventListener("dragover", (event) => event.preventDefault());
  $("dropzone").addEventListener("drop", async (event) => {
    event.preventDefault();
    try {
      await importFile(event.dataTransfer.files[0], "drop");
    } catch (error) {
      status(error.message, true);
    }
  });
  $("dropzone").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("file").click();
    }
  });
  document.addEventListener("paste", async (event) => {
    const image = [...(event.clipboardData?.items || [])]
      .find((item) => item.type.startsWith("image/"))
      ?.getAsFile();
    if (!image) return;
    event.preventDefault();
    try {
      await showImage(image, "pasted image");
    } catch (error) {
      status(error.message, true);
    }
  });
  fetch("examples/chart-crime.json")
    .then((response) => response.json())
    .then((data) =>
      apply(
        data,
        "Loaded the chart-crime example. Paste your own benchmark to rehabilitate it.",
      ),
    )
    .catch(() =>
      fetch("examples/sample.json")
        .then((response) => response.json())
        .then((data) => apply(data)),
    );
}
