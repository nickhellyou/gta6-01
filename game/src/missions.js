// The three chained missions of Solmar Bay: First Wheels, Pier Pressure
// and Neon Tide. A glowing beacon marks the current objective; completing
// one unlocks the next, and getting Busted or Wasted restarts the current one.

import * as THREE from 'three';
import { MISSIONS, LANDMARKS } from './config.js';

function makeBeacon() {
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 26, 16, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 13;
  return mesh;
}

function makeMarkerRing() {
  const geo = new THREE.TorusGeometry(3, 0.28, 8, 32);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffc233 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = 0.3;
  return mesh;
}

export function createMissions(scene) {
  const beacon = makeBeacon();
  const ring = makeMarkerRing();
  scene.add(beacon);
  scene.add(ring);
  return {
    index: 0,          // which mission (0..2); 3 = all done
    stage: 0,          // stage inside the current mission
    collected: 0,      // pier shops collected (M2)
    beacon,
    ring,
    target: null,      // { x, z } of the current objective
    done: false,
    rivalsSpawned: false,
  };
}

function setTarget(missions, x, z) {
  missions.target = { x, z };
  missions.beacon.position.set(x, 13, z);
  missions.ring.position.set(x, 0.3, z);
  missions.beacon.visible = true;
  missions.ring.visible = true;
}

function hideTarget(missions) {
  missions.beacon.visible = false;
  missions.ring.visible = false;
  missions.target = null;
}

function completeMission(state, reward) {
  const missions = state.missions;
  state.cash += reward;
  state.audio.cash();
  state.audio.missionDone();
  state.respect += 10;
  const m = MISSIONS[missions.index];
  state.hud.flash(`${m.name} complete — +$${reward}`);
  state.hud.addKillFeed(`${m.name} complete — +$${reward}`);
  missions.index += 1;
  missions.stage = 0;
  missions.collected = 0;
  missions.rivalsSpawned = false;
  if (missions.index >= MISSIONS.length) {
    missions.done = true;
    hideTarget(missions);
    state.hud.setObjective('Harbor Legend — Solmar Bay is yours. Free roam.');
  }
}

function spawnRivals(state) {
  const missions = state.missions;
  if (missions.rivalsSpawned) return;
  missions.rivalsSpawned = true;
  for (let i = 0; i < 3; i++) {
    const shop = LANDMARKS.pierShops[i];
    state.combat.spawnRival(shop.x + 4 + i * 2, shop.z + 6);
  }
  state.hud.flash('Rival crew on the pier — watch your back!');
}

// restart the current mission from its first stage (after Busted / Wasted)
export function restartMission(state) {
  const missions = state.missions;
  missions.stage = 0;
  missions.collected = 0;
  missions.rivalsSpawned = false;
  if (missions.index < MISSIONS.length) {
    const m = MISSIONS[missions.index];
    state.hud.setObjective(m.objective);
    state.hud.flash(`${m.name} restarted`);
  }
}

export function updateMissions(state, dt) {
  const missions = state.missions;
  if (missions.done) return;
  const m = MISSIONS[missions.index];
  const p = state.player.pos;
  const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;

  if (missions.index === 0) {
    // M1 First Wheels: steal a car, then bring it to Sal's Garage
    if (missions.stage === 0) {
      hideTarget(missions);
      state.hud.setObjective(m.objective);
      if (!state.player.onFoot) {
        missions.stage = 1;
        setTarget(missions, LANDMARKS.salsGarage.x, LANDMARKS.salsGarage.z);
        state.hud.flash('Got wheels — take it to Sal\'s Garage');
      }
    } else if (missions.stage === 1) {
      // the garage sits on its block; arriving on the road beside it counts
      if (near(LANDMARKS.salsGarage.x, LANDMARKS.salsGarage.z, 24)) {
        if (m.unlock === 'pistol') {
          state.weapon = 'pistol';
          state.ammo = 12;
          state.hud.flash('Pistol unlocked — click to shoot, R to reload');
        }
        completeMission(state, m.reward);
      }
    }
  } else if (missions.index === 1) {
    // M2 Pier Pressure: collect cash from the 3 pier shops
    if (missions.stage === 0) {
      spawnRivals(state);
      missions.stage = 1;
      const shop = LANDMARKS.pierShops[0];
      setTarget(missions, shop.x, shop.z);
      state.hud.setObjective('Collect cash from 3 pier shops (0/3)');
    } else {
      const shop = LANDMARKS.pierShops[missions.collected];
      if (shop && near(shop.x, shop.z, 5.5)) {
        missions.collected += 1;
        state.cash += 200;
        state.audio.cash();
        state.hud.flash(`Pier cash collected (${missions.collected}/3) — +$200`);
        if (missions.collected >= 3) {
          completeMission(state, m.reward);
        } else {
          const next = LANDMARKS.pierShops[missions.collected];
          setTarget(missions, next.x, next.z);
          state.hud.setObjective(`Collect cash from 3 pier shops (${missions.collected}/3)`);
        }
      }
    }
  } else if (missions.index === 2) {
    // M3 Neon Tide: night delivery to Neon Row, then shake a 3-star heat
    if (missions.stage === 0) {
      state.hour = 21.5;
      missions.stage = 1;
      setTarget(missions, LANDMARKS.neonRow.x, LANDMARKS.neonRow.z);
      state.hud.setObjective('Deliver the package to Neon Row at night');
      state.hud.flash('Night run — deliver the package to Neon Row');
    } else if (missions.stage === 1) {
      // Neon Row sits on its block; arriving on the road beside it counts
      if (near(LANDMARKS.neonRow.x, LANDMARKS.neonRow.z, 22)) {
        missions.stage = 2;
        hideTarget(missions);
        state.wanted = 3;
        state.hud.setObjective('Shake the 3-star heat — get clean');
        state.hud.flash('Package delivered — now shake the heat!');
      }
    } else if (missions.stage === 2) {
      if (state.wanted === 0) {
        completeMission(state, m.reward);
      }
    }
  }

  // beacon pulse
  const t = performance.now() * 0.002;
  missions.beacon.material.opacity = 0.65 + Math.sin(t) * 0.15;
  missions.ring.scale.setScalar(1 + Math.sin(t * 1.4) * 0.12);
}
