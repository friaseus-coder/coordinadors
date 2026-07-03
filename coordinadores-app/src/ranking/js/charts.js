let centreChart;
let sunburstChart;
let scatterChart;



// ------------------- Gràfica de barres per centre -------------------
function renderCentreChart(arr) {
  const canvas = document.getElementById('centreChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const centresMap = {};
  arr.forEach(d => {
    if (!d.centre) return;
    const val = parseFloat(d.valoracio);
    if (isNaN(val)) return;
    if (!centresMap[d.centre]) centresMap[d.centre] = [];
    centresMap[d.centre].push(val);
  });

  const labels = Object.keys(centresMap);
  const dataValues = labels.map(centre => {
    const vals = centresMap[centre];
    const sum = vals.reduce((a, b) => a + b, 0);
    return Number((sum / vals.length).toFixed(2));
  });

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(34,139,34,0.7)');
  gradient.addColorStop(1, 'rgba(144,238,144,0.7)');

  const dataChart = {
    labels,
    datasets: [{
      label: i18n.t('rankingChartAverage'),
      data: dataValues,
      backgroundColor: gradient,
      borderColor: 'green',
      borderWidth: 1
    }]
  };

  const config = {
    type: 'bar',
    data: dataChart,
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { autoSkip: false, font: { size: 10 } } },
        y: { beginAtZero: true, max: 10 }
      }
    }
  };

  if (centreChart) centreChart.destroy();

// Plugin per dibuixar fletxa sobre la barra més alta
const maxArrowPlugin = {
  id: 'maxArrowPlugin',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const dataset = chart.data.datasets[0];
    const meta = chart.getDatasetMeta(0);

    if (!dataset || dataset.data.length === 0) return;

    // Trobar valor màxim
    const maxValue = Math.max(...dataset.data);
    const maxIndex = dataset.data.indexOf(maxValue);

    const bar = meta.data[maxIndex];
    if (!bar) return;

    const x = bar.x;
    const y = bar.y - 5; // una mica per sobre de la barra

    ctx.save();
    ctx.fillStyle = "green";
    ctx.beginPath();

    // Triangle (fletxa cap avall)
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y - 10);
    ctx.lineTo(x + 5, y - 10);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
};

centreChart = new Chart(ctx, {
  ...config,
  plugins: [maxArrowPlugin]
});
}

/* grafic 3    */

function renderSunburstChart(arr) {
  const container = document.getElementById('sunburstChart');
  if (!container) return;

  if (sunburstChart) {
    sunburstChart.dispose();
  }

  sunburstChart = echarts.init(container);

  const categories = ['coneixements', 'atencio', 'disponibilitat', 'actitud', 'valoracio'];
  const centres = [...new Set(arr.map(d => d.centre).filter(Boolean))];

  const seriesData = centres.map((centre, i) => {
    const dadesCentre = arr.filter(d => d.centre === centre);
    const values = categories.map(cat => {
      const vals = dadesCentre.map(d => d[cat]).filter(v => !isNaN(v));
      const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
      return Number(avg.toFixed(2));
    });
    const opacity = 0.2 + (i * 0.02); // lleugera variació de verd
    return {
      name: centre,
      value: values,
      areaStyle: { color: `rgba(60,160,60,${opacity})` },
      lineStyle: { color: '#23631f', width: 1.5 },
      symbol: 'circle'
    };
  });

  // Dividim llegenda en 2 columnes
  const firstColumn = centres.slice(0, 15);
  const secondColumn = centres.slice(15, 30);

  const categoryLabels = {
    coneixements: i18n.t('rankingThConeixements'),
    atencio: i18n.t('rankingThAtencio'),
    disponibilitat: i18n.t('rankingThDisponibilitat'),
    actitud: i18n.t('rankingThActitud'),
    valoracio: i18n.t('rankingThValoracio')
  };

 const option = {
  tooltip: { trigger: 'item' },
  legend: [
    {
      data: firstColumn,
      orient: 'vertical',
      left: 0,
      top: 10,
      textStyle: { fontSize: 9 },   
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 6                 
    },
    {
      data: secondColumn,
      orient: 'vertical',
      left: 130,
      top: 10,
      textStyle: { fontSize: 9 },
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 6
    }
  ],
  radar: {
  indicator: categories.map(cat => ({ name: categoryLabels[cat] || cat, max: 10 })),
  shape: 'hexagon',
  center: ['70%', '50%'],
  radius: '63%',
  splitNumber: 5,
  axisLine: { lineStyle: { color: '#c0e5c0' } },
  splitLine: { lineStyle: { color: '#c0e5c0' } },
  splitArea: { areaStyle: { color: ['rgba(60,160,60,0.05)','rgba(60,160,60,0.1)'] } }
},

  series: [{
    type: 'radar',
    data: seriesData
  }]
};


  sunburstChart.setOption(option);
}

// ------------------- Gràfica de dispersió / burbulles (Volum aptituds) -------------------
function renderScatterChart(arr) {
  const canvas = document.getElementById('scatterChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const top3 = arr.slice().sort((a,b)=>b.valoracio - a.valoracio).slice(0,3);

  const bubbleData = arr.map(d => {
    const isTop = top3.includes(d);
    return {
      x: d.coneixements,
      y: d.atencio,
      r: d.disponibilitat * 2 + 4,
      disponibilitatReal: d.disponibilitat,
      actitud: d.actitud,
      agent: d.agent,
      valoracio: d.valoracio,
      borderWidth: isTop ? 3 : 1,
      borderColor: isTop ? 'gold' : 'rgba(0,0,0,0.2)'
    };
  });

  if (scatterChart) scatterChart.destroy();

  // Plugin per dibuixar llegenda dins del canvas
  const bubbleLegendPlugin = {
    id: 'bubbleLegendPlugin',
    afterDraw(chart) {
      const { ctx, scales, chartArea } = chart;
      ctx.save();

      const dotRadius = 6;
      const gap = 25; // més espai entre elements
      const yPixel = scales.y.getPixelForValue(10) - 12; // posició vertical
      let xPixel = chartArea.left + 10;

      const legendItems = [
        { color: 'rgba(218,165,32,0.8)', label: i18n.t('rankingLegendActitud8') },
        { color: 'rgba(0,128,0,0.7)', label: i18n.t('rankingLegendActitud5') },
        { color: 'rgba(255,0,0,0.6)', label: i18n.t('rankingLegendActitud2') },
        { color: 'rgba(0,0,0,0.5)', label: i18n.t('rankingLegendActitud0') }
      ];

      legendItems.forEach(item => {
        // cercle
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(xPixel + dotRadius, yPixel, dotRadius, 0, 2 * Math.PI);
        ctx.fill();

        // text
        ctx.fillStyle = '#555';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, xPixel + dotRadius * 2 + 6, yPixel);

        xPixel += ctx.measureText(item.label).width + dotRadius * 2 + gap;
      });

      // Text final de la mida
      ctx.font = '11px Arial italic';
      ctx.fillText(i18n.t('rankingLegendMidaDispo'), xPixel, yPixel);

      ctx.restore();
    }
  };

  scatterChart = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: '', // label buit per evitar llegenda automàtica
        data: bubbleData,
        backgroundColor: bubbleData.map(d => {
          if (d.actitud >= 8) return 'rgba(218,165,32,0.8)';
          if (d.actitud >= 5) return 'rgba(0,128,0,0.7)';
          if (d.actitud >= 2) return 'rgba(255,0,0,0.6)';
          return 'rgba(0,0,0,0.5)';
        }),
        borderWidth: bubbleData.map(d => d.borderWidth),
        borderColor: bubbleData.map(d => d.borderColor)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 45 } },
      scales: {
        x: { min: 0, max: 10, title: { display: true, text: i18n.t('rankingThConeixements') }, ticks: { padding: 10 } },
        y: { min: 0, max: 10, title: { display: true, text: i18n.t('rankingThAtencio') } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const d = context.raw;
              return [
                d.agent,
                `${i18n.t('rankingThConeixements')}: ${d.x}`,
                `${i18n.t('rankingThAtencio')}: ${d.y}`,
                `${i18n.t('rankingThDisponibilitat')}: ${d.disponibilitatReal}`,
                `${i18n.t('rankingThActitud')}: ${d.actitud}`,
                `${i18n.t('rankingThValoracio')}: ${d.valoracio}`
              ];
            }
          }
        }
      }
    },
    plugins: [ bubbleLegendPlugin ]
  });
}
