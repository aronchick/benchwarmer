const $ = (id) => document.getElementById(id);
const fields = ["title", "metric", "unit", "sourceUrl", "caveat", "interpretation", "values"];
let spec = {};

function clean(value) { return String(value ?? "").trim(); }
function number(value) { const parsed = Number(String(value).replace(/[^0-9.+-]/g, "")); return Number.isFinite(parsed) ? parsed : null; }

export function parseTable(input) {
  const text = clean(input).replace(/^```(?:csv|json)?|```$/gim, "").trim();
  if (!text) throw new Error("Paste a table or choose a CSV/JSON file.");
  if (text.startsWith("{")) return normalize(JSON.parse(text));
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.replace(/^\||\|$/g, "").split(/[|,\t]/).map(clean));
  const data = rows.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (data.length < 2) throw new Error("Need a header and at least one result row.");
  const header = data[0].map((cell) => cell.toLowerCase());
  const labelIndex = header.findIndex((cell) => /model|system|name|label|method/.test(cell));
  const valueIndex = header.findIndex((cell) => /score|value|result|metric|accuracy|pass/.test(cell));
  const labels = labelIndex >= 0 ? labelIndex : 0;
  const values = valueIndex >= 0 ? valueIndex : 1;
  const series = data.slice(1).map((row) => ({ label: row[labels], value: number(row[values]), note: row.slice(Math.max(labels, values) + 1).join(" · ") })).filter((row) => row.label && row.value !== null);
  if (!series.length) throw new Error("Could not find numeric benchmark values. Use label,value columns.");
  return normalize({ title: "Imported benchmark", metric: data[0][values] || "Score", series });
}

export function normalize(candidate) {
  const series = (candidate.series || candidate.results || []).map((row) => ({ label: clean(row.label ?? row.name ?? row.model ?? row.system), value: number(row.value ?? row.score ?? row.result), note: clean(row.note) })).filter((row) => row.label && row.value !== null);
  if (!series.length) throw new Error("The specification requires at least one label/value result.");
  return { title: clean(candidate.title) || "Untitled benchmark", metric: clean(candidate.metric) || "Score", unit: clean(candidate.unit), higherIsBetter: candidate.higherIsBetter !== false, source: clean(candidate.source), caveat: clean(candidate.caveat), interpretation: clean(candidate.interpretation), series };
}

function fromEditor() {
  const series = $("values").value.split(/\r?\n/).map((line) => { const [label, raw, ...notes] = line.split(","); return { label: clean(label), value: number(raw), note: clean(notes.join(",")) }; }).filter((row) => row.label && row.value !== null);
  return normalize({ title: $("title").value, metric: $("metric").value, unit: $("unit").value, higherIsBetter: $("direction").value === "higher", source: $("sourceUrl").value, caveat: $("caveat").value, interpretation: $("interpretation").value, series });
}

function toEditor(next) { $("title").value = next.title; $("metric").value = next.metric; $("unit").value = next.unit; $("direction").value = next.higherIsBetter ? "higher" : "lower"; $("sourceUrl").value = next.source; $("caveat").value = next.caveat; $("interpretation").value = next.interpretation; $("values").value = next.series.map((row) => [row.label, row.value, row.note].filter(Boolean).join(", ")).join("\n"); }

function render() {
  const ordered = [...spec.series].sort((a, b) => spec.higherIsBetter ? b.value - a.value : a.value - b.value);
  const min = Math.min(...ordered.map((row) => row.value), 0), max = Math.max(...ordered.map((row) => row.value));
  const width = (value) => max === min ? 100 : Math.max(4, ((value - min) / (max - min)) * 100);
  $("chart").innerHTML = `<article class="chart-card"><h2>${escapeHtml(spec.title)}</h2><p class="meta">${escapeHtml(spec.metric)}${spec.unit ? ` · ${escapeHtml(spec.unit)}` : ""} · ${spec.higherIsBetter ? "higher is better" : "lower is better"}</p>${ordered.map((row) => `<div class="bar-row"><strong>${escapeHtml(row.label)}</strong><div class="bar" style="width:${width(row.value)}%" title="${row.value}"></div><b>${row.value}</b></div>`).join("")}<div class="receipt">${spec.interpretation ? `<p><strong>Interpretation:</strong> ${escapeHtml(spec.interpretation)}</p>` : ""}${spec.source ? `<p><strong>Source:</strong> ${escapeHtml(spec.source)}</p>` : ""}${spec.caveat ? `<p><strong>Caveat:</strong> ${escapeHtml(spec.caveat)}</p>` : ""}</div></article>`;
}

function escapeHtml(value) { return clean(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }
function status(message, error = false) { $("status").textContent = message; $("status").style.color = error ? "#b42318" : "#496650"; }
function download(name, type, content) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function svg() { const card = $("chart"); const bounds = card.getBoundingClientRect(); return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(bounds.width)}" height="${Math.ceil(bounds.height)}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${card.innerHTML}</div></foreignObject></svg>`; }

async function exportFile(kind) {
  if (kind === "json") return download("benchwarmer-spec.json", "application/json", JSON.stringify(spec, null, 2));
  if (kind === "html") return download("benchwarmer-chart.html", "text/html", `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><main><section class="output">${$("chart").innerHTML}</section></main>`);
  const graphic = svg();
  if (kind === "svg") return download("benchwarmer-chart.svg", "image/svg+xml", graphic);
  const image = new Image(); image.src = URL.createObjectURL(new Blob([graphic], { type: "image/svg+xml" })); await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; canvas.getContext("2d").drawImage(image, 0, 0); canvas.toBlob((blob) => download("benchwarmer-chart.png", "image/png", blob));
}

function apply(next, message = "Chart updated. Export includes the visible receipts.") { spec = next; toEditor(spec); render(); status(message); }
if (typeof document !== "undefined" && document.querySelectorAll) {
  $("parse").addEventListener("click", () => { try { apply(parseTable($("source").value)); } catch (error) { status(error.message, true); } });
  $("update").addEventListener("click", () => { try { apply(fromEditor()); } catch (error) { status(error.message, true); } });
  document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => exportFile(button.dataset.export)));
  $("file").addEventListener("change", async (event) => { try { apply(parseTable(await event.target.files[0].text()), "Imported file. Check the receipts before publishing."); } catch (error) { status(error.message, true); } });
  $("dropzone").addEventListener("dragover", (event) => event.preventDefault());
  $("dropzone").addEventListener("drop", async (event) => { event.preventDefault(); try { apply(parseTable(await event.dataTransfer.files[0].text()), "Imported drop. Check the receipts before publishing."); } catch (error) { status(error.message, true); } });
  fetch("examples/sample.json").then((response) => response.json()).then((data) => apply(normalize(data), "Loaded illustrative example. Replace it with sourced results.")).catch(() => status("Ready for a sourced benchmark."));
}
