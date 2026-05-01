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

const parser = window.DBM_PARSER;
const parseCoilCode = parser && typeof parser.parseCoilCode === "function" ? parser.parseCoilCode : null;

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
    return;
  }
  renderSegments(result.tokens);
  renderTable(result.rows);
  summaryEl.value = result.supplierText;
}

btnDecode.addEventListener("click", decode);

btnClear.addEventListener("click", () => {
  inputEl.value = "";
  errEl.textContent = "";
  segmentsEl.innerHTML = "";
  tableBody.innerHTML = "";
  summaryEl.value = "";
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
