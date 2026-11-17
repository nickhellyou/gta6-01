// hud.js — the dense HUD: health bar, cash, respect, wanted stars, weapon +
// ammo, mission objective, radio chatter feed, kill feed, minimap canvas,
// speed + time of day, damage vignette, toasts, and the start / pause /
// busted / wasted overlays. All DOM, drawn over the WebGL canvas.
import { CFG } from './config.js';

const STAR_ON = '★';
const STAR_OFF = '☆';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthFill: $('health-fill'), healthText: $('health-text'),
    cash: $('cash'), respect: $('respect'),
    stars: $('stars'), weapon: $('weapon'), ammo: $('ammo'),
    objective: $('objective'), objectiveTitle: $('objective-title'),
    radio: $('radio'), killfeed: $('killfeed'),
    minimap: $('minimap'), speed: $('speed'), clock: $('clock'),
    vignette: $('vignette'), toast: $('toast'),
    start: $('start-screen'), pause: $('pause-screen'), end: $('end-screen'),
    endTitle: $('end-title'), endText: $('end-text'),
    banner: $('banner'), crosshair: $('crosshair'),
    hint: $('hint'),
  };
  const mm = el.minimap.getContext('2d');
  let lastObjective = '';
  let toastTimer = null;

  function flashStars() {
    el.stars.classList.remove('flash');
    void el.stars.offsetWidth;
    el.stars.classList.add('flash');
  }

  function setObjective(text) {
    if (text === lastObjective) return;
    lastObjective = text;
    el.objective.textContent = text;
  }

  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200);
  }

  function radioLine(text) {
    const div = document.createElement('div');
    div.className = 'radio-line';
    div.textContent = text;
    el.radio.prepend(div);
    while (el.radio.children.length > 4) el.radio.removeChild(el.radio.lastChild);
    setTimeout(() => { if (div.parentNode) div.classList.add('fade'); }, 6000);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 8000);
  }

  function killFeedLine(killer, weapon, victim) {
    const div = document.createElement('div');
    div.className = 'feed-line';
    div.innerHTML = '';
    div.textContent = `${killer}  ·  ${weapon}  ·  ${victim}`;
    el.killfeed.prepend(div);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 9000);
  }

  function showBanner(text, sub) {
    el.banner.innerHTML = '';
    const t = document.createElement('div');
    t.className = 'banner-title'; t.textContent = text;
    el.banner.appendChild(t);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'banner-sub'; s.textContent = sub;
      el.banner.appendChild(s);
    }
    el.banner.classList.add('show');
    setTimeout(() => el.banner.classList.remove('show'), 2600);
  }

  // Minimap: streets as a grid, the pier, player arrow, mission marker,
  // police dots, north tick. 150x150 canvas, drawn every frame (cheap).
  function drawMinimap() {
    const S = 150;
    const scale = S / 300; // world -135..165 -> map
    const toX = (x) => (x + 150) * scale;
    const toZ = (z) => (z + 150) * scale;
    mm.fillStyle = 'rgba(12, 20, 30, 0.88)';
    mm.fillRect(0, 0, S, S);
    // Sea + pier.
    mm.fillStyle = '#1d6f92';
    mm.fillRect(0, toZ(135), S, S - toZ(135));
    mm.fillStyle = '#c9a06a';
    mm.fillRect(toX(-35), toZ(135), 16 * scale * 4, 80 * scale);
    // Streets.
    mm.fillStyle = '#5a6270';
    for (const s of [-81, -27, 27, 81]) {
      mm.fillRect(toX(s - 7), 0, 14 * scale, S);
      mm.fillRect(0, toZ(s - 7), S, 14 * scale);
    }
    mm.fillRect(toX(-135), 0, 14 * scale, S);
    mm.fillRect(0, toZ(-135), S, 14 * scale);
    // Crown Tower.
    mm.fillStyle = '#ffd166';
    mm.fillRect(toX(-9), toZ(-9), 18 * scale, 18 * scale);
    // Police dots.
    mm.fillStyle = '#ff3355';
    for (const c of G.copCars) {
      mm.beginPath(); mm.arc(toX(c.x), toZ(c.z), 3, 0, Math.PI * 2); mm.fill();
    }
    for (const c of G.cops) {
      if (!c.alive) continue;
      mm.beginPath(); mm.arc(toX(c.x), toZ(c.z), 2, 0, Math.PI * 2); mm.fill();
    }
    // Rivals.
    mm.fillStyle = '#ff8800';
    for (const r of G.rivals) {
      if (!r.alive) continue;
      mm.beginPath(); mm.arc(toX(r.x), toZ(r.z), 2.5, 0, Math.PI * 2); mm.fill();
    }
    // Mission marker: pulsing yellow diamond.
    const t = G.missions ? G.missions.objectiveTarget() : null;
    if (t) {
      const pulse = 4 + Math.sin(performance.now() / 250) * 1.5;
      mm.fillStyle = '#ffe600';
      mm.beginPath();
      mm.moveTo(toX(t.x), toZ(t.z) - pulse);
      mm.lineTo(toX(t.x) + pulse, toZ(t.z));
      mm.lineTo(toX(t.x), toZ(t.z) + pulse);
      mm.lineTo(toX(t.x) - pulse, toZ(t.z));
      mm.closePath(); mm.fill();
    }
    // Player arrow (rotates with facing).
    const px = toX(G.player.pos.x), pz = toZ(G.player.pos.z);
    const yaw = G.player.inCar && G.player.car ? G.player.car.yaw : G.player.yaw;
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -7); mm.lineTo(5, 5); mm.lineTo(0, 2.5); mm.lineTo(-5, 5);
    mm.closePath(); mm.fill();
    mm.restore();
    // North tick.
    mm.fillStyle = '#ffffff';
    mm.font = 'bold 10px system-ui, sans-serif';
    mm.textAlign = 'center';
    mm.fillText('N', S - 10, 12);
  }

  function update(dt) {
    const p = G.player;
    el.healthFill.style.width = Math.max(0, p.hp) + '%';
    el.healthFill.style.background = p.hp > 50 ? '#37d67a' : p.hp > 25 ? '#ffb020' : '#ff3355';
    el.healthText.textContent = Math.ceil(Math.max(0, p.hp)) + ' HP';
    el.cash.textContent = '$' + G.cash.toLocaleString('en-US');
    el.respect.textContent = 'RESPECT ' + G.respect;
    let stars = '';
    for (let i = 0; i < CFG.maxWanted; i++) stars += i < G.wanted ? STAR_ON : STAR_OFF;
    el.stars.textContent = stars;
    el.stars.classList.toggle('hot', G.wanted >= 3);
    if (p.armed) {
      el.weapon.textContent = 'PISTOL';
      el.ammo.textContent = p.reloading ? 'RELOADING…' : p.ammo + ' / ' + p.reserve;
    } else {
      el.weapon.textContent = 'FISTS';
      el.ammo.textContent = '—';
    }
    // Speed + clock.
    const kmh = p.inCar ? Math.round(p.speedKmh) : Math.round(p.speedKmh);
    el.speed.textContent = p.inCar ? kmh + ' km/h' : '';
    const hours = Math.floor(G.timeOfDay) % 24;
    const mins = Math.floor((G.timeOfDay % 1) * 60);
    el.clock.textContent = (G.night ? 'NIGHT ' : 'DAY ') + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
    // Damage vignette: red flash that fades after a hit.
    const sinceHurt = performance.now() / 1000 - p.lastHurtAt;
    const hurtGlow = p.hp < 30 ? 0.35 : 0;
    el.vignette.style.opacity = String(Math.max(hurtGlow, sinceHurt < 0.6 ? 0.7 - sinceHurt : 0));
    // Crosshair only when armed and on foot.
    el.crosshair.style.display = p.armed && !p.inCar ? 'block' : 'none';
    // Context hint: what E does right now.
    if (!p.inCar) {
      const car = G.vehicles.nearestCar(G, 4.5);
      el.hint.textContent = car ? '[E] Steal car' : '';
    } else {
      el.hint.textContent = '[E] Exit car    [Space] Handbrake';
    }
    drawMinimap();
  }

  function showScreen(name) {
    el.start.style.display = name === 'start' ? 'flex' : 'none';
    el.pause.style.display = name === 'pause' ? 'flex' : 'none';
    el.end.style.display = name === 'end' ? 'flex' : 'none';
  }

  function showEnd(title, text) {
    el.endTitle.textContent = title;
    el.endText.textContent = text;
    showScreen('end');
  }

  return {
    update, flashStars, setObjective, toast, radioLine, killFeedLine,
    showBanner, showScreen, showEnd,
    setObjectiveTitle(t) { el.objectiveTitle.textContent = t; },
  };
}
