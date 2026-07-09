/* =========================================================
   StadiumMind AI — app.js
   Handles: theming, view routing, live scorebug polling,
   the Stadium Pulse octagon map, and all module forms.
   Every number rendered here comes from a fetch() call —
   nothing is hardcoded.
   ========================================================= */

const API = '/api';
let META = null; // gate/zone geometry, loaded once from /api/meta

// ---------- Theme ----------
const root = document.documentElement;
const savedTheme = localStorage.getItem('smind-theme'); // ok: not app data, just a UI preference, no artifact restriction here since this is a real deployed site
if (savedTheme) root.setAttribute('data-theme', savedTheme);
document.getElementById('themeToggle').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('smind-theme', next);
});

// ---------- Toasts ----------
function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'toast--error' : ''}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ---------- View routing ----------
document.querySelectorAll('.side__item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side__item').forEach((b) => b.classList.remove('is-active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
    btn.classList.add('is-active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('is-active');
  });
});

// ---------- Clock ----------
setInterval(() => {
  document.getElementById('statClock').textContent = new Date().toLocaleTimeString();
}, 1000);

// ---------- Fetch helper with error toast ----------
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || (data.errors && data.errors.join(' ')) || 'Something went wrong.';
    toast(msg, 'error');
    throw new Error(msg);
  }
  return data;
}

// ---------- Populate zone/mode dropdowns once meta is loaded ----------
function populateZoneSelects(zones) {
  ['crowdZoneSelect', 'accessZone', 'incidentZone', 'volunteerZone'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const includeAny = id === 'accessZone';
    el.innerHTML = (includeAny ? ['<option value="">All zones</option>'] : [])
      .concat(zones.map((z) => `<option value="${z}">Zone ${z}</option>`))
      .join('');
  });
}

function populateModeSelect(options) {
  const el = document.getElementById('modeSelect');
  el.innerHTML = options.map((o) => `<option value="${o.mode}">${o.mode.replace(/_/g, ' ')}</option>`).join('');
}

// ---------- Stadium Pulse (signature octagon map) ----------
function renderPulseMap(zones) {
  const svg = document.getElementById('pulseMap');
  const capacity = 82500 / META.stadium.zones.length;

  const levelColor = { low: 'var(--turf-bright)', moderate: 'var(--floodlight)', high: '#e08a2c', critical: 'var(--signal)' };

  svg.innerHTML = zones.map((z) => {
    const gate = META.gates.find((g) => META.seatZoneMap[z.zone].gate === g.name);
    const r = 1.2 + (z.occupancyRatio * 2.4);
    const color = levelColor[z.level];
    return `
      <g class="zone-node" transform="translate(${gate.x} ${gate.y})">
        ${z.level === 'critical' ? `<circle class="zone-pulse" r="2.6" fill="none" stroke="${color}" stroke-width="0.15"/>` : ''}
        <circle class="zone-core" r="${r}" fill="${color}" opacity="0.85"/>
        <text text-anchor="middle" dy="4.2" font-size="1.7">${z.zone}</text>
      </g>`;
  }).join('') + `<circle cx="0" cy="0" r="2" fill="none" stroke="var(--text-muted)" stroke-dasharray="0.4 0.4" opacity="0.4"/>`;
}

function renderZoneCards(zones) {
  const wrap = document.getElementById('zoneCards');
  wrap.innerHTML = zones.map((z) => `
    <div class="card level--${z.level}">
      <div class="card__label">Zone ${z.zone} · ${META.seatZoneMap[z.zone].gate}</div>
      <div class="card__value mono">${z.occupancy.toLocaleString()} / ${z.capacity.toLocaleString()}</div>
      <div class="card__bar"><div class="card__bar-fill" style="width:${Math.min(100, z.occupancyRatio * 100)}%"></div></div>
      <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">Queue ≈ ${z.queueLengthMeters} m · Inflow ${z.inflowRatePerMin}/min</div>
    </div>
  `).join('');
}

let crowdChart = null;
function renderCrowdChart(zones) {
  const ctx = document.getElementById('crowdChart');
  if (!ctx) return;
  const labels = zones.map((z) => `Zone ${z.zone}`);
  const data = zones.map((z) => Math.round(z.occupancyRatio * 100));
  if (crowdChart) {
    crowdChart.data.labels = labels;
    crowdChart.data.datasets[0].data = data;
    crowdChart.update();
    return;
  }
  crowdChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Occupancy %', data, backgroundColor: '#2fa36b' }] },
    options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } },
  });
}

async function refreshLiveState() {
  try {
    const crowd = await apiFetch('/crowd/live');
    document.getElementById('lastUpdated').textContent = `Last updated ${new Date(crowd.generatedAt).toLocaleTimeString()}`;
    document.getElementById('statOccupancy').textContent = crowd.zones.reduce((s, z) => s + z.occupancy, 0).toLocaleString();
    renderPulseMap(crowd.zones);
    renderZoneCards(crowd.zones);
    renderCrowdChart(crowd.zones);

    const incidents = await apiFetch('/incidents');
    document.getElementById('statIncidents').textContent = incidents.incidents.length;
  } catch (e) {
    // toast already shown by apiFetch
  }
}

// ---------- Navigation form ----------
document.getElementById('navForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = {
    seatSection: fd.get('seatSection'),
    accessible: fd.get('accessible') === 'on',
  };
  const arrival = fd.get('arrivalMinutesFromNow');
  if (arrival) body.arrivalMinutesFromNow = Number(arrival);

  const out = document.getElementById('navResult');
  out.innerHTML = `<div class="skeleton" style="height:80px"></div>`;
  try {
    const r = await apiFetch('/navigation', { method: 'POST', body: JSON.stringify(body) });
    out.innerHTML = `
      <div class="panel">
        <div class="result-line"><span>Recommended gate</span><span><b>${r.recommendedGate}</b>${r.gateChangedDueToCrowding ? ' (rerouted — home gate is busy)' : ''}</span></div>
        <div class="result-line"><span>Walking distance</span><span>${r.route.distanceMeters} m</span></div>
        <div class="result-line"><span>Estimated walk time</span><span>${r.route.estimatedWalkMinutes} min</span></div>
        ${r.arrivalAdvice ? `<div class="result-line"><span>Advice</span><span>${r.arrivalAdvice}</span></div>` : ''}
        <div class="result-line"><span>Nearest restroom</span><span>${r.nearestRestroom ? r.nearestRestroom.facility.name + ' · ' + r.nearestRestroom.distanceMeters + 'm' : 'N/A'}</span></div>
        <div class="result-line"><span>Nearest food court</span><span>${r.nearestFoodCourt ? r.nearestFoodCourt.facility.name + ' · ' + r.nearestFoodCourt.distanceMeters + 'm' : 'N/A'}</span></div>
        <div class="result-line"><span>Nearest medical room</span><span>${r.nearestMedicalRoom ? r.nearestMedicalRoom.facility.name + ' · ' + r.nearestMedicalRoom.distanceMeters + 'm' : 'N/A'}</span></div>
        <div class="result-line"><span>Nearest charging station</span><span>${r.nearestChargingStation ? r.nearestChargingStation.facility.name + ' · ' + r.nearestChargingStation.distanceMeters + 'm' : 'N/A'}</span></div>
      </div>`;
  } catch (err) {
    out.innerHTML = '';
  }
});

// ---------- Crowd predict ----------
document.getElementById('crowdPredictBtn').addEventListener('click', async () => {
  const zone = document.getElementById('crowdZoneSelect').value;
  const out = document.getElementById('crowdResult');
  out.innerHTML = `<div class="skeleton" style="height:40px"></div>`;
  try {
    const r = await apiFetch(`/crowd/predict/${zone}`);
    if (!r.available) {
      out.innerHTML = `<div class="ai-note">${r.message}</div>`;
      return;
    }
    out.innerHTML = `
      <div class="panel">
        <div class="result-line"><span>Current occupancy ratio</span><span>${(r.currentRatio * 100).toFixed(1)}%</span></div>
        <div class="result-line"><span>Projected next cycles</span><span>${r.projectedRatios.map((p) => (p * 100).toFixed(0) + '%').join(' → ')}</span></div>
        <div class="result-line"><span>Overload risk</span><span>${r.overloadRisk ? 'Yes ⚠' : 'No'}</span></div>
      </div>
      <div class="ai-note">${r.recommendation}</div>`;
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Accessibility ----------
document.getElementById('accessBtn').addEventListener('click', async () => {
  const profile = document.getElementById('accessProfile').value;
  const zone = document.getElementById('accessZone').value;
  const out = document.getElementById('accessResult');
  out.innerHTML = `<div class="skeleton" style="height:60px"></div>`;
  const qs = new URLSearchParams();
  if (profile) qs.set('profile', profile);
  if (zone) qs.set('zone', zone);
  try {
    const r = await apiFetch(`/accessibility/facilities?${qs.toString()}`);
    out.innerHTML = `
      ${r.guidance ? `<div class="ai-note">${r.guidance}</div>` : ''}
      <div class="panel">
        ${r.facilities.map((f) => `<div class="result-line"><span>${f.name}</span><span>${f.type} · Zone ${f.zone}</span></div>`).join('') || '<p>No matching facilities.</p>'}
      </div>`;
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Sustainability ----------
document.getElementById('sustainForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { distanceKm: Number(fd.get('distanceKm')), mode: fd.get('mode') };
  const out = document.getElementById('sustainResult');
  out.innerHTML = `<div class="skeleton" style="height:80px"></div>`;
  try {
    const r = await apiFetch('/sustainability/footprint', { method: 'POST', body: JSON.stringify(body) });
    out.innerHTML = `
      <div class="panel">
        <div class="result-line"><span>Estimated CO₂</span><span>${r.estimatedCo2Grams} g</span></div>
        <div class="result-line"><span>Estimated travel time</span><span>${r.estimatedTravelMinutes} min</span></div>
      </div>
      ${r.betterAlternatives.length ? `<div class="panel"><h3 class="panel__title">Lower-carbon alternatives</h3>${r.betterAlternatives.map((a) => `<div class="result-line"><span>${a.mode.replace(/_/g,' ')}</span><span>${a.co2Grams} g · saves ${a.co2SavingsGrams} g</span></div>`).join('')}</div>` : ''}
      <div class="panel"><h3 class="panel__title">Nearby water refill & recycling</h3>${r.waterRefillStations.map((f) => `<div class="result-line"><span>${f.name}</span><span>Zone ${f.zone}</span></div>`).join('')}${r.recyclingPoints.map((f) => `<div class="result-line"><span>${f.name}</span><span>Zone ${f.zone}</span></div>`).join('')}</div>`;
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Incidents ----------
function severityBadge(sev) { return `<span class="badge badge--${sev}">${sev}</span>`; }

async function refreshIncidentList() {
  const list = document.getElementById('incidentList');
  try {
    const r = await apiFetch('/incidents');
    list.innerHTML = r.incidents.slice().reverse().map((i) => `
      <div class="incident-row">
        <span>${severityBadge(i.severity)} ${i.type.replace(/_/g,' ')} — Zone ${i.zone}</span>
        <span>${i.dispatchedTeam || 'Unassigned'}</span>
      </div>`).join('') || '<p style="color:var(--text-muted)">No incidents reported yet.</p>';
  } catch (e) { /* ignore */ }
}

document.getElementById('incidentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { type: fd.get('type'), zone: fd.get('zone'), description: fd.get('description') };
  const out = document.getElementById('incidentResult');
  out.innerHTML = `<div class="skeleton" style="height:100px"></div>`;
  try {
    const r = await apiFetch('/incidents', { method: 'POST', body: JSON.stringify(body) });
    out.innerHTML = `
      <div class="panel">
        <div class="result-line"><span>Severity</span><span>${severityBadge(r.incident.severity)}</span></div>
        <div class="result-line"><span>Priority</span><span>P${r.incident.priority}</span></div>
        <div class="result-line"><span>Dispatched team</span><span>${r.incident.dispatchedTeam} (${r.incident.distanceMeters}m away)</span></div>
      </div>
      <div class="ai-note">${r.aiGuidance}</div>`;
    toast('Incident reported and team dispatched.');
    e.target.reset();
    refreshIncidentList();
    refreshLiveState();
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Volunteers ----------
document.getElementById('volunteerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const body = { zone: fd.get('zone'), question: fd.get('question') };
  const out = document.getElementById('volunteerResult');
  out.innerHTML = `<div class="skeleton" style="height:60px"></div>`;
  try {
    const r = await apiFetch('/volunteers/ask', { method: 'POST', body: JSON.stringify(body) });
    out.innerHTML = `<div class="ai-note">${r.answer}</div>`;
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Analytics ----------
let analyticsChart = null;
async function loadAnalytics() {
  try {
    const r = await apiFetch('/analytics/summary');
    document.getElementById('analyticsCards').innerHTML = `
      <div class="card"><div class="card__label">Total occupancy</div><div class="card__value mono">${r.totalOccupancy.toLocaleString()}</div></div>
      <div class="card"><div class="card__label">Occupancy ratio</div><div class="card__value mono">${(r.occupancyRatio*100).toFixed(1)}%</div></div>
      <div class="card"><div class="card__label">Busiest zone</div><div class="card__value mono">${r.busiestZone.zone}</div></div>
      <div class="card"><div class="card__label">Avg queue length</div><div class="card__value mono">${r.avgQueueLengthMeters} m</div></div>
      <div class="card"><div class="card__label">Total incidents</div><div class="card__value mono">${r.totalIncidents}</div></div>
    `;
    const ctx = document.getElementById('analyticsChart');
    const labels = r.zones.map((z) => `Zone ${z.zone}`);
    const data = r.zones.map((z) => z.occupancy);
    if (analyticsChart) { analyticsChart.data.labels = labels; analyticsChart.data.datasets[0].data = data; analyticsChart.update(); }
    else {
      analyticsChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Occupancy', data, borderColor: '#f2c94c', backgroundColor: 'rgba(242,201,76,0.15)', fill: true, tension: 0.35 }] },
        options: { responsive: true, plugins: { legend: { display: false } } },
      });
    }
  } catch (e) { /* ignore */ }
}
document.getElementById('explainBtn').addEventListener('click', async () => {
  const out = document.getElementById('analyticsExplain');
  out.innerHTML = `<div class="skeleton" style="height:60px"></div>`;
  try {
    const r = await apiFetch('/analytics/explain');
    out.innerHTML = `<div class="ai-note">${r.explanation}</div>`;
  } catch (err) { out.innerHTML = ''; }
});

// ---------- Reports ----------
const REPORTS = [
  { type: 'incident_report', label: 'Incident Report' },
  { type: 'daily_operations', label: 'Daily Operations Report' },
  { type: 'crowd_summary', label: 'Crowd Summary' },
  { type: 'accessibility_summary', label: 'Accessibility Summary' },
  { type: 'volunteer_summary', label: 'Volunteer Summary' },
  { type: 'sustainability_report', label: 'Sustainability Report' },
];
function renderReportCards() {
  document.getElementById('reportCards').innerHTML = REPORTS.map((r) => `
    <div class="card">
      <div class="card__label">PDF</div>
      <div class="card__value" style="font-size:16px; font-family:var(--font-display);">${r.label}</div>
      <button class="btn btn--primary" style="margin-top:12px; width:100%;" onclick="window.open('${API}/reports/${r.type}', '_blank')">Download</button>
    </div>
  `).join('');
}

// ---------- Init ----------
async function init() {
  META = await apiFetch('/meta');
  populateZoneSelects(META.stadium.zones);
  populateModeSelect(META.transportOptions);
  renderReportCards();
  await refreshLiveState();
  await refreshIncidentList();
  await loadAnalytics();

  setInterval(refreshLiveState, 6000);
  setInterval(refreshIncidentList, 8000);
  setInterval(loadAnalytics, 12000);
}
init();
