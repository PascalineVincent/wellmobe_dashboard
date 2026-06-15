/* ============================================================
   Dashboard — render functions for each analysis section
   ============================================================ */

const Dashboard = (() => {
  const DE = DataEngine;
  let CFG = null;

  const COLOR_SEL = "#1E4682";   // université sélectionnée
  const COLOR_ALL = "#C39B3C";   // ensemble de l'échantillon
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
    if (p === null || p === undefined || isNaN(p)) return `<span class="badge ns">n/d</span>`;
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
  function plainCard(title, note, bodyHtml) {
    return `<div class="card"><h3>${title}</h3>${note ? `<p class="card-note">${note}</p>` : ""}${bodyHtml}</div>`;
  }
  function kpi(value, label) {
    return `<div class="kpi-card"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
  }
  function legendBar() {
    return `<div class="legend-pair" style="margin:-8px 0 16px;">
      <span class="item"><span class="swatch" style="background:${COLOR_SEL}"></span>Université sélectionnée</span>
      <span class="item"><span class="swatch" style="background:${COLOR_ALL}"></span>Ensemble de l'échantillon</span>
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
        { label: "Université sélectionnée", data: pctBase, color: COLOR_SEL },
        { label: "Ensemble", data: pctAll, color: COLOR_ALL },
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
  // A. Vue d'ensemble
  // ===========================================================
  function renderOverview(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
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

    container.innerHTML = sectionHeader("Vue d'ensemble",
      "Cette section présente la composition générale de l'échantillon : la répartition des répondants selon les quatre profils de mobilité (déjà parti·e, souhaite partir et a postulé, souhaite partir sans avoir postulé, ne souhaite pas partir) et l'entonnoir de conversion entre ces étapes.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(n, "Répondants" + (compareActive ? " (université sélectionnée)" : ""))}
        ${kpi(fmtPct(n ? (wantsToGo / n) * 100 : null), "Souhaitent partir en mobilité")}
        ${kpi(fmtPct(n ? (alreadyGone / n) * 100 : null), "Sont déjà parti·e·s")}
      </div>
      <div class="grid">
        ${card("chart-ov-groups", "Répartition en quatre groupes", "Part de chaque profil de mobilité dans l'échantillon.")}
        ${card("chart-ov-funnel", "Entonnoir de mobilité", "Du nombre total de répondants vers ceux qui souhaitent partir, ont postulé, puis sont effectivement parti·e·s.")}
      </div>`;

    const labels = order.map((g) => labelsFR[g]);
    if (compareActive) {
      Charts.groupedBarChart(document.getElementById("chart-ov-groups"), labels, [
        { label: "Université sélectionnée", data: pctBase, color: COLOR_SEL },
        { label: "Ensemble", data: pctAll, color: COLOR_ALL },
      ], { max: 100 });
    } else {
      Charts.barChart(document.getElementById("chart-ov-groups"), labels, pctBase, { colors, max: 100 });
    }

    Charts.barChart(document.getElementById("chart-ov-funnel"),
      ["Répondants", "Souhaitent partir", "Ont postulé", "Déjà parti·e·s"],
      [n, wantsToGo, applied, alreadyGone],
      { horizontal: true, colors: [CFG.theme.rainbow[5], CFG.theme.rainbow[4], CFG.theme.rainbow[2], CFG.theme.rainbow[3]] });
  }

  // ===========================================================
  // B. Profil socio-démographique
  // ===========================================================
  function renderSocio(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
    const container = document.getElementById("section-socio");

    container.innerHTML = sectionHeader("Profil socio-démographique",
      "Répartition des répondants par genre, niveau d'études et zone géographique d'origine, ainsi que la composition de chaque groupe de mobilité selon ces caractéristiques.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid">
        ${card("chart-socio-genre", "Genre", "Répartition des répondants par genre déclaré.")}
        ${card("chart-socio-niveau", "Niveau d'études", "Répartition des répondants par niveau d'études.")}
        ${card("chart-socio-zone", "Zone géographique d'origine", "Répartition des répondants par zone géographique.")}
      </div>
      <div class="grid">
        ${card("chart-socio-genre-grp", "Genre par groupe de mobilité", "Composition par genre au sein de chaque groupe (100% par ligne).", "", "h-300")}
        ${card("chart-socio-niveau-grp", "Niveau d'études par groupe", "Composition par niveau d'études au sein de chaque groupe (100% par ligne).", "", "h-300")}
      </div>`;

    ["genre", "niveau", "zone_geo"].forEach((field, i) => {
      const id = ["chart-socio-genre", "chart-socio-niveau", "chart-socio-zone"][i];
      const { categories, pctBase, pctAll } = catDistCompare(base, all, field, compareActive);
      distChart(id, categories, pctBase, pctAll, compareActive);
    });

    const order2 = order;
    const genreCats = Object.keys(DE.countBy(base, "genre"));
    Charts.stackedPercentChart(document.getElementById("chart-socio-genre-grp"), genreCats,
      order2.map((g) => ({ key: g, label: labelsFR[g], color: CFG.groups.colors[g] })),
      crossPct(base, "genre", "groupe", order2));

    const niveauCats = Object.keys(DE.countBy(base, "niveau"));
    Charts.stackedPercentChart(document.getElementById("chart-socio-niveau-grp"), niveauCats,
      order2.map((g) => ({ key: g, label: labelsFR[g], color: CFG.groups.colors[g] })),
      crossPct(base, "niveau", "groupe", order2));
  }

  // ===========================================================
  // C. Profil académique & linguistique
  // ===========================================================
  function renderAcademic(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
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

    container.innerHTML = sectionHeader("Profil académique & linguistique",
      "La moyenne académique est normalisée sur une échelle de 0 à 10 (en tenant compte du barème propre à chaque université). Le niveau d'anglais certifié correspond à la certification déclarée la plus élevée (Q24) ; 'certifié' désigne un niveau B2 ou supérieur.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(gradeCmp.b.mean, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(gradeCmp.a.mean, 1)}</span>` : ""), "Moyenne académique (/10)" + (compareActive ? " — sél. / ensemble" : ""))}
        ${kpi(fmtPct(certPctBase) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(certPctAll)}</span>` : ""), "Anglais certifié ≥ B2" + (compareActive ? " — sél. / ensemble" : ""))}
        ${kpi(n_(base), "Répondants")}
      </div>
      <div class="grid">
        ${card("chart-acad-grade-grp", "Moyenne académique normalisée (/10) par groupe", `Moyenne ± erreur standard. Différence globale entre groupes : ${sigBadge(kwGrade.p)} (test de Kruskal-Wallis).`)}
        ${card("chart-acad-english", "Niveau d'anglais certifié (Q24)", "Répartition des niveaux de certification déclarés.")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-acad-grade-grp"), order.map((g) => labelsFR[g]),
      [{ label: "Moyenne", data: gradeMeans, errorBars: gradeSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 10 });

    distChart("chart-acad-english", certCats, pctCertBase, pctCertAll, compareActive, { horizontal: true });
  }
  function n_(records) { return records.length; }

  // ===========================================================
  // D. Profil financier
  // ===========================================================
  function renderFinancial(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
    const container = document.getElementById("section-financial");

    // financial comfort, inverted so higher = more comfortable
    const comfortByGroup = {};
    order.forEach((g) => {
      const vals = base.filter((r) => r.groupe === g).map((r) => r.aisance_fin).filter((v) => v !== null).map((v) => 6 - v);
      comfortByGroup[g] = DE.meanSE(vals);
    });
    const comfortMeans = order.map((g) => comfortByGroup[g].mean);
    const comfortSE = order.map((g) => comfortByGroup[g].se || 0);
    const kwFin = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.aisance_fin)));

    // % can handle 1000 unexpected expense, by group
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

    const comfortCmp = meanCompareInverted(base, all, "aisance_fin", compareActive);
    const depCmp = { b: pctOf(base, "depense_imp", 1), a: compareActive ? pctOf(all, "depense_imp", 1) : null };
    const schCmp = { b: pctOf(base, "scholarship", 1), a: compareActive ? pctOf(all, "scholarship", 1) : null };

    container.innerHTML = sectionHeader("Profil financier",
      "L'aisance financière déclarée est présentée sur une échelle inversée (5 = très à l'aise, 1 = pas à l'aise du tout) pour une lecture plus intuitive. La capacité à absorber une dépense imprévue de 1 000€ et le statut de boursier (Q25) sont également mobilisés comme indicateurs de contraintes financières.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(comfortCmp.b, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(comfortCmp.a, 1)}</span>` : ""), "Aisance financière (/5, 5=très à l'aise)" + (compareActive ? " — sél. / ensemble" : ""))}
        ${kpi(fmtPct(depCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(depCmp.a)}</span>` : ""), "Peut absorber 1 000€ imprévus" + (compareActive ? " — sél. / ensemble" : ""))}
        ${kpi(fmtPct(schCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(schCmp.a)}</span>` : ""), "Boursier (Q25)" + (compareActive ? " — sél. / ensemble" : ""))}
      </div>
      <div class="grid">
        ${card("chart-fin-comfort", "Aisance financière (/5) par groupe", `Moyenne ± erreur standard, échelle inversée (5=très à l'aise). Différence globale entre groupes : ${sigBadge(kwFin.p)}.`)}
        ${card("chart-fin-income", "Revenu du foyer", "Répartition par tranche de revenu mensuel du foyer.")}
      </div>
      <div class="grid">
        ${card("chart-fin-dep", "Peut absorber une dépense imprévue de 1 000€", "Part des répondants répondant 'Oui', par groupe de mobilité.")}
        ${card("chart-fin-sch", "Boursier (Q25)", "Part des répondants boursiers, par groupe de mobilité.")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-fin-comfort"), order.map((g) => labelsFR[g]),
      [{ label: "Aisance", data: comfortMeans, errorBars: comfortSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 5 });

    distChart("chart-fin-income", incomeLabels, pctIncBase, pctIncAll, compareActive, { horizontal: true });

    Charts.barChart(document.getElementById("chart-fin-dep"), order.map((g) => labelsFR[g]), depPct, { colors: order.map((g) => CFG.groups.colors[g]), max: 100, horizontal: true });
    Charts.barChart(document.getElementById("chart-fin-sch"), order.map((g) => labelsFR[g]), schPct, { colors: order.map((g) => CFG.groups.colors[g]), max: 100, horizontal: true });
  }

  function meanCompareInverted(base, all, field, compareActive) {
    const b = DE.mean(base.map((r) => r[field]).filter((v) => v !== null).map((v) => 6 - v));
    const a = compareActive ? DE.mean(all.map((r) => r[field]).filter((v) => v !== null).map((v) => 6 - v)) : null;
    return { b, a };
  }

  // ===========================================================
  // E. Capital parental
  // ===========================================================
  function renderParental(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
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
      parEraData[labelsFR[g]] = {
        Yes: total ? (yes / total) * 100 : 0,
        No: total ? (no / total) * 100 : 0,
        "No answer": total ? (na / total) * 100 : 0,
      };
    });

    const educCmp = meanCompare(base, all, "educ_num", compareActive);
    const parEraCmp = { b: pctOf(base, "parental_erasmus", "Yes"), a: compareActive ? pctOf(all, "parental_erasmus", "Yes") : null };

    container.innerHTML = sectionHeader("Capital parental",
      "Le niveau d'études des parents est codé sur une échelle ordinale de 1 (aucune formation) à 6 (études post-graduées) et reflète le capital culturel transmis. La participation des parents à un programme Erasmus (Q13) donne un accès direct à l'information sur le dispositif.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-3">
        ${kpi(fmtNum(educCmp.b.mean, 1) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtNum(educCmp.a.mean, 1)}</span>` : ""), "Éducation des parents (/6)" + (compareActive ? " — sél. / ensemble" : ""))}
        ${kpi(fmtPct(parEraCmp.b) + (compareActive ? ` <span class="text-muted" style="font-size:1rem">/ ${fmtPct(parEraCmp.a)}</span>` : ""), "Parent ayant fait un Erasmus" + (compareActive ? " — sél. / ensemble" : ""))}
      </div>
      <div class="grid">
        ${card("chart-par-educ", "Niveau d'études des parents (/6) par groupe", `Moyenne ± erreur standard. 1=aucune formation, 6=études post-graduées. Différence globale entre groupes : ${sigBadge(kwEduc.p)}.`)}
        ${card("chart-par-erasmus", "Erasmus parental (Q13) par groupe", "Part des répondants déclarant qu'un de leurs parents a effectué un séjour Erasmus.", "", "h-300")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-par-educ"), order.map((g) => labelsFR[g]),
      [{ label: "Moyenne", data: educMeans, errorBars: educSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 6 });

    Charts.stackedPercentChart(document.getElementById("chart-par-erasmus"), order.map((g) => labelsFR[g]),
      [
        { key: "Yes", label: "Oui", color: CFG.yesNoColors.Yes },
        { key: "No", label: "Non", color: CFG.yesNoColors.No },
        { key: "No answer", label: "Sans réponse", color: CFG.yesNoColors["No answer"] },
      ], parEraData);
  }

  // ===========================================================
  // F. Profil international & psychologique
  // ===========================================================
  function renderInternational(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
    const container = document.getElementById("section-international");

    const intlByGroup = DE.meanByGroup(base, "score_intl", "groupe", order);
    const intlMeans = order.map((g) => intlByGroup[g].mean);
    const intlSE = order.map((g) => intlByGroup[g].se || 0);
    const kwIntl = DE.kruskalWallis(order.map((g) => base.filter((r) => r.groupe === g).map((r) => r.score_intl)));

    const themes = CFG.dimsPsyOrder;
    const themeLabelsFR = themes.map((t) => CFG.dimsPsyLabelsFR[t]);

    const radarDatasets = order.map((g) => ({
      label: labelsFR[g],
      data: themes.map((t) => themeMean(base.filter((r) => r.groupe === g), t)),
      color: CFG.groups.colors[g],
    }));

    container.innerHTML = sectionHeader("Profil international & psychologique",
      "Le score de profil international (0-10) synthétise 8 items psychologiques liés à l'ouverture internationale (travail à l'étranger, curiosité, adaptation, identité européenne...). Le graphique radar présente, pour chacun des 7 grands axes psychologiques, le score moyen (échelle 1-5) par groupe de mobilité.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid">
        ${card("chart-intl-score", "Score de profil international (0-10) par groupe", `Moyenne ± erreur standard. Différence globale entre groupes : ${sigBadge(kwIntl.p)} (Kruskal-Wallis).`)}
        ${card("chart-intl-radar", "Profil psychologique par groupe (7 dimensions)", "Score moyen (1-5) sur chaque grande dimension psychologique.", "", "h-340")}
      </div>` +
      (compareActive ? `<div class="grid cols-1">
        ${card("chart-intl-radar-cmp", "Profil psychologique : université sélectionnée vs ensemble", "Comparaison du profil psychologique moyen, toutes catégories de répondants confondues.", "", "h-340")}
      </div>` : "");

    Charts.groupedBarChart(document.getElementById("chart-intl-score"), order.map((g) => labelsFR[g]),
      [{ label: "Score", data: intlMeans, errorBars: intlSE, color: order.map((g) => CFG.groups.colors[g]) }],
      { max: 10 });

    Charts.radarChart(document.getElementById("chart-intl-radar"), themeLabelsFR, radarDatasets, { min: 1, max: 5 });

    if (compareActive) {
      Charts.radarChart(document.getElementById("chart-intl-radar-cmp"), themeLabelsFR, [
        { label: "Université sélectionnée", data: themes.map((t) => themeMean(base, t)), color: COLOR_SEL },
        { label: "Ensemble", data: themes.map((t) => themeMean(all, t)), color: COLOR_ALL },
      ], { min: 1, max: 5 });
    }
  }

  // ===========================================================
  // G. Freins à la mobilité
  // ===========================================================
  function renderBarriers(ctx) {
    const { all, base, compareActive } = getCtxData(ctx);
    const container = document.getElementById("section-barriers");

    const freinFields = CFG.fields.filter((f) => f.key.startsWith("frein_"));
    const allKeys = freinFields.map((f) => f.key);
    const validKeys = DE.validLikertCols(base, allKeys);

    if (validKeys.length === 0) {
      container.innerHTML = sectionHeader("Freins à la mobilité",
        "Cette section analyse les freins déclarés à la mobilité internationale, item par item.") +
        emptyState("Aucune réponse exploitable sur les items de freins pour cette sélection.");
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

    container.innerHTML = sectionHeader("Freins à la mobilité",
      "Chaque frein est évalué sur une échelle de 1 (pas du tout un frein) à 5 (frein majeur). Les items sans variance (réponse identique pour tous, généralement liés à la structure du questionnaire) sont exclus. La section du bas identifie les freins qui distinguent le plus les répondants souhaitant partir de ceux qui ne le souhaitent pas.") +
      (compareActive ? legendBar() : "") +
      `<div class="grid cols-1">
        ${card("chart-bar-means", "Score moyen par frein (1-5)", "Moyenne ± erreur standard, triés du frein le plus fort au plus faible.", "", "h-420")}
      </div>
      <div class="grid cols-1">
        ${card("chart-bar-likert", "Distribution des réponses par frein", "Part des répondants ayant choisi chaque niveau (1=pas du tout, 5=tout à fait).", "", "h-420")}
      </div>
      <div class="grid cols-1">
        ${card("chart-bar-diff", "Freins les plus différenciants : souhaite partir vs ne souhaite pas partir", "Moyennes par sous-groupe (profil Q : souhaite partir en mobilité). * p<0.05, ** p<0.01, *** p<0.001 (test de Mann-Whitney).", "", "h-340")}
      </div>`;

    if (compareActive) {
      const meansAll = items.map((it) => DE.mean(all.map((r) => r[it.key]).filter((v) => v !== null)));
      Charts.groupedBarChart(document.getElementById("chart-bar-means"), items.map((i) => i.label), [
        { label: "Université sélectionnée", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_SEL },
        { label: "Ensemble", data: meansAll, color: COLOR_ALL },
      ], { horizontal: true, max: 5 });
    } else {
      Charts.groupedBarChart(document.getElementById("chart-bar-means"), items.map((i) => i.label), [
        { label: "Moyenne", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_BASE },
      ], { horizontal: true, max: 5 });
    }

    Charts.likertChart(document.getElementById("chart-bar-likert"), items, dists, CFG.likertPalette,
      { likertLabels: ["1 - Pas du tout", "2", "3", "4", "5 - Tout à fait"] });

    if (diffs.length > 0) {
      Charts.dumbbellChart(document.getElementById("chart-bar-diff"),
        diffs.map((d) => ({ label: d.label, a: d.meanNo, b: d.meanYes, sigStars: sigStars(d.p) })),
        CFG.yesNoColors.No, CFG.yesNoColors.Yes, "Ne souhaite pas partir", "Souhaite partir");
    }
  }

  // ===========================================================
  // H. Raisons de partir (Groupe 1 uniquement)
  // ===========================================================
  function renderReasons(ctx) {
    const { base } = getCtxData(ctx);
    const container = document.getElementById("section-reasons");

    const grp1 = base.filter((r) => r.groupe === "Already gone");
    const raisonFields = CFG.fields.filter((f) => f.key.startsWith("raison_"));
    const validKeys = DE.validLikertCols(grp1, raisonFields.map((f) => f.key));

    if (grp1.length === 0 || validKeys.length === 0) {
      container.innerHTML = sectionHeader("Raisons de partir (groupe « Déjà parti·e »)",
        "Cette section présente, pour les répondants ayant déjà effectué un séjour de mobilité, les raisons qui ont motivé leur départ.") +
        emptyState("Pas assez de répondants du groupe « Déjà parti·e » pour cette sélection.");
      return;
    }

    const items = raisonFields.filter((f) => validKeys.includes(f.key)).map((f) => {
      const vals = grp1.map((r) => r[f.key]).filter((v) => v !== null && v !== undefined);
      const ms = DE.meanSE(vals);
      return { key: f.key, label: f.label, mean: ms.mean, se: ms.se, n: ms.n };
    }).sort((a, b) => (b.mean || 0) - (a.mean || 0));

    container.innerHTML = sectionHeader("Raisons de partir (groupe « Déjà parti·e »)",
      `Cette section présente, pour les ${grp1.length} répondant·e·s ayant déjà effectué un séjour de mobilité, les raisons qui ont motivé leur départ (échelle 1=pas du tout, 5=tout à fait).` +
      (grp1.length < 10 ? " <strong>Attention : effectif faible, à interpréter avec prudence.</strong>" : "")) +
      `<div class="grid cols-1">
        ${card("chart-reasons-means", "Score moyen par raison de départ (1-5)", "Moyenne ± erreur standard, triés de la raison la plus citée à la moins citée.", "", "h-420")}
      </div>`;

    Charts.groupedBarChart(document.getElementById("chart-reasons-means"), items.map((i) => i.label), [
      { label: "Moyenne", data: items.map((i) => i.mean), errorBars: items.map((i) => i.se), color: COLOR_BASE },
    ], { horizontal: true, max: 5 });
  }

  // ===========================================================
  // I. Groupe 2 vs Groupe 3
  // ===========================================================
  function renderGrp23(ctx) {
    const { base } = getCtxData(ctx);
    const container = document.getElementById("section-grp23");

    const grp2 = base.filter((r) => r.groupe === "Wants to go & applied");
    const grp3 = base.filter((r) => r.groupe === "Wants to go");

    if (grp2.length === 0 && grp3.length === 0) {
      container.innerHTML = sectionHeader("Groupe 2 vs Groupe 3 : qui passe à l'acte ?",
        "Comparaison entre les répondants qui souhaitent partir et ont déjà postulé (groupe 2) et ceux qui souhaitent partir mais n'ont pas (encore) postulé (groupe 3).") +
        emptyState("Pas assez de répondants dans ces deux groupes pour cette sélection.");
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

    container.innerHTML = sectionHeader("Groupe 2 vs Groupe 3 : qui passe à l'acte ?",
      `Comparaison entre les répondants qui souhaitent partir et ont déjà postulé (« Veut partir & a postulé », n=${grp2.length}) et ceux qui souhaitent partir mais n'ont pas encore postulé (« Veut partir », n=${grp3.length}). Le graphique présente les valeurs normalisées (0-100, selon l'échelle propre à chaque variable) pour comparer visuellement les écarts ; le tableau ci-dessous donne les valeurs réelles.`) +
      `<div class="grid cols-1">
        ${card("chart-grp23-dumbbell", "Comparaison normalisée (0-100)", "Pour chaque variable, position relative sur son échelle propre. * p<0.05, ** p<0.01, *** p<0.001 (test de Mann-Whitney).", "", "h-340")}
      </div>
      <div class="grid cols-1">
        <div class="card"><h3>Valeurs détaillées</h3>
        <table class="stat-table">
          <thead><tr><th>Variable</th><th class="num">Veut partir & a postulé</th><th class="num">Veut partir</th><th class="num">Test</th></tr></thead>
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
      "Veut partir (pas postulé)", "Veut partir & a postulé");
  }

  // ===========================================================
  // J. Comparaison universités
  // ===========================================================
  function renderUniversities(ctx) {
    const { all } = getCtxData(ctx);
    const order = CFG.groups.order, labelsFR = CFG.groups.labelsFR;
    const container = document.getElementById("section-universities");

    const unis = [...new Set(all.map((r) => r.University))].sort();

    if (unis.length < 2) {
      container.innerHTML = sectionHeader("Comparaison entre universités",
        "Cette section compare la composition des groupes de mobilité entre les différentes universités chargées dans l'outil.") +
        emptyState("Chargez les données d'au moins deux universités pour activer cette comparaison.");
      return;
    }

    const compData = crossPct(all, "University", "groupe", order);
    const nByUni = DE.countBy(all, "University");

    container.innerHTML = sectionHeader("Comparaison entre universités",
      `Cette section compare, sur l'ensemble des ${unis.length} universités chargées, la composition des quatre groupes de mobilité ainsi que le nombre de répondants par site.`) +
      `<div class="grid">
        ${card("chart-univ-comp", "Composition des groupes par université", "Chaque ligne totalise 100% : comparez la part de chaque profil de mobilité entre sites.", "", "h-300")}
        ${card("chart-univ-n", "Nombre de répondants par université", "", "", "h-300")}
      </div>`;

    Charts.stackedPercentChart(document.getElementById("chart-univ-comp"), unis,
      order.map((g) => ({ key: g, label: labelsFR[g], color: CFG.groups.colors[g] })), compData);

    Charts.barChart(document.getElementById("chart-univ-n"), unis, unis.map((u) => nByUni[u] || 0), { horizontal: true, colors: COLOR_BASE });
  }

  // ===========================================================
  // K. Tests statistiques
  // ===========================================================
  function renderStats(ctx) {
    const { all, base, sel } = getCtxData(ctx);
    const order = CFG.groups.order;
    const container = document.getElementById("section-stats");

    const catVars = [
      { key: "genre", label: "Genre" },
      { key: "niveau", label: "Niveau d'études" },
      { key: "zone_geo", label: "Zone géographique" },
      { key: "parental_erasmus", label: "Erasmus parental (Q13)" },
    ];
    const numVars = [
      { key: "moyenne_acad_norm", label: "Moyenne académique (normalisée)" },
      { key: "aisance_fin", label: "Aisance financière" },
      { key: "score_intl", label: "Score profil international" },
      { key: "educ_num", label: "Éducation des parents" },
      { key: "score_frein_simple", label: "Score composite des freins" },
    ];

    const grpRows = [];
    catVars.forEach((v) => {
      const cross = DE.crossCount(base, v.key, "groupe");
      const cats = Object.keys(cross);
      if (cats.length < 2) return;
      const table = cats.map((cat) => order.map((g) => (cross[cat] && cross[cat][g]) || 0));
      const res = DE.chiSquareTest(table);
      grpRows.push({ label: v.label, test: "Chi² (groupes)", stat: res.chi2, df: res.df, p: res.p });
    });
    numVars.forEach((v) => {
      const groups = order.map((g) => base.filter((r) => r.groupe === g).map((r) => r[v.key]).filter((x) => x !== null && x !== undefined));
      const res = DE.kruskalWallis(groups);
      if (res.H === null) return;
      grpRows.push({ label: v.label, test: "Kruskal-Wallis (groupes)", stat: res.H, df: res.df, p: res.p });
    });

    let univSection = "";
    if (sel !== "ALL") {
      const rest = all.filter((r) => r.University !== sel);
      const univRows = [];
      catVars.concat([{ key: "groupe", label: "Groupe de mobilité" }]).forEach((v) => {
        const cats = new Set();
        base.concat(rest).forEach((r) => { if (r[v.key] !== null && r[v.key] !== undefined && r[v.key] !== "") cats.add(r[v.key]); });
        const catArr = [...cats];
        if (catArr.length < 2) return;
        const cBase = DE.countBy(base, v.key), cRest = DE.countBy(rest, v.key);
        const table = catArr.map((cat) => [cBase[cat] || 0, cRest[cat] || 0]);
        const res = DE.chiSquareTest(table);
        univRows.push({ label: v.label, test: "Chi² (sélection vs reste)", stat: res.chi2, df: res.df, p: res.p });
      });
      numVars.concat([{ key: "revenu_num", label: "Revenu du foyer" }]).forEach((v) => {
        const a = base.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
        const b = rest.map((r) => r[v.key]).filter((x) => x !== null && x !== undefined);
        const res = DE.mannWhitneyU(a, b);
        if (res.p === null) return;
        univRows.push({ label: v.label, test: "Mann-Whitney (sélection vs reste)", stat: res.U, df: null, p: res.p });
      });

      univSection = `<div class="grid cols-1"><div class="card">
        <h3>${DE.escapeHtml(sel)} vs reste de l'échantillon</h3>
        <p class="card-note">Compare les répondants de l'université sélectionnée à tous les autres répondants chargés dans l'outil.</p>
        ${statTable(univRows)}
      </div></div>`;
    }

    container.innerHTML = sectionHeader("Tests statistiques",
      "Cette section synthétise les tests de significativité utilisés ailleurs dans le tableau de bord : test du Chi² pour les variables catégorielles, test de Kruskal-Wallis (différence entre les 4 groupes) et test de Mann-Whitney (comparaison de deux groupes). Un résultat est considéré comme statistiquement significatif lorsque p < 0,05.") +
      `<div class="grid cols-1"><div class="card">
        <h3>Différences entre les quatre groupes de mobilité${sel !== "ALL" ? ` — ${DE.escapeHtml(sel)}` : ""}</h3>
        <p class="card-note">Teste si la variable diffère significativement entre les quatre groupes de mobilité, dans la sélection courante.</p>
        ${statTable(grpRows)}
      </div></div>` +
      univSection;
  }

  function statTable(rows) {
    if (rows.length === 0) return emptyState("Pas assez de données pour ces tests.");
    return `<table class="stat-table">
      <thead><tr><th>Variable</th><th>Test</th><th class="num">Statistique</th><th class="num">p-valeur</th><th class="num">Significatif</th></tr></thead>
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
  // registry
  // ===========================================================
  const SECTIONS = [
    { id: "overview", label: "Vue d'ensemble", render: renderOverview },
    { id: "socio", label: "Socio-démographie", render: renderSocio },
    { id: "academic", label: "Académique & langues", render: renderAcademic },
    { id: "financial", label: "Profil financier", render: renderFinancial },
    { id: "parental", label: "Capital parental", render: renderParental },
    { id: "international", label: "International & psycho", render: renderInternational },
    { id: "barriers", label: "Freins à la mobilité", render: renderBarriers },
    { id: "reasons", label: "Raisons de départ", render: renderReasons },
    { id: "grp23", label: "Groupe 2 vs 3", render: renderGrp23 },
    { id: "universities", label: "Universités", render: renderUniversities },
    { id: "stats", label: "Tests statistiques", render: renderStats },
  ];

  function render(sectionId, ctx) {
    const sec = SECTIONS.find((s) => s.id === sectionId);
    if (sec) sec.render(ctx);
  }

  return { init, render, SECTIONS };
})();
