if (!window.__DBM_APP_INIT__) {
  window.__DBM_APP_INIT__ = true;

const $ = (sel) => document.querySelector(sel);

const inputEl = $("#coil-input");
const btnDecode = $("#btn-decode");
const btnClear = $("#btn-clear");
const btnCopy = $("#btn-copy-summary");
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

/** Order matters: longer GX* codes first so the regex alternation matches GXHK before GXK. */
const COIL_OCR_PREFIXES = ["GXHK", "GXK", "GXH", "COH", "COK"];
const COIL_HEAD_RE = new RegExp(`\\b(?:${COIL_OCR_PREFIXES.join("|")})\\b`, "g");

/** Standard long form = coil prefix + (STANDARD_FIELDS.length − 1) hyphen segments — do not eat the next table row in OCR. */
const OCR_MAX_SEGMENTS_AFTER_PREFIX =
  parser && Array.isArray(parser.STANDARD_FIELDS) && parser.STANDARD_FIELDS.length > 1
    ? parser.STANDARD_FIELDS.length - 1
    : 12;

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
]);

function preprocessCoilOcr(raw) {
  let s = String(raw || "")
    .replace(/\r?\n|[\x0b\x0c\u0085\u2028\u2029]/g, " ")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
  s = s.replace(/coil\s*code[:]?\s*/gi, " ");
  s = s.replace(/\(\s*[^\)]*\)/g, " ");
  s = s.replace(/\bAI\s+11\b/gi, "AI11");
  s = s.replace(/\bAJ\s*1\b/gi, "AJ1");
  s = s.replace(/\b(\d+)\s*\.\s*(\d+)\b/g, "$1.$2");
  s = s.replace(/\bGX\s*HK\b/gi, "GXHK");
  s = s.replace(/\bGX\s*K\b/gi, "GXK");
  s = s.replace(/\bGX\s*H\b/gi, "GXH");
  s = s.replace(/\bC\s*O\s*H\b/gi, "COH");
  s = s.replace(/\bC\s*O\s*K\b/gi, "COK");
  s = s.replace(/\s*-\s*/g, "-");
  s = s.replace(/\s+/g, " ");
  return s.trim().toUpperCase();
}

function skipWsHyphen(s, i) {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j++;
  if (j < s.length && s[j] === "-") {
    j++;
    while (j < s.length && /\s/.test(s[j])) j++;
  }
  return j;
}

function consumeHyphenSegments(s, idx, maxTokens) {
  const cap = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : OCR_MAX_SEGMENTS_AFTER_PREFIX;
  const tokens = [];
  let i = idx;
  for (let guard = 0; guard < 28; guard++) {
    if (tokens.length >= cap) break;
    const j = skipWsHyphen(s, i);
    i = j;
    if (i >= s.length || !/[A-Z0-9.]/.test(s[i])) break;
    const rest = s.slice(i);
    const hm = /^(\d+\.\d+|[A-Z]{1,8}\d*|\d+)/.exec(rest);
    if (!hm) break;
    const piece = hm[1].toUpperCase();
    if (OCR_COIL_SEGMENT_STOP.has(piece)) break;
    tokens.push(hm[1]);
    i += hm[0].length;
  }
  return { tokens, end: i };
}

function extractCoilCodeFromOcrText(rawText) {
  const lu = preprocessCoilOcr(rawText);
  if (!lu) return "";
  let best = "";
  let bestRank = -1;
  COIL_HEAD_RE.lastIndex = 0;
  let m;
  while ((m = COIL_HEAD_RE.exec(lu)) !== null) {
    const pfx = m[0];
    const afterHead = m.index + m[0].length;
    const { tokens } = consumeHyphenSegments(lu, afterHead, OCR_MAX_SEGMENTS_AFTER_PREFIX);
    if (tokens.length < 10) continue;
    const candidate = `${pfx}-${tokens.join("-")}`;
    let rank = tokens.length * 10 + (tokens.length >= OCR_MAX_SEGMENTS_AFTER_PREFIX ? 50 : 0);
    if (parseCoilCode) {
      const r = parseCoilCode(candidate);
      if (r.ok) rank += 800;
    }
    if (rank > bestRank) {
      bestRank = rank;
      best = candidate;
    }
  }
  return best;
}

async function runOcrOnBlob(blob) {
  if (!blob) return;
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
    const ret = await Tesseract.recognize(blob, "eng", {
      logger(m) {
        if (!ocrStatusEl) return;
        if (m.status === "recognizing text") {
          ocrStatusEl.textContent = `OCR… ${Math.round((m.progress || 0) * 100)}%`;
        }
      },
    });
    const text = ret?.data?.text || "";
    if (ocrStatusEl) ocrStatusEl.textContent = "";
    const code = extractCoilCodeFromOcrText(text);
    if (code) {
      inputEl.value = code;
      showToast("Coil code extracted from image");
      decode();
      return;
    }
    errEl.textContent =
      "Could not find a long hyphenated coil pattern in the OCR text. Crop closer to the code row or paste the code manually.";
    if (ocrDebugEl && ocrDebugPreEl) {
      ocrDebugPreEl.textContent = text.trim() ? text.trim().slice(0, 6000) : "(empty OCR result)";
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

  const tbl = document.createElement("table");
  tbl.className = "dim-grid";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of dimHits.headers) {
    const th = document.createElement("th");
    th.textContent = h != null && String(h).trim() !== "" ? String(h) : "\u00a0";
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tbl.appendChild(thead);
  const tb = document.createElement("tbody");
  for (const row of dimHits.matchedRows) {
    const tr = document.createElement("tr");
    for (let j = 0; j < dimHits.headers.length; j++) {
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
    errEl.textContent = result.error;
    segmentsEl.innerHTML = "";
    tableBody.innerHTML = "";
    summaryEl.value = "";
    renderDrawingRefs(null, drawingsRootEl.value);
    renderPdfPreview(null);
    renderDimensions(null);
    return;
  }
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
