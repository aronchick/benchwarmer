# Benchwarmer screenshot extraction

Use this skill when a user supplies a benchmark screenshot or a chart without a machine-readable table.

1. Transcribe only visibly supported labels, values, metric names, sources, and caveats.
2. Mark every uncertain value as uncertain; never invent missing axes, units, versions, or evaluation conditions.
3. Return a `benchmark-spec.json` matching `schemas/benchmark-spec.schema.json`.
4. Set `source` to the user-supplied source or `Not visible in screenshot`; write provenance uncertainty into `caveat`.
5. Ask the user to verify the extraction against a primary source before publishing or using it for a decision.

The outcome is an editable specification, not OCR proof.
