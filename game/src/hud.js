// HUD: every DOM panel the player sees — mission banner, SCPD dispatch,
// cash + wanted stars, weapon slots, crew cards, round minimap, speed,
// radio, dialog portraits — plus the pause/stats screen and garage menu.
import { fmtCash, clamp } from './rng.js';
import { DISTRICTS, CITY_HALF, GRID, PITCH } from './city.js';

export const RANKS = [
  { rp: 0, name: 'ROOKIE' },
  { rp: 400, name: 'FIXER' },
  { rp: 1200, name: 'HUSTLER' },
  { rp: 2400, name: 'KINGPIN' },
  { rp: 4200, name: 'LEGEND OF SOLARA' },
];
export function rankFor(rp) {
  let cur = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (rp >= RANKS[i].rp) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { cur, next };
}

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.dialogTimer = null;
    this.toastTimer = null;
    this.garageEl = null;
  }
  stars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < n ? 'on' : 'off'}">★</span>`;
    return s;
  }
  update(s) {
    // mission banner
    if (s.job) {
      $('mNum').textContent = `JOB ${s.jobIndex + 1} ·`;
      $('mTitle').textContent = s.job.title;
      $('mObj').textContent = s.stageText;
      $('mStage').textContent = `STAGE ${s.stageIndex + 1}/${s.stageCount}`;
      $('mDist').textContent = s.targetDist != null ? `${Math.round(s.targetDist)} m` : '—';
      $('mTimer').textContent = s.stageTimer > 0 ? `⏱ ${Math.ceil(s.stageTimer)}s` : '';
      $('mFill').style.width = `${clamp(s.stageProgress * 100, 0, 100)}%`;
      $('mNext').textContent = s.nextStageText ? 'NEXT: ' + s.nextStageText : '';
    } else if (s.taxi) {
      $('mNum').textContent = 'TAXI ·';
      $('mTitle').textContent = s.taxi.phase === 'pickup' ? 'FARE WAITING' : 'FARE ON BOARD';
      $('mObj').textContent = s.taxi.phase === 'pickup'
        ? 'Pick up the passenger at the marker.' : 'Drive the passenger to the drop-off.';
      $('mStage').textContent = 'FARE $' + s.taxi.fare;
      $('mDist').textContent = s.targetDist != null ? `${Math.round(s.targetDist)} m` : '—';
      $('mTimer').textContent = '';
      $('mFill').style.width = s.taxi.phase === 'pickup' ? '25%' : '70%';
      $('mNext').textContent = 'TIP FOR FAST DELIVERY';
    } else {
      $('mNum').textContent = 'FREE ROAM ·';
      $('mTitle').textContent = 'SOLARA CITY';
      $('mObj').textContent = 'Press M for the next job from Marisol — or T for a taxi fare.';
      $('mStage').textContent = `${s.jobsDone}/8 JOBS DONE`;
      $('mDist').textContent = '';
      $('mTimer').textContent = '';
      $('mFill').style.width = `${s.jobsDone / 8 * 100}%`;
      $('mNext').textContent = `${s.packagesFound}/12 PACKAGES · $${s.cash.toLocaleString()}`;
    }
    // cash + wanted
    $('cash').textContent = fmtCash(s.cash);
    $('stars').innerHTML = this.stars(s.wanted);
    $('heat').textContent = s.wanted === 0 ? '' : s.wanted >= 4
      ? 'AIR UNIT DEPLOYED — IN SIGHT' : s.wanted >= 3 ? 'ROADBLOCKS AHEAD — IN SIGHT' : 'IN SIGHT';
    const r = rankFor(s.rp);
    $('rank').textContent = `RANK ${RANKS.indexOf(r.cur) + 1} · ${r.cur.name} · ${s.rp.toLocaleString()} / ${r.next ? r.next.rp.toLocaleString() : 'MAX'} RP`;
    // dispatch
    $('dCount').textContent = `${s.dispatch.length} UNITS`;
    $('dList').innerHTML = s.dispatch.slice(0, 6).map(u =>
      `<li><span class="u-name">${u.name}</span><span class="u-tactic">${u.tactic}</span><span class="u-dist">${u.dist}m</span></li>`).join('');
    $('dMore').textContent = s.dispatch.length > 6 ? `+${s.dispatch.length - 6} more units responding` : '';
    $('dispatch').style.display = s.wanted > 0 ? 'block' : 'none';
    // weapons
    $('weapons').innerHTML = s.weapons.map((w, i) =>
      `<div class="wslot ${i === s.weaponIndex ? 'active' : ''} ${w.locked ? 'locked' : ''}">
        <div class="w-key">${w.key}</div><div class="w-name">${w.name}</div>
        <div class="w-ammo">${w.locked ? 'LOCKED' : (w.ammo === Infinity ? '∞' : w.ammo + ' RDS')}</div>
      </div>`).join('');
    // crew
    $('crew').innerHTML = s.crew.map(c =>
      `<div class="crewcard ${c.cd <= 0 ? 'ready' : ''}">
        <div class="c-name">${c.name} <span class="c-role">· ${c.role}</span></div>
        <div class="c-abil">${c.key} ${c.ability}</div>
        <div class="c-cd">${c.cd <= 0 ? 'READY' : 'READY IN ' + Math.ceil(c.cd) + 's'}</div>
      </div>`).join('');
    // vitals + drive
    $('hpFill').style.width = `${clamp(s.health, 0, 100)}%`;
    $('arFill').style.width = `${clamp(s.armor, 0, 100)}%`;
    $('speed').innerHTML = `${Math.round(Math.abs(s.speedKmh))} <small>KM/H</small>`;
    $('carname').textContent = s.carName;
    $('carcond').textContent = s.carHealth != null
      ? (s.carHealth > 60 ? '' : s.carHealth > 30 ? `${s.carName} — ${Math.round(s.carHealth)}% · DENTED` : `${s.carName} — ${Math.round(s.carHealth)}% · SMOKING`)
      : '';
    $('radio').innerHTML = `<b>${s.station.name}</b> — ${s.station.track}`;
    $('district').textContent = s.district;
    $('crosshair').style.display = s.onFoot && !s.inMenu ? 'block' : 'none';
    this.drawMinimap(s);
  }
  drawMinimap(s) {
    const g = this.mmCtx;
    const W = 190, C = W / 2;
    const scale = W / (CITY_HALF * 2 + 200);
    const px = (x) => C + x * scale;
    const py = (z) => C + z * scale;
    g.clearRect(0, 0, W, W);
    // districts
    for (const d of DISTRICTS) {
      g.fillStyle = d.color + '44';
      g.fillRect(px(d.x0), py(d.z0), (d.x1 - d.x0) * scale, (d.z1 - d.z0) * scale);
    }
    // sea
    g.fillStyle = '#2a7a9e';
    g.fillRect(0, py(CITY_HALF + 40), W, W - py(CITY_HALF + 40));
    // roads
    g.strokeStyle = 'rgba(220,225,235,.55)';
    g.lineWidth = 1.4;
    for (let i = 0; i <= GRID; i++) {
      const p = -CITY_HALF - 8 + i * PITCH + 8;
      g.beginPath(); g.moveTo(px(p), 0); g.lineTo(px(p), W); g.stroke();
      g.beginPath(); g.moveTo(0, py(p)); g.lineTo(W, py(p)); g.stroke();
    }
    const blip = (x, z, color, r = 3.5) => {
      g.fillStyle = color;
      g.beginPath(); g.arc(px(x), py(z), r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
    };
    if (s.garageLot) blip(s.garageLot.x, s.garageLot.z, '#2a8a4a', 4);
    for (const p of s.packages) if (!p.found) blip(p.x, p.z, '#7dff9b', 2.5);
    for (const u of s.policeDots) blip(u.x, u.z, '#ff4a3c', 3);
    if (s.targetPoint) {
      g.fillStyle = '#ffd23e';
      g.beginPath();
      g.arc(px(s.targetPoint.x), py(s.targetPoint.z), 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    }
    // player arrow
    g.save();
    g.translate(px(s.px), py(s.pz));
    g.rotate(Math.atan2(Math.sin(s.heading), Math.cos(s.heading)) * -1 + Math.PI);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 1; g.stroke();
    g.restore();
  }
  say(who, text, letter = 'M', ms = 5200) {
    $('dWho').textContent = who;
    $('dText').textContent = text;
    $('portrait').textContent = letter;
    $('dialog').style.display = 'flex';
    clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => { $('dialog').style.display = 'none'; }, ms);
  }
  toast(text, ms = 2600) {
    $('toast').textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { $('toast').textContent = ''; }, ms);
  }
  hint(text) {
    const el = $('hint');
    if (text) { el.textContent = text; el.style.display = 'block'; }
    else el.style.display = 'none';
  }
  renderStats(s) {
    // district map
    const cv = $('districtMap');
    const g = cv.getContext('2d');
    const W = 330, H = 220;
    const scale = Math.min(W / (CITY_HALF * 2 + 120), H / (CITY_HALF * 2 + 120));
    const ox = (W - (CITY_HALF * 2 + 120) * scale) / 2;
    const oy = (H - (CITY_HALF * 2 + 120) * scale) / 2;
    const px = (x) => ox + (x + CITY_HALF + 60) * scale;
    const py = (z) => oy + (z + CITY_HALF + 60) * scale;
    g.fillStyle = '#10182c'; g.fillRect(0, 0, W, H);
    for (const d of DISTRICTS) {
      g.fillStyle = d.color;
      g.globalAlpha = 0.55 + d.stand * 0.45;
      g.fillRect(px(d.x0), py(d.z0), (d.x1 - d.x0) * scale, (d.z1 - d.z0) * scale);
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.font = 'bold 9px sans-serif';
      g.fillText(d.name, px(d.x0) + 4, py(d.z0) + 13);
    }
    $('districtList').innerHTML = DISTRICTS.map(d =>
      `<div style="display:flex;justify-content:space-between"><span><span style="color:${d.color}">■</span> ${d.name}</span><span>${d.stand > 0 ? 'RESPECTED' : 'NEUTRAL'}</span></div>`).join('');
    $('careerStats').innerHTML = [
      ['Cars stolen', s.stats.carsStolen],
      ['Cops escaped', s.stats.copsEscaped],
      ['Distance driven', (s.stats.kmDriven / 1000).toFixed(1) + ' km'],
      ['People taken out', s.stats.kills],
      ['Taxi fares', s.stats.taxiFares],
      ['Packages found', `${s.packagesFound}/12`],
      ['Cash earned', '$' + s.stats.cashEarned.toLocaleString()],
      ['Completion', s.completion + '%'],
    ].map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    $('jobList').innerHTML = s.jobList.map(j =>
      `<div class="${j.done ? 'done' : 'todo'}">${j.done ? '★' : '○'} ${j.title} ${j.done ? '— ' + j.grade : ''}</div>`).join('');
  }
  renderSlots(el, saves, onPick) {
    el.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const sv = saves[i];
      const div = document.createElement('div');
      div.className = 'slot';
      div.innerHTML = sv
        ? `<div class="s-name">SAVE ${i + 1} — ${sv.completion}% COMPLETE</div>
           <div class="s-info">$${sv.cash.toLocaleString()} · ${sv.jobsDone}/8 jobs · Rank ${sv.rank}</div>
           <div class="s-bar"><div class="s-fill" style="width:${sv.completion}%"></div></div>`
        : `<div class="s-name">SAVE ${i + 1} — EMPTY</div><div class="s-info">No save yet</div>`;
      div.onclick = () => onPick(i);
      el.appendChild(div);
    }
  }
  showGarage(cars, cash, onBuy, onPull, onClose) {
    this.closeGarage();
    const div = document.createElement('div');
    div.className = 'screen';
    div.id = 'garageScreen';
    div.innerHTML = `<div class="card" style="width:560px">
      <h2>SAFEHOUSE GARAGE</h2>
      <p>Cash: <b style="color:#7dff9b">$${cash.toLocaleString()}</b> — up to 3 cars. Pick a car to buy, or pull an owned car out at the lot.</p>
      <div id="garageList" style="margin-top:12px"></div>
      <button class="btn" id="garageClose">CLOSE</button></div>`;
    document.getElementById('app').appendChild(div);
    this.garageEl = div;
    const list = div.querySelector('#garageList');
    for (const c of cars) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:9px 4px;border-top:1px solid rgba(255,255,255,.08);font-size:14px';
      row.innerHTML = `<span><b>${c.name}</b> <span style="color:#9fb4d8">· ${c.desc} · top ${c.top * 3.6 | 0} km/h</span></span>`;
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'margin-top:0;padding:7px 14px;font-size:13px';
      if (c.owned) { btn.textContent = 'PULL OUT'; btn.onclick = () => onPull(c.id); }
      else { btn.textContent = `BUY $${c.price.toLocaleString()}`; btn.onclick = () => onBuy(c.id); }
      row.appendChild(btn);
      list.appendChild(row);
    }
    div.querySelector('#garageClose').onclick = onClose;
  }
  closeGarage() {
    if (this.garageEl) { this.garageEl.remove(); this.garageEl = null; }
  }
}
