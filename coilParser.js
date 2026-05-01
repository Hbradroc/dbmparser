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
      "Cooling coil family (Geniox GXK) — use field 3 (medium): W = chilled water → Cooler drawings; Dxx = DX/refrigerant context → Evapurator drawings",
    GXH:
      "Heating coil family (Geniox GXH) — drawing set: Heater folder for the tube geometry from field 4",
    GXHK:
      "Changeover coil (Geniox GXHK) — use Big Sizes changeover pack; tube geometry from field 4 still selects P25/P3012/P40 where applicable",
    GXC:
      "Coil family GXC (often cooling-side — confirm water vs DX using field 3)",
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

function meaningForField(field, raw, standardTokens = []) {
  if (raw == null || raw === "") return { text: "—", certain: true };
  const { key, lookup } = field;

  if (key === "medium" && /^D\d+/i.test(String(raw))) {
    return {
      text: `DX / refrigerant-side medium code "${raw}" (Calc98 coil string) — for GXK, use Evapurator drawing folder with geometry from field 4.`,
      certain: false,
    };
  }
  if (key === "medium" && String(raw).toUpperCase() === "W") {
    return {
      text: 'Water / chilled water (W) — for GXK, use Cooler drawing folder with geometry from field 4 (e.g. CW cooling coil).',
      certain: true,
    };
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
    return {
      text: `Geniox size code ${raw} (numeric cabinet / coil size class on submittal — match to Geniox sizing tables)`,
      certain: false,
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
        text: `${tube}. ManualeDBM ties tube OD to geometry selection (P3012/P40/P60), so confirm this numeric tube code against your project legend.`,
        certain: false,
      };
    }
  }
  if (key === "finDim1" && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} mm — fin height (vertical finned dimension; confirm on Coils drawings / submittal)`,
      certain: false,
    };
  }
  if (key === "finDim2" && /^\d+(\.\d+)?$/.test(raw)) {
    return {
      text: `${raw} mm — fin length (horizontal finned dimension along air path; confirm on Coils drawings / submittal)`,
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
    return { apps: ["Cooler"], note: "GXC: defaulted to Cooler set — verify field 3 (water vs DX)." };
  }

  if (/COND/.test(coil)) return { apps: ["Condenser"], note: null };
  if (/EVAP|^DX|^ED/.test(coil)) return { apps: ["Evapurator"], note: null };

  if (medium === "S") {
    return { apps: ["Heater"], note: "Fluid code S: steam heater drawings (verify vs submittal)." };
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
function pickPrimaryDrawingPdf(files) {
  if (!files || !files.length) return null;
  const candidates = files.filter((f) => String(f.ext || "").toLowerCase() === ".pdf" && f.geometry !== "Reference");
  if (!candidates.length) return null;
  const page1 = candidates.find((f) => /(^|_)PAGE_1\.PDF$/i.test(String(f.name || "")));
  if (page1) return page1;
  candidates.sort((a, b) => String(a.relPath || "").localeCompare(String(b.relPath || "")));
  return candidates[0];
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
  const { apps, note: appNote } = inferDrawingApplications(tokens);
  const geomsToScan = geometryKey ? [geometryKey] : DRAWING_STANDARD_GEOMS;
  const appsForPacks = apps.filter((a) => a !== "Changeover");

  const picked = [];
  for (const g of geomsToScan) {
    for (const entry of catalog) {
      if (entry.geometry !== g) continue;
      if (!appsForPacks.includes(entry.application)) continue;
      picked.push(entry);
    }
  }

  const bigOnes = catalog.filter((e) => e.geometry === "Big Sizes (35-44)" && bigSizeMatchesEntry(e, geometryKey, apps));
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

  files.sort((a, b) => {
    const ra = a.geometry === "Reference" ? 1 : 0;
    const rb = b.geometry === "Reference" ? 1 : 0;
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
  const selectionSummary = `Drawings narrowed by coil prefix (${String(tokens[0] || "").toUpperCase()}), medium (field 3), and tube / folder geometry ${tubeHint}.`;
  const primary = pickPrimaryDrawingPdf(files);
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
        ? `${m13} Applied as trailing token on this hyphen split — confirm against drawing.`
        : `Trailing segment "${raw}" — variant flag, plating (e.g. electro tinning), distributor code, or drawing note (verify submittal / DBM naming).`,
      certain: false,
      missing: false,
    };
  });

  const allRows = rows.concat(extraRows);
  const drawingPack = selectDrawingReferences(tokens);
  const supplierText = buildSupplierSummary(input, allRows, drawingPack);

  return {
    ok: true,
    error: null,
    tokens,
    rows: allRows,
    extra,
    supplierText,
    drawingPack,
  };
}

function buildSupplierSummary(original, rows, drawingPack) {
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
  appendDrawingRefsToSummary(lines, drawingPack);
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
  selectDrawingReferences,
  inferDrawingGeometry,
  inferDrawingApplications,
  bundledDrawingsBaseUrl,
  bundledDrawingUrl,
  encodeDrawingPathSegments,
};
