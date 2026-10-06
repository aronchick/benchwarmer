export function clean(value) {
  return String(value ?? "").trim();
}

export function numeric(value) {
  const raw = clean(value);

  if (!raw || /^(?:\*|\*\*|-|--+|—|n\/?a|null|not available)$/i.test(raw))
    return null;
  const annotated = raw.match(/^(.+?)\s*\*\*$/);
  const source = annotated ? annotated[1] : raw;
  const parsed = Number(source.replace(/[%,$\s]/g, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedCell(
  value,
  suppliedMissingReason,
  suppliedFootnote,
  suppliedNote,
) {
  const raw = clean(value);
  const note = clean(suppliedNote);
  let missingReason = clean(suppliedMissingReason);
  let footnote = clean(suppliedFootnote);

  if (!["not_supported", "not_available"].includes(missingReason))
    missingReason = "";

  if (footnote !== "not_self_reported") footnote = "";

  if (note === "not supported") missingReason ||= "not_supported";

  if (note === "not available") missingReason ||= "not_available";

  if (note === "not self-reported") footnote ||= "not_self_reported";

  if (raw === "*")
    return {
      value: null,
      missingReason: missingReason || "not_supported",
      footnote: footnote || null,
    };

  if (/^(?:-|--+|—|n\/?a|null|not available)$/i.test(raw))
    return {
      value: null,
      missingReason: missingReason || "not_available",
      footnote: footnote || null,
    };

  const notSelfReported = raw === "**" || /^.+?\s*\*\*$/.test(raw);

  return {
    value: numeric(value),
    missingReason: missingReason || null,
    footnote: footnote || (notSelfReported ? "not_self_reported" : null),
  };
}

function splitDelimited(text) {
  const lines = clean(text)
    .replace(/^```(?:csv|json)?|```$/gim, "")
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean);

  const delimiter = lines.some((line) => line.includes("\t"))
    ? "\t"
    : lines.some((line) => line.includes("|"))
      ? "|"
      : ",";

  return lines
    .map((line) => {
      const stripped = delimiter === "|" ? line.replace(/^\||\|$/g, "") : line;

      return stripped.split(delimiter).map(clean);
    })
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
}

export function parseTable(input) {
  const text = clean(input);

  if (!text) throw new Error("Paste a benchmark table or choose a file.");

  if (text.startsWith("{")) return normalize(JSON.parse(text));
  const data = splitDelimited(text);

  if (data.length < 2)
    throw new Error("Need a header and at least one result row.");

  const headers = data[0];
  const normalizedHeaders = headers.map((cell) => cell.toLowerCase());

  const metadata =
    /^(?:benchmark|task|test|name|label|metric|detail|subtitle|group|category|direction)$/i;

  const modelIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => index > 0 && !metadata.test(header));

  const matrixEvidence = data
    .slice(1)
    .filter(
      (row) =>
        modelIndexes.filter(({ index }) => numeric(row[index]) !== null)
          .length >= 2,
    );

  const matrixRows = data
    .slice(1)
    .filter((row) =>
      modelIndexes.some(({ index }) => numeric(row[index]) !== null),
    );

  if (modelIndexes.length >= 2 && matrixEvidence.length) {
    const detailIndex = normalizedHeaders.findIndex((header) =>
      /^(detail|subtitle|metric)$/.test(header),
    );

    const groupIndex = normalizedHeaders.findIndex((header) =>
      /^(group|category)$/.test(header),
    );

    const directionIndex = normalizedHeaders.findIndex(
      (header) => header === "direction",
    );

    return normalize({
      kind: "matrix",
      title: "Imported benchmark comparison",
      metric: "Score",
      columns: modelIndexes.map(({ header }) => header),
      rows: matrixRows.map((row) => ({
        label: row[0],
        detail: detailIndex >= 0 ? row[detailIndex] : "",
        group: groupIndex >= 0 ? row[groupIndex] : "",
        higherIsBetter:
          directionIndex < 0 || !/^low/i.test(row[directionIndex]),
        values: modelIndexes.map(({ index }) => row[index]),
      })),
    });
  }

  const labelIndex = normalizedHeaders.findIndex((cell) =>
    /model|system|name|label|method/.test(cell),
  );

  const valueIndex = normalizedHeaders.findIndex((cell) =>
    /score|value|result|metric|accuracy|pass/.test(cell),
  );

  const labels = labelIndex >= 0 ? labelIndex : 0;
  const values = valueIndex >= 0 ? valueIndex : 1;

  const series = data
    .slice(1)
    .map((row) => ({
      label: row[labels],
      value: numeric(row[values]),
      note: row.slice(Math.max(labels, values) + 1).join(" · "),
    }))
    .filter((row) => row.label && row.value !== null);

  if (!series.length)
    throw new Error(
      "Could not find benchmark values. Use label,value columns or a matrix with two or more model columns.",
    );

  return normalize({
    kind: "series",
    title: "Imported benchmark",
    metric: headers[values] || "Score",
    series,
  });
}

function normalizeMatrix(candidate) {
  const columns = (candidate.columns || []).map(clean).filter(Boolean);

  if (columns.length < 2)
    throw new Error("A comparison matrix requires at least two model columns.");
  const defaultDirection = candidate.higherIsBetter !== false;

  const rows = (candidate.rows || [])
    .map((row) => {
      const cells = columns.map((column, index) =>
        normalizedCell(
          Array.isArray(row.values) ? row.values[index] : row.values?.[column],
          Array.isArray(row.missingReasons)
            ? row.missingReasons[index]
            : row.missingReasons?.[column],
          Array.isArray(row.footnotes)
            ? row.footnotes[index]
            : row.footnotes?.[column],
          Array.isArray(row.notes) ? row.notes[index] : row.notes?.[column],
        ),
      );

      return {
        label: clean(row.label ?? row.name ?? row.benchmark),
        detail: clean(row.detail ?? row.subtitle),
        group: clean(row.group ?? row.category),
        higherIsBetter: row.higherIsBetter ?? defaultDirection,
        values: cells.map((cell) => cell.value),
        missingReasons: cells.map((cell) => cell.missingReason),
        footnotes: cells.map((cell) => cell.footnote),
      };
    })
    .filter(
      (row) =>
        row.label &&
        (row.values.some((value) => value !== null) ||
          row.missingReasons.some(Boolean) ||
          row.footnotes.some(Boolean)),
    );

  if (!rows.length)
    throw new Error(
      "The matrix requires at least one benchmark row with numeric results.",
    );

  return {
    kind: "matrix",
    title: clean(candidate.title) || "Untitled benchmark comparison",
    metric: clean(candidate.metric) || "Score",
    unit: clean(candidate.unit),
    higherIsBetter: defaultDirection,
    source: clean(candidate.source),
    caveat: clean(candidate.caveat),
    interpretation: clean(candidate.interpretation),
    sourceHighlight: clean(candidate.sourceHighlight),
    columns,
    rows,
  };
}

function normalizeSeries(candidate) {
  const series = (candidate.series || candidate.results || [])
    .map((row) => ({
      label: clean(row.label ?? row.name ?? row.model ?? row.system),
      value: numeric(row.value ?? row.score ?? row.result),
      note: clean(row.note),
    }))
    .filter((row) => row.label && row.value !== null);

  if (!series.length)
    throw new Error(
      "The specification requires at least one label/value result.",
    );

  return {
    kind: "series",
    title: clean(candidate.title) || "Untitled benchmark",
    metric: clean(candidate.metric) || "Score",
    unit: clean(candidate.unit),
    higherIsBetter: candidate.higherIsBetter !== false,
    source: clean(candidate.source),
    caveat: clean(candidate.caveat),
    interpretation: clean(candidate.interpretation),
    sourceHighlight: "",
    series,
  };
}

export function normalize(candidate) {
  if (
    candidate?.kind === "matrix" ||
    Array.isArray(candidate?.columns) ||
    Array.isArray(candidate?.rows)
  )
    return normalizeMatrix(candidate || {});

  return normalizeSeries(candidate || {});
}

export function rankRow(row) {
  const available = row.values
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value !== null);

  if (!available.length) return { winners: [], runnersUp: [] };

  const orderedValues = [...new Set(available.map(({ value }) => value))].sort(
    (a, b) => (row.higherIsBetter ? b - a : a - b),
  );

  return {
    winners: available
      .filter(({ value }) => value === orderedValues[0])
      .map(({ index }) => index),
    runnersUp: available
      .filter(({ value }) => value === orderedValues[1])
      .map(({ index }) => index),
  };
}

export function auditMatrix(spec) {
  const normalized = normalizeMatrix(spec);
  const wins = normalized.columns.map(() => 0);
  let missing = 0;
  let ties = 0;
  let notSupported = 0;
  let notAvailable = 0;
  let unclassifiedMissing = 0;
  let notSelfReported = 0;

  for (const row of normalized.rows) {
    const rank = rankRow(row);

    if (rank.winners.length > 1) ties += 1;
    rank.winners.forEach((index) => {
      wins[index] += 1;
    });
    missing += row.values.filter((value) => value === null).length;
    row.values.forEach((value, index) => {
      const reason = row.missingReasons[index];
      const footnote = row.footnotes[index];

      if (reason === "not_supported") notSupported += 1;
      else if (reason === "not_available") notAvailable += 1;
      else if (value === null) unclassifiedMissing += 1;

      if (footnote === "not_self_reported") notSelfReported += 1;
    });
  }

  const winningColumns = wins.filter(Boolean).length;

  const highlightedIndex = normalized.columns.indexOf(
    normalized.sourceHighlight,
  );

  const highlightMisses =
    highlightedIndex < 0
      ? null
      : normalized.rows.filter(
          (row) => !rankRow(row).winners.includes(highlightedIndex),
        ).length;

  const findings = [
    {
      severity: "fixed",
      text: "Source styling is ignored; every highlight is recomputed from the numeric values.",
    },
  ];

  if (highlightMisses > 0)
    findings.push({
      severity: "crime",
      text: `${normalized.sourceHighlight} is visually emphasized in the source but does not win ${highlightMisses} of ${normalized.rows.length} rows.`,
    });

  if (winningColumns > 1)
    findings.push({
      severity: "crime",
      text: `${winningColumns} different models win at least one row, so a full-column highlight would imply a false universal winner.`,
    });

  if (notSupported)
    findings.push({
      severity: "note",
      text: `${notSupported} result${notSupported === 1 ? " is" : "s are"} marked not supported (*), not treated as zero.`,
    });

  if (notAvailable)
    findings.push({
      severity: "note",
      text: `${notAvailable} result${notAvailable === 1 ? " is" : "s are"} marked not available (—), not treated as zero.`,
    });

  if (unclassifiedMissing)
    findings.push({
      severity: "note",
      text: `${unclassifiedMissing} result${unclassifiedMissing === 1 ? " is" : "s are"} missing without a source reason, not treated as zero.`,
    });

  if (notSelfReported)
    findings.push({
      severity: "note",
      text: `${notSelfReported} numeric result${notSelfReported === 1 ? " carries" : "s carry"} the source's not-self-reported footnote (**).`,
    });

  if (ties)
    findings.push({
      severity: "note",
      text: `${ties} tied row${ties === 1 ? "" : "s"} preserve all co-winners.`,
    });

  return {
    findings,
    wins,
    missing,
    missingReasons: { notSupported, notAvailable, unclassified: unclassifiedMissing },
    footnotes: { notSelfReported },
    ties,
    highlightMisses,
  };
}

export function toEditableTable(spec) {
  const normalized = normalize(spec);

  if (normalized.kind === "series")
    return [
      "Label,Value,Note",
      ...normalized.series.map((row) =>
        [row.label, row.value, row.note].join(","),
      ),
    ].join("\n");

  return [
    ["Benchmark", "Detail", "Group", "Direction", ...normalized.columns].join(
      ",",
    ),
    ...normalized.rows.map((row) =>
      [
        row.label,
        row.detail,
        row.group,
        row.higherIsBetter ? "higher" : "lower",
        ...row.values.map((value, index) => {
          const missingReason = clean(row.missingReasons?.[index]);
          const footnote = clean(row.footnotes?.[index]);

          if (missingReason === "not_supported") return "*";

          if (missingReason === "not_available") return "—";

          if (footnote === "not_self_reported") return `${value ?? ""}**`;

          return value ?? "--";
        }),
      ].join(","),
    ),
  ].join("\n");
}
