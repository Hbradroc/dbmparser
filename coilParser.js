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

/** Geniox field-2 size ≥ this uses Big Sizes (35–44) drawing packs alongside P25/P3012/P40. */
const BIG_SIZES_GENIOX_MIN = 32;

/** Largest Geniox size code present in bundled dimension spreadsheets (exclusive of 35+). */
const DIMENSION_TABLE_GENIOX_MAX = 34;

const LOOKUPS = {
  coilType: {
    COH: "Heating coil (COH)",
    COK: "Cooling coil (COK)",
    GXK:
      "Cooling coil family (Geniox GXK) — use field 3 (medium): W = chilled water → Cooler drawings; Dxx = DX/refrigerant context → Evapurator drawings",
    GXH:
      "Heating coil family (Geniox GXH) — drawing set: Heater folder for the tube geometry from field 4",
    GXHK:
      "Changeover coil (Geniox GXHK) — use Big Sizes changeover pack; tube geometry from field 4 still selects P25/P3012/P40 where applicable",
    GXC:
      "Coil family GXC (often cooling-side — use field 3 to tell water vs DX)",
    P60: `${DLL_COIL_TYPE_TABLE6["1"]}`,
    P3012: `${DLL_COIL_TYPE_TABLE6["2"]}`,
    P40: `${DLL_COIL_TYPE_TABLE6["94"]}`,
    P25: `${DLL_COIL_TYPE_TABLE6["113"]}`,
  },
  medium: {
    W: "Water",
    S: "Steam",
    G: "Glycol / brine (concentration per job spec)",
    E: "Electric (if applicable to product line)",
    R: "Refrigerant circuit context",
  },
  tubeCode: {
    "3": 'Tube OD 3/8" — drawing geometry folder P25 (match hosted P25/* pack)',
    "4": 'Tube OD 1/2" — drawing geometry folder P3012 (e.g. Calc98 "1/2\" (P3012)")',
    "5": 'Tube OD 5/8" — drawing geometry folder P40',
  },
  headerMaterial: {
    CU: "Copper headers (GEO.COIL DLL Table 10 maps header material Copper = numeric code 1 in cell 9)",
    "1": "Header material Copper (DLL Table 10, input cell 9)",
    "6": "Header material Steel (DLL Table 10, input cell 9)",
    SST: "Stainless steel headers",
    ST: "Stainless steel headers",
    FE: "Steel / ferrous headers",
    BR: "Brass headers",
  },
  finMaterial: {
    AI: "Aluminum fins (DLL Table 7: AL)",
    AL: "Aluminum fins (DLL Table 7: AL)",
    ALPR: "Pre-painted aluminum fins (DLL Table 7: ALPR)",
    CUSN: "CuSn fins (DLL Table 7)",
    AJ1: "Fin stock / finish code AJ1 (aluminum-family in DBM tables: AL, ALPR, AlMg2.5, etc.)",
    CU: "Copper fins (DLL Table 7: CU)",
    SST: "Stainless fins",
  },
  handing: {
    "0": "Left-hand (LH)",
    "1": "Right-hand (RH)",
    V: "Left-hand (LH), service-side code V",
    H: "Right-hand (RH), service-side code H",
    "2": "Handing / orientation code 2",
  },
};

/**
 * ManualeDBM / DBM “Available materials” tube blocks + hosted Tube Thickness.pdf excerpt:
 * - P25: tubes Cu / CuSn — thickness 0.30 / 0.50 mm
 */
const MANUAL_GEOMETRY_SPECS = {
  P25: {
    tubeOdMm: "(see ManualeDBM geometry overview for P25 tube OD)",
    pitchMm: "see ManualeDBM fin block for P25",
    thicknessMm: "0.30 / 0.50 (Cu, CuSn — Tube Thickness.pdf / Manuale)",
  },
  P3012: {
    tubeOdMm: "12.45",
    pitchMm: "30 x 26",
    thicknessMm: "0.35 / 0.40 / 0.60",
  },
  P40: {
    tubeOdMm: "16.45",
    pitchMm: "40 x 34.64",
    thicknessMm: "0.40 / 0.60 / 0.75 / 1.00 / 1.50",
  },
  P60: {
    tubeOdMm: "16.45",
    pitchMm: "60 x 30",
    thicknessMm: "0.40 / 0.60 / 0.75 / 1.00 / 1.50",
  },
};

/** Positions after splitting on "-" (0-based), for the long "detailed" code form */
const STANDARD_FIELDS = [
  { key: "coilType", label: "Coil type", lookup: "coilType" },
  { key: "size", label: "Geniox size", lookup: null },
  { key: "medium", label: "Medium", lookup: "medium" },
  { key: "tubeCode", label: "Tube diameter code", lookup: "tubeCode" },
  { key: "rows", label: "Number of rows", lookup: null },
  { key: "circuits", label: "Number of circuits", lookup: null },
  { key: "finDim1", label: "Fin height (mm)", lookup: null },
  { key: "finDim2", label: "Fin length (mm)", lookup: null },
  {
    key: "finPitch",
    label: "Fin pitch (mm)",
    lookup: null,
    hint:
      "DLL input cell 17; Table 8 lists standard pitches — common grid 2.0–12.0 mm depending on geometry (P60/P40/P3012/P25)",
  },
  { key: "headerMaterial", label: "Header material", lookup: "headerMaterial" },
  { key: "finMaterial", label: "Fin material", lookup: "finMaterial" },
  { key: "handing", label: "Handing (LH / RH)", lookup: "handing" },
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
    return `${MANIFOLD_INPUT_TABLE13[t]} (GEO.COIL Table 13 manifold input).`;
  }
  return null;
}

function explainFinMaterial(raw) {
  const direct = lookupCategory("finMaterial", raw);
  if (direct) return direct;
  if (/^A[J-Z]?\d*$/i.test(raw)) {
    return `Fin material / stock code "${raw}" (typically aluminum-series from product legend)`;
  }
  return null;
}

function meaningForField(field, raw, standardTokens = []) {
  if (raw == null || raw === "") return { text: "—", certain: true };
  const { key, lookup } = field;

  if (key === "medium" && /^D\d+/i.test(String(raw))) {
    const coil = String(standardTokens[0] || "").toUpperCase();
    if (coil === "GXK" || coil === "COK") {
      return {
        text: `DX / refrigerant medium code "${raw}" — GXK draws from Evapurator folder; geometry comes from tube field (digit 4 in code).`,
        certain: false,
      };
    }
    return {
      text: `DX / refrigerant-style medium code "${raw}" — most often used with GXK evaporator naming; confirm against submittal if coil type is not GXK.`,
      certain: false,
    };
  }
  if (key === "medium" && String(raw).toUpperCase() === "W") {
    const coil = String(standardTokens[0] || "").toUpperCase();
    if (coil === "GXH" || coil === "COH") {
      return {
        text:
          "Water/heating-fluid medium (W) — GXH heater coil: use Heater drawing folder set with geometry from field 4 (not the GXK cooler/evap wording).",
        certain: true,
      };
    }
    if (coil === "GXHK") {
      return {
        text:
          'Water medium (W) — GXHK changeover: follow bundled changeover / Big Sizes packages; tube geometry still from field 4 → P25/P3012/P40.',
        certain: false,
      };
    }
    return {
      text:
        "Water / chilled water (W) — GXK cooling coil: Cooler drawing folder with geometry from field 4 (e.g. chilled-water cooling coil).",
      certain: true,
    };
  }

  if (key === "handing" && String(raw).trim() === "2") {
    return { text: LOOKUPS.handing["2"], certain: false };
  }

  if (lookup && LOOKUPS[lookup]) {
    const hit = lookupCategory(lookup, raw);
    if (hit) return { text: hit, certain: true };
  }
  if (key === "finMaterial") {
    const ex = explainFinMaterial(raw);
    if (ex) return { text: ex, certain: false };
  }
  if (key === "size" && /^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    const bigHint =
      Number.isFinite(n) && n >= BIG_SIZES_GENIOX_MIN
        ? ` Big-cabinet line (≥${BIG_SIZES_GENIOX_MIN}): also use "Big Sizes (35–44)" coil brochures alongside P25/P3012/P40.`
        : Number.isFinite(n)
          ? ` Standard line (≤${BIG_SIZES_GENIOX_MIN - 1}): geometry folders P25/P3012/P40 only (unless GXHK).`
          : "";
    return {
      text: `Geniox size ${raw}.${bigHint}`,
      certain: true,
    };
  }
  if ((key === "rows" || key === "circuits") && /^\d+$/.test(raw)) {
    const dll =
      key === "rows"
        ? " — DLL input cell 15 (number of rows)"
        : " — DLL input cell 18 (number of circuits)";
    return { text: `${raw} (numeric segment)${dll}`, certain: true };
  }
  if (key === "tubeCode") {
    const geom = String(standardTokens[0] || "").toUpperCase();
    const gspec = MANUAL_GEOMETRY_SPECS[geom] || null;
    if (gspec) {
      const odLooksNumeric = /^[\d.]+$/.test(String(gspec.tubeOdMm).trim());
      const odText = odLooksNumeric ? `${gspec.tubeOdMm} mm` : gspec.tubeOdMm;
      const pitchLooksNumericPair = /\d/.test(String(gspec.pitchMm)) && /x/i.test(String(gspec.pitchMm));
      const pitchText = pitchLooksNumericPair ? `${gspec.pitchMm} mm` : gspec.pitchMm;
      return {
        text: `Geometry ${geom} (ManualeDBM / tube tables): tube OD ${odText}, tube pitch ${pitchText}, allowed tube thickness (mm): ${gspec.thicknessMm}.`,
        certain: true,
      };
    }
    const tube = lookupCategory("tubeCode", raw);
    if (tube) {
      return {
        text: tube,
        certain: true,
      };
    }
  }
  if (key === "finDim1" && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} mm — fin height (vertical finned dimension)`,
      certain: true,
    };
  }
  if (key === "finDim2" && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} mm — fin length (horizontal finned dimension along air path)`,
      certain: true,
    };
  }
  if (key === "finPitch" && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `Fin pitch ${raw} mm (fin spacing)`,
      certain: true,
    };
  }
  if (key === "connectionSize") {
    const t = String(raw).trim();
    if (MANIFOLD_INPUT_TABLE13[t]) {
      return {
        text: `${MANIFOLD_INPUT_TABLE13[t]} (GEO.COIL Table 13 manifold input).`,
        certain: true,
      };
    }
    if (
      /^\d+\s+\d+\/\d+(?:["'"′″]+)?$/i.test(raw.trim()) ||
      /^\d+(\s+\d+\/\d+)?(\s*["'"′″])?$/i.test(raw.trim())
    ) {
      return {
        text: `Connection / header nominal size ${raw}.`,
        certain: true,
      };
    }
    return {
      text: `Connection or suffix "${raw}" (e.g. single manifold, double manifold, twin take-off per job drawing).`,
      certain: false,
    };
  }
  return {
    text: `Code "${raw}" — not in this decoder’s shorthand table.`,
    certain: false,
  };
}

const DRAWING_STANDARD_GEOMS = ["P25", "P3012", "P40"];

function getDrawingsCatalog() {
  return Array.isArray(window.DBMM_COILS_DRAWINGS_INDEX) ? window.DBMM_COILS_DRAWINGS_INDEX : [];
}

/** Tube diameter code (field 4, 1-based position) → drawings root folder name. */
const TUBE_CODE_TO_DRAWING_GEOM = {
  "3": "P25",
  "4": "P3012",
  "5": "P40",
};

function inferGenioxSize(tokens) {
  const s = tokens[1] != null ? String(tokens[1]).trim() : "";
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || s === "") return null;
  return n;
}

function getCoilDimensionsCatalog() {
  if (typeof window === "undefined" || !window.DBMM_COIL_DIM || typeof window.DBMM_COIL_DIM !== "object")
    return null;
  return window.DBMM_COIL_DIM;
}

/** GX10.05 → 10 ; plain number in col A → rounded int. */
function gxLeadingGenioxFromCell(cell0) {
  const s = String(cell0 ?? "").trim();
  const m = s.match(/^GX\s*[,.]?\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const n = parseFloat(String(s).replace(",", "."));
  if (Number.isFinite(n) && /^\s*\d+(\.\d+)?\s*$/.test(s)) return Math.round(n);
  return null;
}

function circuitsColumnIndex(headers) {
  if (!Array.isArray(headers)) return -1;
  let i = headers.findIndex((h) => /CIRCUIT/i.test(String(h)));
  if (i >= 0) return i;
  i = headers.findIndex((h) => /NUMBER\s+OF\s+CIRCUITS/i.test(String(h)));
  return i;
}

/** Column with connection / Ø / manifold-style size (fractions like 1/2" or ØIN DN codes). */
function odOrConnectionColumnIndex(headers) {
  if (!Array.isArray(headers)) return -1;
  for (let i = 0; i < headers.length; i++) {
    const raw = String(headers[i] ?? "").trim();
    const u = raw.toUpperCase().replace(/\u00d8/g, "Ø");
    const compact = u.replace(/\s+/g, "");
    if (compact === "OD") return i;
    if (compact === "ØIN" || compact === "OIN") return i;
  }
  return -1;
}

/** GEO.COL Table 13 input cell values → nominal threaded inch size (approximate for row matching). */
const MANIFOLD_INPUT_TO_APPROX_INCHES = {
  "2": 0.75,
  "3": 1,
  "4": 1.25,
  "5": 1.5,
  "6": 2,
  "7": 2.5,
  "8": 3,
  "9": 4,
  "10": 5,
};

/**
 * Parses nominal inch size from coil field 13 (e.g. 1 1/2", 3/4, 1.5).
 */
function parseFractionInchesFromString(raw) {
  let s = String(raw ?? "")
    .trim()
    .replace(/[\u2033\u201d\u201c\u00ab\u00bb]/g, " ")
    .replace(/"/g, " ");
  if (!s) return null;
  s = s.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const wm = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (wm) {
    const w = parseInt(wm[1], 10);
    const num = parseInt(wm[2], 10);
    const den = parseInt(wm[3], 10);
    if (den) return w + num / den;
  }
  const fm = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fm) {
    const num = parseInt(fm[1], 10);
    const den = parseInt(fm[2], 10);
    if (den) return num / den;
  }
  const dec = parseFloat(s.replace(",", "."));
  return Number.isFinite(dec) ? dec : null;
}

function excelOdRoughlyMatchesCoil(odCell, coilInches) {
  if (coilInches == null || !Number.isFinite(coilInches)) return true;
  if (odCell == null || String(odCell).trim() === "") return true;
  const fromText = parseFractionInchesFromString(String(odCell));
  if (fromText != null && Math.abs(fromText - coilInches) < 0.065) return true;
  const k = String(odCell).trim();
  const m = MANIFOLD_INPUT_TO_APPROX_INCHES[k];
  if (m != null && Math.abs(m - coilInches) < 0.065) return true;
  const asNum = parseFloat(k.replace(",", "."));
  if (Number.isFinite(asNum) && asNum >= 1 && asNum <= 12 && Math.abs(asNum - Math.round(asNum)) < 1e-6) {
    const m2 = MANIFOLD_INPUT_TO_APPROX_INCHES[String(Math.round(asNum))];
    if (m2 != null && Math.abs(m2 - coilInches) < 0.065) return true;
  }
  return false;
}

/** Band like "6 TO 10" vs coil circuits token numeric. */
function circuitsBandAllowsCoil(bandCell, circuitsToken) {
  const t = String(circuitsToken ?? "").trim();
  if (!t || t === "*") return true;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return true;
  const b = bandCell != null ? String(bandCell).trim() : "";
  const rng = b.match(/(\d+)\s*(?:TO|-)\s*(\d+)/i);
  if (rng) return n >= parseInt(rng[1], 10) && n <= parseInt(rng[2], 10);
  const single = parseInt(b, 10);
  if (Number.isFinite(single)) return n === single;
  return true;
}

function rowMatchesGeniox(row0, geniox) {
  const c0 = row0;
  if (c0 == null || c0 === "") return false;
  if (typeof c0 === "number" && Number.isFinite(c0) && Math.round(c0) === geniox) return true;
  const gx = gxLeadingGenioxFromCell(c0);
  if (gx !== null && gx === geniox) return true;
  const pn = parseFloat(String(c0).replace(",", "."));
  if (Number.isFinite(pn) && Math.round(pn) === geniox) return true;
  return false;
}

/**
 * Filter pre-extracted spreadsheet rows by Geniox / block size (col A / UNIT column) and circuits band when applicable.
 * When the table has OD / ØIN and coil field 13 is a recognizable inch size, keep the best-matching diameter row(s).
 */
function matchDimensionRowsForGeniox(table, geniox, circuitsToken, connectionToken) {
  const headers = table.headers || [];
  const rows = table.rows || [];
  const cIdx = circuitsColumnIndex(headers);
  const odIdx = odOrConnectionColumnIndex(headers);
  const connTrim = connectionToken != null ? String(connectionToken).trim().replace(/\s+/g, " ") : "";
  const coilInches = connTrim ? parseFractionInchesFromString(connTrim.replace(/-/g, " ")) : null;
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    if (!rowMatchesGeniox(row[0], geniox)) continue;
    if (cIdx >= 0 && cIdx < row.length && row[cIdx] != null && String(row[cIdx]).trim() !== "") {
      if (!circuitsBandAllowsCoil(row[cIdx], circuitsToken)) continue;
    }
    out.push(row);
  }
  if (
    odIdx >= 0 &&
    coilInches != null &&
    out.length > 0 &&
    odIdx < headers.length
  ) {
    const filtered = out.filter((row) => excelOdRoughlyMatchesCoil(row[odIdx], coilInches));
    if (filtered.length) return filtered;
  }
  return out;
}

/**
 * Dimension XLS excerpts (bundled JS) apply for Geniox codes < 35, i.e. through 34 — matches standard-line coil tables.
 */
function resolveCoilDimensions(tokens) {
  const geniox = inferGenioxSize(tokens);
  const geometryKey = inferDrawingGeometry(tokens);
  const { apps } = inferDrawingApplications(tokens);
  if (geniox == null || geniox > DIMENSION_TABLE_GENIOX_MAX || !geometryKey) return null;

  const cat = getCoilDimensionsCatalog();
  if (!cat || !cat[geometryKey]) return null;

  const appsTry = apps.filter((a) => a !== "Changeover");
  const circuitsToken = tokens[5];
  const connectionToken = tokens.length > 12 ? tokens[12] : "";

  const gatherHits = (withCircuitsFilter) => {
    const out = [];
    for (const app of appsTry) {
      const table = cat[geometryKey][app];
      if (!table || !table.rows || !table.headers) continue;
      const tok = withCircuitsFilter ? circuitsToken : "*";
      for (const row of matchDimensionRowsForGeniox(table, geniox, tok, connectionToken)) {
        out.push({ app, row, table });
      }
    }
    return out;
  };

  let hits = gatherHits(true);
  if (!hits.length) hits = gatherHits(false);

  if (!hits.length) {
    const t0 = appsTry.map((app) => cat[geometryKey][app]).find(Boolean);
    return {
      geniox,
      geometry: geometryKey,
      application: appsTry.join(", ") || null,
      headers: (t0 && t0.headers) || null,
      matchedRows: [],
      layout: (t0 && t0.layout) || null,
      sourceRelPath: (t0 && t0.relPath) || null,
      sourceUrl: t0 && t0.relPath ? bundledDrawingUrl(t0.relPath) : "",
      note: `No row in bundled tables where block / UNIT matches Geniox ${geniox} for ${geometryKey} (${appsTry.join(", ")}) — table may list different numbering (DVH-Y / GX naming).`,
    };
  }

  const first = hits[0];
  const table = first.table;
  const sheetLabel = table.sheetName ? String(table.sheetName) : "";
  return {
    geniox,
    geometry: geometryKey,
    application: first.app,
    sheetName: sheetLabel || null,
    headers: table.headers,
    matchedRows: hits.map((h) => h.row),
    layout: table.layout,
    sourceRelPath: table.relPath,
    sourceUrl: table.relPath ? bundledDrawingUrl(table.relPath) : "",
    note: hits.length > 1 ? `${hits.length} matching rows (e.g. connection / circuit variants).` : null,
  };
}

/**
 * Coils drawings folder: explicit P25/P3012/P40 prefix, else Geniox tube code digit in field 4.
 */
function inferDrawingGeometry(tokens) {
  const t0 = String(tokens[0] || "")
    .toUpperCase()
    .trim();
  if (/^P25$/.test(t0)) return "P25";
  if (/^P3012$/.test(t0)) return "P3012";
  if (/^P40$/.test(t0)) return "P40";

  const tubeTok = String(tokens[3] != null ? tokens[3] : "").trim();
  return TUBE_CODE_TO_DRAWING_GEOM[tubeTok] || null;
}

function isGxkDxMedium(mediumRaw) {
  const m = String(mediumRaw || "").toUpperCase().trim();
  if (!m || m === "*") return false;
  if (m === "W" || m.startsWith("CW") || m === "CHW" || m === "CG") return false;
  if (/^D\d/.test(m)) return true;
  if (/(^|-)DX($|-)/.test(m) || /^R\d/.test(m)) return true;
  return false;
}

/**
 * GXH heating, GXK cooling (water vs DX by field 3), GXHK changeover → folder names under P25/P3012/P40 and Big Sizes.
 */
function inferDrawingApplications(tokens) {
  const coil = String(tokens[0] || "").toUpperCase().trim();
  const mediumRaw = tokens[2] != null ? tokens[2] : "";
  const medium = String(mediumRaw || "").toUpperCase().trim();

  if (coil === "COH" || coil === "GXH") {
    return { apps: ["Heater"], note: null };
  }
  if (coil === "COK") return { apps: ["Cooler"], note: null };
  if (coil === "GXHK") {
    return {
      apps: ["Changeover"],
      note: 'GXHK changeover — primary standard pack lives under drawings "Big Sizes (35-44)" (changeover brochure); geometry folders P25/P3012/P40 use field 4 for related size packs.',
    };
  }

  if (coil === "GXK") {
    if (medium === "W" || medium.startsWith("CW")) {
      return {
        apps: ["Cooler"],
        note: "GXK + W (water / chilled water) → AHU cooling coil set (Cooler folder), e.g. CW cooling coil.",
      };
    }
    if (isGxkDxMedium(mediumRaw)) {
      return {
        apps: ["Evapurator"],
        note: "GXK + DX / refrigerant-style medium (e.g. D35) → evaporator DX set (Evapurator folder — Calc98 spells 'Evapurator').",
      };
    }
    return {
      apps: ["Cooler", "Evapurator"],
      note: 'GXK + unclear medium — showing both Cooler (water) and Evapurator (DX). Field 3: use W for water, patterns like D35 for DX.',
    };
  }

  if (coil === "GXC") {
    if (medium === "W" || medium.startsWith("CW")) return { apps: ["Cooler"], note: null };
    if (isGxkDxMedium(mediumRaw)) return { apps: ["Evapurator"], note: null };
    return { apps: ["Cooler"], note: "GXC: defaulted to Cooler set — use field 3 for water vs DX." };
  }

  if (/COND/.test(coil)) return { apps: ["Condenser"], note: null };
  if (/EVAP|^DX|^ED/.test(coil)) return { apps: ["Evapurator"], note: null };

  if (medium === "S") {
    return { apps: ["Heater"], note: "Fluid code S: steam heater drawing set." };
  }

  const all = ["Heater", "Cooler", "Evapurator", "Condenser", "Changeover"];
  return {
    apps: all,
    note: `Coil type "${tokens[0] || ""}" not mapped tightly — listing all packs. Prefer GXH (heat), GXK (cool), GXHK (changeover) with field 4 = P25/P3012/P40 tube digit.`,
  };
}

function bigSizeMatchesEntry(entry, geometryKey, apps) {
  const n = String(entry.name || "").toUpperCase();
  return apps.some((a) => {
    if (a === "Changeover") return n.includes("CHANGEOVER");
    if (a === "Cooler") return n.includes("COOLING");
    if (a === "Evapurator") return n.includes("EVAPORATING");
    if (a === "Condenser") return n.includes("CONDENS") && !n.includes("COOLING");
    if (a === "Heater") {
      if (!geometryKey) return n.includes("HEATING");
      return n.includes("HEATING") && (n.endsWith(`-${geometryKey}.PDF`) || n.endsWith(`-${geometryKey}.pdf`));
    }
    return false;
  });
}

/** First representative PDF for on-page preview (skip Reference packs and XLSX). */
function pickPrimaryDrawingPdf(files, options = {}) {
  const preferBig = Boolean(options.preferBigSizes);
  if (!files || !files.length) return null;
  const candidates = files.filter((f) => String(f.ext || "").toLowerCase() === ".pdf" && f.geometry !== "Reference");
  if (!candidates.length) return null;

  let pool = candidates;
  if (preferBig) {
    const big = candidates.filter((f) => f.geometry === "Big Sizes (35-44)");
    if (big.length) pool = big;
  }

  const page1 = pool.find((f) => /(^|_)PAGE_1\.PDF$/i.test(String(f.name || "")));
  if (page1) return page1;
  pool.sort((a, b) => String(a.relPath || "").localeCompare(String(b.relPath || "")));
  return pool[0];
}

function selectDrawingReferences(tokens) {
  const catalog = getDrawingsCatalog();
  if (catalog.length === 0) {
    return {
      geometry: null,
      applications: [],
      files: [],
      note: "Drawing index not loaded. Include coilsDrawingsIndex.js (local) or coils-drawings-index.json on a web server.",
    };
  }

  const geometryKey = inferDrawingGeometry(tokens);
  const genioxN = inferGenioxSize(tokens);
  const { apps, note: appNote } = inferDrawingApplications(tokens);
  const geomsToScan = geometryKey ? [geometryKey] : DRAWING_STANDARD_GEOMS;
  const appsForPacks = apps.filter((a) => a !== "Changeover");
  const solelyChangeover = apps.length === 1 && apps[0] === "Changeover";

  /** Big Sizes brochures for heater/cooler/evap/etc. apply only above Geniox 31; GXHK changeover stays on Big Sizes at any numeric size. */
  const mergeBigSizesPacks =
    solelyChangeover || (genioxN != null && genioxN >= BIG_SIZES_GENIOX_MIN);

  const picked = [];
  for (const g of geomsToScan) {
    for (const entry of catalog) {
      if (entry.geometry !== g) continue;
      if (!appsForPacks.includes(entry.application)) continue;
      picked.push(entry);
    }
  }

  let bigOnes = catalog.filter((e) => e.geometry === "Big Sizes (35-44)" && bigSizeMatchesEntry(e, geometryKey, apps));
  if (!mergeBigSizesPacks) bigOnes = [];
  for (const b of bigOnes) {
    picked.push(b);
  }

  const seen = new Set();
  const files = [];
  for (const p of picked) {
    if (seen.has(p.relPath)) continue;
    seen.add(p.relPath);
    files.push(p);
  }

  const refDocs = catalog.filter((e) => e.geometry === "Reference");
  for (const r of refDocs) {
    if (seen.has(r.relPath)) continue;
    seen.add(r.relPath);
    files.push(r);
  }

  const preferBigForPreview =
    mergeBigSizesPacks && Boolean(bigOnes.length);
  files.sort((a, b) => {
    const ra = a.geometry === "Reference" ? 2 : 0;
    const rb = b.geometry === "Reference" ? 2 : 0;
    const ba =
      preferBigForPreview && a.geometry === "Big Sizes (35-44)" ? 0 : 1;
    const bb =
      preferBigForPreview && b.geometry === "Big Sizes (35-44)" ? 0 : 1;
    if (ba !== bb) return ba - bb;
    if (ra !== rb) return ra - rb;
    const ga = String(a.geometry);
    const gb = String(b.geometry);
    if (ga !== gb) return ga.localeCompare(gb);
    const aa = String(a.application);
    const ab = String(b.application);
    if (aa !== ab) return aa.localeCompare(ab);
    return String(a.name).localeCompare(String(b.name));
  });

  const tubeHint = geometryKey ? geometryKey : "field 4 not 3|4|5 — pick geometry manually";
  const sizeHint =
    genioxN == null
      ? "Geniox size unset/* — assuming standard folders only unless GXHK."
      : genioxN >= BIG_SIZES_GENIOX_MIN || solelyChangeover
        ? `Geniox ${genioxN}: include "Big Sizes (35–44)" brochures where they match.${solelyChangeover && genioxN != null && genioxN < BIG_SIZES_GENIOX_MIN ? " GXHK keeps changeover pack for any size." : ""}`
        : `Geniox ${genioxN}: use P25/P3012/P40 folders only (no Big Sizes heater/cooler packs).`;

  const selectionSummary = `Drawings narrowed by coil prefix (${String(tokens[0] || "").toUpperCase()}), medium (field 3), tube/folder geometry ${tubeHint}. ${sizeHint}`;
  const primary = pickPrimaryDrawingPdf(files, {
    preferBigSizes: preferBigForPreview || solelyChangeover,
  });
  const primaryPdfRelPath = primary ? primary.relPath : null;
  const primaryPdfUrl = primaryPdfRelPath ? bundledDrawingUrl(primaryPdfRelPath) : "";

  return {
    geometry: geometryKey,
    applications: apps,
    files,
    note: appNote,
    selectionSummary,
    primaryPdfRelPath,
    primaryPdfUrl,
    primaryPdfName: primary ? primary.name : null,
  };
}

function encodeDrawingPathSegments(relPath) {
  return String(relPath || "")
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Base URL for drawing files bundled next to index as ./drawings/ (GitHub Pages + local server). */
function bundledDrawingsBaseUrl() {
  if (typeof window === "undefined" || !window.location || !window.location.href) return "";
  try {
    return new URL("./drawings/", window.location.href).href;
  } catch (_) {
    return "";
  }
}

function bundledDrawingUrl(relPath) {
  const base = bundledDrawingsBaseUrl();
  if (!base || !relPath) return "";
  try {
    return new URL(encodeDrawingPathSegments(relPath), base).href;
  } catch (_) {
    return "";
  }
}

function appendDrawingRefsToSummary(lines, pack) {
  lines.push('COILS DRAWINGS (repo / site: path "drawings/<relPath>" under this app)');
  lines.push("---------------------------------------------------------");
  if (!pack || !pack.files || pack.files.length === 0) {
    lines.push(pack && pack.note ? pack.note : "No drawing references available.");
    lines.push("");
    return;
  }
  lines.push(
    `Folders: geometry ${pack.geometry || "? (field 4 → P25|P3012|P40)"} | drawing sets: ${pack.applications.join(", ")}`,
  );
  if (pack.selectionSummary) lines.push(pack.selectionSummary);
  if (pack.note) lines.push(`Note: ${pack.note}`);
  if (pack.primaryPdfRelPath) lines.push(`Primary PDF for preview/list: ${pack.primaryPdfRelPath}`);
  lines.push(
    `Files (${pack.files.length}) — URLs under "./drawings/" (includes Reference/* such as tube thickness tables).`,
  );
  const wantUrls = typeof window !== "undefined" && window.location;
  for (const f of pack.files) {
    const tag = f.ext === ".xlsx" ? "XLSX" : "PDF";
    lines.push(`- [${tag}] ${f.relPath}`);
    if (wantUrls) {
      const url = bundledDrawingUrl(f.relPath);
      if (url) lines.push(`  ${url}`);
    }
  }
  lines.push("");
}

/**
 * Optional trailing tokens after the 12 standard positions (e.g. D2, tt, connection notes).
 */
function parseCoilCode(input) {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    return {
      ok: false,
      error: "Enter a coil code.",
      tokens: [],
      rows: [],
      extra: [],
      supplierText: "",
      drawingPack: { files: [], note: null, geometry: null, applications: [] },
      dimensionHits: null,
    };
  }

  const standardCount = STANDARD_FIELDS.length;
  const standardTokens = tokens.slice(0, standardCount);
  const extra = tokens.slice(standardCount);

  const rows = STANDARD_FIELDS.map((field, i) => {
    const raw = standardTokens[i] ?? "";
    const m = meaningForField(field, raw, standardTokens);
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
        ? `${m13} Trailing segment after the 12 standard fields.`
        : `Trailing segment "${raw}" — optional flags, plating, distributor, or connection note per product naming.`,
      certain: Boolean(m13),
      missing: false,
    };
  });

  const allRows = rows.concat(extraRows);
  const drawingPack = selectDrawingReferences(tokens);
  const dimensionHits = resolveCoilDimensions(tokens);
  const supplierText = buildSupplierSummary(input, allRows, drawingPack);

  return {
    ok: true,
    error: null,
    tokens,
    rows: allRows,
    extra,
    supplierText,
    drawingPack,
    dimensionHits,
  };
}

function buildSupplierSummary(original, rows, drawingPack) {
  const lines = [
    "COIL ORDER / RFQ SUMMARY (decoded from DBM-style code — check before order)",
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
    "- GEO.COIL DLL result cell 30 (Table 3) gives the complete coil denomination from Calc98 — good cross-check vs this string.",
  );
  lines.push(
    "- Water coils (DLL doc examples): normal connection size (e.g. 3 in), double manifold (e.g. 2x3 in), single manifold with double connection (e.g. 3 in (x2)).",
  );
  lines.push("- Handing, connections, casing, and duty (kW / Δp / flow) stay with the formal order package.");
  lines.push("- This hyphen decode is a quick field map; drawings and factory order wording win on conflicts.");
  appendDrawingRefsToSummary(lines, drawingPack);
  return lines.join("\n");
}

window.DBM_PARSER = {
  LOOKUPS,
  STANDARD_FIELDS,
  GEO_COIL_DOC_NOTE,
  MANIFOLD_INPUT_TABLE13,
  DLL_COIL_TYPE_TABLE6,
  BIG_SIZES_GENIOX_MIN,
  DIMENSION_TABLE_GENIOX_MAX,
  normalizeInput,
  tokenize,
  parseCoilCode,
  selectDrawingReferences,
  inferDrawingGeometry,
  inferDrawingApplications,
  inferGenioxSize,
  resolveCoilDimensions,
  bundledDrawingsBaseUrl,
  bundledDrawingUrl,
  encodeDrawingPathSegments,
};
