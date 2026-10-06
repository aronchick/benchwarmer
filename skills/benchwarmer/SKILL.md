# Benchwarmer screenshot extraction

Use this skill when a user supplies a benchmark screenshot or a chart without a machine-readable table.

1. Transcribe only visibly supported labels, values, metric names, sources, and caveats.
2. Mark every uncertain value as uncertain; never invent missing axes, units, versions, or evaluation conditions.
3. Determine whether the source is a single series or a matrix. For matrices, preserve every visible model column, benchmark row, group, direction, and missing value; return a `kind: "matrix"` specification matching `schemas/benchmark-spec.schema.json`.
4. Set `source` to the user-supplied source or `Not visible in screenshot`; write provenance uncertainty into `caveat`.
5. Ignore source colors, selected columns, and bolding when calculating rank. Recompute winners separately for each row from the transcribed values and declared higher/lower direction.
6. If a source visually emphasizes a column that does not win every row, set `sourceHighlight` and report the mismatch as a chart crime.
7. Ask the user to verify the extraction against a primary source before publishing or using it for a decision.

The outcome is an editable specification, not extraction proof.
