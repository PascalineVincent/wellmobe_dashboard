/* ============================================================
   DataEngine
   - Parse uploaded Excel files (via SheetJS)
   - Map columns according to config.json (or a user-calibrated mapping)
   - Derive analytical variables (groups, normalized grade, scores...)
   - Provide small stats helpers (mean/SE, Kruskal-Wallis, Mann-Whitney, Chi2)
   ============================================================ */

const DataEngine = (() => {

  // ---------------------------------------------------------
  // String / value normalization helpers
  // ---------------------------------------------------------

  function normStr(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function normLower(v) {
    return normStr(v).toLowerCase();
  }

  // Collapse number formatting variants: "€1,001 – €1,500" -> "1001 - 1500"
  function normNumStr(v) {
    let s = normLower(v);
    s = s.replace(/[€$£¥]/g, "");
    s = s.replace(/[\u2010-\u2015]/g, "-"); // various dashes -> hyphen
    // remove spaces/commas used as thousands separators between digit groups
    for (let i = 0; i < 3; i++) {
      s = s.replace(/(\d)[,\s](\d{3})(?!\d)/g, "$1$2");
    }
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function isYes(v, config) {
    const s = normLower(v);
    if (!s) return false;
    return config.yesValues.includes(s);
  }

  function isNo(v, config) {
    const s = normLower(v);
    if (!s) return false;
    return config.noValues.includes(s);
  }

  // Yes / No / null
  function yesNo(v, config) {
    if (v === null || v === undefined || normStr(v) === "" || normLower(v) === "n/a") return null;
    if (isYes(v, config)) return "Yes";
    if (isNo(v, config)) return "No";
    return null;
  }

  // Binary 0/1/null version of yesNo
  function yesNoBinary(v, config) {
    const yn = yesNo(v, config);
    if (yn === "Yes") return 1;
    if (yn === "No") return 0;
    return null;
  }

  function toNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    const s = normStr(v).replace(",", ".");
    if (s === "" || normLower(s) === "n/a") return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  // Likert 1-5 numeric, anything else -> null
  function toLikert(v) {
    const n = toNumber(v);
    if (n === null) return null;
    if (n >= 1 && n <= 5) return n;
    return null;
  }

  // Ordinal category mapper using "includes" matching on normalized strings.
  // categories: ordered array of normalized substrings, rank = index + 1
  function mapOrdinal(v, categories, useNumNorm) {
    const raw = useNumNorm ? normNumStr(v) : normLower(v);
    if (!raw || raw === "n/a") return null;
    for (let i = 0; i < categories.length; i++) {
      if (raw.includes(categories[i])) return i + 1;
    }
    return null;
  }

  function matchEnglishLevel(v, config) {
    const raw = normLower(v);
    if (!raw || raw === "n/a") return null;
    const levels = config.englishLevels.map((l) => l.toLowerCase());
    const idx = levels.indexOf(raw);
    return idx === -1 ? null : idx; // 0 = None ... 6 = C2
  }

  function gradeMax(universityName, config) {
    const u = normLower(universityName);
    for (const rule of config.gradeMaxRules) {
      if (u.includes(rule.match.toLowerCase())) return rule.max;
    }
    return config.gradeDefaultMax;
  }

  function escapeHtml(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---------------------------------------------------------
  // Excel parsing (SheetJS)
  // ---------------------------------------------------------

  function readWorkbook(arrayBuffer) {
    const data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
    const wb = XLSX.read(data, { type: "array" });
    const sheets = {};
    wb.SheetNames.forEach((name) => {
      sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1,
        raw: true,
        defval: null,
      });
    });
    return { sheetNames: wb.SheetNames, sheets };
  }

  // Build a preview of the columns of a sheet for the calibration screen
  function previewColumns(rows, maxSamples) {
    maxSamples = maxSamples || 3;
    if (!rows || rows.length === 0) return [];
    const header = rows[0] || [];
    const nCols = Math.max(...rows.slice(0, 20).map((r) => r.length), header.length);
    const cols = [];
    for (let c = 0; c < nCols; c++) {
      const samples = [];
      for (let r = 1; r < rows.length && samples.length < maxSamples; r++) {
        const val = rows[r] ? rows[r][c] : null;
        if (val !== null && val !== undefined && normStr(val) !== "") samples.push(val);
      }
      cols.push({
        index: c + 1, // 1-based, matches config "col"
        header: header[c] !== undefined && header[c] !== null ? String(header[c]) : "",
        samples,
      });
    }
    return cols;
  }

  function defaultMapping(config) {
    const mapping = {};
    config.fields.forEach((f) => {
      mapping[f.key] = f.col;
    });
    return mapping;
  }

  // ---------------------------------------------------------
  // Mapping rows -> raw records (1 object per respondent)
  // ---------------------------------------------------------

  function mapRowsToRecords(rows, mapping, config) {
    if (!rows || rows.length < 2) return [];
    const records = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      // skip fully empty rows
      const hasAny = row.some((v) => v !== null && v !== undefined && normStr(v) !== "");
      if (!hasAny) continue;

      const rec = {};
      config.fields.forEach((f) => {
        const col = mapping[f.key];
        const idx = (col && col > 0) ? col - 1 : -1;
        rec[f.key] = idx >= 0 ? row[idx] : null;
      });
      records.push(rec);
    }
    return records;
  }

  // ---------------------------------------------------------
  // Derive analytical variables for one record
  // ---------------------------------------------------------

  function deriveRecord(raw, config) {
    const rec = { _raw: raw };

    // pass-through text / category fields
    rec.University = normStr(raw.University) || "Unknown";
    rec.genre = normStr(raw.genre) || null;
    rec.niveau = normStr(raw.niveau) || null;
    rec.zone_geo = normStr(raw.zone_geo) || null;
    if (rec.genre && normLower(rec.genre) === "n/a") rec.genre = null;
    if (rec.niveau && normLower(rec.niveau) === "n/a") rec.niveau = null;
    if (rec.zone_geo && normLower(rec.zone_geo) === "n/a") rec.zone_geo = null;

    // numeric likert: frein_, raison_, psy_ (except psy_science)
    config.fields.forEach((f) => {
      if (f.type === "likert") rec[f.key] = toLikert(raw[f.key]);
    });

    // psy_science: binary from free text
    const sciRaw = normLower(raw.psy_science);
    if (sciRaw.includes("vast majority")) rec.psy_science = 1;
    else if (sciRaw.includes("many important things")) rec.psy_science = 0;
    else rec.psy_science = null;

    // academic grade, normalized 0-10
    rec.moyenne_acad = toNumber(raw.moyenne_acad);
    const gmax = gradeMax(rec.University, config);
    rec.grade_max = gmax;
    rec.moyenne_acad_norm = rec.moyenne_acad === null ? null : Math.round((rec.moyenne_acad / gmax) * 10 * 100) / 100;

    // financial comfort (1-5, 1=very comfortable)
    rec.aisance_fin = toLikert(raw.aisance_fin);

    // binary yes/no fields
    rec.depense_imp = yesNoBinary(raw.depense_imp, config);
    rec.scholarship = yesNoBinary(raw.scholarship, config);
    rec.parental_erasmus = yesNo(raw.parental_erasmus, config);

    // ordinal
    rec.revenu_num = mapOrdinal(raw.revenu_foyer, config.incomeCategories, true);
    rec.educ_num = mapOrdinal(raw.educ_parents, config.educationCategories, false);
    rec.english_cert = matchEnglishLevel(raw.english_cert, config);
    rec.english_certified = rec.english_cert === null ? null :
      (rec.english_cert >= config.englishLevels.indexOf(config.englishCertifiedFrom) ? 1 : 0);

    // mobility profile / group
    const profil = yesNo(raw.erasmus, config); // wants to go (Q?)
    let a_participe = yesNo(raw.a_participe, config); // already went
    let a_postule = yesNo(raw.a_postule, config); // has applied
    if (a_participe === "Yes") a_postule = "Yes";

    rec.profil = profil;
    rec.a_participe = a_participe;
    rec.a_postule = a_postule;

    let groupe = null;
    if (a_participe === "Yes") groupe = "Already gone";
    else if (profil === "Yes" && a_postule === "Yes") groupe = "Wants to go & applied";
    else if (profil === "Yes") groupe = "Wants to go";
    else if (profil === "No") groupe = "Does not want to go";
    rec.groupe = groupe;

    rec.raison_non_partir = (() => {
      const s = normStr(raw.raison_non_partir);
      if (!s || ["n/a", "na", "0", "null"].includes(s.toLowerCase())) return null;
      return s;
    })();

    // composite international profile score (0-10)
    const intlVals = config.scoreIntlCols.map((k) => rec[k]).filter((v) => v !== null && v !== undefined);
    if (intlVals.length > 0) {
      const m = mean(intlVals);
      rec.score_intl = Math.round(((m - 1) / 4) * 10 * 100) / 100;
    } else {
      rec.score_intl = null;
    }

    // psy thematic helper composites (used for Group2 vs Group3 comparison)
    rec.psy_openness = meanOf(rec, config.psyOpennessCols);
    rec.psy_efficacy = meanOf(rec, config.psyEfficacyCols);

    // simple barrier composite score (mean of available frein_ items)
    const freinKeys = config.fields.filter((f) => f.key.startsWith("frein_")).map((f) => f.key);
    const freinVals = freinKeys.map((k) => rec[k]).filter((v) => v !== null && v !== undefined);
    rec.score_frein_simple = freinVals.length > 0 ? Math.round(mean(freinVals) * 100) / 100 : null;

    // ── Structural Vulnerability Index V_i (0-10) ──────────────
    // F_i: financial constraint composite (1-5 each sub-component, missing → 2.5)
    const MISS = 2.5;
    // aisance_fin: 1=very comfortable, 5=not comfortable — use directly
    const fi_aisance = (rec.aisance_fin !== null && rec.aisance_fin !== undefined)
      ? rec.aisance_fin : MISS;
    // revenu_num: 1-8, higher = more comfortable → invert to 1-5
    const fi_revenu = (rec.revenu_num !== null && rec.revenu_num !== undefined)
      ? ((8 - rec.revenu_num) / 7) * 4 + 1 : MISS;
    // depense_imp: 1=can absorb (low constraint)→1, 0=cannot→5
    const fi_depense = (rec.depense_imp !== null && rec.depense_imp !== undefined)
      ? (rec.depense_imp === 1 ? 1 : 5) : MISS;
    const Fi = (fi_aisance + fi_revenu + fi_depense) / 3;

    // A_i: academic constraint (0=max grade→0 constraint, missing→2.5)
    const Ai = (rec.moyenne_acad_norm !== null && rec.moyenne_acad_norm !== undefined)
      ? ((10 - rec.moyenne_acad_norm) / 10) * 5 : MISS;

    // E_i: parental education constraint (educ_num 1-6, high=low constraint)
    const Ei = (rec.educ_num !== null && rec.educ_num !== undefined)
      ? ((7 - rec.educ_num) / 6) * 5 : MISS;

    rec.score_vuln = Math.round(((0.4 * Fi + 0.3 * Ai + 0.3 * Ei) / 5 * 10) * 100) / 100;
    rec.vuln_high = rec.score_vuln > 6 ? 1 : 0; // "resigned non-mover" threshold

    return rec;
  }

  function meanOf(rec, keys) {
    const vals = keys.map((k) => rec[k]).filter((v) => v !== null && v !== undefined);
    return vals.length > 0 ? mean(vals) : null;
  }

  // ---------------------------------------------------------
  // Full pipeline: rows -> processed records
  // ---------------------------------------------------------

  function processRows(rows, mapping, config, universityOverride) {
    const rawRecords = mapRowsToRecords(rows, mapping, config);
    return rawRecords.map((raw) => {
      if (universityOverride) raw.University = universityOverride;
      return deriveRecord(raw, config);
    });
  }

  // ---------------------------------------------------------
  // Basic statistics
  // ---------------------------------------------------------

  function mean(arr) {
    if (!arr || arr.length === 0) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function sd(arr) {
    if (!arr || arr.length < 2) return null;
    const m = mean(arr);
    const v = arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  function se(arr) {
    if (!arr || arr.length < 2) return null;
    const s = sd(arr);
    return s === null ? null : s / Math.sqrt(arr.length);
  }

  function meanSE(values) {
    const clean = values.filter((v) => v !== null && v !== undefined && !isNaN(v));
    return { mean: mean(clean), se: se(clean), n: clean.length };
  }

  // --- log-gamma (Lanczos approximation) ---
  function logGamma(x) {
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059, 12.507343278686905,
      -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    if (x < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    }
    x -= 1;
    let a = c[0];
    const t = x + g + 0.5;
    for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // regularized upper incomplete gamma function Q(a, x)
  function gammaQ(a, x) {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 1;
    if (x < a + 1) {
      // series for P(a,x), then Q = 1 - P
      let ap = a;
      let sum = 1 / a;
      let del = sum;
      for (let n = 1; n < 200; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-12) break;
      }
      const P = sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
      return 1 - P;
    } else {
      // continued fraction for Q(a,x)
      let b = x + 1 - a;
      let c = 1e308;
      let d = 1 / b;
      let h = d;
      for (let i = 1; i < 200; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < 1e-300) d = 1e-300;
        c = b + an / c;
        if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < 1e-12) break;
      }
      return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    }
  }

  // upper-tail p-value for chi-square distribution with df degrees of freedom
  function chisqP(x, df) {
    if (x <= 0) return 1;
    return Math.max(0, Math.min(1, gammaQ(df / 2, x / 2)));
  }

  // standard normal CDF
  function normCDF(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  function erf(x) {
    // Abramowitz & Stegun 7.1.26
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
      a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  // Kruskal-Wallis test across k groups of numeric values
  function kruskalWallis(groupsArr) {
    const groups = groupsArr.map((g) => g.filter((v) => v !== null && v !== undefined && !isNaN(v)));
    const k = groups.length;
    const allVals = [];
    groups.forEach((g, gi) => g.forEach((v) => allVals.push({ v, g: gi })));
    const N = allVals.length;
    if (N < 3 || groups.filter((g) => g.length > 0).length < 2) return { H: null, df: k - 1, p: null, N };

    allVals.sort((a, b) => a.v - b.v);
    // assign average ranks (1-based), handling ties
    const ranks = new Array(N);
    let i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && allVals[j + 1].v === allVals[i].v) j++;
      const avgRank = (i + j) / 2 + 1; // average of (i+1)..(j+1)
      for (let m = i; m <= j; m++) ranks[m] = avgRank;
      i = j + 1;
    }

    const rankSums = new Array(k).fill(0);
    for (let idx = 0; idx < N; idx++) rankSums[allVals[idx].g] += ranks[idx];

    let H = 0;
    for (let gi = 0; gi < k; gi++) {
      const n = groups[gi].length;
      if (n > 0) H += (rankSums[gi] * rankSums[gi]) / n;
    }
    H = (12 / (N * (N + 1))) * H - 3 * (N + 1);

    // tie correction
    let tieSum = 0;
    i = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && allVals[j + 1].v === allVals[i].v) j++;
      const t = j - i + 1;
      if (t > 1) tieSum += t * t * t - t;
      i = j + 1;
    }
    const correction = 1 - tieSum / (N * N * N - N);
    if (correction > 0) H = H / correction;

    const df = k - 1;
    const p = df > 0 ? chisqP(H, df) : null;
    return { H, df, p, N };
  }

  // Mann-Whitney U test (two-sided, normal approximation with tie correction)
  function mannWhitneyU(x, y) {
    const a = x.filter((v) => v !== null && v !== undefined && !isNaN(v));
    const b = y.filter((v) => v !== null && v !== undefined && !isNaN(v));
    const n1 = a.length, n2 = b.length;
    if (n1 === 0 || n2 === 0) return { U: null, p: null, n1, n2 };

    const all = a.map((v) => ({ v, g: 0 })).concat(b.map((v) => ({ v, g: 1 })));
    all.sort((p1, p2) => p1.v - p2.v);
    const N = all.length;
    const ranks = new Array(N);
    let i = 0;
    let tieSum = 0;
    while (i < N) {
      let j = i;
      while (j + 1 < N && all[j + 1].v === all[i].v) j++;
      const avgRank = (i + j) / 2 + 1;
      for (let m = i; m <= j; m++) ranks[m] = avgRank;
      const t = j - i + 1;
      if (t > 1) tieSum += t * t * t - t;
      i = j + 1;
    }

    let R1 = 0;
    for (let idx = 0; idx < N; idx++) if (all[idx].g === 0) R1 += ranks[idx];

    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1;
    const U = Math.min(U1, U2);

    const muU = (n1 * n2) / 2;
    const sigmaU2 = (n1 * n2 / 12) * ((N + 1) - tieSum / (N * (N - 1)));
    const sigmaU = Math.sqrt(Math.max(sigmaU2, 1e-12));

    // continuity-corrected z
    const z = (Math.abs(U1 - muU) - 0.5) / sigmaU;
    const p = 2 * (1 - normCDF(Math.abs(z)));

    return { U: U1, p: Math.max(0, Math.min(1, p)), n1, n2 };
  }

  // Chi-square test of independence on a contingency table (rows x cols)
  function chiSquareTest(table) {
    const rows = table.length;
    const cols = table[0] ? table[0].length : 0;
    if (rows < 2 || cols < 2) return { chi2: null, df: null, p: null };

    const rowSums = table.map((r) => r.reduce((a, b) => a + b, 0));
    const colSums = new Array(cols).fill(0);
    table.forEach((r) => r.forEach((v, c) => (colSums[c] += v)));
    const total = rowSums.reduce((a, b) => a + b, 0);
    if (total === 0) return { chi2: null, df: null, p: null };

    let chi2 = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const exp = (rowSums[r] * colSums[c]) / total;
        if (exp > 0) chi2 += ((table[r][c] - exp) * (table[r][c] - exp)) / exp;
      }
    }
    const df = (rows - 1) * (cols - 1);
    const p = chisqP(chi2, df);
    return { chi2, df, p, total };
  }

  // ---------------------------------------------------------
  // Aggregation helpers used throughout the dashboard
  // ---------------------------------------------------------

  function countBy(records, field) {
    const out = {};
    records.forEach((r) => {
      const v = r[field];
      if (v === null || v === undefined || v === "") return;
      out[v] = (out[v] || 0) + 1;
    });
    return out;
  }

  // counts[catValue][groupValue] = n
  function crossCount(records, catField, groupField) {
    const out = {};
    records.forEach((r) => {
      const cat = r[catField];
      const grp = r[groupField];
      if (cat === null || cat === undefined || cat === "") return;
      if (grp === null || grp === undefined || grp === "") return;
      if (!out[cat]) out[cat] = {};
      out[cat][grp] = (out[cat][grp] || 0) + 1;
    });
    return out;
  }

  function meanByGroup(records, field, groupField, groupOrder) {
    const out = {};
    (groupOrder || []).forEach((g) => {
      const vals = records.filter((r) => r[groupField] === g).map((r) => r[field])
        .filter((v) => v !== null && v !== undefined && !isNaN(v));
      out[g] = meanSE(vals);
    });
    return out;
  }

  // Likert (1-5) % distribution for one field
  function likertDistribution(records, field) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let n = 0;
    records.forEach((r) => {
      const v = r[field];
      if (v >= 1 && v <= 5) {
        counts[v] = (counts[v] || 0) + 1;
        n++;
      }
    });
    const pct = {};
    for (let k = 1; k <= 5; k++) pct[k] = n > 0 ? (counts[k] / n) * 100 : 0;
    return { counts, pct, n };
  }

  // keep only likert columns that have at least 2 distinct non-null values
  function validLikertCols(records, cols) {
    return cols.filter((c) => {
      const seen = new Set();
      for (const r of records) {
        if (r[c] !== null && r[c] !== undefined) seen.add(r[c]);
        if (seen.size > 1) return true;
      }
      return false;
    });
  }

  return {
    normStr, normLower, normNumStr,
    yesNo, yesNoBinary, toNumber, toLikert, mapOrdinal,
    readWorkbook, previewColumns, defaultMapping,
    mapRowsToRecords, deriveRecord, processRows,
    mean, sd, se, meanSE,
    kruskalWallis, mannWhitneyU, chiSquareTest, chisqP,
    countBy, crossCount, meanByGroup, likertDistribution, validLikertCols,
    escapeHtml,
  };
})();
