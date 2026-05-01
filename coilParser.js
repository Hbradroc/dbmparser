/**
 * DBM-style hyphenated coil codes (COH/COK family and similar GXK-style strings).
 * Field meanings follow typical submittal breakdown; extend LOOKUPS for your plant.
 */

const LOOKUPS = {
  coilType: {
    COH: "Heating coil (COH)",
    COK: "Cooling coil (COK)",
    GXK: "Coil type GXK (confirm exact product line with DBM / submittal legend)",
    GXH: "Coil type GXH (confirm with documentation)",
    GXC: "Coil type GXC (confirm with documentation)",
  },
  medium: {
    W: "Water",
    S: "Steam",
    G: "Glycol / brine (verify concentration with job spec)",
    E: "Electric (if applicable to product line)",
    R: "Refrigerant circuit context (verify)",
  },
  tubeCode: {
    "3": 'Tube OD 3/8"',
    "4": 'Tube OD 1/2"',
    "5": 'Tube OD 5/8"',
  },
  headerMaterial: {
    CU: "Copper headers",
    SST: "Stainless steel headers",
    ST: "Stainless steel headers",
    FE: "Steel / ferrous headers (verify)",
    BR: "Brass headers",
  },
  finMaterial: {
    AI: "Aluminum fins",
    AL: "Aluminum fins",
    CU: "Copper fins",
    SST: "Stainless fins",
  },
  handing: {
    V: "Handing: left (per CORE legend — confirm against drawing)",
    H: "Handing: right (per CORE legend — confirm against drawing)",
    "1": "Code 1 (verify handing / connection detail on drawing)",
    "2": "Code 2 (verify handing / connection detail on drawing)",
  },
};

/** Positions after splitting on "-" (0-based), for the long "detailed" code form */
const STANDARD_FIELDS = [
  { key: "coilType", label: "Coil type", lookup: "coilType" },
  { key: "size", label: "Coil size / face reference", lookup: null },
  { key: "medium", label: "Medium", lookup: "medium" },
  { key: "tubeCode", label: "Tube diameter code", lookup: "tubeCode" },
  { key: "rows", label: "Number of rows", lookup: null },
  { key: "circuits", label: "Number of circuits", lookup: null },
  { key: "finDim1", label: "Fin pack dimension 1 (mm or code per legend)", lookup: null },
  { key: "finDim2", label: "Fin pack dimension 2 (mm or code per legend)", lookup: null },
  { key: "finPitch", label: "Fin spacing / pitch (mm)", lookup: null },
  { key: "headerMaterial", label: "Header material", lookup: "headerMaterial" },
  { key: "finMaterial", label: "Fin material", lookup: "finMaterial" },
  { key: "handing", label: "Handing / orientation code", lookup: "handing" },
  {
    key: "connectionSize",
    label: "Header bore / connection size",
    lookup: null,
  },
];

/**
 * Normalize user paste: trim, collapse whitespace, unify separators.
 */
function normalizeInput(raw) {
  let s = String(raw).trim();
  s = s.replace(/\s+/g, " ");
  s = s.replace(/\s*-\s*/g, "-");
  return s;
}

/**
 * Splits pasted "CODE 123" hyphen groups when a letter-code and digit got merged (e.g. AJ1 1).
 * Keeps segments like "1 1/4" intact when they lack a letter prefix.
 */
function expandSplitCodes(tokens) {
  const out = [];
  for (const t of tokens) {
    const m = t.match(/^([A-Za-z]{1,6}\d*)\s+(\d+(?:\s+\d+\/\d+)?)$/);
    if (m && !String(t).includes("-")) {
      out.push(m[1], m[2].replace(/\s+/g, " ").trim());
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Split on hyphens; keep segments. Header sizes like "1 1/4" stay as one segment.
 */
function tokenize(code) {
  const parts = normalizeInput(code)
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean);
  return expandSplitCodes(parts);
}

function lookupCategory(category, code) {
  const table = LOOKUPS[category];
  if (!table) return null;
  const upper = String(code).toUpperCase();
  if (table[code] != null) return table[code];
  if (table[upper] != null) return table[upper];
  return null;
}

function explainFinMaterial(raw) {
  const direct = lookupCategory("finMaterial", raw);
  if (direct) return direct;
  if (/^A[J-Z]?\d*$/i.test(raw)) {
    return `Fin material / fin stock code "${raw}" (likely aluminum series — confirm on submittal legend)`;
  }
  return null;
}

function meaningForField(field, raw) {
  if (raw == null || raw === "") return { text: "—", certain: true };
  const { key, lookup } = field;
  if (lookup && LOOKUPS[lookup]) {
    const hit = lookupCategory(lookup, raw);
    if (hit) return { text: hit, certain: true };
  }
  if (key === "finMaterial") {
    const ex = explainFinMaterial(raw);
    if (ex) return { text: ex, certain: false };
  }
  if (key === "size" && /^\d+$/.test(raw)) {
    return { text: `Size reference ${raw} (numeric code from product family)`, certain: false };
  }
  if ((key === "rows" || key === "circuits") && /^\d+$/.test(raw)) {
    return { text: `${raw} (numeric per code table)`, certain: true };
  }
  if ((key === "finDim1" || key === "finDim2") && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} — typically fin pack length/width or net fin length in mm (verify units on drawing)`,
      certain: false,
    };
  }
  if (key === "finPitch" && /^\d+(\.\d+)?$/.test(raw)) {
    return { text: `Fin pitch ${raw} mm (typical for this code style — confirm)`, certain: false };
  }
  if (key === "connectionSize") {
    if (/^\d+(\s+\d+\/\d+)?(\s*")?$/i.test(raw.trim())) {
      return {
        text: `Connection / header nominal size ${raw} (typically inches — verify on drawing)`,
        certain: false,
      };
    }
    return {
      text: `Connection or suffix code "${raw}" (e.g. variant, nipple layout, distributor option — verify on legend)`,
      certain: false,
    };
  }
  return {
    text: `Code "${raw}" — add to lookup table or confirm on submittal / DBM legend`,
    certain: false,
  };
}

/**
 * Optional trailing tokens after the 12 standard positions (e.g. D2, tt, connection notes).
 */
function parseCoilCode(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return { ok: false, error: "Enter a coil code.", tokens: [], rows: [], extra: [], supplierText: "" };
  }

  const standardCount = STANDARD_FIELDS.length;
  const standardTokens = tokens.slice(0, standardCount);
  const extra = tokens.slice(standardCount);

  const rows = STANDARD_FIELDS.map((field, i) => {
    const raw = standardTokens[i] ?? "";
    const m = meaningForField(field, raw);
    return {
      position: i + 1,
      key: field.key,
      label: field.label,
      raw,
      meaning: m.text,
      certain: m.certain,
      missing: !raw,
    };
  });

  const extraRows = extra.map((raw, j) => ({
    position: standardCount + j + 1,
    key: "extra",
    label: "Additional suffix",
    raw,
    meaning: `Trailing segment "${raw}" (connection variant, distributor code, drawing ref — verify on submittal)`,
    certain: false,
    missing: false,
  }));

  const allRows = rows.concat(extraRows);
  const supplierText = buildSupplierSummary(input, allRows);

  return {
    ok: true,
    error: null,
    tokens,
    rows: allRows,
    extra,
    supplierText,
  };
}

function buildSupplierSummary(original, rows) {
  const lines = [
    "COIL ORDER / RFQ SUMMARY (decode from DBM-style code — verify before order)",
    "================================================================",
    `Full code: ${normalizeInput(original)}`,
    "",
  ];
  for (const r of rows) {
    if (!r.raw && r.key !== "extra") continue;
    lines.push(`${r.position}. ${r.label}: ${r.raw || "(missing)"}`);
    lines.push(`   → ${r.meaning}`);
    lines.push("");
  }
  lines.push("Notes:");
  lines.push("- Confirm handing, connections, casing sides, and design duty (kW / kPa / flow) separately.");
  lines.push("- This tool interprets hyphen positions only; it is not a substitute for approved drawings.");
  return lines.join("\n");
}

window.DBM_PARSER = {
  LOOKUPS,
  STANDARD_FIELDS,
  normalizeInput,
  tokenize,
  parseCoilCode,
};
