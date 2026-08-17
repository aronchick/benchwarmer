export function clean(value) {
  return String(value ?? "").trim();
}

export function numeric(value) {
  const raw = clean(value);
  if (!raw || /^(?:--+|—|n\/?a|null|not available)$/i.test(raw)) return null;
  const parsed = Number(raw.replace(/[%,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
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
        values: modelIndexes.map(({ index }) => numeric(row[index])),
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
    .map((row) => ({
      label: clean(row.label ?? row.name ?? row.benchmark),
      detail: clean(row.detail ?? row.subtitle),
      group: clean(row.group ?? row.category),
      higherIsBetter: row.higherIsBetter ?? defaultDirection,
      values: columns.map((column, index) =>
        numeric(
          Array.isArray(row.values) ? row.values[index] : row.values?.[column],
        ),
      ),
    }))
    .filter((row) => row.label && row.values.some((value) => value !== null));
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
  for (const row of normalized.rows) {
    const rank = rankRow(row);
    if (rank.winners.length > 1) ties += 1;
    rank.winners.forEach((index) => {
      wins[index] += 1;
    });
    missing += row.values.filter((value) => value === null).length;
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
  if (missing)
    findings.push({
      severity: "note",
      text: `${missing} unavailable results are marked as missing—not treated as zero.`,
    });
  if (ties)
    findings.push({
      severity: "note",
      text: `${ties} tied row${ties === 1 ? "" : "s"} preserve all co-winners.`,
    });
  return { findings, wins, missing, ties, highlightMisses };
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
        ...row.values.map((value) => value ?? "--"),
      ].join(","),
    ),
  ].join("\n");
}

export function parseOcrText(input) {
  const rows = clean(input)
    .split(/\r?\n/)
    .map(clean)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+(-?\d[\d,.]*(?:\.\d+)?%?)\s*$/);
      return match
        ? {
            label: clean(match[1].replace(/[|:]+$/, "")),
            value: numeric(match[2]),
          }
        : null;
    })
    .filter(
      (row) =>
        row?.label &&
        row.value !== null &&
        !/^(score|value|result|accuracy)$/i.test(row.label),
    );
  if (rows.length < 2)
    throw new Error(
      "OCR needs at least two label-and-value lines. Edit the extracted text, then try again.",
    );
  return normalize({
    kind: "series",
    title: "Imported benchmark",
    metric: "Score",
    series: rows,
  });
}

export function matrixFromTsv(tsv) {
  const words = clean(tsv)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 12 && Number(parts[0]) === 5)
    .map((parts) => ({
      left: Number(parts[6]),
      top: Number(parts[7]),
      width: Number(parts[8]),
      height: Number(parts[9]),
      text: clean(parts.slice(11).join("\t")),
    }))
    .filter((word) => word.text);
  const numericWords = words.filter(
    (word) => numeric(word.text) !== null && /\d/.test(word.text),
  );
  if (numericWords.length < 4)
    throw new Error(
      "OCR could not find a comparison matrix. Edit the transcription or use the agent extraction workflow.",
    );

  const yTolerance = Math.max(
    10,
    Math.round(Math.max(...words.map((word) => word.height), 10) * 0.8),
  );
  const lines = [];
  for (const word of words) {
    const centerY = word.top + word.height / 2;
    let line = lines.find(
      (candidate) => Math.abs(candidate.centerY - centerY) <= yTolerance,
    );
    if (!line) {
      line = { centerY, words: [] };
      lines.push(line);
    }
    line.words.push(word);
  }
  lines.forEach((line) => line.words.sort((a, b) => a.left - b.left));
  const preliminaryValueLines = lines
    .filter(
      (line) =>
        line.words.filter(
          (word) => numeric(word.text) !== null && /\d/.test(word.text),
        ).length >= 2,
    )
    .sort((a, b) => a.centerY - b.centerY);
  if (preliminaryValueLines.length < 2)
    throw new Error(
      "OCR found numbers but not enough aligned benchmark rows. Edit the transcription before charting.",
    );

  // A chart title can contain more words than its headers. Inferring columns
  // from that title was the reason a two-column subtitle became a bogus
  // matrix. Model columns are the x positions that recur *across result rows*.
  const valueWords = preliminaryValueLines.flatMap((line) =>
    line.words.filter(
      (word) => numeric(word.text) !== null && /\d/.test(word.text),
    ),
  );
  const xValues = valueWords
    .map((word) => word.left + word.width / 2)
    .sort((a, b) => a - b);
  const threshold = Math.max(
    42,
    Math.min(90, (Math.max(...xValues) - Math.min(...xValues)) / 14),
  );
  const clusters = [];
  for (const x of xValues) {
    let cluster = clusters.find(
      (candidate) => Math.abs(candidate.center - x) < threshold,
    );
    if (!cluster) {
      cluster = { center: x, values: [] };
      clusters.push(cluster);
    }
    cluster.values.push(x);
    cluster.center =
      cluster.values.reduce((sum, value) => sum + value, 0) /
      cluster.values.length;
  }
  const strongestColumn = Math.max(
    ...clusters.map((cluster) => new Set(cluster.values).size),
  );
  let clusteredCenters = clusters
    .filter(
      (cluster) =>
        cluster.values.length >=
        Math.max(2, Math.ceil(strongestColumn * 0.35)),
    )
    .sort((a, b) => a.center - b.center)
    .map((cluster) => cluster.center);
  if (clusteredCenters.length < 2)
    throw new Error(
      "OCR could not infer model columns. Edit the extracted text before charting.",
    );
  const likelyResultLines = preliminaryValueLines.filter((line) =>
    !line.words.some((word) => /^(?:benchmark|models?)$/i.test(word.text)) &&
    line.words.some(
      (word) =>
        numeric(word.text) === null &&
        word.left + word.width / 2 < clusteredCenters[0] - threshold / 2,
    ),
  );
  const resultLines =
    likelyResultLines.length >= 2 ? likelyResultLines : preliminaryValueLines;
  const candidateGaps = clusteredCenters
    .slice(1)
    .map((center, index) => center - clusteredCenters[index]);
  const medianGap = candidateGaps.sort((a, b) => a - b)[
    Math.floor(candidateGaps.length / 2)
  ];
  const labelRightEdge = Math.max(
    ...resultLines.flatMap((line) =>
      line.words
        .filter(
          (word) =>
            numeric(word.text) === null &&
            word.left + word.width / 2 < clusteredCenters[0] - threshold / 2,
        )
        .map((word) => word.left + word.width),
    ),
    0,
  );
  // A low-contrast selected column can lose all of its values to OCR. If the
  // regular result grid leaves one full slot between labels and its first
  // detected column, retain that slot as an explicit reviewable column instead
  // of shifting every remaining model left.
  if (
    Number.isFinite(medianGap) &&
    clusteredCenters[0] - labelRightEdge > medianGap * 1.45
  ) {
    clusteredCenters = [clusteredCenters[0] - medianGap, ...clusteredCenters];
  }
  const columnCenters = clusteredCenters;
  const firstRowY = resultLines[0].centerY;
  const headerWords = lines
    .filter(
      (line) =>
        line.centerY < firstRowY - yTolerance / 2 &&
        line.centerY >= firstRowY - yTolerance * 6,
    )
    .flatMap((line) => line.words);
  const firstColumnX = columnCenters[0];
  const columns = columnCenters.map((center, index) => {
    const nextGap =
      index < columnCenters.length - 1
        ? (columnCenters[index + 1] - center) / 2
        : threshold * 1.5;
    const previousGap =
      index > 0 ? (center - columnCenters[index - 1]) / 2 : threshold * 1.5;
    const label = headerWords
      .filter((word) => {
        const x = word.left + word.width / 2;
        return x >= center - previousGap && x <= center + nextGap;
      })
      .sort((a, b) => a.left - b.left)
      .map((word) => word.text)
      .join(" ");
    return label || `Unrecognized model ${index + 1}`;
  });
  const valueLines = preliminaryValueLines.filter(
    (line) =>
      line.centerY >= firstRowY - yTolerance &&
      columnCenters.filter((center) =>
        line.words.some(
          (word) =>
            numeric(word.text) !== null &&
            Math.abs(word.left + word.width / 2 - center) < threshold,
        ),
      ).length >= 2,
  );
  const ocrScore = (word) => {
    const value = numeric(word?.text);
    return value !== null &&
      value > 100 &&
      value < 1000 &&
      !/[.,]/.test(word.text)
      ? value / 10
      : value;
  };
  const rows = valueLines.map((line, rowIndex) => {
    const values = columnCenters.map((center) => {
      const closest = line.words
        .filter((word) => numeric(word.text) !== null)
        .sort(
          (a, b) =>
            Math.abs(a.left + a.width / 2 - center) -
            Math.abs(b.left + b.width / 2 - center),
        )[0];
      return closest &&
        Math.abs(closest.left + closest.width / 2 - center) < threshold
        ? ocrScore(closest)
        : null;
    });
    let labelWords = line.words.filter(
      (word) =>
        word.left + word.width / 2 < firstColumnX - threshold / 2 &&
        numeric(word.text) === null,
    );
    if (!labelWords.length) {
      labelWords = lines
        .filter(
          (candidate) =>
            Math.abs(candidate.centerY - line.centerY) <= yTolerance * 3.5,
        )
        .sort(
          (a, b) =>
            Math.abs(a.centerY - line.centerY) -
            Math.abs(b.centerY - line.centerY),
        )
        .flatMap((candidate) => candidate.words)
        .filter(
          (word) =>
            word.left + word.width / 2 < firstColumnX - threshold / 2 &&
            numeric(word.text) === null,
        );
    }
    const label = labelWords.map((word) => word.text).join(" ");
    return {
      label: label || `Benchmark ${rowIndex + 1}`,
      values,
      higherIsBetter: true,
    };
  });
  return normalize({
    kind: "matrix",
    title: "OCR benchmark comparison",
    metric: "Score",
    columns,
    rows,
  });
}
