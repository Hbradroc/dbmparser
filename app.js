if (!window.__DBM_APP_INIT__) {
  window.__DBM_APP_INIT__ = true;

const $ = (sel) => document.querySelector(sel);

const inputEl = $("#coil-input");
const btnDecode = $("#btn-decode");
const btnClear = $("#btn-clear");
const btnCopy = $("#btn-copy-summary");
const btnReportPdf = $("#btn-report-pdf");
const errEl = $("#error-msg");
const tableBody = $("#decode-body");
const segmentsEl = $("#segments");
const summaryEl = $("#supplier-summary");
const toastEl = $("#toast");
const drawingsRootEl = $("#drawings-root");
const drawingsMetaEl = $("#drawings-meta");
const drawingsListEl = $("#drawings-list");
const drawingPreviewMetaEl = $("#drawing-preview-meta");
const drawingPreviewSlotEl = $("#drawing-preview-slot");
const drawingPreviewNoneEl = $("#drawing-preview-none");
const drawingPdfFrameEl = $("#drawing-pdf-frame");
const dimExcelTitleEl = $("#dim-excel-title");
const dimExcelMetaEl = $("#dim-excel-meta");
const dimExcelWrapEl = $("#dim-excel-table-wrap");
const ocrFileEl = $("#ocr-file");
const btnOcrPick = $("#btn-ocr-pick");
const ocrStatusEl = $("#ocr-status");
const ocrDebugEl = $("#ocr-debug");
const ocrDebugPreEl = $("#ocr-debug-pre");

const LS_DRAWINGS_ROOT = "dbmCoilsDrawingsRoot";

const parser = window.DBM_PARSER;
const parseCoilCode = parser && typeof parser.parseCoilCode === "function" ? parser.parseCoilCode : null;

/** Persisted for standalone HTML / print report (same session). */
const reportSnapshot = {
  coilCode: "",
  /** data URL of last image used for OCR */
  ocrDataUrl: null,
  decodedAt: null,
  decodeResult: null,
};

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function trimEmptyDimensionColumns(headers, rows) {
  const hs = Array.isArray(headers) ? headers : [];
  const rs = Array.isArray(rows) ? rows.filter((r) => Array.isArray(r)) : [];
  const maxCols = Math.max(hs.length, ...rs.map((r) => r.length), 0);
  const cols = [];
  for (let j = 0; j < maxCols; j++) {
    const hasVal = rs.some((r) => {
      const v = r[j];
      return v != null && String(v).trim() !== "";
    });
    if (hasVal) cols.push(j);
  }
  return {
    headers: cols.map((j) => hs[j] ?? `C${j + 1}`),
    rows: rs.map((r) => cols.map((j) => r[j] ?? "")),
  };
}

/** Longest first so GXHK beats GXK and GXK beats GX at the same slice offset. */
const COIL_PREFIX_ORDER = ["GXHK", "GXK", "GXH", "COH", "COK"];

/** Canonical segment count after coil type (= fin pitch … connection). */
const OCR_STANDARD_TAIL_COUNT =
  parser && Array.isArray(parser.STANDARD_FIELDS) && parser.STANDARD_FIELDS.length > 1
    ? parser.STANDARD_FIELDS.length - 1
    : 12;

/**
 * Extra hyphen tokens beyond the nominal table width so mis-read fin codes like AI11→AI1+1
 * do not steal the segment budget and drop trailing `1 1/2`.
 */
const OCR_TAIL_SEGMENT_SLACK = 5;

/** Max tokens eaten after GXH/GXK… before hard stop — larger than STANDARD + slack. */
const OCR_MAX_SEGMENTS_AFTER_PREFIX = OCR_STANDARD_TAIL_COUNT + OCR_TAIL_SEGMENT_SLACK;

/** Accept partial OCR (missing a tail field); still prefer fuller strings via scoreOcrCandidate. */
const OCR_MIN_SEGMENTS_AFTER_PREFIX = 8;

/**
 * Sliding-window prefix match works when Tesseract glues digits to GXH/GXK (GXH11-… drops the \b after H).
 */
function findCoilHeadMatches(lu) {
  const s = String(lu || "");
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let best = "";
    const slice = s.slice(i);
    for (const name of COIL_PREFIX_ORDER) {
      if (slice.startsWith(name) && name.length > best.length) best = name;
    }
    if (!best) continue;
    const prev = i > 0 ? s[i - 1] : "";
    if (/[A-Z0-9_]/.test(prev)) continue;
    const after = s[i + best.length];
    if (after !== undefined && /[A-Z]/.test(after)) continue;
    out.push({ pfx: best, tail: i + best.length });
  }
  return out;
}

/** Only separators between cursor and next token — allows `/` gaps from fractional sizes. */
function sliceIsGlueOnly(slice) {
  return String(slice || "").replace(/[\s\-_:,·|\\/'"`]+/g, "").length === 0;
}

/** Labels from the row below / beside the coil line that OCR sometimes merges; never treat as coil tokens. */
const OCR_COIL_SEGMENT_STOP = new Set([
  "WATER",
  "TRAP",
  "PCS",
  "DRIP",
  "TRAY",
  "DRIPTRAY",
  "FPI",
  "THICKNESS",
  "SPACING",
  "STAINLESS",
  "ALUMINUM",
  "COPPER",
  "DIAMETER",
  "SERVICE",
  "FROST",
  "GUARD",
  "RECOMMENDED",
  "TAP",
]);

/** First token chunk in a hyphen or flexible-spaced coil run ("1 1/2", optional inch marks, fused 1"1/2, pitches, AJ1). */
function matchLeadingCoilSegment(rest) {
  const str = String(rest || "");
  return (
    /^(\d+\s+\d+\s*\/\s*\d+(?:\s*["'"′″]+)?|\d+"?\s*\d+\s*\/\s*\d+)/i.exec(str) ||
    /^(\d+\.\d+|[A-Z]{1,14}\d*|\d+)/i.exec(str)
  );
}

function normalizeOcrToken(t) {
  let s = String(t || "").replace(/\s+/g, " ").trim();
  let inch = "";
  if (/["'"′″]+$/.test(s)) {
    s = s.replace(/["'"′″]+$/g, "").trim();
    inch = '"';
  }
  const fr = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/i.exec(s);
  if (fr) return `${fr[1]} ${fr[2]}/${fr[3]}${inch}`;
  return inch ? `${s}${inch}` : s;
}

/** Tesseract splits fin stock like AI11 into AI1 + 1; merge before joining. */
function squashOcrFinMaterialSplits(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = String(tokens[i] || "");
    const b = i + 1 < tokens.length ? String(tokens[i + 1] || "") : "";
    if (b && /^[A-Z]{2}\d$/i.test(a) && /^[0-9]$/i.test(b)) {
      out.push(`${a}${b}`);
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

/** If code ends at handing `-H/-LH/…` and OCR line still has `-1 1/2`, append it. */
function appendTrailingConnectionFraction(code, lu) {
  let c = String(code || "").replace(/\s+/g, " ").trim();
  const pool = String(lu || "").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim().toUpperCase();
  if (!c || !pool) return code;
  const segments = c.split("-");
  const last = segments[segments.length - 1] || "";
  if (/\s+\d+\/\d+|^\d\s+\d+\/\d+/i.test(last) || /\d\/\d/.test(last)) return code;
  if (!/^(H|LH|RH|L|R|2)$/i.test(last)) return code;

  const fullAnch = segments.join("-").toUpperCase();
  const altFullAnch = fullAnch.replace(/-([A-Z]{2}\d)-(\d)(-H)$/i, "-$1$2$3");
  let ix = -1;
  let matchLen = 0;
  const tryFull = altFullAnch !== fullAnch ? [fullAnch, altFullAnch] : [fullAnch];
  for (const a of tryFull) {
    const j = pool.indexOf(a);
    if (j >= 0) {
      ix = j;
      matchLen = a.length;
      break;
    }
  }
  if (ix < 0 && segments.length > 6) {
    const tail = segments.slice(-10).join("-").toUpperCase();
    const altTail = tail.replace(/-([A-Z]{2}\d)-(\d)(-H)$/i, "-$1$2$3");
    for (const a of [tail, altTail]) {
      const j = pool.lastIndexOf(a);
      if (j >= 0) {
        ix = j;
        matchLen = a.length;
        break;
      }
    }
  }
  if (ix < 0) return code;
  const rest = pool.slice(ix + matchLen).trim();
  const m = /^[\s,.|_-]*(?:[-–]\s*)?(\d+)\s+(\d+\/\d+)\s*(["'"′″]*)/.exec(rest);
  if (!m) return code;
  const frac = normalizeOcrToken(`${m[1]} ${m[2]}${m[3] || ""}`);
  return frac ? `${c}-${frac}` : code;
}

/** Bridge line breaks OCR inserts inside coil strings (horizontal table lines). */
function deepCleanCoilImageOcr(raw) {
  let s = String(raw || "");
  s = s.replace(/\r/g, "\n");
  s = s.replace(/([A-Za-z0-9.])\s*\n\s*([A-Za-z0-9.])/g, "$1 $2");
  s = s.replace(/([GXH gxh])(?:\s*\n\s*)+([XKHKxk])/gi, "$1$2");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n+/g, " ");
}

function preprocessCoilOcr(raw) {
  let s = deepCleanCoilImageOcr(raw);
  s = s
    .replace(/\r?\n|[\x0b\x0c\u0085\u2028\u2029]/g, " ")
    .replace(/[`´]/g, "'")
    .replace(/[·•|\uFF5C│┃]/g, " ")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s*\/\s*/g, "/");
  s = s.replace(/\(\s*\d+\s*%\s*\)/g, " ");
  s = s.replace(/\(\s*[^)]*\)/g, " ");
  s = s.replace(/coil\s*codes?:?\s*/gi, " ");
  s = s.replace(/hyphen(?:ated)?\s*code[:]?\s*/gi, " ");
  s = s.replace(/\b(?:G\s*[I1il|]\s*[Xx]\s*[Hhs])\b|\bGYH\b|\b(?:G\s*[6Gb]\s*X\s*H)\b|\b(?:G\s*X\s*H)\b|\bCXH\b|\bQXH\b/gi, "GXH");
  s = s.replace(/\bG\s+X\s+[Kk]\b|\bG\s+X\s+X\s+H\s*K\b|\bQXK\b/gi, "GXK");
  s = s.replace(/\b(?:G\s*X\s*H\s*[Kk])\b/gi, "GXHK");
  s = s.replace(/\bC\s+[OØ0]\s+[Hhs]\b/gi, "COH");
  s = s.replace(/\bC\s+[OØ0]\s+[Kk]\b/gi, "COK");
  s = s.replace(/\bGX\s*[.,]?\s*HK\b/gi, "GXHK");
  s = s.replace(/\bGX\s*[.,]?\s*K\b/gi, "GXK");
  s = s.replace(/\bGX\s*[.,]?\s*H\b/gi, "GXH");
  /** “Al…” (fin aluminum on submittals) often OCRs as “Ai…” (roman I vs sans-serif l). Fix before uppercase. */
  s = s.replace(/\bAi(\d{1,3})\b/gi, "Al$1");
  s = s.replace(/\bAi\s+(\d{1,3})\b/gi, "Al $1");
  s = s.replace(/\bAl\s+(\d{1,3})\b/gi, "Al$1");
  /** After Cu tubes, hyphenated AI## on these GEO-style sheets is almost always AL## fin naming. */
  s = s.replace(/\bCU-AI(\d{1,3})\b/gi, "CU-AL$1");
  s = s.replace(/\bCU-AI\s+(\d{1,3})\b/gi, "CU-AL$1");
  s = s.replace(/\bAI\s+11\b/gi, "AI11");
  s = s.replace(/\bAJ\s*1\b/gi, "AJ1");
  s = s.replace(/\bA[Ll1Ii|]\s*11\b|\bALI\s*1\b/gi, "AL11");
  s = s.replace(/\b(\d+)\s*["'′″]+\s*\s+(\d+)\s*\/\s*(\d+)/g, '$1 $2/$3');
  s = s.replace(/\b(\d+)\s*\.\s*(\d+)\b/g, "$1.$2");
  s = s.replace(/\s*-\s*/g, "-");
  s = s.replace(/\s+:+\s*/g, " ");
  s = s.replace(/-+/g, "-");
  s = s.replace(/\s+/g, " ");
  return s.trim().toUpperCase();
}

function skipHyphenGlue(s, i) {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j++;
  if (j < s.length && /[-—_:]/.test(s[j])) {
    j++;
    while (j < s.length && /\s/.test(s[j])) j++;
  }
  return j;
}

/** Between OCR tokens when hyphenators are weak (table gaps, slashes, commas). */
function skipFlexibleTokenBoundary(s, i) {
  let j = i;
  for (let hop = 0; hop < 3; hop++) {
    while (j < s.length && /[\s|,:;_·•]/.test(s[j])) j++;
    while (j < s.length && /[-—]/.test(s[j])) j++;
  }
  return j;
}

function consumeHyphenSegments(s, idx, maxTokens) {
  const cap = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : OCR_MAX_SEGMENTS_AFTER_PREFIX;
  const tokens = [];
  let i = idx;
  for (let guard = 0; guard < 28; guard++) {
    if (tokens.length >= cap) break;
    const j = skipHyphenGlue(s, i);
    i = j;
    if (i >= s.length || !/[A-Z0-9.]/.test(s[i])) break;
    const rest = s.slice(i);
    const hm = matchLeadingCoilSegment(rest);
    if (!hm) break;
    const piece = hm[1].replace(/\s+/g, "").toUpperCase();
    if (OCR_COIL_SEGMENT_STOP.has(piece)) break;
    tokens.push(normalizeOcrToken(hm[1]));
    i += hm[0].length;
  }
  return { tokens, end: i };
}

function consumeFlexibleSegments(s, idx, maxTokens) {
  const cap = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : OCR_MAX_SEGMENTS_AFTER_PREFIX;
  const tokens = [];
  let i = idx;
  for (let guard = 0; guard < 28; guard++) {
    if (tokens.length >= cap) break;
    const jHyp = skipHyphenGlue(s, i);
    const jFlex = skipFlexibleTokenBoundary(s, i);
    i = Math.min(jHyp, jFlex);
    if (i >= s.length || !/[A-Z0-9.]/.test(s[i])) break;
    const rest = s.slice(i);
    const hm = matchLeadingCoilSegment(rest);
    if (!hm) break;
    const compact = hm[1].replace(/\s+/g, "").toUpperCase();
    if (OCR_COIL_SEGMENT_STOP.has(compact)) break;
    tokens.push(normalizeOcrToken(hm[1]));
    i += hm[0].length;
  }
  return { tokens, end: i };
}

/** Hyphen-delimited and/or glued runs (GXH11W55…); tries several skip offsets per token. */
function consumeAdaptiveSegments(s, idx, maxTokens) {
  const cap = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : OCR_MAX_SEGMENTS_AFTER_PREFIX;
  const tokens = [];
  let i = idx;
  for (let guard = 0; guard < 32; guard++) {
    if (tokens.length >= cap) break;
    const starts = [...new Set([i, skipHyphenGlue(s, i), skipFlexibleTokenBoundary(s, i)])].sort((a, b) => a - b);
    let chosen = null;
    let at = -1;
    for (const st of starts) {
      if (st > i && !sliceIsGlueOnly(s.slice(i, st))) continue;
      if (st >= s.length || !/[A-Z0-9.]/.test(s[st])) continue;
      const m = matchLeadingCoilSegment(s.slice(st));
      if (m) {
        chosen = m;
        at = st;
        break;
      }
    }
    if (!chosen || at < 0) break;
    const compact = chosen[1].replace(/\s+/g, "").toUpperCase();
    if (OCR_COIL_SEGMENT_STOP.has(compact)) break;
    tokens.push(normalizeOcrToken(chosen[1]));
    i = at + chosen[0].length;
  }
  return { tokens, end: i };
}

function scoreOcrCandidate(pfx, tokens) {
  if (tokens.length < OCR_MIN_SEGMENTS_AFTER_PREFIX) return -1;
  const candidate = `${pfx}-${tokens.join("-")}`;
  let rank = tokens.length * 10 + (tokens.length >= OCR_STANDARD_TAIL_COUNT ? 50 : 0);
  if (parseCoilCode) {
    const r = parseCoilCode(candidate);
    if (r.ok) rank += 800;
  }
  return rank;
}

function extractCoilCodeFromOcrText(rawText) {
  const raw = String(rawText || "");
  const variants = new Set([
    preprocessCoilOcr(raw),
    preprocessCoilOcr(raw.replace(/\//g, " / ")),
    preprocessCoilOcr(deepCleanCoilImageOcr(raw)),
  ].filter(Boolean));
  let best = "";
  let bestRank = -1;
  const luBlob = [...variants].join("\n");
  for (const lu of variants) {
    const heads = findCoilHeadMatches(lu);
    for (const { pfx, tail } of heads) {
      for (const consume of [consumeAdaptiveSegments, consumeHyphenSegments, consumeFlexibleSegments]) {
        let { tokens } = consume(lu, tail, OCR_MAX_SEGMENTS_AFTER_PREFIX);
        tokens = squashOcrFinMaterialSplits(tokens);
        const r = scoreOcrCandidate(pfx, tokens);
        if (r > bestRank && tokens.length >= OCR_MIN_SEGMENTS_AFTER_PREFIX) {
          bestRank = r;
          best = `${pfx}-${tokens.join("-")}`;
        }
      }
    }
  }
  if (best) best = appendTrailingConnectionFraction(best, luBlob || rawText);
  return best;
}

function pickBestParsedCoilCodeFromTexts(textPieces) {
  const parts = [...new Set(textPieces.map((t) => String(t || "").trim()).filter(Boolean))];
  const tryFirst = [...parts];
  tryFirst.unshift(parts.join("\n\n"));
  let bestCode = "";
  let bestRank = -1;
  const seenCand = new Set();
  for (const piece of tryFirst) {
    const cand = extractCoilCodeFromOcrText(piece);
    if (!cand || seenCand.has(cand)) continue;
    seenCand.add(cand);
    const chunk = cand.split("-");
    const rank =
      chunk.length >= OCR_MIN_SEGMENTS_AFTER_PREFIX + 1 ? scoreOcrCandidate(chunk[0], chunk.slice(1)) : -1;
    if (rank > bestRank) {
      bestRank = rank;
      bestCode = cand;
    }
  }
  return bestCode;
}

async function upscaleBlobForOcr(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) {
          URL.revokeObjectURL(url);
          resolve(blob);
          return;
        }
        const longEdge = Math.max(w, h);
        const targetMax = 2200;
        const boostIfBelow = 1200;
        let scale = 1;
        if (longEdge < boostIfBelow) scale = Math.min(2.5, boostIfBelow / longEdge);
        if (longEdge * scale > targetMax) scale = targetMax / longEdge;
        if (scale < 1.06) {
          URL.revokeObjectURL(url);
          resolve(blob);
          return;
        }
        const nw = Math.round(w * scale);
        const nh = Math.round(h * scale);
        const c = document.createElement("canvas");
        c.width = nw;
        c.height = nh;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, nw, nh);
        ctx.filter = "contrast(1.07)";
        ctx.drawImage(img, 0, 0, nw, nh);
        ctx.filter = "none";
        c.toBlob(
          (b) => {
            URL.revokeObjectURL(url);
            resolve(b && b.size ? b : blob);
          },
          "image/png",
          0.92
        );
      } catch (_) {
        URL.revokeObjectURL(url);
        resolve(blob);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

async function recognizeOcrPasses(blob, onPassProgress) {
  const scaled = await upscaleBlobForOcr(blob);
  const baseOpts = { preserve_interword_spaces: "1" };
  const defs = [{ b: blob, opts: { ...baseOpts }, key: "" }];
  defs.push({ b: blob, opts: { ...baseOpts, tessedit_pageseg_mode: "11" }, key: "11" });
  if (scaled !== blob) {
    defs.push({ b: scaled, opts: { ...baseOpts }, key: "up" });
    defs.push({ b: scaled, opts: { ...baseOpts, tessedit_pageseg_mode: "11" }, key: "up11" });
  }
  const texts = [];
  const seenFull = new Set();
  let pass = 0;
  const total = defs.length;
  for (const def of defs) {
    pass += 1;
    const logger = {
      logger(m) {
        if (!onPassProgress || m.status !== "recognizing text") return;
        const p = Math.min(1, (pass - 1 + (m.progress || 0)) / total);
        onPassProgress(pass, total, Math.round(p * 100));
      },
    };
    try {
      const ret = await Tesseract.recognize(def.b, "eng", { ...def.opts, ...logger });
      const t = (ret?.data?.text || "").trim();
      if (t && !seenFull.has(t)) {
        seenFull.add(t);
        texts.push(t);
      }
    } catch (_) {
      /* next pass */
    }
  }
  return texts;
}

async function runOcrOnBlob(blob) {
  if (!blob) return;
  try {
    reportSnapshot.ocrDataUrl = await blobToDataUrl(blob);
  } catch (_) {
    reportSnapshot.ocrDataUrl = null;
  }
  if (ocrDebugEl && ocrDebugPreEl) {
    ocrDebugEl.hidden = true;
    ocrDebugPreEl.textContent = "";
  }
  errEl.textContent = "";
  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    errEl.textContent =
      "OCR library (Tesseract.js) failed to load. Check your network connection or extensions blocking the CDN script.";
    return;
  }
  if (ocrStatusEl) {
    ocrStatusEl.style.color = "var(--accent)";
    ocrStatusEl.textContent = "Reading image… (first run may download OCR data)";
  }
  try {
    const texts = await recognizeOcrPasses(blob, (_pass, total, pct) => {
      if (!ocrStatusEl) return;
      ocrStatusEl.style.color = "var(--accent)";
      ocrStatusEl.textContent = `Reading image (${total} passes max)… ${pct}%`;
    });
    const debugBody = texts.length ? texts.join("\n---\n") : "";
    if (ocrStatusEl) ocrStatusEl.textContent = "";
    const code = pickBestParsedCoilCodeFromTexts(texts);
    if (code) {
      inputEl.value = code;
      showToast("Coil code extracted from image");
      decode();
      return;
    }
    errEl.textContent =
      "Could not find a coil code pattern in the OCR text (often GXH-/GXK-… plus many segments). Crop tight around the Coil code row, or open “OCR raw text” below to see what was read.";
    if (ocrDebugEl && ocrDebugPreEl) {
      ocrDebugPreEl.textContent = debugBody ? debugBody.slice(0, 12000) : "(empty OCR result)";
      ocrDebugEl.hidden = false;
    }
  } catch (err) {
    if (ocrStatusEl) ocrStatusEl.textContent = "";
    errEl.textContent =
      typeof err?.message === "string" ? `OCR failed: ${err.message}` : "OCR failed unexpectedly.";
    if (window.console && console.warn) console.warn(err);
  }
}

function joinDrawingsPath(root, relPath) {
  const r = String(root || "").trim().replace(/[\\/]+$/, "");
  if (!r) return "";
  const sub = String(relPath || "").replace(/\//g, "\\");
  return r + "\\" + sub;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function renderSegments(tokens) {
  segmentsEl.innerHTML = "";
  tokens.forEach((t, i) => {
    const span = document.createElement("span");
    span.className = "segment idx";
    span.dataset.i = `#${i + 1}`;
    span.textContent = t;
    segmentsEl.appendChild(span);
  });
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = String(r.position);
    if (!r.raw && r.key !== "extra") {
      const badge = document.createElement("span");
      badge.className = "badge badge-missing";
      badge.textContent = "Missing";
      th.append(document.createTextNode(" "), badge);
    }
    const tdRaw = document.createElement("td");
    tdRaw.className = "raw";
    tdRaw.textContent = r.raw || "—";
    const tdMeaning = document.createElement("td");
    tdMeaning.className = [
      "meaning",
      !r.raw && r.key !== "extra" ? "meaning-missingcol" : r.certain ? "meaning-sure" : "meaning-maybe",
    ].join(" ");
    tdMeaning.textContent = `${r.label} — ${r.meaning}`;
    tr.append(th, tdRaw, tdMeaning);
    if (r.key === "size") tr.classList.add("row-geniox-highlight");
    tableBody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function reportFilenameStem(code) {
  const s = String(code || "coil")
    .trim()
    .replace(/[^\w\s.-]+/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return s || "coil";
}

function getJsPDFConstructor() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (typeof window.jsPDF === "function") return window.jsPDF;
  return null;
}

const PDF_REPORT_TITLE = "Heat Exchanger Coils RFQ Report";

/** Report visual theme (aligned with app accent / slate neutrals). */
const PDF_THEME = {
  ink: [15, 23, 42],
  muted: [100, 116, 139],
  band: [30, 41, 59],
  bandSub: [203, 213, 225],
  accent: [56, 189, 248],
  surface: [248, 250, 252],
  border: [226, 232, 240],
  tableHead: [30, 41, 59],
  zebra: [248, 250, 252],
  bodyText: [51, 65, 85],
};

function pdfPageGeom(doc) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  return { pw, ph, innerW: pw - 96 };
}

function drawPdfHeroHeader(doc, marg, ts) {
  const { pw } = pdfPageGeom(doc);
  doc.setFillColor(...PDF_THEME.band);
  doc.rect(0, 0, pw, 78, "F");
  doc.setFillColor(...PDF_THEME.accent);
  doc.rect(0, 78, pw, 3.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(doc.splitTextToSize(PDF_REPORT_TITLE, pw - marg * 2), marg, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_THEME.bandSub);
  const sub = "Structured field breakdown · spreadsheet dimensions · primary drawing appendix";
  doc.text(doc.splitTextToSize(sub, pw - marg * 2), marg, 56);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(ts, pw - marg, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_THEME.bodyText);
  return 98;
}

function drawPdfSectionHeading(doc, marg, y, title) {
  const { pw } = pdfPageGeom(doc);
  doc.setTextColor(...PDF_THEME.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, marg, y);
  const tw = typeof doc.getTextWidth === "function" ? doc.getTextWidth(title) : title.length * 7;
  const lineW = Math.min(tw + 8, pw - marg * 2);
  doc.setDrawColor(...PDF_THEME.accent);
  doc.setLineWidth(1);
  doc.line(marg, y + 4, marg + lineW, y + 4);
  return y + 28;
}

function stampSummaryPageFooters(doc, marg) {
  const n =
    typeof doc.getNumberOfPages === "function" ? doc.getNumberOfPages() : doc.internal.getNumberOfPages();
  const { pw, ph } = pdfPageGeom(doc);
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_THEME.border);
    doc.setLineWidth(0.35);
    doc.line(marg, ph - 40, pw - marg, ph - 40);
    doc.setTextColor(...PDF_THEME.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const footLines = doc.splitTextToSize(`${PDF_REPORT_TITLE} · ${i} / ${n}`, pw - marg * 2);
    const footY = ph - 24 - (footLines.length - 1) * 10;
    doc.text(footLines, marg, footY);
  }
}

async function mergeReportWithDrawingAppendix(reportArrayBuffer, drawingPdfUrl) {
  const PDFDocument = PDFLib.PDFDocument;
  const merged = await PDFDocument.create();
  const first = await PDFDocument.load(reportArrayBuffer);
  const aPages = await merged.copyPages(first, first.getPageIndices());
  aPages.forEach((p) => merged.addPage(p));
  const resp = await fetch(drawingPdfUrl, { mode: "cors", credentials: "same-origin" });
  if (!resp.ok) throw new Error("drawing fetch failed");
  const raw = await resp.arrayBuffer();
  const second = await PDFDocument.load(raw);
  const bPages = await merged.copyPages(second, second.getPageIndices());
  bPages.forEach((p) => merged.addPage(p));
  return merged.save();
}

async function buildCoilReportPdfBytes() {
  const res = reportSnapshot.decodeResult;
  const coil = String(reportSnapshot.coilCode || inputEl?.value?.trim() || "").trim();
  if (!res || !res.ok) return null;

  const JsPDF = getJsPDFConstructor();
  if (!JsPDF) {
    showToast("PDF library failed to load — reload the page.");
    return null;
  }
  const doc = new JsPDF({ unit: "pt", format: "a4", compress: true });
  if (typeof doc.autoTable !== "function") {
    showToast("PDF table plug-in missing — reload the page.");
    return null;
  }

  const marg = 48;
  const { pw, innerW } = pdfPageGeom(doc);

  const ts = reportSnapshot.decodedAt ? new Date(reportSnapshot.decodedAt).toLocaleString() : new Date().toLocaleString();
  let y = drawPdfHeroHeader(doc, marg, ts);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_THEME.bodyText);

  y = drawPdfSectionHeading(doc, marg, y, "Coil identification");
  const pad = 16;
  const coilLines = doc.splitTextToSize(coil || "—", innerW - pad * 2);
  const boxH = coilLines.length * 13 + pad * 2;
  doc.setFillColor(...PDF_THEME.surface);
  doc.setDrawColor(...PDF_THEME.border);
  doc.setLineWidth(0.6);
  if (typeof doc.roundedRect === "function") {
    doc.roundedRect(marg, y, pw - marg * 2, boxH, 4, 4, "FD");
  } else {
    doc.rect(marg, y, pw - marg * 2, boxH, "FD");
  }
  doc.setFont("courier", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_THEME.ink);
  doc.text(coilLines, marg + pad, y + pad + 11);
  doc.setFont("helvetica", "normal");
  y += boxH + 22;

  y += 8;
  y = drawPdfSectionHeading(doc, marg, y, "Field breakdown");

  /** Fixed widths summing to innerW so autoTable’s linebreak height matches the Meaning column */
  const brkWNum = 36;
  const brkWField = 98;
  const brkWRaw = 78;
  const brkWMean = Math.max(120, innerW - brkWNum - brkWField - brkWRaw);
  /** Inner drawable width minus left+right cell padding (~8 pt each side). */
  const brkMeaningPts = Math.max(48, Math.floor(brkWMean - 18));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (typeof doc.setLineHeightFactor === "function") doc.setLineHeightFactor(1.25);

  const fieldBreakBody = res.rows.map((r) => {
    const meaning = String(r.meaning ?? "").replace(/\u00a0/g, " ");
    const wrapped =
      typeof doc.splitTextToSize === "function"
        ? doc.splitTextToSize(meaning.trim() || "—", brkMeaningPts + 1)
        : meaning || "—";
    return [String(r.position), String(r.label || ""), r.raw ? String(r.raw) : "—", wrapped];
  });

  doc.autoTable({
    startY: y,
    margin: { left: marg, right: marg },
    tableWidth: innerW,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 7, bottom: 7, left: 8, right: 8 },
      textColor: PDF_THEME.bodyText,
      lineWidth: 0.2,
      lineColor: PDF_THEME.border,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PDF_THEME.tableHead,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
      cellPadding: 8,
    },
    alternateRowStyles: { fillColor: PDF_THEME.zebra },
    columnStyles: {
      0: { cellWidth: brkWNum, halign: "center", valign: "top" },
      1: { cellWidth: brkWField, valign: "top" },
      2: { cellWidth: brkWRaw, valign: "top" },
      3: { cellWidth: brkWMean, valign: "top", overflow: "linebreak", fontStyle: "normal" },
    },
    head: [["#", "Field", "Raw", "Meaning"]],
    body: fieldBreakBody,
    didParseCell(data) {
      if (data.section !== "body" || data.row == null) return;
      const srcRow = res.rows[data.row.index];
      if (!srcRow || srcRow.key !== "size") return;
      data.cell.styles.fillColor = [224, 242, 254];
      data.cell.styles.textColor = PDF_THEME.ink;
      if (data.column.index === 2) data.cell.styles.fontStyle = "bold";
    },
  });
  if (typeof doc.setLineHeightFactor === "function") doc.setLineHeightFactor(1.15);
  y = doc.lastAutoTable.finalY + 28;

  const dim = res.dimensionHits;
  const ph = pdfPageGeom(doc).ph;
  if (y > ph - 130) {
    doc.addPage();
    y = 56;
  }
  y = drawPdfSectionHeading(doc, marg, y, "Spreadsheet dimensions");

  if (
    dim &&
    Array.isArray(dim.matchedRows) &&
    dim.matchedRows.length &&
    Array.isArray(dim.headers) &&
    dim.headers.length
  ) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_THEME.muted);
    const dimLine = [
      dim.geniox != null ? `Geniox ${dim.geniox}` : null,
      dim.geometry ? `geometry ${dim.geometry}` : null,
      dim.application ? `${dim.application}` : null,
      dim.sheetName ? `sheet ${dim.sheetName}` : null,
      dim.layout || null,
      dim.sourceRelPath || null,
    ]
      .filter(Boolean)
      .join(" · ");
    if (dimLine) {
      const metaChunks = doc.splitTextToSize(dimLine, innerW);
      doc.text(metaChunks, marg, y);
      y += metaChunks.length * 11 + 14;
    }
    doc.setTextColor(...PDF_THEME.bodyText);
    const { headers: dh, rows: dr } = trimEmptyDimensionColumns(dim.headers, dim.matchedRows);
    doc.autoTable({
      startY: y,
      margin: { left: marg, right: marg },
      tableWidth: innerW,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: { top: 6, bottom: 6, left: 6, right: 6 },
        textColor: PDF_THEME.bodyText,
        lineWidth: 0.2,
        lineColor: PDF_THEME.border,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: PDF_THEME.tableHead,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      alternateRowStyles: { fillColor: PDF_THEME.zebra },
      head: [dh.map((h) => (h != null && String(h).trim() !== "" ? String(h) : ""))],
      body: dr.map((row) => dh.map((_, jj) => (row[jj] != null && row[jj] !== "" ? String(row[jj]) : ""))),
    });
    y = doc.lastAutoTable.finalY + 14;
    if (dim.note) {
      doc.setFontSize(8);
      doc.setTextColor(...PDF_THEME.muted);
      const noteChunks = doc.splitTextToSize(String(dim.note), innerW);
      doc.text(noteChunks, marg, y);
      y += noteChunks.length * 11 + 6;
      doc.setTextColor(...PDF_THEME.bodyText);
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_THEME.muted);
    const msg =
      dim && dim.note
        ? dim.note
        : "No spreadsheet row matched bundled dimension tables for this geometry / circuits / connection.";
    const msgChunks = doc.splitTextToSize(msg, innerW);
    doc.text(msgChunks, marg, y);
  }

  const pack = res.drawingPack;
  const pdfAppendUrl = pack && pack.primaryPdfUrl ? String(pack.primaryPdfUrl) : "";

  stampSummaryPageFooters(doc, marg);

  const buf = doc.output("arraybuffer");
  if (!window.PDFLib || !PDFLib.PDFDocument || !pdfAppendUrl) {
    return new Uint8Array(buf);
  }
  try {
    return await mergeReportWithDrawingAppendix(buf, pdfAppendUrl);
  } catch (e) {
    if (window.console && console.warn) console.warn(e);
    showToast("Could not attach drawing PDF — downloaded summary pages only.");
    return new Uint8Array(buf);
  }
}

async function handleReportPdfDownload() {
  showToast("Building PDF…");
  try {
    const bytes = await buildCoilReportPdfBytes();
    if (!bytes) return;
    const coil = reportSnapshot.coilCode || inputEl?.value?.trim() || "coil";
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `heat-exchanger-coils-rfq-report-${reportFilenameStem(coil)}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("PDF report downloaded");
  } catch (e) {
    if (window.console && console.warn) console.warn(e);
    showToast("PDF build failed — try reloading the page.");
  }
}

function renderDimensions(dimHits) {
  if (!dimExcelTitleEl || !dimExcelMetaEl || !dimExcelWrapEl) return;
  dimExcelWrapEl.innerHTML = "";
  if (!dimHits) {
    dimExcelTitleEl.hidden = true;
    dimExcelMetaEl.hidden = true;
    dimExcelWrapEl.hidden = true;
    return;
  }

  dimExcelTitleEl.hidden = false;
  dimExcelMetaEl.hidden = false;
  dimExcelWrapEl.hidden = false;

  const summaryBits = [
    `Geniox ${dimHits.geniox} · ${dimHits.geometry}`,
    dimHits.application ? dimHits.application : null,
    dimHits.layout ? `layout: ${dimHits.layout}` : null,
    dimHits.sheetName ? `sheet: ${dimHits.sheetName}` : null,
  ].filter(Boolean);
  dimExcelMetaEl.replaceChildren();
  dimExcelMetaEl.append(document.createTextNode(summaryBits.join(" · ")));
  if (dimHits.sourceRelPath) {
    dimExcelMetaEl.append(document.createTextNode(" · "));
    dimExcelMetaEl.append(document.createTextNode(dimHits.sourceRelPath));
  }
  if (dimHits.sourceUrl) {
    dimExcelMetaEl.append(document.createTextNode(" "));
    const ax = document.createElement("a");
    ax.href = dimHits.sourceUrl;
    ax.target = "_blank";
    ax.rel = "noopener noreferrer";
    ax.className = "ref-link";
    ax.textContent = "Open .xlsx";
    dimExcelMetaEl.append(ax);
  }

  if (
    !Array.isArray(dimHits.headers) ||
    !dimHits.headers.length ||
    !Array.isArray(dimHits.matchedRows) ||
    !dimHits.matchedRows.length
  ) {
    const p = document.createElement("p");
    p.className = "sub dim-empty-msg";
    p.textContent =
      dimHits.note || "No spreadsheet row matches this Geniox size (or circuit band) for the selected geometry / folder.";
    dimExcelWrapEl.appendChild(p);
    return;
  }

  const { headers: dimHeadersTrim, rows: dimRowsTrim } = trimEmptyDimensionColumns(
    dimHits.headers,
    dimHits.matchedRows,
  );

  const tbl = document.createElement("table");
  tbl.className = "dim-grid";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of dimHeadersTrim) {
    const th = document.createElement("th");
    th.textContent = h != null && String(h).trim() !== "" ? String(h) : "\u00a0";
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tb = document.createElement("tbody");
  for (const row of dimRowsTrim) {
    const tr = document.createElement("tr");
    for (let j = 0; j < dimHeadersTrim.length; j++) {
      const td = document.createElement("td");
      const v = row[j];
      td.textContent = v == null || v === "" ? "" : String(v);
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  dimExcelWrapEl.appendChild(tbl);
  if (dimHits.note) {
    const pn = document.createElement("p");
    pn.className = "sub dim-row-note";
    pn.textContent = dimHits.note;
    dimExcelWrapEl.appendChild(pn);
  }
}

function renderPdfPreview(pack) {
  if (!drawingPdfFrameEl || !drawingPreviewSlotEl || !drawingPreviewNoneEl) return;
  const url = pack && pack.primaryPdfUrl;
  if (!pack) {
    drawingPdfFrameEl.removeAttribute("src");
    drawingPreviewSlotEl.hidden = true;
    drawingPreviewNoneEl.hidden = false;
    if (drawingPreviewMetaEl) drawingPreviewMetaEl.textContent = "";
    return;
  }
  if (drawingPreviewMetaEl) {
    const bits = [];
    if (pack.selectionSummary) bits.push(pack.selectionSummary);
    if (pack.primaryPdfName) bits.push(`Preview: ${pack.primaryPdfName}`);
    drawingPreviewMetaEl.textContent = bits.join(" ");
  }
  if (url) {
    drawingPdfFrameEl.src = url;
    drawingPreviewSlotEl.hidden = false;
    drawingPreviewNoneEl.hidden = true;
  } else {
    drawingPdfFrameEl.removeAttribute("src");
    drawingPreviewSlotEl.hidden = true;
    drawingPreviewNoneEl.hidden = false;
    if (drawingPreviewMetaEl) {
      if (!pack || !pack.files || !pack.files.length) {
        drawingPreviewMetaEl.textContent = "";
      } else if (pack.note) {
        drawingPreviewMetaEl.textContent = pack.selectionSummary ? `${pack.selectionSummary} ${pack.note}` : pack.note;
      }
    }
  }
}

function renderDrawingRefs(pack, rootHint) {
  drawingsListEl.innerHTML = "";
  const urlBuilder = parser && typeof parser.bundledDrawingUrl === "function" ? parser.bundledDrawingUrl : null;
  if (!pack || !pack.files || pack.files.length === 0) {
    drawingsMetaEl.textContent =
      pack && pack.note
        ? pack.note
        : "No drawings matched. Paste a coil code and decode.";
    renderPdfPreview(null);
    return;
  }
  const geoLine = pack.geometry || "field 4 not 3|4|5 (showing all geometries)";
  const appsLine = (pack.applications || []).join(", ");
  const baseHint =
    parser && typeof parser.bundledDrawingsBaseUrl === "function"
      ? String(parser.bundledDrawingsBaseUrl() || "").replace(/\/?$/, "/")
      : "";
  drawingsMetaEl.textContent = `${
    pack.selectionSummary ? pack.selectionSummary + " • " : ""
  }./drawings/ ${baseHint ? "(" + baseHint + ")" : ""} • Folder: ${geoLine} • Sets: ${appsLine}${pack.note ? " — " + pack.note : ""}`;
  const root = (rootHint != null ? rootHint : drawingsRootEl && drawingsRootEl.value) || "";

  const ul = document.createElement("ul");
  ul.className = "ref-list";
  for (const f of pack.files) {
    const ty = String(f.ext || "").toLowerCase() === ".xlsx" ? "xlsx" : "pdf";
    const abs = joinDrawingsPath(root, f.relPath);
    const hosted = urlBuilder ? urlBuilder(f.relPath) : "";
    const li = document.createElement("li");
    li.className = "ref-item";
    const linkRow =
      hosted
        ? `<a class="ref-link" href="${escapeHtml(hosted)}" target="_blank" rel="noopener noreferrer">Open on this site</a>`
        : "";
    const localRow =
      abs
        ? `<span class="ref-abs local-path" title="${escapeHtml(abs)}">Local: ${escapeHtml(abs)}</span>`
        : "";
    const localHint =
      !abs && drawingsRootEl
        ? `<span class="ref-abs muted">Optional: set folder path below to show a Windows path.</span>`
        : "";

    li.innerHTML = `
      <span class="ref-type">${escapeHtml(ty)}</span>
      <div class="ref-body">
        <span class="ref-path" title="${escapeHtml(f.relPath)}">${escapeHtml(f.relPath)}</span>
        ${linkRow ? `<div class="ref-row">${linkRow}</div>` : ""}
        ${localRow || localHint}
      </div>`;
    ul.appendChild(li);
  }
  drawingsListEl.appendChild(ul);
  renderPdfPreview(pack);
}

function decode() {
  errEl.textContent = "";
  if (!parseCoilCode) {
    errEl.textContent =
      "Parser failed to load. Confirm GitHub Pages is publishing the same folder as index.html and coilParser.js.";
    return;
  }
  const result = parseCoilCode(inputEl.value);
  if (!result.ok) {
    reportSnapshot.decodeResult = null;
    reportSnapshot.decodedAt = null;
    errEl.textContent = result.error;
    segmentsEl.innerHTML = "";
    tableBody.innerHTML = "";
    summaryEl.value = "";
    renderDrawingRefs(null, drawingsRootEl.value);
    renderPdfPreview(null);
    renderDimensions(null);
    return;
  }
  reportSnapshot.decodeResult = result;
  reportSnapshot.coilCode = String(inputEl.value || "").trim();
  reportSnapshot.decodedAt = new Date().toISOString();
  renderSegments(result.tokens);
  renderTable(result.rows);
  summaryEl.value = result.supplierText;
  renderDrawingRefs(result.drawingPack, drawingsRootEl.value);
  renderDimensions(result.dimensionHits);
}

btnDecode.addEventListener("click", decode);

if (drawingsRootEl) {
  try {
    const saved = localStorage.getItem(LS_DRAWINGS_ROOT);
    if (saved) drawingsRootEl.value = saved;
  } catch (_) {}
  drawingsRootEl.addEventListener("change", () => {
    try {
      localStorage.setItem(LS_DRAWINGS_ROOT, drawingsRootEl.value.trim());
    } catch (_) {}
    decode();
  });
}

btnClear.addEventListener("click", () => {
  reportSnapshot.coilCode = "";
  reportSnapshot.ocrDataUrl = null;
  reportSnapshot.decodedAt = null;
  reportSnapshot.decodeResult = null;
  inputEl.value = "";
  errEl.textContent = "";
  if (ocrStatusEl) {
    ocrStatusEl.textContent = "";
  }
  if (ocrDebugEl && ocrDebugPreEl) {
    ocrDebugEl.hidden = true;
    ocrDebugPreEl.textContent = "";
  }
  segmentsEl.innerHTML = "";
  tableBody.innerHTML = "";
  summaryEl.value = "";
  renderDrawingRefs(null, drawingsRootEl.value);
  renderPdfPreview(null);
  renderDimensions(null);
  inputEl.focus();
});

btnReportPdf?.addEventListener("click", () => {
  handleReportPdfDownload().catch((e) => {
    if (window.console && console.warn) console.warn(e);
    showToast("PDF build failed.");
  });
});

btnCopy.addEventListener("click", async () => {
  const text = summaryEl.value;
  if (!text) {
    decode();
    if (!summaryEl.value) return;
  }
  try {
    await navigator.clipboard.writeText(summaryEl.value);
    showToast("Summary copied to clipboard");
  } catch (err) {
    summaryEl.select();
    document.execCommand("copy");
    showToast("Summary copied");
  }
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    decode();
  }
});

// Example from user
inputEl.value =
  "GXK-41-W-4-10-102-1830-3500-3.0-CU-AJ1-1-tt-3";

decode();

document.addEventListener(
  "paste",
  (e) => {
    const items = e.clipboardData?.items;
    if (!items || !items.length) return;
    const imgItem = Array.from(items).find((it) => String(it.type || "").startsWith("image/"));
    if (!imgItem) return;
    const blob = imgItem.getAsFile();
    if (!blob) return;
    e.preventDefault();
    runOcrOnBlob(blob);
  },
  true
);

btnOcrPick?.addEventListener("click", () => ocrFileEl?.click());
ocrFileEl?.addEventListener("change", () => {
  const f = ocrFileEl.files?.[0];
  if (f) runOcrOnBlob(f);
  ocrFileEl.value = "";
});

window.DBM_COIL = window.DBM_PARSER || {};
window.extractCoilCodeFromOcrText = extractCoilCodeFromOcrText;
}
