document.addEventListener('DOMContentLoaded', async () => {

  const tableView = document.getElementById('tableView');
  const cardsContainer = document.getElementById('cardsContainer');
  const btnTableView = document.getElementById('btnTableView');
  const btnCardView = document.getElementById('btnCardView');
  const addRowBtn = document.getElementById('addRowBtn');
  const tableBody = document.getElementById('tableBody');
  const filterCentre = document.getElementById('filterCentre');
  const filterTorn = document.getElementById('filterTorn');
  const filterNota = document.getElementById('filterNota');
  const filterZona = document.getElementById('filterZona');
  const searchInput = document.getElementById('search');
  const opcionsTorn = ["MATÍ","TARDA","CAP DE SET.","NIT"];
  const opcionsZona = ["Zona 1","Zona 2","Zona 3"];
  const notesOptions = [
    { label: '<2', value: '0-2' },
    { label: '2 - 5', value: '2-5' },
    { label: '5 - 8', value: '5-8' },
    { label: '8 - 10', value: '8-10' }
  ];

 // ------------------ DADES ------------------
let currentData = [];

const stored = localStorage.getItem('nnData');

if (stored) {
  // Si ja hi ha dades al localStorage, les usem
  currentData = JSON.parse(stored);
} else {
  try {
    // Si no, carreguem data.json del servidor i guardem al localStorage
    const res = await fetch('js/data.json');
    currentData = await res.json();
    localStorage.setItem('nnData', JSON.stringify(currentData));
  } catch (e) {
    console.error('Error carregant data.json:', e);
    currentData = [];
  }
}


// assignar ordre si no existeix
currentData.forEach((d, i) => {
    if(d.ordre === undefined) d.ordre = i+1;
});

let scatterChart; 


  // --- FILTRES ---
  [filterCentre, filterTorn, filterNota, filterZona].forEach(f => f.classList.add('centre-select'));

  filterCentre.innerHTML = '<option value="">Tots els centres</option>';
  Array.from(new Set(currentData.map(d=>d.centre).filter(Boolean))).forEach(c => {
    const o = document.createElement('option'); o.value=c; o.textContent=c;
    filterCentre.appendChild(o);
  });

  filterTorn.innerHTML = '<option value="">Tots els torns</option>';
  opcionsTorn.forEach(t=>{ 
    const o=document.createElement('option'); o.value=t; o.textContent=t; 
    filterTorn.appendChild(o); 
  });

  filterZona.innerHTML = '<option value="">Totes les zones</option>';
  opcionsZona.forEach(z=>{
    const o=document.createElement('option'); o.value=z; o.textContent=z;
    filterZona.appendChild(o);
  });

  filterNota.innerHTML = '<option value="">Totes les notes</option>';
  notesOptions.forEach(opt=>{
    const o=document.createElement('option'); o.value=opt.value; o.textContent=opt.label;
    filterNota.appendChild(o);
  });

  function saveData(){ 
  fetch("save.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(currentData)
  })
  .then(res => res.text())
  .then(response => console.log("Guardat:", response))
  .catch(err => console.error("Error guardant:", err));
}


  

// 🔹 Guardar ordre del rànquing
function saveRankingOrder(arr){
  const order = arr
    .slice()
    .sort((a,b)=>b.valoracio - a.valoracio)
    .map(d=>d.agent);

  localStorage.setItem('nnRankingOrder', JSON.stringify(order));
}

//afegim comptador de treballadors
function updateWorkerCount(arr) {
  const counter = document.getElementById('workerCount');
  if(counter) {
    counter.textContent = `Treballadors: ${arr.length}`;
  }
}


  function getRowColor(val){
    if(val>=8) return 'rgba(218,165,32,0.25)';
    if(val>=5) return 'rgba(0,128,0,0.1)';
    if(val>=2) return 'rgba(255,0,0,0.08)';
    return 'rgba(0,0,0,0.12)';
  }

  function getGradientColor(val){
    let baseColor;
    if(val>=8) baseColor = '218,165,32';
    else if(val>=5) baseColor = '0,128,0';
    else if(val>=2) baseColor = '255,0,0';
    else baseColor = '0,0,0';
    return `linear-gradient(to right, rgba(255,255,255,0.3), rgba(${baseColor},0.4))`;
  }

  function sortByNota(arr){ return arr.slice().sort((a,b)=>b.valoracio - a.valoracio); }

  function renderCards(arr){
    cardsContainer.innerHTML='';
    sortByNota(arr).forEach(d=>{
      const card=document.createElement('div');
      card.className='card';
      card.style.background = getRowColor(d.valoracio);
      card.innerHTML=`
        <h3>${d.agent}</h3>
        <p><strong>Centre:</strong> ${d.centre}</p>
        <p><strong>Societat:</strong> ${d.societat}</p>
        <p><strong>Torn:</strong> ${d.torn}</p>
        <p><strong>Zona:</strong> ${d.zona}</p>
        <p><strong>Coneixements:</strong> ${d.coneixements}</p>
        <p><strong>Atenció:</strong> ${d.atencio}</p>
        <p><strong>Disponibilitat:</strong> ${d.disponibilitat}</p>
        <p><strong>Actitud:</strong> ${d.actitud}</p>
        <p data-key="valoracio"><strong>Valoració:</strong> ${d.valoracio}</p>
        <p><strong>Observacions:</strong> ${d.observacions}</p>
      `;
      cardsContainer.appendChild(card);
    });
  }

  function makeEditable(td, d, key, numeric=false){
    td.contentEditable=true;
    td.dataset.key=key;
    td.textContent = d[key];
    td.style.textAlign = numeric ? 'center' : 'left';
    td.style.background = getRowColor(d.valoracio);

    td.addEventListener('keydown', e=>{
      if(e.key==='Enter'){ e.preventDefault(); td.blur(); }
    });

    td.addEventListener('blur', ()=>{
      td.textContent = td.textContent.trim();
      if(numeric){
        d[key] = parseFloat(td.textContent)||0;
      } else {
        d[key] = td.textContent;
      }
    });
  }

  function recalcularMitjana(d){
    const camps = ['coneixements','atencio','disponibilitat','actitud'];
    let suma=0;
    camps.forEach(k=>suma+=d[k]);
    d.valoracio = +(suma/camps.length).toFixed(2);
  }

  function renderTable(arr){
   const previousOrder = JSON.parse(localStorage.getItem('nnRankingOrder')) || [];
   const oldPositions = {};
   previousOrder.forEach((agent, index)=>{
   oldPositions[agent] = index + 1;
  });

    tableBody.querySelectorAll('tr').forEach((tr,i)=>{
      const agent = tr.querySelector('td[data-key="agent"]')?.textContent;
      if(agent) oldPositions[agent] = i+1;
    });

    let thead = tableView.querySelector('thead');
    if(!thead){
      thead = document.createElement('thead');
      tableView.insertBefore(thead, tableBody);
    }
    thead.innerHTML=`
      <tr>
        <th>🗑</th>
        <th>💾</th>
        <th>Posició</th>
        <th>Agent</th>
        <th>Centre</th>
        <th>Societat</th>
        <th>Torn</th>
        <th>Zona</th>
        <th>Coneixements</th>
        <th>Atenció</th>
        <th>Disponibilitat</th>
        <th>Actitud</th>
        <th>Valoració</th>
        <th>Observacions</th>
      </tr>
    `;

    tableBody.innerHTML='';
    const sorted = sortByNota(arr);

    sorted.forEach((d,i)=>{
      const tr = document.createElement('tr');

      // BORRAR
      const tdDelete = document.createElement('td');
      const btnDelete = document.createElement('button');
      btnDelete.textContent='🗑';
      btnDelete.className='delete-btn';
      btnDelete.style.fontSize='1.4em';
      btnDelete.addEventListener('click', ()=>{
        currentData.splice(currentData.indexOf(d),1);
        saveData(); renderTable(currentData);
        if(typeof renderCentreChart==="function") renderCentreChart(currentData);
        renderScatterChart(currentData);

      });
      tdDelete.appendChild(btnDelete);
      tr.appendChild(tdDelete);

      // GUARDAR
      const tdSave = document.createElement('td');
      const btnSave = document.createElement('button');
      btnSave.textContent='💾';
      btnSave.className='save-btn';
      btnSave.addEventListener('click', ()=>{
        recalcularMitjana(d);
        d.ordre = i+1;
        saveData();
        renderTable(currentData);
        if(typeof renderCentreChart==="function") renderCentreChart(currentData);
      });
      tdSave.appendChild(btnSave);
      tr.appendChild(tdSave);

// ---------- POSICIÓ ----------
const tdPos = document.createElement('td');
tdPos.dataset.key = 'pos';
tdPos.style.textAlign = 'center';
tdPos.style.fontSize = '1.8em';
tdPos.style.fontWeight = 'bold';
tdPos.style.padding = '0 12px';

// PAS 3: mostrar fletxa segons l'ordre guardat o per defecte
const oldOrder = d.ordre || i+1;  // si no hi ha ordre guardat, posició actual
if(oldOrder > i+1) {
    tdPos.textContent = '⬆';
    tdPos.style.color = 'green';
} else if(oldOrder < i+1) {
    tdPos.textContent = '⬇';
    tdPos.style.color = 'red';
} else {
    tdPos.textContent = '➡'; // fletxa neutra
    tdPos.style.color = '#1E22326';
}

tr.appendChild(tdPos);




      // AGENT
      const tdAgent = document.createElement('td');
      makeEditable(tdAgent,d,'agent');
      tr.appendChild(tdAgent);

      // CENTRE
const tdCentre = document.createElement('td');
const selectCentre = document.createElement('select');
selectCentre.classList.add('centre-select');
selectCentre.style.width='140px';

// Opció inicial buida
const emptyOption = document.createElement('option');
emptyOption.value = "";
emptyOption.textContent = "-- Selecciona centre --";
selectCentre.appendChild(emptyOption);


// Afegir tots els centres existents
Array.from(new Set(currentData.map(x => x.centre).filter(Boolean)))
  .map(s=>s.trim())
  .sort((a,b)=>a.localeCompare(b,'ca',{sensitivity:'base'}))
  .forEach(c=>{ 
    const o=document.createElement('option'); 
    o.value=c;
    o.textContent=c;
    if(c===d.centre) o.selected=true; 
    selectCentre.appendChild(o); 
  });

// Afegir opció "Altres..." per escriure manualment un Centre
const otherOption = document.createElement('option');
otherOption.value = "Altres...";
otherOption.textContent = "Nou Centre...";
selectCentre.appendChild(otherOption);

// Quan canviïs el select
selectCentre.addEventListener('change', ()=>{
  if(selectCentre.value === "Altres..."){
    const nouCentre = prompt("Introdueix el nom del nou centre:");
    if(nouCentre){
      // Actualitzar dades
      d.centre = nouCentre;

      // Afegir nova opció al select
      const option = document.createElement('option');
      option.value = nouCentre;
      option.textContent = nouCentre;
      selectCentre.insertBefore(option, otherOption);
      option.selected = true;

      // Afegir al filtre també si no existeix
      if (![...filterCentre.options].some(o=>o.value===nouCentre)){
        const filterOption = document.createElement('option');
        filterOption.value = nouCentre;
        filterOption.textContent = nouCentre;
        filterCentre.appendChild(filterOption);
      }

      // Guardar i tornar a renderitzar
      saveData();
      renderTable(currentData);
      if(typeof renderCentreChart==="function") renderCentreChart(currentData);
    } else {
      // Tornar al primer centre si no introdueixen res
      selectCentre.selectedIndex = 0;
    }
  } else {
    d.centre = selectCentre.value;
  }
});
tdCentre.appendChild(selectCentre);
tr.appendChild(tdCentre);

      // SOCIETAT
      const tdSoc = document.createElement('td');
      const selectSoc = document.createElement('select'); selectSoc.classList.add('centre-select'); selectSoc.style.width='120px';
      Array.from(new Set(currentData.map(x=>x.societat).filter(s=>s))).forEach(s=>{ const o=document.createElement('option'); o.value=s;o.textContent=s;if(s===d.societat)o.selected=true; selectSoc.appendChild(o); });
      selectSoc.addEventListener('change',()=>{ d.societat=selectSoc.value; });
      tdSoc.appendChild(selectSoc); tr.appendChild(tdSoc);

      // TORN
      const tdTorn = document.createElement('td'); const selectTorn = document.createElement('select'); selectTorn.classList.add('centre-select'); selectTorn.style.width='120px';
      opcionsTorn.forEach(op=>{ const o=document.createElement('option'); o.value=op;o.textContent=op;if(op===d.torn)o.selected=true; selectTorn.appendChild(o); });
      selectTorn.addEventListener('change',()=>{ d.torn=selectTorn.value; });
      tdTorn.appendChild(selectTorn); tr.appendChild(tdTorn);

      // ZONA
      const tdZona = document.createElement('td'); const selectZona = document.createElement('select'); selectZona.classList.add('centre-select'); selectZona.style.width='120px';
      opcionsZona.forEach(z=>{ const o=document.createElement('option'); o.value=z;o.textContent=z;if(z===d.zona)o.selected=true; selectZona.appendChild(o); });
      selectZona.addEventListener('change',()=>{ d.zona=selectZona.value; });
      tdZona.appendChild(selectZona); tr.appendChild(tdZona);

      // CEL·LES NUMERIQUES
      ['coneixements','atencio','disponibilitat','actitud'].forEach(k=>{
        const td = document.createElement('td');
        makeEditable(td,d,k,true);
        td.style.background=getRowColor(d.valoracio);
        td.style.textAlign='center';
        tr.appendChild(td);
      });

      // VALORACIÓ
      const tdVal = document.createElement('td'); tdVal.dataset.key='valoracio';
      tdVal.textContent=d.valoracio.toFixed(2); tdVal.style.background=getGradientColor(d.valoracio);
      tdVal.style.textAlign='center'; tdVal.style.fontWeight='bold';
      tr.appendChild(tdVal);

      // OBSERVACIONS
      const tdObs = document.createElement('td');
      makeEditable(tdObs,d,'observacions');
      tr.appendChild(tdObs);

      // Zebra
      if(i%2===0) tr.style.backgroundColor='rgba(255,255,255,0.05)';
      else tr.style.backgroundColor='rgba(0,0,0,0.03)';

// ---------------- PAS 1: color de la fila segons valoració i zebra ----------------
const baseColor = getRowColor(d.valoracio);

// Funció per aclarir/fosquejar
function shadeColor(color, percent) {
    const match = color.match(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/);
    if(!match) return color;
    let [r,g,b,a] = match.slice(1).map(Number);
    r = Math.min(255, Math.max(0, r + r*percent));
    g = Math.min(255, Math.max(0, g + g*percent));
    b = Math.min(255, Math.max(0, b + b*percent));
    return `rgba(${r},${g},${b},${a})`;
}

// Zebra subtil: files parelles +5%, files senars -5%
const finalRowColor = (i%2===0) ? shadeColor(baseColor, 0.05) : shadeColor(baseColor, -0.05);



      tableBody.appendChild(tr);
    });

    // Footer amb botó Afegir fila
    let tfoot = tableView.querySelector('tfoot');
    if(!tfoot){ tfoot=document.createElement('tfoot'); tableView.appendChild(tfoot);}
    tfoot.innerHTML = `
      <tr>
        <td colspan="14" style="text-align:left; padding:10px 0;">
          <button id="addRowBtn">+ Afegir fila</button>
        </td>
      </tr>
      <tr>
        <td colspan="14" class="footer">Núñez i Navarro parkings 2026 v1.0 beta</td>
      </tr>
    `;
    document.getElementById('addRowBtn').addEventListener('click',()=>{
      currentData.push({ agent:"", centre:"", societat:"", torn:"", zona:opcionsZona[0],
        coneixements:0, atencio:0, disponibilitat:0, actitud:0, valoracio:0, observacions:"" });
      saveData();
      renderTable(currentData);
    });
  // 🔹 Guardar nou ordre del rànquing
   saveRankingOrder(arr);

  }



// ===============================
// SCATTER: Coneixements vs Atenció
// ===============================

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

  if(scatterChart) scatterChart.destroy();


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
        { color: 'rgba(218,165,32,0.8)', label: 'Actitud ≥ 8' },
        { color: 'rgba(0,128,0,0.7)', label: 'Actitud 5–7' },
        { color: 'rgba(255,0,0,0.6)', label: 'Actitud 2–4' },
        { color: 'rgba(0,0,0,0.5)', label: 'Actitud < 2' }
      ];

      legendItems.forEach(item => {
        // cercle
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.arc(xPixel + dotRadius, yPixel, dotRadius, 0, 2 * Math.PI);
        ctx.fill();

        // text grisós
        ctx.fillStyle = '#555';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.label, xPixel + dotRadius * 2 + 6, yPixel);

        xPixel += ctx.measureText(item.label).width + dotRadius * 2 + gap;
      });

      // Text final de la mida
      ctx.font = '13px Arial italic';
      ctx.fillText('Mida = Disponibilitat', xPixel, yPixel);

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
        if(d.actitud >= 8) return 'rgba(218,165,32,0.8)';
        if(d.actitud >= 5) return 'rgba(0,128,0,0.7)';
        if(d.actitud >= 2) return 'rgba(255,0,0,0.6)';
        return 'rgba(0,0,0,0.5)';
      }),
      borderWidth: bubbleData.map(d => d.borderWidth),
      borderColor: bubbleData.map(d => d.borderColor)
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 10, bottom: 40 } },
    scales: {
      x: { min: 0, max: 10, title: { display: true, text: 'Coneixements' }, ticks: { padding: 10 } },
      y: { min: 0, max: 10, title: { display: true, text: 'Atenció' } }
    },
plugins: {
  legend: {
    display: false  },
  tooltip: {
    callbacks: {
      label: function(context){
        const d = context.raw;
        return [
          d.agent,
          `Coneixements: ${d.x}`,
          `Atenció: ${d.y}`,
          `Disponibilitat: ${d.disponibilitatReal}`,
          `Actitud: ${d.actitud}`,
          `Valoració: ${d.valoracio}`
        ];
      }
    }
  }
}

  },
  plugins: [ bubbleLegendPlugin ]
});

}

function aplicarFiltres(){
    const centreVal = filterCentre.value,
          tornVal = filterTorn.value,
          zonaVal = filterZona.value,
          notaRange = filterNota.value;
    const searchVal = searchInput.value.trim().toLowerCase();

    let notaMin = NaN, notaMax = NaN;
    if(notaRange){
        const p = notaRange.split('-');
        if(p.length === 2){
            notaMin = parseFloat(p[0]);
            notaMax = parseFloat(p[1]);
        }
    }

    const filtrades = currentData.filter(d => {
        if(centreVal && d.centre !== centreVal) return false;
        if(tornVal && d.torn !== tornVal) return false;
        if(zonaVal && d.zona !== zonaVal) return false;
        if(!isNaN(notaMin) && !isNaN(notaMax)){
            if(d.valoracio < notaMin || d.valoracio >= notaMax) return false;
        }
        if(searchVal && !d.agent.toLowerCase().includes(searchVal)) return false;
        return true;
    });

    // ---------------- Actualitza taula i gràfiques ----------------
    renderTable(filtrades);
   if(typeof renderCentreChart === "function") renderCentreChart(filtrades);
   if(typeof renderScatterChart === "function") renderScatterChart(filtrades);
   if(typeof renderSunburstChart === "function") renderSunburstChart(filtrades);
   updateWorkerCount(filtrades);


}


  // --- EVENTS ---
  btnCardView.addEventListener('click',()=>{
    tableView.style.display='none';
    cardsContainer.style.display='grid';
    renderCards(currentData);
  });
  btnTableView.addEventListener('click',()=>{
    cardsContainer.style.display='none';
    tableView.style.display='table';
  });
  [filterCentre,filterTorn,filterZona,filterNota].forEach(f=>f.addEventListener('change',aplicarFiltres));
  searchInput.addEventListener('input',aplicarFiltres);

  // --- RENDER INICIAL ---
renderTable(currentData);
updateWorkerCount(currentData);
if(typeof renderCentreChart==="function") renderCentreChart(currentData);
renderScatterChart(currentData);
if(typeof renderSunburstChart === "function") renderSunburstChart(currentData);





});
