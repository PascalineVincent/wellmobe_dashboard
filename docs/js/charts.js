/* ============================================================
   Charts — Chart.js builder helpers
   ============================================================ */

const Charts = (() => {

  // Register a small plugin to draw mean +/- SE error bars on bar charts.
  // Datasets carrying an `errorBars` array (same length as data) get
  // a vertical whisker drawn through the top of each bar.
  const errorBarPlugin = {
    id: "errorBars",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, di) => {
        if (!dataset.errorBars) return;
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((element, i) => {
          const err = dataset.errorBars[i];
          if (err === null || err === undefined || isNaN(err)) return;
          const { x, y } = element.getProps(["x", "y"], true);
          const isHorizontal = chart.options.indexAxis === "y";
          const scale = isHorizontal ? chart.scales.x : chart.scales.y;
          const value = dataset.data[i];
          if (value === null || value === undefined) return;

          ctx.save();
          ctx.strokeStyle = "rgba(15,40,80,0.65)";
          ctx.lineWidth = 1.5;

          if (isHorizontal) {
            const xHigh = scale.getPixelForValue(value + err);
            const xLow = scale.getPixelForValue(value - err);
            ctx.beginPath();
            ctx.moveTo(xLow, y); ctx.lineTo(xHigh, y);
            ctx.moveTo(xLow, y - 4); ctx.lineTo(xLow, y + 4);
            ctx.moveTo(xHigh, y - 4); ctx.lineTo(xHigh, y + 4);
            ctx.stroke();
          } else {
            const yHigh = scale.getPixelForValue(value + err);
            const yLow = scale.getPixelForValue(value - err);
            ctx.beginPath();
            ctx.moveTo(x, yLow); ctx.lineTo(x, yHigh);
            ctx.moveTo(x - 4, yLow); ctx.lineTo(x + 4, yLow);
            ctx.moveTo(x - 4, yHigh); ctx.lineTo(x + 4, yHigh);
            ctx.stroke();
          }
          ctx.restore();
        });
      });
    },
  };
  Chart.register(errorBarPlugin);

  Chart.defaults.font.family = "Inter, 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.color = "#5A6B85";
  Chart.defaults.font.size = 12;

  const registry = new Map();

  function destroy(canvas) {
    const existing = registry.get(canvas);
    if (existing) { existing.destroy(); registry.delete(canvas); }
  }

  function create(canvas, config) {
    destroy(canvas);
    const chart = new Chart(canvas.getContext("2d"), config);
    registry.set(canvas, chart);
    return chart;
  }

  // ---------------------------------------------------------
  // Simple bar chart (categorical counts/percentages)
  // ---------------------------------------------------------
  function barChart(canvas, labels, data, opts) {
    opts = opts || {};
    return create(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: opts.colors || "#4182C8",
          borderRadius: 6,
          maxBarThickness: 56,
        }],
      },
      options: {
        indexAxis: opts.horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => (opts.tooltipSuffix ? `${ctx.formattedValue}${opts.tooltipSuffix}` : ctx.formattedValue),
            },
          },
          title: opts.title ? { display: true, text: opts.title, color: "#0F2850", font: { weight: 700, size: 13 } } : { display: false },
        },
        scales: opts.horizontal ? {
          x: { beginAtZero: true, max: opts.max, grid: { color: "#EEF2F8" } },
          y: { grid: { display: false }, ticks: opts.yTicks },
        } : {
          x: { grid: { display: false }, ticks: { autoSkip: false } },
          y: { beginAtZero: true, max: opts.max, grid: { color: "#EEF2F8" }, ticks: opts.yTicks },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // Grouped bar chart with optional mean +/- SE error bars
  // datasets: [{ label, data, errorBars (optional), color }]
  // ---------------------------------------------------------
  function groupedBarChart(canvas, labels, datasets, opts) {
    opts = opts || {};
    return create(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.color,
          borderRadius: 5,
          errorBars: d.errorBars || null,
          maxBarThickness: opts.horizontal ? 22 : 38,
        })),
      },
      options: {
        indexAxis: opts.horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          title: opts.title ? { display: true, text: opts.title, color: "#0F2850", font: { weight: 700, size: 13 } } : { display: false },
        },
        scales: opts.horizontal ? {
          x: { beginAtZero: true, max: opts.max, grid: { color: "#EEF2F8" }, reverse: opts.xReverse || false },
          y: { grid: { display: false } },
        } : {
          x: { grid: { display: false } },
          y: { beginAtZero: true, max: opts.max, grid: { color: "#EEF2F8" }, reverse: opts.xReverse || false },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // 100% stacked horizontal bar (e.g. group composition by category)
  // series: [{ key, label, color }] ; data: { category: { key: pct, ... } }
  // ---------------------------------------------------------
  function stackedPercentChart(canvas, categories, series, data, opts) {
    opts = opts || {};
    const datasets = series.map((s) => ({
      label: s.label,
      data: categories.map((cat) => (data[cat] && data[cat][s.key] !== undefined) ? data[cat][s.key] : 0),
      backgroundColor: s.color,
      borderRadius: 3,
    }));
    return create(canvas, {
      type: "bar",
      data: { labels: categories, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}%` } },
          title: opts.title ? { display: true, text: opts.title, color: "#0F2850", font: { weight: 700, size: 13 } } : { display: false },
        },
        scales: {
          x: { stacked: true, beginAtZero: true, max: 100, grid: { color: "#EEF2F8" }, ticks: { callback: (v) => v + "%" } },
          y: { stacked: true, grid: { display: false } },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // Likert (1-5) stacked distribution — one row per item
  // items: [{ key, label }] ; dists: { key: { pct: {1..5: %}, n } }
  // ---------------------------------------------------------
  function likertChart(canvas, items, dists, palette, opts) {
    opts = opts || {};
    const labels = items.map((it) => it.label);
    const datasets = [1, 2, 3, 4, 5].map((lvl) => ({
      label: opts.likertLabels ? opts.likertLabels[lvl - 1] : String(lvl),
      data: items.map((it) => (dists[it.key] ? dists[it.key].pct[lvl] : 0)),
      backgroundColor: palette[String(lvl)],
      borderRadius: 3,
    }));
    return create(canvas, {
      type: "bar",
      data: { labels, datasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.formattedValue}%` } },
        },
        scales: {
          x: { stacked: true, beginAtZero: true, max: 100, grid: { color: "#EEF2F8" }, ticks: { callback: (v) => v + "%" } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // Doughnut chart
  // ---------------------------------------------------------
  function doughnutChart(canvas, labels, data, colors, opts) {
    opts = opts || {};
    return create(canvas, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.formattedValue} (${(ctx.parsed / ctx.dataset.data.reduce((a, b) => a + b, 0) * 100).toFixed(0)}%)` } },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // Radar / line-profile chart (psychological dimensions by group)
  // datasets: [{ label, data, color }]
  // ---------------------------------------------------------
  function radarChart(canvas, labels, datasets, opts) {
    opts = opts || {};
    return create(canvas, {
      type: "radar",
      data: {
        labels,
        datasets: datasets.map((d) => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: d.color + "26",
          pointBackgroundColor: d.color,
          pointRadius: 2.5,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          r: {
            min: opts.min !== undefined ? opts.min : 1,
            max: opts.max !== undefined ? opts.max : 5,
            grid: { color: "#EEF2F8" },
            angleLines: { color: "#EEF2F8" },
            pointLabels: { font: { size: 10 } },
            ticks: { display: false, stepSize: 1 },
          },
        },
      },
    });
  }

  // ---------------------------------------------------------
  // Dumbbell-style comparison chart (horizontal): for each variable,
  // two points (group A vs group B) connected by a line.
  // items: [{ label, a, b, sigStars }]
  // ---------------------------------------------------------
  function dumbbellChart(canvas, items, colorA, colorB, labelA, labelB) {
    const labels = items.map((it) => it.label + (it.sigStars ? `  ${it.sigStars}` : ""));
    return create(canvas, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: labelA,
            data: items.map((it, i) => ({ x: it.a, y: i })),
            backgroundColor: colorA,
            pointRadius: 6,
          },
          {
            label: labelB,
            data: items.map((it, i) => ({ x: it.b, y: i })),
            backgroundColor: colorB,
            pointRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
        },
        scales: {
          x: { grid: { color: "#EEF2F8" }, title: { display: true, text: "Valeur (échelle propre à chaque variable)" } },
          y: {
            min: -0.5,
            max: items.length - 0.5,
            ticks: {
              stepSize: 1,
              callback: (v) => labels[v] !== undefined ? labels[v] : "",
            },
            grid: { color: "#EEF2F8" },
          },
        },
      },
      plugins: [{
        id: "dumbbellLines",
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          items.forEach((it, i) => {
            const y = yScale.getPixelForValue(i);
            const x1 = xScale.getPixelForValue(it.a);
            const x2 = xScale.getPixelForValue(it.b);
            ctx.save();
            ctx.strokeStyle = "rgba(15,40,80,0.25)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x1, y); ctx.lineTo(x2, y);
            ctx.stroke();
            ctx.restore();
          });
        },
      }],
    });
  }

  return { create, destroy, barChart, groupedBarChart, stackedPercentChart, likertChart, doughnutChart, radarChart, dumbbellChart };
})();
