/* ============================================================
   Dashboard — render functions for each analysis section
   ============================================================ */

const Dashboard = (() => {
  const DE = DataEngine;
  let CFG = null;

  const COLOR_SEL = "#1E4682";   // selected university
  const COLOR_ALL = "#C39B3C";   // entire sample
  const COLOR_BASE = "#4182C8";

  const VAR_RANGES = {
    score_intl: [0, 10], aisance_fin: [1, 5], moyenne_acad_norm: [0, 10], educ_num: [1, 6],
    revenu_num: [1, 8], depense_imp: [0, 1], scholarship: [0, 1], psy_openness: [1, 5], psy_efficacy: [1, 5],
  };

  function init(config) { CFG = config; }

  // ---------------------------------------------------------
  // generic helpers
  // ---------------------------------------------------------

  function getCtxData(ctx) {
    const all = ctx.records;
    const sel = ctx.selectedUniversity;
    const base = sel === "ALL" ? all : all.filter((r) => r.University === sel);
    const compareActive = sel !== "ALL" && ctx.compare;
    return { all, base, compareActive, sel };
  }

  function fmtPct(x) { return x === null || x === undefined || isNaN(x) ? "–" : Math.round(x) + "%"; }
  function fmtNum(x, d) { d = d === undefined ? 1 : d; return x === null || x === undefined || isNaN(x) ? "–" : x.toFixed(d); }

  function pStr(p) {
    if (p === null || p === undefined || isNaN(p)) return "–";
    if (p < 0.001) return "p<0.001";
    if (p < 0.01) return "p<0.01";
    if (p < 0.05) return "p<0.05";
    return "p=" + p.toFixed(3);
  }
  function sigBadge(p) {
    if (p === null || p === undefined || isNaN(p)) return `<span class="badge ns">n/a</span>`;
    return p < 0.05 ? `<span class="badge sig">${pStr(p)}</span>` : `<span class="badge ns">${pStr(p)} (n.s.)</span>`;
  }
  function sigStars(p) {
    if (p === null || p === undefined || isNaN(p)) return "";
    if (p < 0.001) return "***";
    if (p < 0.01) return "**";
    if (p < 0.05) return "*";
    return "";
  }

  function sectionHeader(title, desc) {
    return `<div class="section-title"><span class="stripe"></span><h2>${title}</h2></div>` +
      (desc ? `<p class="section-desc">${desc}</p>` : "");
  }
  function card(id, title, note, extra, heightClass) {
    return `<div class="card"><h3>${title}</h3>${note ? `<p class="card-note">${note}</p>` : ""}
      <div class="chart-wrap ${heightClass || "h-260"}"><canvas id="${id}"></canvas></div>${extra || ""}</div>`;
  }
  function kpi(value, label) {
    return `<div class="kpi-card"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
  }
  function legendBar() {
    return `<div class="legend-pair" style="margin:-8px 0 16px;">
      <span class="item"><span class="swatch" style="background:${COLOR_SEL}"></span>Selected university</span>
      <span class="item"><span class="swatch" style="background:${COLOR_ALL}"></span>Entire sample</span>
    </div>`;
  }
  function emptyState(msg) {
    return `<div class="empty-state"><p>${msg}</p></div>`;
  }

  function pctOf(records, field, value) {
    const valid = records.filter((r) => r[field] !== null && r[field] !== undefined);
    if (!valid.length) return null;
    return (valid.filter((r) => r[field] === value).length / valid.length) * 100;
  }

  function meanCompare(base, all, field, compareActive) {
    const b = DE.meanSE(base.map((r) => r[field]).filter((v) => v !== null && v !== undefined));
    const a = compareActive ? DE.meanSE(all.map((r) => r[field]).filter((v) => v !== null && v !== undefined)) : null;
    return { b, a };
  }

  function catDistCompare(base, all, field, compareActive, sortCats) {
    const countsBase = DE.countBy(base, field);
    const categories = sortCats || Object.keys(countsBase).sort((a, b) => countsBase[b] - countsBase[a]);
    const nBase = base.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== "").length;
    const pctBase = categories.map((c) => (nBase ? ((countsBase[c] || 0) / nBase) * 100 : 0));
    let pctAll = null;
    if (compareActive) {
      const countsAll = DE.countBy(all, field);
      const nAll = all.filter((r) => r[field] !== null && r[field] !== undefined && r[field] !== "").length;
      pctAll = categories.map((c) => (nAll ? ((countsAll[c] || 0) / nAll) * 100 : 0));
    }
    return { categories, pctBase, pctAll };
  }

  function crossPct(records, catField, groupField, order) {
    const cross = DE.crossCount(records, catField, groupField);
    const out = {};
    Object.keys(cross).forEach((cat) => {
      const total = Object.values(cross[cat]).reduce((a, b) => a + b, 0);
      out[cat] = {};
      order.forEach((g) => (out[cat][g] = total ? ((cross[cat][g] || 0) / total) * 100 : 0));
    });
    return out;
  }

  function distChart(canvasId, categories, pctBase, pctAll, compareActive, opts) {
    opts = opts || {};
    const canvas = document.getElementById(canvasId);
    if (compareActive) {
      Charts.groupedBarChart(canvas, categories, [
        { label: "Selected university", data: pctBase, color: COLOR_SEL },
        { label: "Entire sample", data: pctAll, color: COLOR_ALL },
      ], Object.assign({ max: 100, horizontal: true }, opts));
    } else {
      Charts.barChart(canvas, categories, pctBase, Object.assign({ colors: COLOR_BASE, max: 100, horizontal: true }, opts));
    }
  }

  function themeKeys(theme) {
    return CFG.fields.filter((f) => f.dim === theme).map((f) => f.key);
  }
  function themeMean(records, theme) {
    const keys = themeKeys(theme);
    const vals = [];
    records.forEach((r) => keys.forEach((k) => { if (r[k] !== null && r[k] !== undefined) vals.push(r[k]); }));
    return vals.length ? DE.mean(vals) : null;
  }

  // ===========================================================
  // A. Overview
  // ===========================================================
  function renderOverview(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const colors = order.map((g) => CFG.groups.colors[g]);
    const container = document.getElementById("section-overview");

    const n = base.length;
    const wantsToGo = base.filter((r) => r.profil === "Yes").length;
    const applied = base.filter((r) => r.a_postule === "Yes").length;
    const alreadyGone = base.filter((r) => r.a_participe === "Yes").length;

    const counts = DE.countBy(base, "groupe");
    const pctBase = order.map((g) => (n ? ((counts[g] || 0) / n) * 100 : 0));
    let pctAll = null;
    if (compareActive) {
      const countsAll = DE.countBy(all, "groupe");
      const nAll = all.length;
      pctAll = order.map((g) => (nAll ? ((countsAll[g] || 0) / nAll) * 100 : 0));
    }

    container.innerHTML = sectionHeader("Overview",
      "This section presents the overall composition of the sample: the share of respondents in each of the four mobility profiles (already gone, wants to go and has applied, wants to go without having applied, does not want to go), and the conversion funnel between these stages.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(n, "Respondents" + (compareActive ? " (selected university)" : ""))}
        ${kpi(fmtPct(n ? (wantsToGo / n) * 100 : null), "Want to go on mobility")}
        ${kpi(fmtPct(n ? (alreadyGone / n) * 100 : null), "Have already gone")}
      </div>
      <div class="grid">
        ${card("chart-ov-groups", "Distribution across four groups", "Share of each mobility profile in the sample.")}
        ${card("chart-ov-funnel", "Mobility funnel", "From the total number of respondents to those who want to go, have applied, and have actually gone.")}
      </div>`;

    const labelArr = order.map((g) => labels[g]);
    if (compareActive) {
      Charts.groupedBarChart(document.getElementById("chart-ov-groups"), labelArr, [
        { label: "Selected university", data: pctBase, color: COLOR_SEL },
        { label: "Entire sample", data: pctAll, color: COLOR_ALL },
      ], { max: 100 });
    } else {
      Charts.barChart(document.getElementById("chart-ov-groups"), labelArr, pctBase, { colors, max: 100 });
    }

    Charts.barChart(document.getElementById("chart-ov-funnel"),
      ["Respondents", "Want to go", "Applied", "Already gone"],
      [n, wantsToGo, applied, alreadyGone],
      { horizontal: true, colors: [CFG.theme.rainbow[5], CFG.theme.rainbow[4], CFG.theme.rainbow[2], CFG.theme.rainbow[3]] });
  }

  // ===========================================================
  // B. Socio-demographic profile
  // ===========================================================
  function renderSocio(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-socio");

    container.innerHTML = sectionHeader("Socio-demographic profile",
      "Distribution of respondents by gender, level of study and geographic area of origin, and the composition of each mobility group along these characteristics.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid">
        ${card("chart-socio-genre", "Gender", "Distribution of respondents by self-reported gender.")}
        ${card("chart-socio-niveau", "Study level", "Distribution of respondents by level of study.")}
        ${card("chart-socio-zone", "Geographic area of origin", "Distribution of respondents by geographic area.")}
      </div>
      <div class="grid">
        ${card("chart-socio-genre-grp", "Gender by mobility group", "Gender composition within each group (100% per row).", "", "h-300")}
        ${card("chart-socio-niveau-grp", "Study level by group", "Study level composition within each group (100% per row).", "", "h-300")}
      </div>`;

    ["genre", "niveau", "zone_geo"].forEach((field, i) => {
      const id = ["chart-socio-genre", "chart-socio-niveau", "chart-socio-zone"][i];
      const { categories, pctBase, pctAll } = catDistCompare(base, all, field, compareActive);
      distChart(id, categories, pctBase, pctAll, compareActive);
    });

    const genreCats = Object.keys(DE.countBy(base, "genre"));
    Charts.stackedPercentChart(document.getElementById("chart-socio-genre-grp"), genreCats,
      order.map((g) => ({ key: g, label: labels[g], color: CFG.groups.colors[g] })),
      crossPct(base, "genre", "groupe", order));

    const niveauCats = Object.keys(DE.countBy(base, "niveau"));
    Charts.stackedPercentChart(document.getElementById("chart-socio-niveau-grp"), niveauCats,
      order.map((g) => ({ key: g, label: labels[g], color: CFG.groups.colors[g] })),
      crossPct(base, "niveau", "groupe", order));
  }

  // ===========================================================
  // C. Academic & language profile
  // ===========================================================
  function renderAcademic(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-academic");

    const gradeByGroup = DE.meanByGroup(base, "moyenne_acad_norm", "groupe", order);
    const gradeMeans = order.map((g) => gradeByGroup[g].mean);
    const gradeSE = order.map((g) => gradeByGroup[g].se || 0);
    const kwGrade = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.moyenne_acad_norm)));

    const certCats = CFG.englishLevels;
    const certCountsBase = DE.countBy(base, "english_cert");
    const nCertBase = base.filter((r) => r.english_cert !== null && r.english_cert !== undefined).length;
    const pctCertBase = certCats.map((_, i) => (nCertBase ? ((certCountsBase[i] || 0) / nCertBase) * 100 : 0));
    let pctCertAll = null;
    if (compareActive) {
      const certCountsAll = DE.countBy(all, "english_cert");
      const nCertAll = all.filter((r) => r.english_cert !== null && r.english_cert !== undefined).length;
      pctCertAll = certCats.map((_, i) => (nCertAll ? ((certCountsAll[i] || 0) / nCertAll) * 100 : 0));
    }

    const gradeCmp = meanCompare(base, all, "moyenne_acad_norm", compareActive);
    const certPctBase = pctOf(base, "english_certified", 1);
    const certPctAll = compareActive ? pctOf(all, "english_certified", 1) : null;

    container.innerHTML = sectionHeader("Academic & language profile",
      "The academic grade is normalized on a 0-10 scale, accounting for each university's own grading scale. The certified English level corresponds to the highest self-reported certification (Q24); 'certified' means a level of B2 or above.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(gradeCmp.b.mean, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(gradeCmp.a.mean, 1)}</span>` : ""), "Academic grade (/10)" + (compareActive ? " — selected / overall" : ""))}
        ${kpi(fmtPct(certPctBase) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(certPctAll)}</span>` : ""), "English certified ≥ B2" + (compareActive ? " — selected / overall" : ""))}
        ${kpi(base.length, "Respondents")}
      </div>
      <div class="grid">
        ${card("chart-acad-grade-grp", "Normalized academic grade (/10) by group", `Mean ± standard error. Overall difference between groups: ${sigBadge(kwGrade.p)} (Kruskal-Wallis test).`)}
        ${card("chart-acad-english", "Certified English level (Q24)", "Distribution of self-reported certification levels.")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-acad-grade-grp"), order.map((g) => labels[g]),
      [{ label: "Mean", data: gradeMeans, errorBars: gradeSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 10 });

    distChart("chart-acad-english", certCats, pctCertBase, pctCertAll, compareActive, { horizontal: true });
  }

  // ===========================================================
  // D. Financial profile
  // ===========================================================
  function renderFinancial(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-financial");

    // Financial comfort, original scale: 1 = very comfortable, 5 = not comfortable at all
    const comfortByGroup = DE.meanByGroup(base, "aisance_fin", "groupe", order);
    const comfortMeans = order.map((g) => comfortByGroup[g].mean);
    const comfortSE = order.map((g) => comfortByGroup[g].se || 0);
    const kwFin = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.aisance_fin)));

    // % can absorb 1,000 unexpected expense, by group
    const depPct = order.map((g) => pctOf(base.filter((r) => r.groupe === g), "depense_imp", 1));
    // % scholarship, by group
    const schPct = order.map((g) => pctOf(base.filter((r) => r.groupe === g), "scholarship", 1));

    // income distribution
    const incomeLabels = CFG.incomeLabels;
    const incomeCountsBase = DE.countBy(base, "revenu_num");
    const nIncBase = base.filter((r) => r.revenu_num !== null && r.revenu_num !== undefined).length;
    const pctIncBase = incomeLabels.map((_, i) => (nIncBase ? ((incomeCountsBase[i + 1] || 0) / nIncBase) * 100 : 0));
    let pctIncAll = null;
    if (compareActive) {
      const incomeCountsAll = DE.countBy(all, "revenu_num");
      const nIncAll = all.filter((r) => r.revenu_num !== null && r.revenu_num !== undefined).length;
      pctIncAll = incomeLabels.map((_, i) => (nIncAll ? ((incomeCountsAll[i + 1] || 0) / nIncAll) * 100 : 0));
    }

    const comfortCmp = meanCompare(base, all, "aisance_fin", compareActive);
    const depCmp = { b: pctOf(base, "depense_imp", 1), a: compareActive ? pctOf(all, "depense_imp", 1) : null };
    const schCmp = { b: pctOf(base, "scholarship", 1), a: compareActive ? pctOf(all, "scholarship", 1) : null };

    container.innerHTML = sectionHeader("Financial profile",
      "Financial comfort is reported on its original 1-5 scale: <strong>1 = very comfortable, 5 = not comfortable at all</strong> (so a lower average indicates a more comfortable group). The ability to absorb an unexpected €1,000 expense and scholarship status (Q25) are used as additional indicators of financial constraint.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(comfortCmp.b.mean, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(comfortCmp.a.mean, 1)}</span>` : ""), "Financial comfort (1-5, 1=very comfortable)" + (compareActive ? " — selected / overall" : ""))}
        ${kpi(fmtPct(depCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(depCmp.a)}</span>` : ""), "Can absorb a €1,000 unexpected expense" + (compareActive ? " — selected / overall" : ""))}
        ${kpi(fmtPct(schCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(schCmp.a)}</span>` : ""), "Scholarship holder (Q25)" + (compareActive ? " — selected / overall" : ""))}
      </div>
      <div class="grid">
        ${card("chart-fin-comfort", "Financial comfort (1-5) by group", `Mean ± standard error. <strong>1 = very comfortable, 5 = not comfortable at all</strong> (lower = more comfortable). Overall difference between groups: ${sigBadge(kwFin.p)}.`)}
        ${card("chart-fin-income", "Household income", "Distribution by monthly household income bracket.")}
      </div>
      <div class="grid">
        ${card("chart-fin-dep", "Can absorb an unexpected €1,000 expense", "Share of respondents answering 'Yes', by mobility group.")}
        ${card("chart-fin-sch", "Scholarship holder (Q25)", "Share of scholarship holders, by mobility group.")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-fin-comfort"), order.map((g) => labels[g]),
      [{ label: "Mean", data: comfortMeans, errorBars: comfortSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 5 });

    distChart("chart-fin-income", incomeLabels, pctIncBase, pctIncAll, compareActive, { horizontal: true });

    Charts.barChart(document.getElementById("chart-fin-dep"), order.map((g) => labels[g]), depPct, { colors: order.map((g) => CFG.groups.colors[g]), max: 100, horizontal: true });
    Charts.barChart(document.getElementById("chart-fin-sch"), order.map((g) => labels[g]), schPct, { colors: order.map((g) => CFG.groups.colors[g]), max: 100, horizontal: true });
  }

  // ===========================================================
  // E. Parental capital
  // ===========================================================
  function renderParental(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-parental");

    const educByGroup = DE.meanByGroup(base, "educ_num", "groupe", order);
    const educMeans = order.map((g) => educByGroup[g].mean);
    const educSE = order.map((g) => educByGroup[g].se || 0);
    const kwEduc = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.educ_num)));

    // parental erasmus (Yes / No / No answer) by group, 100% stacked
    const parEraData = {};
    order.forEach((g) => {
      const grpRecs = base.filter((r) => r.groupe === g);
      const total = grpRecs.length;
      const yes = grpRecs.filter((r) => r.parental_erasmus === "Yes").length;
      const no = grpRecs.filter((r) => r.parental_erasmus === "No").length;
      const na = total - yes - no;
      parEraData[labels[g]] = {
        Yes: total ? (yes / total) * 100 : 0,
        No: total ? (no / total) * 100 : 0,
        "No answer": total ? (na / total) * 100 : 0,
      };
    });

    const educCmp = meanCompare(base, all, "educ_num", compareActive);
    const parEraCmp = { b: pctOf(base, "parental_erasmus", "Yes"), a: compareActive ? pctOf(all, "parental_erasmus", "Yes") : null };

    container.innerHTML = sectionHeader("Parental capital",
      "Parental education is coded on an ordinal scale from 1 (no formal education) to 6 (postgraduate studies) and reflects transmitted cultural capital. A parent's own Erasmus participation (Q13) gives direct access to information about the program.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(educCmp.b.mean, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(educCmp.a.mean, 1)}</span>` : ""), "Parental education (/6)" + (compareActive ? " — selected / overall" : ""))}
        ${kpi(fmtPct(parEraCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(parEraCmp.a)}</span>` : ""), "Parent who did an Erasmus exchange" + (compareActive ? " — selected / overall" : ""))}
      </div>
      <div class="grid">
        ${card("chart-par-educ", "Parental education level (/6) by group", `Mean ± standard error. 1 = no formal education, 6 = postgraduate studies. Overall difference between groups: ${sigBadge(kwEduc.p)}.`)}
        ${card("chart-par-erasmus", "Parental Erasmus (Q13) by group", "Share of respondents reporting that a parent took part in an Erasmus exchange.", "", "h-300")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-par-educ"), order.map((g) => labels[g]),
      [{ label: "Mean", data: educMeans, errorBars: educSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 6 });

    Charts.stackedPercentChart(document.getElementById("chart-par-erasmus"), order.map((g) => labels[g]),
      [
        { key: "Yes", label: "Yes", color: CFG.yesNoColors.Yes },
        { key: "No", label: "No", color: CFG.yesNoColors.No },
        { key: "No answer", label: "No answer", color: CFG.yesNoColors["No answer"] },
      ], parEraData);
  }

  // ===========================================================
  // F. International & psychological profile
  // ===========================================================
  function renderInternational(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-international");

    const intlByGroup = DE.meanByGroup(base, "score_intl", "groupe", order);
    const intlMeans = order.map((g) => intlByGroup[g].mean);
    const intlSE = order.map((g) => intlByGroup[g].se || 0);
    const kwIntl = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.score_intl)));

    const themes = CFG.dimsPsyOrder;

    const radarDatasets = order.map((g) => ({
      label: labels[g],
      data: themes.map((t) => themeMean(base.filter((r) => r.groupe === g), t)),
      color: CFG.groups.colors[g],
    }));

    container.innerHTML = sectionHeader("International & psychological profile",
      "The international profile score (0-10) summarizes 8 psychological items related to international openness (working abroad, curiosity, adaptability, European identity...). The radar chart shows, for each of the 7 broad psychological dimensions, the average score (1-5 scale) by mobility group.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid">
        ${card("chart-intl-score", "International profile score (0-10) by group", `Mean ± standard error. Overall difference between groups: ${sigBadge(kwIntl.p)} (Kruskal-Wallis).`)}
        ${card("chart-intl-radar", "Psychological profile by group (7 dimensions)", "Average score (1-5) on each broad psychological dimension.", "", "h-340")}
      </div>` +
      (compareActive ? `<div class="grid cols-1">
        ${card("chart-intl-radar-cmp", "Psychological profile: selected university vs overall", "Comparison of the average psychological profile across all respondents.", "", "h-340")}
      </div>` : "");

    Charts.groupedBarChart(document.getElementById("chart-intl-score"), order.map((g) => labels[g]),
      [{ label: "Score", data: intlMeans, errorBars: intlSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 10 });

    Charts.radarChart(document.getElementById("chart-intl-radar"), themes, radarDatasets, { min: 1, max: 5 });

    if (compareActive) {
      Charts.radarChart(document.getElementById("chart-intl-radar-cmp"), themes, [
        { label: "Selected university", data: themes.map((t) => themeMean(base, t)), color: COLOR_SEL },
        { label: "Entire sample", data: themes.map((t) => themeMean(all, t)), color: COLOR_ALL },
      ], { min: 1, max: 5 });
    }
  }

  // ===========================================================
  // G. Barriers to mobility
  // ===========================================================
  function renderBarriers(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const container = document.getElementById("section-barriers");

    const freinFields = CFG.fields.filter((f) => f.key.startsWith("frein_"));
    const allKeys = freinFields.map((f) => f.key);
    const validKeys = DE.validLikertCols(base, allKeys);

    if (validKeys.length === 0) {
      container.innerHTML = sectionHeader("Barriers to mobility",
        "This section analyzes the barriers reported to international mobility, item by item.") +
        emptyState("No usable responses on barrier items for this selection.");
      return;
    }

    const items = freinFields.filter((f) => validKeys.includes(f.key)).map((f) => {
      const vals = base.map((r) => r[f.key]).filter((v) => v !== null && v !== undefined);
      const ms = DE.meanSE(vals);
      return { key: f.key, label: f.label, mean: ms.mean, se: ms.se, n: ms.n };
    }).sort((a, b) => (b.mean || 0) - (a.mean || 0));

    const dists = {};
    items.forEach((it) => { dists[it.key] = DE.likertDistribution(base, it.key); });

    // wants vs does not want differentiators
    const yesRecs = base.filter((r) => r.profil === "Yes");
    const noRecs = base.filter((r) => r.profil === "No");
    const diffs = items.map((it) => {
      const yesVals = yesRecs.map((r) => r[it.key]).filter((v) => v !== null);
      const noVals = noRecs.map((r) => r[it.key]).filter((v) => v !== null);
      const mwu = DE.mannWhitneyU(yesVals, noVals);
      return { label: it.label, meanYes: DE.mean(yesVals), meanNo: DE.mean(noVals), p: mwu.p };
    }).filter((d) => d.meanYes !== null && d.meanNo !== null)
      .sort((a, b) => (a.p === null ? 1 : a.p) - (b.p === null ? 1 : b.p))
      .slice(0, 8);

    container.innerHTML = sectionHeader("Barriers to mobility",
      "Each barrier is rated on a scale from 1 (not a barrier at all) to 5 (major barrier). Items with no variance (identical response for everyone, usually due to questionnaire routing) are excluded. The bottom section identifies the barriers that most distinguish respondents who want to go from those who do not.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-1">
        ${card("chart-bar-means", "Average score per barrier (1-5)", "Mean ± standard error, sorted from strongest to weakest barrier.", "", "h-420")}
      </div>
      <div class="grid cols-1">
        ${card("chart-bar-likert", "Response distribution per barrier", "Share of respondents choosing each level (1=not at all, 5=completely).", "", "h-420")}
      </div>
      <div class="grid cols-1">
        ${card("chart-bar-diff", "Most differentiating barriers: wants to go vs does not want to go", "Means by subgroup (based on whether the respondent wants to go on mobility). * p<0.05, ** p<0.01, *** p<0.001 (Mann-Whitney test).", "", "h-340")}
      </div>`;

    if (compareActive) {
      const meansAll = items.map((it) => DE.mean(all.map((r) => r[it.key]).filter((v) => v !== null)));
      Charts.groupedBarChart(document.getElementById("chart-bar-means"), items.map((i) => i.label), [
        { label: "Selected university", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_SEL },
        { label: "Entire sample", data: meansAll, color: COLOR_ALL },
      ], { horizontal: true, max: 5 });
    } else {
      Charts.groupedBarChart(document.getElementById("chart-bar-means"), items.map((i) => i.label), [
        { label: "Mean", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_BASE },
      ], { horizontal: true, max: 5 });
    }

    Charts.likertChart(document.getElementById("chart-bar-likert"), items, dists, CFG.likertPalette,
      { likertLabels: ["1 - Not at all", "2", "3", "4", "5 - Completely"] });

    if (diffs.length > 0) {
      Charts.dumbbellChart(document.getElementById("chart-bar-diff"),
        diffs.map((d) => ({ label: d.label, a: d.meanNo, b: d.meanYes, sigStars: sigStars(d.p) })),
        CFG.yesNoColors.No, CFG.yesNoColors.Yes, "Does not want to go", "Wants to go");
    }
  }

  // ===========================================================
  // H. Reasons for going (Group 1 only)
  // ===========================================================
  function renderReasons(ctx) {
    const { base } = getCtxData(ctx);
    const container = document.getElementById("section-reasons");

    const grp1 = base.filter((r) => r.groupe === "Already gone");
    const raisonFields = CFG.fields.filter((f) => f.key.startsWith("raison_"));
    const validKeys = DE.validLikertCols(grp1, raisonFields.map((f) => f.key));

    if (grp1.length === 0 || validKeys.length === 0) {
      container.innerHTML = sectionHeader("Reasons for going (\u201CAlready gone\u201D group)",
        "This section presents, for respondents who have already completed a mobility stay, the reasons that motivated their departure.") +
        emptyState("Not enough respondents in the \u201CAlready gone\u201D group for this selection.");
      return;
    }

    const items = raisonFields.filter((f) => validKeys.includes(f.key)).map((f) => {
      const vals = grp1.map((r) => r[f.key]).filter((v) => v !== null && v !== undefined);
      const ms = DE.meanSE(vals);
      return { key: f.key, label: f.label, mean: ms.mean, se: ms.se, n: ms.n };
    }).sort((a, b) => (b.mean || 0) - (a.mean || 0));

    container.innerHTML = sectionHeader("Reasons for going (\u201CAlready gone\u201D group)",
      `This section presents, for the ${grp1.length} respondents who have already completed a mobility stay, the reasons that motivated their departure (scale 1=not at all, 5=completely).` +
      (grp1.length < 10 ? " <strong>Note: small sample size, interpret with caution.</strong>" : "")) +
      `<div class="grid cols-1">
        ${card("chart-reasons-means", "Average score per reason for going (1-5)", "Mean ± standard error, sorted from most to least cited reason.", "", "h-420")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-reasons-means"), items.map((i) => i.label), [
      { label: "Mean", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_BASE },
    ], { horizontal: true, max: 5 });
  }

  // ===========================================================
  // I. Group 2 vs Group 3
  // ===========================================================
  function renderGrp23(ctx) {
    const { base } = getCtxData(ctx);
    const container = document.getElementById("section-grp23");

    const grp2 = base.filter((r) => r.groupe === "Wants to go & applied");
    const grp3 = base.filter((r) => r.groupe === "Wants to go");

    if (grp2.length === 0 && grp3.length === 0) {
      container.innerHTML = sectionHeader("Group 2 vs Group 3: who follows through?",
        "Comparison between respondents who want to go and have already applied (group 2) and those who want to go but have not (yet) applied (group 3).") +
        emptyState("Not enough respondents in these two groups for this selection.");
      return;
    }

    const vars = CFG.grp23CompareVars;
    const rows = vars.map((v) => {
      const v2 = grp2.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
      const v3 = grp3.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
      const m2 = DE.meanSE(v2), m3 = DE.meanSE(v3);
      const mwu = DE.mannWhitneyU(v2, v3);
      const range = VAR_RANGES[v.key] || [0, 1];
      const norm = (x) => x === null ? null : ((x - range[0]) / (range[1] - range[0])) * 100;
      return { label: v.label, key: v.key, m2, m3, p: mwu.p, norm2: norm(m2.mean), norm3: norm(m3.mean), range };
    });

    container.innerHTML = sectionHeader("Group 2 vs Group 3: who follows through?",
      `Comparison between respondents who want to go and have already applied ("Wants to go & applied", n=${grp2.length}) and those who want to go but have not yet applied ("Wants to go (not applied)", n=${grp3.length}). The chart shows normalized values (0-100, on each variable's own scale) to visually compare gaps; the table below gives the actual values.`) +
      `<div class="grid cols-1">
        ${card("chart-grp23-dumbbell", "Normalized comparison (0-100)", "For each variable, relative position on its own scale. * p<0.05, ** p<0.01, *** p<0.001 (Mann-Whitney test).", "", "h-340")}
      </div>
      <div class="grid cols-1">
        <div class="card"><h3>Detailed values</h3>
        <table class="stat-table">
          <thead><tr><th>Variable</th><th class="num">Wants to go & applied</th><th class="num">Wants to go (not applied)</th><th class="num">Test</th></tr></thead>
          <tbody>
          ${rows.map((r) => `<tr>
            <td>${r.label}</td>
            <td class="num">${fmtNum(r.m2.mean, 2)} (n=${r.m2.n})</td>
            <td class="num">${fmtNum(r.m3.mean, 2)} (n=${r.m3.n})</td>
            <td class="num">${sigBadge(r.p)}</td>
          </tr>`).join("")}
          </tbody>
        </table>
        </div>
      </div>`;

    Charts.dumbbellChart(document.getElementById("chart-grp23-dumbbell"),
      rows.map((r) => ({ label: r.label, a: r.norm3, b: r.norm2, sigStars: sigStars(r.p) })),
      CFG.groups.colors["Wants to go"], CFG.groups.colors["Wants to go & applied"],
      "Wants to go (not applied)", "Wants to go & applied");
  }

  // ===========================================================
  // J. Comparison between universities
  // ===========================================================
  function renderUniversities(ctx) {
    const { all } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-universities");

    const unis = [...new Set(all.map((r) => r.University))].sort();

    if (unis.length < 2) {
      container.innerHTML = sectionHeader("Comparison between universities",
        "This section compares the composition of mobility groups across the different universities loaded into the tool.") +
        emptyState("Load data from at least two universities to enable this comparison.");
      return;
    }

    const compData = crossPct(all, "University", "groupe", order);
    const nByUni = DE.countBy(all, "University");

    container.innerHTML = sectionHeader("Comparison between universities",
      `This section compares, across all ${unis.length} loaded universities, the composition of the four mobility groups, as well as the number of respondents per site.`) +
      `<div class="grid">
        ${card("chart-univ-comp", "Group composition by university", "Each row totals 100%: compare the share of each mobility profile across sites.", "", "h-300")}
        ${card("chart-univ-n", "Number of respondents per university", "", "", "h-300")}
      </div>`;

    Charts.stackedPercentChart(document.getElementById("chart-univ-comp"), unis,
      order.map((g) => ({ key: g, label: labels[g], color: CFG.groups.colors[g] })), compData);

    Charts.barChart(document.getElementById("chart-univ-n"), unis, unis.map((u) => nByUni[u] || 0), { horizontal: true, colors: COLOR_BASE });
  }

  // ===========================================================
  // K. Statistical tests
  // ===========================================================
  function renderStats(ctx) {
    const { all, base, sel } = getCtxData(ctx);
    const order = CFG.groups.order;
    const container = document.getElementById("section-stats");

    const catVars = [
      { key: "genre", label: "Gender" },
      { key: "niveau", label: "Study level" },
      { key: "zone_geo", label: "Geographic area" },
      { key: "parental_erasmus", label: "Parental Erasmus (Q13)" },
    ];
    const numVars = [
      { key: "moyenne_acad_norm", label: "Academic grade (normalized)" },
      { key: "aisance_fin", label: "Financial comfort" },
      { key: "score_intl", label: "International profile score" },
      { key: "educ_num", label: "Parental education" },
      { key: "score_frein_simple", label: "Composite barrier score" },
    ];

    const grpRows = [];
    catVars.forEach((v) => {
      const cross = DE.crossCount(base, v.key, "groupe");
      const cats = Object.keys(cross);
      if (cats.length < 2) return;
      const table = cats.map((cat) => order.map((g) => (cross[cat] && cross[cat][g]) || 0));
      const res = DE.chiSquareTest(table);
      grpRows.push({ label: v.label, test: "Chi² (groups)", stat: res.chi2, df: res.df, p: res.p });
    });
    numVars.forEach((v) => {
      const groups = order.map((g) => base.filter((r) => r.groupe === g).map((r) => r[v.key]).filter((x) => x !== null && x !== undefined));
      const res = DE.kruskalWallis(groups);
      if (res.H === null) return;
      grpRows.push({ label: v.label, test: "Kruskal-Wallis (groups)", stat: res.H, df: res.df, p: res.p });
    });

    let univSection = "";
    if (sel !== "ALL") {
      const rest = all.filter((r) => r.University !== sel);
      const univRows = [];
      catVars.concat([{ key: "groupe", label: "Mobility group" }]).forEach((v) => {
        const cats = new Set();
        base.concat(rest).forEach((r) => { if (r[v.key] !== null && r[v.key] !== undefined && r[v.key] !== "") cats.add(r[v.key]); });
        const catArr = [...cats];
        if (catArr.length < 2) return;
        const cBase = DE.countBy(base, v.key), cRest = DE.countBy(rest, v.key);
        const table = catArr.map((cat) => [cBase[cat] || 0, cRest[cat] || 0]);
        const res = DE.chiSquareTest(table);
        univRows.push({ label: v.label, test: "Chi² (selection vs rest)", stat: res.chi2, df: res.df, p: res.p });
      });
      numVars.concat([{ key: "revenu_num", label: "Household income" }]).forEach((v) => {
        const a = base.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
        const b = rest.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
        const res = DE.mannWhitneyU(a, b);
        if (res.p === null) return;
        univRows.push({ label: v.label, test: "Mann-Whitney (selection vs rest)", stat: res.U, df: null, p: res.p });
      });

      univSection = `<div class="grid cols-1"><div class="card">
        <h3>${DE.escapeHtml(sel)} vs the rest of the sample</h3>
        <p class="card-note">Compares respondents from the selected university to all other respondents loaded into the tool.</p>
        ${statTable(univRows)}
      </div></div>`;
    }

    container.innerHTML = sectionHeader("Statistical tests",
      "This section summarizes the significance tests used elsewhere in the dashboard: the Chi-square test for categorical variables, the Kruskal-Wallis test (difference across the four groups), and the Mann-Whitney test (comparison of two groups). A result is considered statistically significant when p < 0.05.") +
      `<div class="grid cols-1"><div class="card">
        <h3>Differences across the four mobility groups${sel !== "ALL" ? ` — ${DE.escapeHtml(sel)}` : ""}</h3>
        <p class="card-note">Tests whether the variable differs significantly across the four mobility groups, within the current selection.</p>
        ${statTable(grpRows)}
      </div></div>` +
      univSection;
  }

  function statTable(rows) {
    if (rows.length === 0) return emptyState("Not enough data for these tests.");
    return `<table class="stat-table">
      <thead><tr><th>Variable</th><th>Test</th><th class="num">Statistic</th><th class="num">p-value</th><th class="num">Significant</th></tr></thead>
      <tbody>
      ${rows.map((r) => `<tr>
        <td>${r.label}</td>
        <td>${r.test}${r.df !== null && r.df !== undefined ? ` (df=${r.df})` : ""}</td>
        <td class="num">${r.stat === null || r.stat === undefined ? "–" : r.stat.toFixed(2)}</td>
        <td class="num">${pStr(r.p)}</td>
        <td class="num">${sigBadge(r.p)}</td>
      </tr>`).join("")}
      </tbody>
    </table>`;
  }

  // ===========================================================
  // L. About
  // ===========================================================
  function renderAbout() {
    const container = document.getElementById("section-about");
    container.innerHTML = sectionHeader("About", "") +
      `<div class="grid cols-1">
        <div class="card">
          <h3>About this dashboard</h3>
          <p class="card-note" style="font-size:0.88rem; line-height:1.6;">
            <strong>Mobility Insights</strong> is an interactive exploration tool for survey data on
            barriers to international student mobility (Erasmus-type exchanges). It is based on the
            analytical framework of the report <em>"Barriers to International Student Mobility —
            Four-Group Approach"</em>, a collective work which classifies respondents into four
            mobility profiles (already gone, wants to go and has applied, wants to go without having
            applied, does not want to go) and examines socio-demographic, academic, financial, and
            psychological factors associated with mobility decisions.
          </p>
          <p class="card-note" style="font-size:0.88rem; line-height:1.6;">
            All data processing — column mapping, derived variables, group classification, composite
            scores, and statistical tests (Chi², Kruskal-Wallis, Mann-Whitney) — runs entirely in
            your browser, using the Excel files you import. No data is ever sent to a server.
          </p>
          <h3 style="margin-top:18px;">Role of AI in building this tool</h3>
          <p class="card-note" style="font-size:0.88rem; line-height:1.6;">
            The code for this dashboard — the data-processing engine, statistical functions, charts,
            calibration screen, and overall visual design — was developed with the assistance of
            <strong>Claude</strong>, an AI assistant created by Anthropic, working from the original
            survey report. The analytical framework, variable definitions, and group logic come from
            that source report; the AI's role was to translate this framework into an interactive,
            browser-based application and to design its visual identity.
          </p>
          <p class="card-note" style="font-size:0.88rem; line-height:1.6;">
            As with any AI-assisted analysis tool, the underlying logic, derived variables, and
            statistical results shown here should be reviewed against the original analysis before
            being used for formal reporting or decision-making.
          </p>
        </div>
      </div>`;
  }

  // ===========================================================
  // L. Policy Warnings — two sections: G4 + G2/G3
  // ===========================================================
  function renderWarnings(ctx) {
    const { all, base, compareActive, sel } = getCtxData(ctx);
    const container = document.getElementById("section-warnings");
    const order = CFG.groups.order;

    const n = base.length;
    if (n === 0) {
      container.innerHTML = sectionHeader("Policy Warnings", "") + emptyState("No data for this selection.");
      return;
    }

    const grp1 = base.filter(r => r.groupe === "Already gone");
    const grp2 = base.filter(r => r.groupe === "Wants to go & applied");
    const grp3 = base.filter(r => r.groupe === "Wants to go");
    const grp4 = base.filter(r => r.groupe === "Does not want to go");
    const n123 = grp1.length + grp2.length + grp3.length;
    const n23  = grp2.length + grp3.length;

    function safeM(arr, field) {
      const vals = arr.map(r => r[field]).filter(v => v !== null && v !== undefined && !isNaN(v));
      return vals.length ? DE.mean(vals) : null;
    }
    function safePct(arr, field, val) {
      const valid = arr.filter(r => r[field] !== null && r[field] !== undefined);
      return valid.length ? valid.filter(r => r[field] === val).length / valid.length * 100 : null;
    }
    function vulnVals(arr) {
      return arr.map(r => r.score_vuln).filter(v => v !== null && !isNaN(v));
    }

    // ── G4 computations ──────────────────────────────────────
    const g4pct        = n > 0 ? grp4.length / n * 100 : null;
    const g4VulnVals   = vulnVals(grp4);
    const g123VulnVals = vulnVals([...grp1,...grp2,...grp3]);
    const g4VulnMean   = g4VulnVals.length ? DE.mean(g4VulnVals) : null;
    const g123VulnMean = g123VulnVals.length ? DE.mean(g123VulnVals) : null;
    const g4ResignedN  = grp4.filter(r => r.vuln_high === 1).length;
    const g4ResignedPct= grp4.length > 0 ? g4ResignedN / grp4.length * 100 : null;
    const mwuG4G123    = DE.mannWhitneyU(g4VulnVals, g123VulnVals);
    const g4IntlMean   = safeM(grp4, "score_intl");
    const g123IntlMean = safeM([...grp1,...grp2,...grp3], "score_intl");
    const g4IntlGap    = (g4IntlMean !== null && g123IntlMean !== null) ? g4IntlMean - g123IntlMean : null;
    // Dominant barrier in G4
    const freinFields  = CFG.fields.filter(f => f.key.startsWith("frein_"));
    const g4BarrierMeans = freinFields.map(f => ({ key: f.key, label: f.label, m: safeM(grp4, f.key) }))
      .filter(x => x.m !== null).sort((a,b) => b.m - a.m);
    const g4TopBarrier = g4BarrierMeans.length ? g4BarrierMeans[0] : null;
    const g4FirstGenPct= grp4.length > 0 ? grp4.filter(r => r.educ_num !== null && r.educ_num <= 2).length / grp4.length * 100 : null;
    const g4ParentalPct= safePct(grp4, "parental_erasmus", "Yes");
    const g4ComfortMean= safeM(grp4, "aisance_fin");
    const g3ComfortMean= safeM(grp3, "aisance_fin");
    // G4 vs G3 vulnerability (are they really different, or hidden G3?)
    const mwuG4G3Vuln  = DE.mannWhitneyU(g4VulnVals, vulnVals(grp3));
    const g3VulnMean   = vulnVals(grp3).length ? DE.mean(vulnVals(grp3)) : null;
    const g4G3VulnGap  = (g4VulnMean !== null && g3VulnMean !== null) ? g4VulnMean - g3VulnMean : null;

    // ── G2/G3 computations ───────────────────────────────────
    const vulnG2      = vulnVals(grp2), vulnG3 = vulnVals(grp3);
    const vulnMeanG2  = vulnG2.length ? DE.mean(vulnG2) : null;
    const vulnMeanG3  = vulnG3.length ? DE.mean(vulnG3) : null;
    const vulnMeanAll = vulnVals(base).length ? DE.mean(vulnVals(base)) : null;
    const vulnGap     = (vulnMeanG3 !== null && vulnMeanG2 !== null) ? vulnMeanG3 - vulnMeanG2 : null;
    const mwuVuln     = DE.mannWhitneyU(vulnG2, vulnG3);
    const resignedG3n = grp3.filter(r => r.vuln_high === 1).length;
    const resignedG3pct = grp3.length > 0 ? resignedG3n / grp3.length * 100 : null;
    const resignedG2n = grp2.filter(r => r.vuln_high === 1).length;
    const resignedG2pct = grp2.length > 0 ? resignedG2n / grp2.length * 100 : null;
    const convRate    = n123 > 0 ? (grp1.length + grp2.length) / n123 * 100 : null;
    const finBarrierG3= safeM(grp3, "frein_02");
    const adminBarrier= safeM([...grp3,...grp4], "frein_15");
    const comfortG2   = safeM(grp2, "aisance_fin");
    const comfortG3   = safeM(grp3, "aisance_fin");
    const comfortGap  = (comfortG2 !== null && comfortG3 !== null) ? comfortG3 - comfortG2 : null;
    const firstGenG3  = grp3.length > 0 ? grp3.filter(r => r.educ_num !== null && r.educ_num <= 2).length / grp3.length * 100 : null;
    const firstGenG2  = grp2.length > 0 ? grp2.filter(r => r.educ_num !== null && r.educ_num <= 2).length / grp2.length * 100 : null;
    const langBarrier = safeM(grp3, "frein_11");
    const noEngG23pct = n23 > 0 ? [...grp2,...grp3].filter(r => r.english_certified === 0).length / n23 * 100 : null;
    const parentalErasPct = safePct(base, "parental_erasmus", "Yes");
    const scoreIntlGap= (compareActive && safeM(base,"score_intl") !== null && safeM(all,"score_intl") !== null)
      ? safeM(all,"score_intl") - safeM(base,"score_intl") : null;

    // ── Shared rendering helpers ─────────────────────────────
    function levelColor(lv) { return {red:"#C84650",orange:"#D27832",green:"#329B5A"}[lv]||"#788291"; }
    function getLevel(v, thresholds) {
      for (const t of thresholds) { if (v < t.max) return t; }
      return thresholds[thresholds.length-1];
    }
    function buildCard(ind) {
      const lv  = ind.value !== null ? getLevel(ind.value, ind.thresholds) : null;
      const col = lv ? levelColor(lv.level) : "#788291";
      const icon= lv ? lv.icon : "–";
      const lbl = lv ? lv.label : "No data";
      const val = ind.value !== null ? ind.format(ind.value) : "–";
      const detailId = "detail-" + ind.id + "-" + Math.random().toString(36).slice(2,6);
      return `<div class="card" style="border-left:4px solid ${col};margin-bottom:12px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:1.5rem;line-height:1;padding-top:2px;">${icon}</span>
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <h3 style="margin:0;font-size:0.95rem;">${ind.title}</h3>
              <span style="background:${col};color:#fff;font-size:0.7rem;font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap;">${lbl}</span>
            </div>
            <p style="margin:0 0 8px;font-size:0.97rem;line-height:1.5;color:var(--text);">
              ${ind.value !== null ? ind.message(ind.value) : "Not enough data for this indicator."}
            </p>
            ${ind.recommendation ? `<div style="background:var(--panel);border-radius:8px;padding:9px 13px;margin-bottom:8px;">
              <span style="font-size:0.71rem;font-weight:800;text-transform:uppercase;letter-spacing:0.05em;color:var(--navy);">💡 What to do</span>
              <p style="margin:4px 0 0;font-size:0.85rem;line-height:1.5;color:var(--text);">${ind.recommendation}</p>
            </div>` : ""}
            <details style="margin-top:2px;">
              <summary style="font-size:0.75rem;color:var(--gray);cursor:pointer;user-select:none;list-style:none;">
                <span style="text-decoration:underline dotted;">Technical details ▾</span>
              </summary>
              <div style="margin-top:6px;padding:8px 12px;background:#F8FAFE;border-radius:6px;font-size:0.78rem;color:var(--gray);line-height:1.5;">
                <strong style="color:var(--navy);">Measured value:</strong> ${val}
                ${ind.groups ? `<br><strong style="color:var(--navy);">Sample:</strong> ${ind.groups}` : ""}
                ${ind.value !== null ? `<br>${ind.detail(ind.value)}` : ""}
              </div>
            </details>
          </div>
        </div>
      </div>`;
    }
    function summaryKpis(inds) {
      const r = inds.filter(i=>i.level&&i.level.level==="red").length;
      const o = inds.filter(i=>i.level&&i.level.level==="orange").length;
      const g = inds.filter(i=>i.level&&i.level.level==="green").length;
      return `<div class="grid cols-3" style="margin-bottom:14px;">
        <div class="kpi-card" style="background:linear-gradient(135deg,#C84650,#8B1E23);"><div class="kpi-value">${r}</div><div class="kpi-label">Critical</div></div>
        <div class="kpi-card" style="background:linear-gradient(135deg,#D27832,#9B5A1E);"><div class="kpi-value">${o}</div><div class="kpi-label">Attention</div></div>
        <div class="kpi-card" style="background:linear-gradient(135deg,#329B5A,#1E6B3A);"><div class="kpi-value">${g}</div><div class="kpi-label">Satisfactory</div></div>
      </div>`;
    }
    function computeInds(inds) {
      return inds.filter(i=>!i.skip).map(i=>({...i, level: i.value!==null?getLevel(i.value,i.thresholds):null}));
    }

    // ── Section 1: Group 4 indicators ───────────────────────
    const indsG4 = computeInds([
      {
        id:"g4_size",
        title:"How many students don't want to go?",
        value: g4pct,
        format: v => Math.round(v) + "% of respondents",
        thresholds:[{max:30,level:"green",icon:"✓",label:"Moderate"},{max:50,level:"orange",icon:"⚡",label:"High"},{max:Infinity,level:"red",icon:"⚠️",label:"Very high"}],
        message: v => `<strong>${Math.round(v)}% of students at this institution (${grp4.length} people) say they don't want to go on an international mobility stay.</strong> This is the starting point: before acting, it's worth understanding whether this reflects a genuine choice or unaddressed barriers.`,
        detail: v => `Group 4 share of total sample. Total respondents: ${base.length}.`,
        recommendation:"Before launching awareness campaigns, understand the reasons: is non-desire linked to lack of information, financial constraints, family context, or a sense that mobility is “not for people like me”? A short qualitative survey of Group 4 students can clarify.",
      },
      {
        id:"g4_vuln",
        title:"Are non-mobile students held back by circumstances, or making a free choice?",
        value: g4VulnMean,
        format: v => v.toFixed(1) + "/10 barrier score",
        thresholds:[{max:4,level:"green",icon:"✓",label:"Choice appears free"},{max:6,level:"orange",icon:"⚡",label:"Partly constrained"},{max:Infinity,level:"red",icon:"⚠️",label:"Likely constrained — not a free choice"}],
        message: v => `Students who don't want to go score <strong>${v.toFixed(1)}/10</strong> on accumulated structural barriers (financial situation, academic background, parental education).${g123VulnMean!==null?` Students who do want to go score ${g123VulnMean.toFixed(1)}/10.`:""} ${v>6?"A score above 6 strongly suggests that non-desire reflects resignation, not genuine preference.":v>4?"This moderate score suggests that structural factors are playing a role alongside personal preference.":"Structural barriers appear limited — non-desire likely reflects genuine preference in most cases."}`,
        detail: v => `Structural Vulnerability Index mean for Group 4: ${v.toFixed(2)}/10.${g123VulnMean!==null?` Groups 1+2+3: ${g123VulnMean.toFixed(2)}.`:""}${mwuG4G123.p!==null?` Mann-Whitney test: ${mwuG4G123.p<0.001?"p<0.001":mwuG4G123.p<0.05?"p="+mwuG4G123.p.toFixed(3):"n.s., p="+mwuG4G123.p.toFixed(3)}.`:""}`,
        recommendation:"If the barrier score is high, awareness campaigns will not be enough. Address financial and social barriers first: expand grant access, reduce application complexity, and make mobility feel attainable for students from less privileged backgrounds.",
        skip: g4VulnMean===null,
      },
      {
        id:"g4_resigned",
        title:"How many non-mobile students are structurally blocked?",
        value: g4ResignedPct,
        format: v => Math.round(v) + `% of Group 4 (${g4ResignedN} students)`,
        thresholds:[{max:20,level:"green",icon:"✓",label:"Low share"},{max:40,level:"orange",icon:"⚡",label:"Significant share"},{max:Infinity,level:"red",icon:"⚠️",label:"Large share — systemic issue"}],
        message: v => `<strong>${Math.round(v)}% of students who say they don't want to go are likely not making a free choice</strong> — their circumstances (financial, academic, family) place them above the critical barrier threshold. ${v>40?"This is a systemic issue that goes beyond individual motivation.":v>20?"A significant portion of non-desire may be driven by structural constraints, not genuine preference.":"Most non-desire in this group appears to reflect genuine preference."}`,
        detail: v => `Share of Group 4 with Structural Vulnerability Index > 6 (critical threshold). n = ${g4ResignedN} of ${grp4.length}.`,
        recommendation:"Reach out proactively to structurally constrained Group 4 students. Removing one key barrier (often financial) can shift them toward considering mobility. Personalised one-to-one advising is more effective than group sessions for this population.",
        skip: g4ResignedPct===null,
      },
      {
        id:"g4_g3_similar",
        title:"Could some Group 4 students become mobile with the right support?",
        value: g4G3VulnGap,
        format: v => Math.abs(v)<0.5?"Very similar profiles to Group 3":"Profiles differ from Group 3",
        thresholds:[{max:0.5,level:"orange",icon:"⚡",label:"Yes — hidden demand likely"},{max:Infinity,level:"green",icon:"✓",label:"Profiles are distinct"}],
        message: v => Math.abs(v)<0.5
          ? `<strong>A portion of students who say they don't want to go share almost the same structural profile as students who do want to go but haven't applied yet (Group 3).</strong> This suggests that some of Group 4 may represent hidden, unexpressed demand — students who might consider mobility if the right information or support were offered.`
          : `Students who don't want to go (Group 4) and students who want to go but haven't applied (Group 3) have meaningfully different structural profiles. Non-desire in Group 4 appears to reflect something beyond structural barriers.`,
        detail: v => `Structural Vulnerability Index gap: Group 4 vs Group 3 = ${v>0?"+":""}${v.toFixed(2)} pts.${mwuG4G3Vuln.p!==null?` Mann-Whitney: ${mwuG4G3Vuln.p<0.05?"significant (p="+mwuG4G3Vuln.p.toFixed(3)+")":"not significant (p="+mwuG4G3Vuln.p.toFixed(3)+")"}.`:""}`,
        recommendation: Math.abs(g4G3VulnGap??1)<0.5
          ? "A simple, personalised outreach (not a mass campaign) targeting Group 4 students with similar profiles to Group 3 could activate latent demand. Frame mobility as accessible and financially supported."
          : "Focus efforts on Groups 2 and 3 — Group 4's non-desire appears more deeply rooted and may require longer-term cultural change.",
        skip: g4G3VulnGap===null,
      },
      {
        id:"g4_intl",
        title:"Do non-mobile students lack interest in the wider world, or just in formal mobility?",
        value: g4IntlGap,
        format: v => (v>0?"+":"")+v.toFixed(1)+" pts on international openness score",
        thresholds:[{max:-1.5,level:"red",icon:"⚠️",label:"Much lower — deep gap in international orientation"},{max:-0.5,level:"orange",icon:"⚡",label:"Somewhat lower"},{max:Infinity,level:"green",icon:"✓",label:"Similar level of international interest"}],
        message: v => v<-1.5
          ? `<strong>Students who don't want to go score notably lower on international openness, curiosity, and sense of belonging in Europe</strong> — not just on mobility itself. This suggests a deeper gap in international orientation that formal mobility programmes alone cannot address.`
          : v<-0.5
          ? `Non-mobile students show somewhat lower international interest compared to others. This is normal to some extent, but worth monitoring.`
          : `Non-mobile students show a similar level of international curiosity and openness to the rest of the sample. Non-desire may be primarily practical (financial, logistical) rather than motivational.`,
        detail: v => `International profile score gap: Group 4 vs Groups 1+2+3 = ${v>0?"+":""}${v.toFixed(2)} pts. Score range: 0 (low openness) to 10 (high openness).`,
        recommendation: g4IntlGap!==null&&g4IntlGap<-1
          ? "Invest upstream: English-taught courses, virtual international exchanges (COIL), international student events on campus. The goal is building international curiosity before addressing mobility itself."
          : "International interest is not the main barrier. Focus on practical supports: financial aid, simplified processes, peer mentoring.",
        skip: g4IntlGap===null,
      },
      {
        id:"g4_topbarrier",
        title:`What is the single biggest obstacle for Group 4?`,
        value: g4TopBarrier ? g4TopBarrier.m : null,
        format: v => `"${g4TopBarrier?g4TopBarrier.label:"–"}" — rated ${v.toFixed(1)}/5`,
        thresholds:[{max:2.5,level:"green",icon:"✓",label:"Minor obstacle"},{max:3.5,level:"orange",icon:"⚡",label:"Significant obstacle"},{max:Infinity,level:"red",icon:"⚠️",label:"Major obstacle — priority action"}],
        message: v => g4TopBarrier ? `Among all the barriers assessed, <strong>"${g4TopBarrier.label}"</strong> is the one rated highest by students who don't want to go (${v.toFixed(1)}/5). This is the most concrete, actionable entry point for this group.` : "No barrier data available for this group.",
        detail: v => g4TopBarrier ? `Top barrier for Group 4: "${g4TopBarrier.label}", mean score ${v.toFixed(2)}/5. Full ranking available in the "Barriers to mobility" tab.` : "",
        recommendation: g4TopBarrier ? `Address "${g4TopBarrier.label}" directly and visibly in institutional communication targeting Group 4. Make it clear this barrier is being acted upon.` : "",
        skip: g4TopBarrier===null,
      },
      {
        id:"g4_firstgen",
        title:"Are non-mobile students more likely to be the first in their family to go to university?",
        value: g4FirstGenPct,
        format: v => Math.round(v)+"% of Group 4",
        thresholds:[{max:20,level:"green",icon:"✓",label:"Not overrepresented"},{max:35,level:"orange",icon:"⚡",label:"Moderately overrepresented"},{max:Infinity,level:"red",icon:"⚠️",label:"Strongly overrepresented"}],
        message: v => `<strong>${Math.round(v)}% of students who don't want to go are the first in their family to access higher education</strong> (parents with no higher education background). For these students, international mobility may feel culturally distant — "not something people like me do."`,
        detail: v => `Share of Group 4 with parental education ≤ primary level (educ_num ≤ 2). n = ${grp4.filter(r=>r.educ_num!==null&&r.educ_num<=2).length} of ${grp4.length}.`,
        recommendation:"Alumni ambassadors from first-generation backgrounds who went on Erasmus are the most effective messengers for this population. Family information sessions (in accessible language) can also shift perceptions.",
        skip: g4FirstGenPct===null,
      },
      {
        id:"g4_parental",
        title:"Do non-mobile students have family experience of Erasmus?",
        value: g4ParentalPct,
        format: v => Math.round(v)+"% have a parent who did Erasmus",
        thresholds:[{max:10,level:"orange",icon:"⚡",label:"Very low — no informal transmission"},{max:Infinity,level:"green",icon:"✓",label:"Some family transmission"}],
        message: v => `Only <strong>${Math.round(v)}% of students who don't want to go have a parent who participated in an Erasmus exchange</strong>. Without family experience to draw on, these students have no informal reference point — they rely entirely on what the institution tells them.`,
        detail: v => `Share of Group 4 reporting at least one parent who participated in an Erasmus exchange (Q13).`,
        recommendation:"Do not assume word of mouth will do the work. Systematic institutional outreach — open days, dedicated sessions, printed and digital materials — is the only reliable channel for reaching Group 4.",
        skip: g4ParentalPct===null,
      },
    ]);

    // ── Section 2: G2/G3 indicators ─────────────────────────
    const indsG23 = computeInds([
      {
        id:"conv",
        title:"Of students who want to go, how many actually take the step?",
        value: convRate,
        format: v => Math.round(v)+"% have gone or applied",
        thresholds:[{max:30,level:"red",icon:"⚠️",label:"Very low — large gap between desire and action"},{max:50,level:"orange",icon:"⚡",label:"Moderate — room for improvement"},{max:Infinity,level:"green",icon:"✓",label:"Good conversion rate"}],
        message: v => `<strong>${Math.round(v)}% of students who expressed a desire for mobility have either already gone or formally applied.</strong> ${v<30?"This is a very low conversion rate — a large proportion of motivated students are not following through. This points to real obstacles between intention and action.":v<50?"More than half of motivated students haven't taken the step yet. There is significant untapped potential.":"Most motivated students are following through — the main challenge is reaching those who haven't yet expressed interest."}`,
        detail: v => `Formula: (G1+G2) / (G1+G2+G3). G1 (already gone): ${grp1.length}, G2 (applied): ${grp2.length}, G3 (wants to go, not applied): ${grp3.length}.`,
        recommendation:"Review the application process end-to-end. Identify where students drop off. Dedicated guidance sessions for Group 3 — especially those with high barrier scores — can significantly improve conversion.",
        groups:`G1: n=${grp1.length} · G2: n=${grp2.length} · G3: n=${grp3.length}`,
      },
      {
        id:"vuln_mean",
        title:"Are the students who want to go but haven't applied facing real obstacles?",
        value: vulnMeanAll,
        format: v => `Overall barrier score: ${v.toFixed(1)}/10`,
        thresholds:[{max:4,level:"green",icon:"✓",label:"Barriers are limited"},{max:6,level:"orange",icon:"⚡",label:"Significant barriers"},{max:Infinity,level:"red",icon:"⚠️",label:"High barriers — structural obstacles dominant"}],
        message: v => `The overall structural barrier score is <strong>${v.toFixed(1)}/10</strong>.${vulnMeanG2!==null&&vulnMeanG3!==null?` Students who have applied (Group 2) score ${vulnMeanG2.toFixed(1)}, while those who haven't applied yet (Group 3) score ${vulnMeanG3.toFixed(1)}.`:""}${vulnGap!==null&&vulnGap>0.5?" The gap confirms that what separates applicants from non-applicants is not motivation — it's resources and circumstances.":""}`,
        detail: v => `Structural Vulnerability Index (V_i = 0.4·Financial + 0.3·Academic + 0.3·Parental education, scale 0-10). Mean all: ${v.toFixed(2)}${vulnMeanG2!==null?`, G2: ${vulnMeanG2.toFixed(2)}`:""}${vulnMeanG3!==null?`, G3: ${vulnMeanG3.toFixed(2)}`:""}${vulnGap!==null?`. Gap G3−G2: ${vulnGap>0?"+":""}${vulnGap.toFixed(2)} pts, Mann-Whitney ${mwuVuln.p!==null?(mwuVuln.p<0.05?"significant":"n.s."):"–"} (p=${mwuVuln.p!==null?mwuVuln.p.toFixed(3):"–"}).`:""}`,
        recommendation:"Universities with high barrier scores should combine financial aid, academic tutoring, and first-generation programmes. These interventions work best together — addressing only one barrier at a time has limited impact.",
        skip: vulnMeanAll===null,
      },
      {
        id:"vuln_resigned",
        title:"How many motivated students are structurally blocked from applying?",
        value: resignedG3pct,
        format: v => Math.round(v)+`% of Group 3 (${resignedG3n} students)`,
        thresholds:[{max:20,level:"green",icon:"✓",label:"Limited share"},{max:40,level:"orange",icon:"⚡",label:"Significant share"},{max:Infinity,level:"red",icon:"⚠️",label:"Large share — structural barriers dominant"}],
        message: v => `<strong>${Math.round(v)}% of students who want to go but haven't applied yet are carrying a high level of structural barriers</strong> (financial, academic, family background).${resignedG2pct!==null?` Among those who did apply, this share is only ${Math.round(resignedG2pct)}%.`:""}  For these students, the obstacle is not lack of motivation — it's their circumstances.`,
        detail: v => `Share of Group 3 with Structural Vulnerability Index > 6. n = ${resignedG3n} of ${grp3.length}.${resignedG2pct!==null?` Group 2 equivalent: ${Math.round(resignedG2pct)}% (${resignedG2n} of ${grp2.length}).`:""}`,
        recommendation:"Standard information campaigns will not reach these students. What works: proactive one-to-one outreach, guaranteed funding offers (before the application, not after), and peer mentors from similar backgrounds.",
        skip: resignedG3pct===null,
      },
      {
        id:"vuln_gap",
        title:"What separates students who applied from those who didn't?",
        value: vulnGap,
        format: v => Math.abs(v)<0.3?"Very similar structural profiles":"Structural gap: "+(v>0?"+":"")+v.toFixed(1)+" pts",
        thresholds:[{max:0.5,level:"green",icon:"✓",label:"Small gap — other factors at play"},{max:1.5,level:"orange",icon:"⚡",label:"Moderate gap — barriers matter"},{max:Infinity,level:"red",icon:"⚠️",label:"Large gap — barriers are decisive"}],
        message: v => Math.abs(v)<0.5
          ? `Groups 2 and 3 have very similar structural profiles. The gap between applying and not applying may be driven by less visible factors — information access, confidence, timing.`
          : `<strong>Students who haven't applied (Group 3) carry ${v>0?"heavier":"lighter"} structural barriers than those who have (Group 2).</strong> This gap ${mwuVuln.p!==null&&mwuVuln.p<0.05?"is statistically significant — ":""}confirms that structural circumstances, not motivation, are driving the difference.`,
        detail: v => `V_i gap (G3 − G2): ${v>0?"+":""}${v.toFixed(2)} pts. Mann-Whitney U test: ${mwuVuln.p!==null?(mwuVuln.p<0.001?"p<0.001":mwuVuln.p<0.05?"p="+mwuVuln.p.toFixed(3):"n.s., p="+mwuVuln.p.toFixed(3)):"n/a"}.`,
        recommendation:"Targeted structural support (financial bridges, simplified process, language preparation) for Group 3 will be more effective than awareness campaigns. The goal is removing specific barriers, not persuading.",
        skip: vulnGap===null,
      },
      {
        id:"fin",
        title:"Is money stopping motivated students from applying?",
        value: finBarrierG3,
        format: v => v.toFixed(1)+"/5 — financial barrier score",
        thresholds:[{max:2.5,level:"green",icon:"✓",label:"Not a dominant obstacle"},{max:3.5,level:"orange",icon:"⚡",label:"Notable obstacle"},{max:Infinity,level:"red",icon:"⚠️",label:"Major obstacle — financial barrier dominant"}],
        message: v => `Among students who want to go but haven't applied, <strong>lack of financial resources is rated ${v.toFixed(1)}/5</strong> as a barrier to mobility. ${v>3.5?"Financial concerns are a dominant obstacle — many motivated students are being held back by money.":v>2.5?"Money is a notable concern for this group, even if it's not the only barrier.":"Financial barriers appear manageable for most of this group."}`,
        detail: v => `Mean score for item "Lack of financial resources" (frein_02) among Group 3. Scale: 1 = not a barrier at all, 5 = major barrier.`,
        recommendation:"Strengthen grant visibility and accessibility: make sure Group 3 students know what funding is available and how to access it. Consider streamlining the grant application process alongside the mobility application.",
      },
      {
        id:"comfort_gap",
        title:"Do students who apply feel more financially secure than those who don't?",
        value: comfortGap,
        format: v => v>0.2?`Yes — Group 3 is less comfortable (+${v.toFixed(1)} pts)`:v<-0.2?"No — Group 2 is less comfortable":"Financial comfort is similar in both groups",
        thresholds:[{max:0.2,level:"green",icon:"✓",label:"Similar financial comfort"},{max:0.5,level:"orange",icon:"⚡",label:"Notable difference"},{max:Infinity,level:"red",icon:"⚠️",label:"Significant difference — finances are a deciding factor"}],
        message: v => v>0.2
          ? `<strong>Students who haven't applied yet report lower financial comfort than those who have already applied</strong> — a difference of ${v.toFixed(1)} points on a 1-5 scale (1 = very comfortable). Financial security appears to be a deciding factor in whether motivated students follow through.`
          : "Students who applied and those who haven't report similar levels of financial comfort. Financial security alone may not explain the difference in behaviour.",
        detail: v => `Mean financial comfort (aisance_fin, 1=very comfortable, 5=not at all). G2: ${comfortG2!==null?comfortG2.toFixed(2):"–"}, G3: ${comfortG3!==null?comfortG3.toFixed(2):"–"}. Gap (G3−G2): ${v>0?"+":""}${v.toFixed(2)} pts.`,
        recommendation:"Consider offering a clear financial commitment to Group 3 students early — before they apply, not after. Removing financial uncertainty at the decision stage is more effective than increasing grant amounts after the fact.",
        skip: comfortGap===null,
      },
      {
        id:"admin",
        title:"Is the application process too complex?",
        value: adminBarrier,
        format: v => v.toFixed(1)+"/5 — complexity barrier score",
        thresholds:[{max:2.5,level:"green",icon:"✓",label:"Process appears manageable"},{max:3.5,level:"orange",icon:"⚡",label:"Complexity is a real friction point"},{max:Infinity,level:"red",icon:"⚠️",label:"Process is a major deterrent"}],
        message: v => `Students who haven't gone yet rate the application process as <strong>${v.toFixed(1)}/5</strong> in terms of complexity and time burden. ${v>3.5?"This is a major deterrent — institutional friction is actively preventing motivated students from applying.":v>2.5?"The process is creating real friction. Simplifying it could meaningfully increase conversion.":"The process appears manageable for most students."}`,
        detail: v => `Mean score for item "Application process too complex or time-consuming" (frein_15) among Groups 3 and 4. Scale: 1 = not a barrier, 5 = major barrier.`,
        recommendation:"Map the application process step by step. Remove or digitise unnecessary steps. Assign dedicated mobility advisors who can guide students through the process in a single session.",
      },
      {
        id:"firstgen",
        title:"Are motivated non-applicants more likely to be from less educated families?",
        value: firstGenG3,
        format: v => Math.round(v)+"% of Group 3"+(firstGenG2!==null?` vs ${Math.round(firstGenG2)}% of Group 2`:""),
        thresholds:[{max:20,level:"green",icon:"✓",label:"No strong overrepresentation"},{max:35,level:"orange",icon:"⚡",label:"Moderately overrepresented"},{max:Infinity,level:"red",icon:"⚠️",label:"Strongly overrepresented — equity issue"}],
        message: v => `<strong>${Math.round(v)}% of students who want to go but haven't applied yet come from families with no higher education background</strong>${firstGenG2!==null?`, compared to ${Math.round(firstGenG2)}% among those who did apply`:""}.${v>25?" This overrepresentation signals an equity gap: social background is shaping who follows through on their desire for mobility.":""}`,
        detail: v => `Share of Group 3 with parental education ≤ primary level (educ_num ≤ 2). n = ${grp3.filter(r=>r.educ_num!==null&&r.educ_num<=2).length} of ${grp3.length}.`,
        recommendation:"Peer mentoring by alumni from first-generation backgrounds is particularly effective. Pair it with proactive outreach (don't wait for students to come to you) and simplified access to financial support.",
        skip: firstGenG3===null,
      },
      {
        id:"lang",
        title:"Is language a barrier to mobility for Group 3?",
        value: langBarrier,
        format: v => v.toFixed(1)+"/5 — language barrier score",
        thresholds:[{max:2.5,level:"green",icon:"✓",label:"Not a major obstacle"},{max:3.5,level:"orange",icon:"⚡",label:"Noticeable obstacle"},{max:Infinity,level:"red",icon:"⚠️",label:"Major obstacle — language support needed"}],
        message: v => `Students who want to go but haven't applied rate insufficient English as a barrier at <strong>${v.toFixed(1)}/5</strong>. ${v>3?"Language confidence is a significant deterrent — students may be self-selecting out of mobility because they don't feel ready linguistically.":v>2.5?"Language is a moderate concern. Pre-departure language preparation could help.":"Language barriers are relatively limited for this group."}`,
        detail: v => `Mean score for item "Insufficient level of English" (frein_11) among Group 3. Scale: 1 = not a barrier, 5 = major barrier.`,
        recommendation:"Position language preparation as part of the mobility journey, not a prerequisite to be met alone. Offer structured pre-mobility English courses linked to the application process.",
      },
      {
        id:"eng_cert",
        title:"How many motivated students lack a certified English level?",
        value: noEngG23pct,
        format: v => Math.round(v)+"% of Groups 2 & 3 have no B2+ certification",
        thresholds:[{max:30,level:"green",icon:"✓",label:"Most students are certified"},{max:55,level:"orange",icon:"⚡",label:"A significant share lacks certification"},{max:Infinity,level:"red",icon:"⚠️",label:"Most motivated students lack certification"}],
        message: v => `<strong>${Math.round(v)}% of students who want to go on mobility (Groups 2 and 3 combined) have no certified English level at B2 or above.</strong> ${v>55?"This means the majority of motivated students may face a practical language barrier.":v>30?"A significant share of motivated students are not certified — this may be a hidden obstacle.":"Most motivated students have some level of English certification."}`,
        detail: v => `Share of Groups 2+3 with english_cert below B2 (index < ${CFG.englishLevels.indexOf(CFG.englishCertifiedFrom)}). Total G2+G3: ${n23}.`,
        recommendation:"Consider offering in-house language testing or certification partnerships. Make it easy for motivated students to formalise the English level they already have.",
        skip: noEngG23pct===null,
      },
      {
        id:"parental",
        title:"Can students rely on family experience to guide their mobility decision?",
        value: parentalErasPct,
        format: v => Math.round(v)+"% have a parent who did Erasmus",
        thresholds:[{max:10,level:"orange",icon:"⚡",label:"Very low — institutional info is the only channel"},{max:Infinity,level:"green",icon:"✓",label:"Some family transmission exists"}],
        message: v => `<strong>Only ${Math.round(v)}% of respondents have a parent who participated in an Erasmus exchange.</strong> For the vast majority, mobility is not a family tradition — they depend entirely on what the institution communicates to make their decision.`,
        detail: v => `Share of all respondents reporting at least one parent who participated in Erasmus (Q13, parental_erasmus = "Yes").`,
        recommendation:"Invest in systematic, visible institutional communication: open days, alumni testimonials, dedicated information sessions early in the academic year. Don't assume students will find information on their own.",
      },
      {
        id:"intl_score",
        title:"Does this university's international profile compare favourably to others?",
        value: scoreIntlGap,
        format: v => (v>0?"+":"")+v.toFixed(1)+" pts vs full sample average",
        thresholds:[{max:-1,level:"orange",icon:"⚡",label:"Below average — gap to address"},{max:Infinity,level:"green",icon:"✓",label:"At or above average"}],
        message: v => `This university's students score <strong>${v>0?"+":""}${v.toFixed(1)} points</strong> on international openness compared to the full sample average. ${v<-1?"This below-average score suggests that students here have lower international orientation — not just lower mobility rates.":"The international profile is broadly in line with other institutions."}`,
        detail: v => `International profile score gap (this university − full sample). Score range: 0 (low) to 10 (high). Based on 8 psychological items related to international openness.`,
        recommendation:"If below average, prioritise at-home internationalisation: English-medium teaching, incoming international student interaction, virtual exchanges, and international content in curricula.",
        skip: !compareActive || scoreIntlGap===null,
      },
    ]);

    // ── Render ───────────────────────────────────────────────
    const noteHtml = `<div class="info-box" style="margin-top:18px;">
      <strong>How to read these indicators</strong><br>
      Thresholds are indicative. Interpret in context and review with subject-matter experts before formal reporting.
      ${compareActive?"":"<strong>Enable \"Compare to the entire sample\" to unlock the international profile score gap indicator.</strong>"}
    </div>`;

    const dividerHtml = (title, subtitle) => `
      <div style="display:flex;align-items:center;gap:14px;margin:28px 0 14px;">
        <div style="flex:1;height:2px;background:linear-gradient(90deg,var(--accent),transparent);"></div>
        <div style="text-align:center;">
          <div style="font-size:1rem;font-weight:800;color:var(--navy);">${title}</div>
          <div style="font-size:0.78rem;color:var(--gray);">${subtitle}</div>
        </div>
        <div style="flex:1;height:2px;background:linear-gradient(270deg,var(--accent),transparent);"></div>
      </div>`;

    container.innerHTML = sectionHeader("Policy Warnings",
      "Automatically computed indicators organised in two sections: students who don't want to go (Group 4) and motivated students who haven't yet applied or gone (Groups 2 & 3). Each indicator includes a suggested policy recommendation and updates in real time as you switch between universities.") +
      dividerHtml("Section 1 — Group 4: Students who don't want to go", `n=${grp4.length} respondents`) +
      summaryKpis(indsG4) +
      `<div class="grid cols-1">${indsG4.map(buildCard).join("")}</div>` +
      dividerHtml("Section 2 — Groups 2 & 3: Motivated students who haven't yet gone", `G2: n=${grp2.length} · G3: n=${grp3.length}`) +
      summaryKpis(indsG23) +
      `<div class="grid cols-1">${indsG23.map(buildCard).join("")}</div>` +
      noteHtml;
  }

  // ===========================================================
  // M. Structural Vulnerability Index
  // ===========================================================
  function renderVulnerability(ctx) {
    const { base } = getCtxData(ctx);
    const order = CFG.groups.order, labels = CFG.groups.labels;
    const container = document.getElementById("section-vulnerability");

    if (base.length === 0) {
      container.innerHTML = sectionHeader("Structural Vulnerability Index", "") +
        emptyState("No data for this selection.");
      return;
    }

    const byGroup = {};
    order.forEach(g => {
      byGroup[g] = base.filter(r => r.groupe === g)
        .map(r => r.score_vuln).filter(v => v !== null && !isNaN(v));
    });

    const bLabels = ["0–2","2–4","4–6","6–8","8–10"];
    const bColors = ["#329B5A","#7EC88A","#D27832","#C84650","#8B1E23"];

    function bucketize(vals) {
      const b = [0,0,0,0,0];
      vals.forEach(v => { b[Math.min(4, Math.floor(v / 2))]++; });
      const n = vals.length || 1;
      return b.map(x => Math.round(x / n * 100));
    }

    const groupMeans = order.map(g => byGroup[g].length ? DE.mean(byGroup[g]) : null);
    const groupSE    = order.map(g => byGroup[g].length ? DE.se(byGroup[g])   : null);

    const subcomps = [
      { key: "aisance_fin",       label: "Financial comfort (F)" },
      { key: "revenu_num",        label: "Household income (F)" },
      { key: "depense_imp",       label: "Can absorb \u20ac1k expense (F)" },
      { key: "moyenne_acad_norm", label: "Academic grade (A)" },
      { key: "educ_num",          label: "Parental education (E)" },
    ];

    const resignedRow = order.map(g => {
      const grp = base.filter(r => r.groupe === g);
      const n = grp.length;
      const nh = grp.filter(r => r.vuln_high === 1).length;
      return { g, n, nh, pct: n > 0 ? Math.round(nh / n * 100) : null };
    });

    const mwu = DE.mannWhitneyU(byGroup["Wants to go & applied"], byGroup["Wants to go"]);

    container.innerHTML = sectionHeader("Structural Vulnerability Index",
      `V<sub>i</sub> = (0.4·F<sub>i</sub> + 0.3·A<sub>i</sub> + 0.3·E<sub>i</sub>) / 5 × 10 — 
      <strong>F<sub>i</sub></strong>: financial constraint composite (financial comfort + household income + ability to absorb unexpected expense); 
      <strong>A<sub>i</sub></strong>: academic constraint; 
      <strong>E<sub>i</sub></strong>: parental education constraint. 
      Missing → 2.5. Scale: 0 = no constraint, 10 = maximum. Threshold V<sub>i</sub> > 6 = "resigned non-mover".`) +
      `<div class="grid">
        ${card("chart-vuln-means", "V\u1d62 by group — mean \u00b1 SE",
          `Mean ± SE per mobility group. G2 vs G3: ${sigBadge(mwu.p)} (Mann-Whitney).`)}
        ${card("chart-vuln-dist", "V\u1d62 distribution by group — score brackets (%)",
          "Share of each group in each vulnerability bracket (0–2 = low, 8–10 = very high).", "", "h-300")}
      </div>
      <div class="grid cols-1"><div class="card">
        <h3>Resigned non-movers (V<sub>i</sub> > 6) by group</h3>
        <p class="card-note">Students whose accumulated structural constraints exceed the critical threshold.</p>
        <table class="stat-table">
          <thead><tr><th>Group</th><th class="num">n</th><th class="num">V<sub>i</sub> > 6</th><th class="num">Share</th><th class="num">Mean V<sub>i</sub></th></tr></thead>
          <tbody>${resignedRow.map(r => {
            const m = byGroup[r.g].length ? DE.mean(byGroup[r.g]).toFixed(2) : "–";
            const col = r.pct !== null && r.pct > 40 ? "#C84650" : r.pct > 20 ? "#D27832" : "#329B5A";
            return `<tr><td>${labels[r.g]}</td><td class="num">${r.n}</td>
              <td class="num">${r.nh}</td>
              <td class="num" style="color:${col};font-weight:700;">${r.pct !== null ? r.pct + "%" : "–"}</td>
              <td class="num">${m}</td></tr>`;
          }).join("")}</tbody>
        </table>
      </div></div>
      <div class="grid cols-1"><div class="card">
        <h3>Sub-component means by group</h3>
        <p class="card-note">Raw variable means per group. Financial comfort: 1 = very comfortable, 5 = not at all; household income: 1–8; ability to absorb €1k expense: 1 = yes, 0 = no; academic grade: 0–10; parental education: 1–6.</p>
        <table class="stat-table">
          <thead><tr><th>Variable</th>${order.map(g => `<th class="num">${labels[g]}</th>`).join("")}</tr></thead>
          <tbody>${subcomps.map(sc => {
            const vals = order.map(g => {
              const v = DE.mean(base.filter(r => r.groupe === g).map(r => r[sc.key]).filter(x => x !== null && !isNaN(x)));
              return v !== null ? v.toFixed(2) : "–";
            });
            return `<tr><td>${sc.label}</td>${vals.map(v => `<td class="num">${v}</td>`).join("")}</tr>`;
          }).join("")}</tbody>
        </table>
      </div></div>`;

    Charts.groupedBarChart(document.getElementById("chart-vuln-means"),
      order.map(g => labels[g]),
      [{ label: "Mean V\u1d62", data: groupMeans, errorBars: groupSE,
         color: order.map(g => CFG.groups.colors[g]) }],
      { max: 10 });

    Charts.groupedBarChart(document.getElementById("chart-vuln-dist"),
      order.map(g => labels[g]),
      bLabels.map((bl, bi) => ({
        label: bl,
        data: order.map(g => bucketize(byGroup[g])[bi]),
        color: bColors[bi],
      })),
      { max: 100 });
  }

  // ===========================================================
  // registry
  // ===========================================================
  const SECTIONS = [
    { id: "overview",      label: "Overview",             render: renderOverview },
    { id: "socio",         label: "Socio-demographics",   render: renderSocio },
    { id: "academic",      label: "Academic & language",  render: renderAcademic },
    { id: "financial",     label: "Financial profile",    render: renderFinancial },
    { id: "parental",      label: "Parental capital",     render: renderParental },
    { id: "international", label: "International & psycho", render: renderInternational },
    { id: "barriers",      label: "Barriers to mobility", render: renderBarriers },
    { id: "reasons",       label: "Reasons for going",    render: renderReasons },
    { id: "grp23",         label: "Group 2 vs 3",         render: renderGrp23 },
    { id: "vulnerability", label: "Vulnerability Index",  render: renderVulnerability },
    { id: "universities",  label: "Universities",         render: renderUniversities },
    { id: "stats",         label: "Statistical tests",    render: renderStats },
    { id: "warnings",      label: "⚠️ Policy Warnings",  render: renderWarnings },
    { id: "about",         label: "About",                render: renderAbout },
  ];

  function render(sectionId, ctx) {
    const sec = SECTIONS.find((s) => s.id === sectionId);
    if (sec) sec.render(ctx);
  }

  return { init, render, SECTIONS };
})();
