// shots.js — the four staged screenshots behind ?shot=chase|streets|mission|night.
// Each one puts the live game into a real mid-action state (a driving police
// chase, on-foot downtown, a pier mission firefight, the night run), paints
// it twice and sets window.__shotReady. Nothing here is a fake backdrop: the
// same simulation, HUD and minimap the player sees, frozen at a good moment.
import * as THREE from 'three';
import { CFG } from './config.js';
import { enterCar } from './vehicles.js';

function placeCopChase(G, count) {
  const car = G.player.car;
  for (let i = 0; i < count; i++) {
    const cop = G.copCars[i] || G.copCars[0];
    if (!cop) break;
    // Flanking just behind the player's car: in front of the chase camera
    // (which sits ~10.5 m behind), close to the centreline so the pursuit
    // reads in the frame.
    const behind = -4 - i * 3;
    const side = i % 2 === 0 ? 3.2 : -3.2;
    cop.x = car.x + Math.sin(car.yaw) * behind + Math.cos(car.yaw) * side;
    cop.z = car.z + Math.cos(car.yaw) * behind - Math.sin(car.yaw) * side;
    cop.yaw = car.yaw;
    cop.speed = 24;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.yaw;
    cop.mesh.visible = true;
  }
}

function placeTrafficAhead(G, x, z, yaw) {
  let placed = 0;
  for (const car of G.cars) {
    if (placed >= 4) break;
    if (car.kind !== 'traffic') continue;
    placed += 1;
    car.x = x + Math.sin(yaw) * (18 + placed * 12) + (placed % 2 === 0 ? 3.5 : -3.5);
    car.z = z + Math.cos(yaw) * (18 + placed * 12);
    car.yaw = yaw;
    car.speed = 8;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.yaw;
  }
}

function placePedsNear(G, x, z, count) {
  let placed = 0;
  for (const ped of G.peds) {
    if (placed >= count) break;
    placed += 1;
    ped.x = x + (placed % 2 === 0 ? 6 : -6) + placed;
    ped.z = z + 10 + placed * 4;
    ped.down = false;
    ped.mesh.rotation.x = 0;
    ped.mesh.position.set(ped.x, 0, ped.z);
  }
}

// Put the player in the nearest parked car and point it down the boulevard.
function putPlayerInCar(G, x, z, yaw, speed) {
  let best = null; let bestD = Infinity;
  for (const car of G.cars) {
    if (car.kind !== 'parked') continue;
    const d = (car.x - x) ** 2 + (car.z - z) ** 2;
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return null;
  best.x = x; best.z = z; best.yaw = yaw; best.speed = speed;
  best.mesh.position.set(x, 0, z);
  best.mesh.rotation.y = yaw;
  enterCar(G, best);
  best.speed = speed;
  return best;
}

export function stageShot(G, name) {
  const p = G.player;
  // A clean slate: hide the start screen, clear old cops/rivals, reset the day.
  G.hud.showScreen(null);
  G.screen = 'play';
  G.wanted = 0;
  G.night = false;
  G.nightMix = 0;
  G.timeOfDay = 14.5;
  for (const c of G.cops) { c.alive = false; c.mesh.visible = false; }
  for (const r of G.rivals) { r.alive = false; r.mesh.visible = false; }
  for (const c of G.copCars) { c.mesh.visible = false; c.speed = 0; }
  if (p.inCar) { p.car = null; p.inCar = false; }

  if (name === 'chase') {
    // COVER: mid-action police chase on the plaza approach, heading east
    // straight at the Crown Tower so the landmark fills the frame.
    G.missions.startMission(0);
    const car = putPlayerInCar(G, -26, 0, Math.PI / 2, 26);
    G.player.speedKmh = 94;
    G.wanted = 3;
    G.cash = 1240;
    G.respect = 25;
    // Two cop cars in pursuit + one foot cop on the sidewalk.
    let shown = 0;
    for (const c of G.copCars) {
      if (shown >= 2) break;
      c.mesh.visible = true; shown += 1;
    }
    if (car) placeCopChase(G, 2);
    // Traffic crossing on the streets either side, in the background.
    let placed = 0;
    for (const t of G.cars) {
      if (placed >= 2) break;
      if (t.kind !== 'traffic') continue;
      placed += 1;
      t.x = placed === 1 ? -50 : -40;
      t.z = placed === 1 ? -27 : 27;
      t.yaw = Math.PI / 2; t.speed = 8;
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.yaw;
    }
    placePedsNear(G, -26, 0, 5);
    const cop = G.cops[0];
    if (cop) { cop.alive = true; cop.mesh.visible = true; cop.x = -14; cop.z = 8; cop.mesh.position.set(-14, 0, 8); }
    p.armed = true; p.ammo = 9; p.reserve = 48;
    G.hud.killFeedLine('You', 'Pistol', 'Rocco');
    G.hud.radioLine('RADIO: Unit 7 responding to Palmera Blvd');
    G.hud.radioLine("Sal: Get that car to my garage, kid");
    G.hud.setObjective("Steal a car and deliver it to Sal's Garage");
    G.hud.setObjectiveTitle('MISSION: FIRST WHEELS');
    G.events.toast('WANTED: 3 stars — lose the cops!');
  } else if (name === 'streets') {
    // On foot on Neon Row with a clear sightline to the Crown Tower:
    // player on the x = 27 street at z = 40, looking north-west at the tower.
    G.missions.startMission(0);
    p.pos.set(27, 0, 40);
    p.yaw = -2.55; p.camYaw = 0.59; p.camPitch = 0.3;
    p.armed = false;
    G.cash = 350;
    placeTrafficAhead(G, 27, 40, Math.PI);
    placePedsNear(G, 27, 40, 7);
    G.hud.radioLine('RADIO: All units, quiet night on Neon Row');
    G.hud.radioLine("Sal: First job is simple. Get wheels.");
    G.hud.setObjective("Steal a car and deliver it to Sal's Garage");
    G.hud.setObjectiveTitle('MISSION: FIRST WHEELS');
  } else if (name === 'mission') {
    // M2 firefight on the pier: rivals shooting, shop collection in progress.
    G.player.armed = true; G.player.ammo = 10; G.player.reserve = 36;
    G.missions.state.index = 1;
    G.missions.state.stage = 'active';
    G.missions.state.collected = 1;
    const shop = G.city.pierShops[1];
    G.missions.setObjectiveTarget(shop.x, shop.z, shop.name + ' (2/3)');
    // Stand mid-pier, clear of the first shop, so the rivals read in front
    // of the second shop instead of behind a kiosk wall.
    p.pos.set(-27, 0, 165);
    // Player faces south, toward the rivals; the camera sits north of the
    // player, so the pier, the shops and the firefight read beyond them.
    p.yaw = 0; p.camYaw = Math.PI; p.camPitch = 0.28;
    G.wanted = 2;
    G.cash = 890;
    G.respect = 35;
    let ri = 0;
    const rivalSpots = [[-31, 175], [-23, 177], [-27, 179]];
    for (const r of G.rivals) {
      if (ri >= 3) break;
      r.alive = true; r.mesh.visible = true;
      r.x = rivalSpots[ri][0];
      r.z = rivalSpots[ri][1];
      r.hp = CFG.rivalHp;
      r.mesh.position.set(r.x, 0, r.z);
      ri += 1;
    }
    // A tracer mid-flight and a muzzle flash, frozen in the frame.
    G.effects.tracer(-31, 1.4, 175, -27, 1.2, 165, 0xffaa33);
    G.effects.burst(-31, 1.4, 175, 0xffee88, 8, 3);
    G.hud.killFeedLine('You', 'Pistol', 'Vito');
    G.hud.radioLine('Rocco: This turf is ours, kid. Walk away.');
    G.hud.radioLine('RADIO: Shots fired on Solmar Pier');
    G.hud.setObjective('Collect protection cash at SURF SHACK (1/3)');
    G.hud.setObjectiveTitle('MISSION: PIER PRESSURE');
  } else if (name === 'night') {
    // M3 night chase: headlights, neon, three stars, the package run.
    G.night = true;
    G.nightMix = 1;
    G.timeOfDay = 23.2;
    G.missions.state.index = 2;
    G.missions.state.stage = 'active';
    G.missions.state.packageHeld = true;
    G.missions.setObjectiveTarget(-81, 108, 'MARINA DEL SOL');
    const car = putPlayerInCar(G, 27, -40, Math.PI, 24);
    G.player.speedKmh = 86;
    G.wanted = 3;
    G.cash = 2150;
    G.respect = 60;
    p.armed = true; p.ammo = 7; p.reserve = 24;
    let shown = 0;
    for (const c of G.copCars) {
      if (shown >= 2) break;
      c.mesh.visible = true; shown += 1;
    }
    if (car) placeCopChase(G, 2);
    placeTrafficAhead(G, 27, -40, Math.PI);
    G.hud.killFeedLine('You', 'Pistol', 'Marco');
    G.hud.radioLine('RADIO: All units, package courier on Neon Row');
    G.hud.radioLine('Sal: Lose them at the Marina. Go go go!');
    G.hud.setObjective('Deliver the package to Marina Del Sol, then lose the cops');
    G.hud.setObjectiveTitle('MISSION: NEON TIDE');
  } else {
    // Unknown shot name: fall back to the street scene.
    return stageShot(G, 'streets');
  }
  // The simulation never runs in shot mode, so sync the player mesh by hand:
  // position + facing from the staged state, hidden while driving.
  p.visual.mesh.position.copy(p.pos);
  p.visual.mesh.rotation.y = p.yaw;
  p.visual.mesh.visible = !p.inCar;
  // Let the HUD + minimap settle on the staged state before painting.
  G.hud.update(0);
  G.stage.updateLighting(G, 1);
  G.stage.updateCamera(G, 1);
  // Shots that need the landmark in frame tilt the camera up toward it
  // after the chase camera settles (the player stays in the lower frame).
  // The chase keeps its level chase camera: the tower mass fills the frame
  // behind the cars, and the sign shot is the streets frame.
  if (name === 'streets') {
    // Pull the camera back so the player and the tower sign fit in one
    // frame, then aim between them.
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);
    G.camera.position.addScaledVector(dir, -12);
    G.camera.lookAt(13, 11, 24);
  }
}
