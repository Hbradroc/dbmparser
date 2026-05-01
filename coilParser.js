/**
 * DBM-style hyphenated coil codes (COH/COK / GXK family and similar).
 * Cross-checks where they overlap with DBM GEO.COIL / Calc98 DLL documentation
 * (e.g. manifold Table 13, coil geometry Table 6, fin pitch Table 8).
 */

/** Table 13 — DLL input value → manifold / threaded size (GEO.COIL DLL doc). */
const MANIFOLD_INPUT_TABLE13 = {
  "2": 'Manifold DN 20 / threaded ¾"',
  "3": 'Manifold DN 25 / threaded 1"',
  "4": 'Manifold DN 32 / threaded 1¼"',
  "5": 'Manifold DN 40 / threaded 1½"',
  "6": 'Manifold DN 50 / threaded 2"',
  "7": 'Manifold DN 65 / threaded 2½"',
  "8": 'Manifold DN 80 / threaded 3"',
  "9": 'Manifold DN 100 / threaded 4"',
  "10": 'Manifold DN 125 / threaded 5"',
};

/** Table 6 — Coil type numeric codes used by Calc98 input cell 1 (DLL doc). */
const DLL_COIL_TYPE_TABLE6 = {
  "1": "Geometry P60 (DLL coil type code 1 — doc notes P60 deprecated for new lines in some tables)",
  "2": "Geometry P3012 (DLL coil type code 2)",
  "94": "Geometry P40 (DLL coil type code 94)",
  "113": "Geometry P25 (DLL coil type code 113)",
};

const GEO_COIL_DOC_NOTE =
  "GEO.COIL Calc98/DLL uses a 100-cell numeric input array; hyphenated submittal strings are a separate naming scheme but often carry the same physical ideas (rows, circuits, fin pitch mm, materials).";

const LOOKUPS = {
  coilType: {
    COH: "Heating coil (COH)",
    COK: "Cooling coil (COK)",
    GXK:
      "Coil family code GXK (drawing/submittal nomenclature — not listed in GEO.COIL DLL Table 6 P60/P3012/P40/P25)",
    GXH:
      "Coil family code GXH (drawing/submittal nomenclature — confirm alongside DBM order description)",
    GXC:
      "Coil family code GXC (drawing/submittal nomenclature — confirm alongside DBM order description)",
    P60: `${DLL_COIL_TYPE_TABLE6["1"]}`,
    P3012: `${DLL_COIL_TYPE_TABLE6["2"]}`,
    P40: `${DLL_COIL_TYPE_TABLE6["94"]}`,
    P25: `${DLL_COIL_TYPE_TABLE6["113"]}`,
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
    CU: "Copper headers (GEO.COIL DLL Table 10 maps header material Copper = numeric code 1 in cell 9)",
    "1": "Header material Copper (DLL Table 10, input cell 9)",
    "6": "Header material Steel (DLL Table 10, input cell 9)",
    SST: "Stainless steel headers",
    ST: "Stainless steel headers",
    FE: "Steel / ferrous headers (verify)",
    BR: "Brass headers",
  },
  finMaterial: {
    AI: "Aluminum fins (DLL Table 7: AL)",
    AL: "Aluminum fins (DLL Table 7: AL)",
    ALPR: "Pre-painted aluminum fins (DLL Table 7: ALPR)",
    CUSN: "CuSn fins (DLL Table 7)",
    AJ1: "Fin stock / finish code AJ1 — treat as aluminum-family unless your legend says otherwise (DLL lists AL, ALPR, AlMg2.5, Cu, CuSn)",
    CU: "Copper fins (DLL Table 7: CU)",
    SST: "Stainless fins",
  },
  handing: {
    V: "Handing: left (per CORE legend — confirm against drawing)",
    H: "Handing: right (per CORE legend — confirm against drawing)",
    "1": "Code 1 (verify handing / connection detail on drawing)",
    "2": "Code 2 (verify handing / connection detail on drawing)",
  },
};

/**
 * Tube OD -> geometry/thickness mapping used by this decoder.
 * Thickness values reference GEO.COIL DLL documentation tables:
 * - P3012 section: 0.35, 0.40, 0.60 mm
 * - P40 section: 0.40, 0.60, 0.75, 1.00, 1.50 mm
 * - P60 section: 0.40, 0.60, 0.75, 1.00, 1.50 mm
 */
const TUBE_CODE_SPECS = {
  "3": {
    od: 'Tube OD 3/8"',
    geometry: "P3012",
    thicknessMm: "0.35 / 0.40 / 0.60",
  },
  "4": {
    od: 'Tube OD 1/2"',
    geometry: "P40",
    thicknessMm: "0.40 / 0.60 / 0.75 / 1.00 / 1.50",
  },
  "5": {
    od: 'Tube OD 5/8"',
    geometry: "P60",
    thicknessMm: "0.40 / 0.60 / 0.75 / 1.00 / 1.50",
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
  {
    key: "finPitch",
    label: "Fin spacing / pitch (mm)",
    lookup: null,
    hint:
      "DLL input cell 17; Table 8 lists standard pitches — common grid 2.0–12.0 mm depending on geometry (P60/P40/P3012/P25)",
  },
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

function explainManifoldTable13(raw) {
  const t = String(raw).trim();
  if (MANIFOLD_INPUT_TABLE13[t]) {
    return `${MANIFOLD_INPUT_TABLE13[t]} — if this segment is a GEO.COIL manifold selector, it matches DLL Table 13 input values 2–10 (cells 79/80).`;
  }
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
    const dll =
      key === "rows"
        ? " — DLL input cell 15 (number of rows)"
        : " — DLL input cell 18 (number of circuits)";
    return { text: `${raw} (numeric segment)${dll}`, certain: true };
  }
  if (key === "tubeCode") {
    const spec = TUBE_CODE_SPECS[String(raw).trim()] || null;
    if (spec) {
      return {
        text: `${spec.od}. Geometry ${spec.geometry}. Allowed tube thickness (mm): ${spec.thicknessMm} (per GEO.COIL DLL documentation tables).`,
        certain: true,
      };
    }
  }
  if ((key === "finDim1" || key === "finDim2") && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} — typically fin pack length/width or net fin length in mm (verify units on drawing)`,
      certain: false,
    };
  }
  if (key === "finPitch" && /^\d+(\.\d+)?$/.test(raw)) {
    const f = STANDARD_FIELDS.find((x) => x.key === "finPitch");
    const dllHint = f && f.hint ? ` (${f.hint})` : "";
    return {
      text: `Fin pitch ${raw} mm — DBM GEO.COIL doc: input cell 17; standard pitch grids in Table 8${dllHint}.`,
      certain: false,
    };
  }
  if (key === "connectionSize") {
    const m13 = explainManifoldTable13(raw);
    if (m13) return { text: m13, certain: false };
    if (/^\d+(\s+\d+\/\d+)?(\s*")?$/i.test(raw.trim())) {
      return {
        text: `Connection / header nominal size ${raw} (nominal inch sizes also appear as text in coil denomination examples in the GEO.COIL DLL doc).`,
        certain: false,
      };
    }
    return {
      text: `Connection or suffix "${raw}". Doc examples: normal manifold (e.g. … 3 "), double manifold (… 2x3 "), twin take-off (… 3 "(x2)).`,
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

  const extraRows = extra.map((raw, j) => {
    const m13 = explainManifoldTable13(raw);
    return {
      position: standardCount + j + 1,
      key: "extra",
      label: "Additional suffix",
      raw,
      meaning: m13
        ? `${m13} Applied as trailing token on this hyphen split — confirm against drawing.`
        : `Trailing segment "${raw}" — variant flag, plating (e.g. electro tinning), distributor code, or drawing note (verify submittal / DBM naming).`,
      certain: false,
      missing: false,
    };
  });

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
  lines.push(`- ${GEO_COIL_DOC_NOTE}`);
  lines.push(
    "- GEO.COIL DLL result cell 30 (1-based Table 3) returns the complete coil denomination string from Calc98 — compare with your submittal line.",
  );
  lines.push(
    "- Water coils (DLL doc examples): normal connection size (e.g. 3 in), double manifold (e.g. 2x3 in), single manifold with double connection (e.g. 3 in (x2)).",
  );
  lines.push("- Confirm handing, connections, casing sides, and design duty (kW / kPa / flow) separately.");
  lines.push("- Hyphen decoding here is positional help only; drawings and DBM order confirmation prevail.");
  return lines.join("\n");
}

window.DBM_PARSER = {
  LOOKUPS,
  STANDARD_FIELDS,
  GEO_COIL_DOC_NOTE,
  MANIFOLD_INPUT_TABLE13,
  DLL_COIL_TYPE_TABLE6,
  normalizeInput,
  tokenize,
  parseCoilCode,
};
