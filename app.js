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

const LS_DRAWINGS_ROOT = "dbmCoilsDrawingsRoot";

const parser = window.DBM_PARSER;
const parseCoilCode = parser && typeof parser.parseCoilCode === "function" ? parser.parseCoilCode : null;

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
    const badge =
      !r.raw && r.key !== "extra"
        ? '<span class="badge warn">Missing</span>'
        : !r.certain
          ? '<span class="badge warn">Verify</span>'
          : '<span class="badge ok">Decoded</span>';
    tr.innerHTML = `
      <th>${r.position}${badge}</th>
      <td class="raw">${escapeHtml(r.raw || "—")}</td>
      <td class="meaning">${escapeHtml(r.label)} — ${escapeHtml(r.meaning)}</td>`;
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
    return;
  }
  renderSegments(result.tokens);
  renderTable(result.rows);
  summaryEl.value = result.supplierText;
  renderDrawingRefs(result.drawingPack, drawingsRootEl.value);
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
  segmentsEl.innerHTML = "";
  tableBody.innerHTML = "";
  summaryEl.value = "";
  renderDrawingRefs(null, drawingsRootEl.value);
  renderPdfPreview(null);
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

window.DBM_COIL = window.DBM_PARSER || {};
}
