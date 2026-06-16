/* ============================================================
   App — main controller
   Screens: upload -> calibration (per file) -> dashboard
   ============================================================ */

(() => {
  const DE = DataEngine;

  const STORAGE_RECORDS = "mobins_records";
  const STORAGE_DATASETS = "mobins_datasets";
  const STORAGE_TEMPLATES = "mobins_templates";

  const state = {
    config: null,
    records: [],
    datasets: [], // {fileName, university, n}
    uploadQueue: [], // {fileName, sheets, sheetNames, selectedSheet}
    activeTab: "overview",
    selectedUniversity: "ALL",
    compare: false,
  };

  const CATEGORY_MAP = [
    { test: (k) => k === "University", label: "Identification" },
    { test: (k) => ["genre", "niveau", "zone_geo", "educ_parents", "revenu_foyer"].includes(k), label: "Socio-demographics" },
    { test: (k) => ["moyenne_acad", "english_cert", "scholarship"].includes(k), label: "Academic & language" },
    { test: (k) => ["aisance_fin", "depense_imp"].includes(k), label: "Financial profile" },
    { test: (k) => ["parental_erasmus", "a_participe", "erasmus", "a_postule", "raison_non_partir"].includes(k), label: "Mobility" },
    { test: (k) => k.startsWith("frein_"), label: "Barriers to mobility (1-5)" },
    { test: (k) => k.startsWith("raison_"), label: "Reasons for going — Group 1 (1-5)" },
    { test: (k) => k.startsWith("psy_"), label: "Psychological profile (1-5)" },
  ];
  function fieldCategory(key) {
    const m = CATEGORY_MAP.find((c) => c.test(key));
    return m ? m.label : "Other";
  }
  function orderedFieldsForCalibration(config) {
    const cats = [...new Set(CATEGORY_MAP.map((c) => c.label)), "Other"];
    const out = [];
    cats.forEach((catLabel) => config.fields.forEach((f) => { if (fieldCategory(f.key) === catLabel) out.push(f); }));
    return out;
  }

  // ---------------------------------------------------------
  // bootstrap
  // ---------------------------------------------------------

  async function init() {
    const res = await fetch("config/config.json?v=3");
    state.config = await res.json();
    Dashboard.init(state.config);

    document.querySelectorAll(".js-app-title").forEach((el) => (el.textContent = state.config.meta.title));
    document.querySelectorAll(".js-app-subtitle").forEach((el) => (el.textContent = state.config.meta.subtitle));
    document.title = state.config.meta.title;

    setupUploadScreen();
    setupDashboardScreen();

    if (tryRestore()) {
      showScreen("dashboard");
      buildDashboard();
      return;
    }

    try {
      const r = await fetch("data/dataset.json");
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data.records) && data.records.length > 0) {
          state.records = data.records;
          state.datasets = data.datasets || [];
          persist();
          showScreen("dashboard");
          buildDashboard();
          return;
        }
      }
    } catch (e) { /* no pre-baked dataset, ignore */ }

    showScreen("upload");
  }

  function tryRestore() {
    try {
      const r = localStorage.getItem(STORAGE_RECORDS);
      const d = localStorage.getItem(STORAGE_DATASETS);
      if (!r) return false;
      const records = JSON.parse(r);
      if (!Array.isArray(records) || records.length === 0) return false;
      state.records = records;
      state.datasets = d ? JSON.parse(d) : [];
      return true;
    } catch (e) { return false; }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_RECORDS, JSON.stringify(state.records));
      localStorage.setItem(STORAGE_DATASETS, JSON.stringify(state.datasets));
    } catch (e) { /* storage unavailable, ignore */ }
  }

  function resetAll() {
    try {
      localStorage.removeItem(STORAGE_RECORDS);
      localStorage.removeItem(STORAGE_DATASETS);
    } catch (e) {}
    state.records = [];
    state.datasets = [];
    state.uploadQueue = [];
    state.selectedUniversity = "ALL";
    state.compare = false;
    document.getElementById("upload-file-list").innerHTML = "";
    showScreen("upload");
    refreshUploadScreen();
  }

  // ---------------------------------------------------------
  // screen switching
  // ---------------------------------------------------------

  function showScreen(name) {
    ["upload", "calibration", "dashboard"].forEach((s) => {
      document.getElementById("screen-" + s).style.display = s === name ? "" : "none";
    });
  }

  // ===========================================================
  // UPLOAD SCREEN
  // ===========================================================

  function setupUploadScreen() {
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("file-input");

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    document.getElementById("btn-back-to-dashboard").addEventListener("click", () => {
      showScreen("dashboard");
      buildDashboard();
    });
  }

  function refreshUploadScreen() {
    document.getElementById("btn-back-to-dashboard").style.display = state.records.length > 0 ? "" : "none";
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => /\.(xlsx|xls)$/i.test(f.name));
    if (files.length === 0) return;

    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = DE.readWorkbook(buf);
        state.uploadQueue.push({
          fileName: file.name,
          sheets: wb.sheets,
          sheetNames: wb.sheetNames,
          selectedSheet: wb.sheetNames[0],
        });
      } catch (e) {
        console.error("Error reading file", file.name, e);
      }
    }
    processQueue();
  }

  function processQueue() {
    if (state.uploadQueue.length === 0) {
      if (state.records.length > 0) {
        persist();
        showScreen("dashboard");
        buildDashboard();
      } else {
        showScreen("upload");
        refreshUploadScreen();
      }
      return;
    }
    showScreen("calibration");
    renderCalibration(state.uploadQueue[0]);
  }

  // ===========================================================
  // CALIBRATION SCREEN
  // ===========================================================

  function getTemplates() {
    try {
      const t = localStorage.getItem(STORAGE_TEMPLATES);
      return t ? JSON.parse(t) : {};
    } catch (e) { return {}; }
  }
  function saveTemplate(name, mapping) {
    const t = getTemplates();
    t[name] = mapping;
    try { localStorage.setItem(STORAGE_TEMPLATES, JSON.stringify(t)); } catch (e) {}
  }

  function truncate(s, n) {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function renderCalibration(item) {
    const config = state.config;
    const content = document.getElementById("calibration-content");
    const rows = item.sheets[item.selectedSheet];
    const cols = DE.previewColumns(rows, 2);
    const templates = getTemplates();
    const defaultMapping = DE.defaultMapping(config);
    const fields = orderedFieldsForCalibration(config);

    const sheetOptions = item.sheetNames.map((s) =>
      `<option value="${s}" ${s === item.selectedSheet ? "selected" : ""}>${s}</option>`).join("");

    const templateOptions = `<option value="__default__">Default mapping (config)</option>` +
      Object.keys(templates).map((name) => `<option value="${name}">${name}</option>`).join("");

    let lastCategory = null;
    const tableRows = fields.map((f) => {
      const cat = fieldCategory(f.key);
      let catRow = "";
      if (cat !== lastCategory) {
        catRow = `<tr><td colspan="2" class="mapping-cat">${cat}</td></tr>`;
        lastCategory = cat;
      }
      const opts = [`<option value="0" ${f.col === 0 ? "selected" : ""}>— (not available) —</option>`]
        .concat(cols.map((c) => {
          const label = `Col ${c.index} — ${truncate(c.header || "(no title)", 28)}` +
            (c.samples.length ? ` — e.g. ${c.samples.map((s) => truncate(s, 14)).join(", ")}` : "");
          return `<option value="${c.index}" ${c.index === f.col ? "selected" : ""}>${DE.escapeHtml(truncate(label, 90))}</option>`;
        }));
      return catRow + `<tr><td>${DE.escapeHtml(f.label)}</td><td><select data-field="${f.key}">${opts.join("")}</select></td></tr>`;
    }).join("");

    content.innerHTML = `
      <div class="info-box">
        File: <strong>${DE.escapeHtml(item.fileName)}</strong>
        ${item.sheetNames.length > 1 ? ` — sheet: <select id="sheet-select" style="margin-left:6px;">${sheetOptions}</select>` : ""}
        <br>Check the correspondence between the expected variables (left) and the columns in this file (right). The default values follow the usual structure of the questionnaire — adjust them if this file differs.
      </div>
      <div class="flex-between" style="margin-bottom:14px; align-items: flex-end;">
        <div>
          <label style="font-size:0.78rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">University (if the column doesn't contain a usable name)</label><br>
          <input type="text" id="university-override" placeholder="e.g. University of Nantes" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);min-width:300px;font-family:inherit;">
        </div>
        <div>
          <label style="font-size:0.78rem;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:0.04em;">Mapping template</label><br>
          <select id="template-select" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);font-family:inherit;">${templateOptions}</select>
          <button id="btn-save-template" class="btn btn-light btn-sm">Save as template</button>
        </div>
      </div>
      <div style="max-height:440px; overflow:auto; border:1px solid var(--border); border-radius:10px;">
        <table class="mapping-table"><thead><tr><th>Expected variable</th><th>Source column in file</th></tr></thead>
        <tbody>${tableRows}</tbody></table>
      </div>
      <div class="flex-between" style="margin-top:18px;">
        <button id="btn-cancel-file" class="btn btn-light">Skip this file</button>
        <div style="display:flex; gap:10px;">
          <button id="btn-use-default" class="btn btn-light">Use default mapping</button>
          <button id="btn-confirm-mapping" class="btn btn-primary">Confirm and continue</button>
        </div>
      </div>
    `;

    const sheetSelect = document.getElementById("sheet-select");
    if (sheetSelect) {
      sheetSelect.addEventListener("change", (e) => {
        item.selectedSheet = e.target.value;
        renderCalibration(item);
      });
    }

    document.getElementById("template-select").addEventListener("change", (e) => {
      const val = e.target.value;
      const mapping = val === "__default__" ? defaultMapping : templates[val];
      if (!mapping) return;
      content.querySelectorAll("select[data-field]").forEach((sel) => {
        const key = sel.getAttribute("data-field");
        const col = mapping[key] !== undefined ? mapping[key] : 0;
        if (sel.querySelector(`option[value="${col}"]`)) sel.value = String(col);
      });
    });

    document.getElementById("btn-save-template").addEventListener("click", () => {
      const name = window.prompt("Name for this mapping template (e.g. university or source name):");
      if (!name) return;
      saveTemplate(name, readMappingFromForm(content));
      renderCalibration(item);
    });

    document.getElementById("btn-cancel-file").addEventListener("click", () => {
      state.uploadQueue.shift();
      processQueue();
    });

    document.getElementById("btn-use-default").addEventListener("click", () => {
      finalizeFile(item, defaultMapping);
    });

    document.getElementById("btn-confirm-mapping").addEventListener("click", () => {
      finalizeFile(item, readMappingFromForm(content));
    });
  }

  function readMappingFromForm(content) {
    const mapping = {};
    content.querySelectorAll("select[data-field]").forEach((sel) => {
      mapping[sel.getAttribute("data-field")] = parseInt(sel.value, 10) || 0;
    });
    return mapping;
  }

  function finalizeFile(item, mapping) {
    const overrideEl = document.getElementById("university-override");
    const override = overrideEl && overrideEl.value.trim() ? overrideEl.value.trim() : null;
    const rows = item.sheets[item.selectedSheet];
    const records = DE.processRows(rows, mapping, state.config, override);

    state.records = state.records.concat(records);

    const universities = {};
    records.forEach((r) => { universities[r.University] = (universities[r.University] || 0) + 1; });
    Object.keys(universities).forEach((u) => {
      state.datasets.push({ fileName: item.fileName, university: u, n: universities[u] });
    });

    state.uploadQueue.shift();
    processQueue();
  }

  // ===========================================================
  // DASHBOARD SCREEN
  // ===========================================================

  function setupDashboardScreen() {
    const tabsInner = document.getElementById("tabs-inner");
    const tabs = Dashboard.SECTIONS.map((s) => ({ id: s.id, label: s.label })).concat([{ id: "data", label: "Data" }]);
    tabsInner.innerHTML = tabs.map((t) => `<button data-tab="${t.id}">${t.label}</button>`).join("");
    tabsInner.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeTab = btn.getAttribute("data-tab");
        renderActiveTab();
      });
    });

    const sectionsHtml = Dashboard.SECTIONS.map((s) => `<section id="section-${s.id}" class="dashboard-section"></section>`).join("")
      + `<section id="section-data" class="dashboard-section"></section>`;
    document.getElementById("dashboard-sections").innerHTML = sectionsHtml;

    document.getElementById("university-select").addEventListener("change", (e) => {
      state.selectedUniversity = e.target.value;
      const compareToggle = document.getElementById("compare-toggle");
      if (state.selectedUniversity === "ALL") {
        compareToggle.checked = false;
        state.compare = false;
        compareToggle.disabled = true;
      } else {
        compareToggle.disabled = false;
      }
      updateNChip();
      renderActiveTab();
    });

    document.getElementById("compare-toggle").addEventListener("change", (e) => {
      state.compare = e.target.checked;
      renderActiveTab();
    });

    document.getElementById("btn-add-data").addEventListener("click", () => {
      refreshUploadScreen();
      showScreen("upload");
    });
    document.getElementById("btn-export").addEventListener("click", exportJSON);
    document.getElementById("btn-reset").addEventListener("click", () => {
      if (window.confirm("Resetting will delete all data imported in this browser. Continue?")) {
        resetAll();
      }
    });
  }

  function buildDashboard() {
    const select = document.getElementById("university-select");
    const universities = [...new Set(state.records.map((r) => r.University))].sort();
    const totalN = state.records.length;
    select.innerHTML = `<option value="ALL">All universities (n=${totalN})</option>` +
      universities.map((u) => {
        const n = state.records.filter((r) => r.University === u).length;
        return `<option value="${DE.escapeHtml(u)}">${DE.escapeHtml(u)} (n=${n})</option>`;
      }).join("");

    if (![...select.options].some((o) => o.value === state.selectedUniversity)) {
      state.selectedUniversity = "ALL";
    }
    select.value = state.selectedUniversity;

    const compareToggle = document.getElementById("compare-toggle");
    compareToggle.checked = state.compare;
    compareToggle.disabled = state.selectedUniversity === "ALL";

    updateNChip();
    if (!Dashboard.SECTIONS.some((s) => s.id === state.activeTab) && state.activeTab !== "data") {
      state.activeTab = "overview";
    }
    renderActiveTab();
  }

  function updateNChip() {
    const base = state.selectedUniversity === "ALL" ? state.records : state.records.filter((r) => r.University === state.selectedUniversity);
    document.getElementById("n-chip").textContent = `n = ${base.length} respondent${base.length === 1 ? "" : "s"}`;
  }

  function renderActiveTab() {
    const tabsInner = document.getElementById("tabs-inner");
    tabsInner.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.getAttribute("data-tab") === state.activeTab));

    document.querySelectorAll("#dashboard-sections .dashboard-section").forEach((sec) => sec.classList.remove("active"));
    const filterBar = document.querySelector(".filter-bar");

    if (state.activeTab === "data") {
      filterBar.style.display = "none";
      document.getElementById("section-data").classList.add("active");
      renderDataTab();
      return;
    }
    filterBar.style.display = "";
    document.getElementById("section-" + state.activeTab).classList.add("active");
    Dashboard.render(state.activeTab, {
      records: state.records,
      selectedUniversity: state.selectedUniversity,
      compare: state.compare,
    });
  }

  // ---------------------------------------------------------
  // Data management tab
  // ---------------------------------------------------------

  function renderDataTab() {
    const container = document.getElementById("section-data");
    const byUniversity = {};
    state.records.forEach((r) => { byUniversity[r.University] = (byUniversity[r.University] || 0) + 1; });

    const filesHtml = state.datasets.length === 0
      ? `<div class="empty-state"><p>No files imported yet.</p></div>`
      : `<table class="stat-table">
          <thead><tr><th>Source file</th><th>Detected university</th><th class="num">Respondents</th></tr></thead>
          <tbody>${state.datasets.map((d) => `<tr><td>${DE.escapeHtml(d.fileName)}</td><td>${DE.escapeHtml(d.university)}</td><td class="num">${d.n}</td></tr>`).join("")}</tbody>
        </table>`;

    container.innerHTML = `
      <div class="section-title"><span class="stripe"></span><h2>Data management</h2></div>
      <p class="section-desc">List of imported files and available universities. Data stays stored locally in your browser — nothing is sent to an external server.</p>
      <div class="grid">
        <div class="card"><h3>Imported files</h3>${filesHtml}</div>
        <div class="card"><h3>Respondents per university</h3>
          <table class="stat-table">
            <thead><tr><th>University</th><th class="num">Respondents</th></tr></thead>
            <tbody>${Object.keys(byUniversity).sort().map((u) => `<tr><td>${DE.escapeHtml(u)}</td><td class="num">${byUniversity[u]}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="card" style="margin-top:18px;">
        <h3>Actions</h3>
        <p class="card-note">Add data from another university, export the merged dataset as JSON (for example to place it in <code>data/dataset.json</code> on GitHub so it loads automatically), re-import a previous export, or reset the tool.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; padding-bottom:14px;">
          <button id="btn-data-add" class="btn btn-primary">+ Add data</button>
          <button id="btn-data-export" class="btn btn-light">Export (JSON)</button>
          <button id="btn-data-import" class="btn btn-light">Import a JSON export</button>
          <input type="file" id="data-import-input" accept=".json" style="display:none;">
          <button id="btn-data-reset" class="btn btn-light">Reset</button>
        </div>
      </div>
    `;

    document.getElementById("btn-data-add").addEventListener("click", () => { refreshUploadScreen(); showScreen("upload"); });
    document.getElementById("btn-data-export").addEventListener("click", exportJSON);
    document.getElementById("btn-data-reset").addEventListener("click", () => {
      if (window.confirm("Resetting will delete all data imported in this browser. Continue?")) resetAll();
    });
    document.getElementById("btn-data-import").addEventListener("click", () => document.getElementById("data-import-input").click());
    document.getElementById("data-import-input").addEventListener("change", importJSON);
  }

  function exportJSON() {
    try {
      const data = { records: state.records, datasets: state.datasets, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dataset.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert("Export error: " + e.message);
    }
  }

  function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.records) && data.records.length > 0) {
          state.records = state.records.concat(data.records);
          state.datasets = state.datasets.concat(data.datasets || []);
          persist();
          buildDashboard();
        } else {
          window.alert("Invalid or empty JSON file.");
        }
      } catch (err) {
        window.alert("Unable to read this JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  init();
})();
