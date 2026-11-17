// missions.js — the story: three chained missions with an objective marker,
// a beacon in the world, a tracker on the HUD, cash + respect rewards, and
// fail states with retry. M1 teaches stealing, M2 teaches combat, M3 is the
// night chase that ends the arc.
import * as THREE from 'three';
import { CFG, MISSION_DEFS } from './config.js';
import { dist2D } from './random.js';
import { makeRival } from './combat.js';

export function createMissions(G) {
  // The beacon: a tall light pillar + ring at the current objective.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true), beaconMat);
  beacon.position.y = 30;
  beacon.visible = false;
  G.scene.add(beacon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.visible = false;
  G.scene.add(ring);

  const state = {
    index: 0,               // 0..2, or 3 when the story is done
    stage: 'intro',         // intro | active | done
    target: null,           // {x, z, label}
    collected: 0,
    collectT: 0,
    packageHeld: false,
    escaped: false,
    timer: 0,
  };

  function currentDef() { return MISSION_DEFS[state.index] || null; }

  function setTarget(x, z, label) {
    state.target = { x, z, label };
    beacon.position.x = x; beacon.position.z = z; beacon.visible = true;
    ring.position.x = x; ring.position.z = z; ring.visible = true;
  }

  function clearTarget() {
    state.target = null;
    beacon.visible = false; ring.visible = false;
  }

  function startMission(i) {
    state.index = i;
    state.collected = 0;
    state.collectT = 0;
    state.packageHeld = false;
    state.escaped = false;
    state.stage = 'active';
    const def = MISSION_DEFS[i];
    G.events.radio('Sal: ' + def.brief);
    G.events.toast('MISSION: ' + def.name);
    G.audio.sting();
    if (i === 0) {
      setTarget(G.city.garagePos.x, G.city.garagePos.z, "SAL'S GARAGE");
      G.hud.setObjective("Steal a car and deliver it to Sal's Garage");
    } else if (i === 1) {
      const shop = G.city.pierShops[0];
      setTarget(shop.x, shop.z, shop.name + ' (1/3)');
      G.hud.setObjective('Collect protection cash at the pier shops (0/3)');
    } else if (i === 2) {
      G.night = true;
      G.events.radio('RADIO: All units, package courier on the move. 3 stars, do not let them slip');
      const pkg = { x: 81, z: -81 };
      setTarget(pkg.x, pkg.z, 'THE PACKAGE');
      G.hud.setObjective('Pick up the package at Neon Row (81, -81)');
      G.events.raiseWanted(3, 'Package run flagged, Neon Row');
    }
  }

  function completeMission() {
    const def = MISSION_DEFS[state.index];
    G.cash += def.reward;
    G.respect += def.respect;
    G.events.toast('MISSION COMPLETE: ' + def.name + '  +$' + def.reward);
    G.events.radio('Sal: Beautiful work, kid. That was clean.');
    G.audio.sting();
    G.hud.setObjective('Mission complete — talk to Sal for the next job');
    clearTarget();
    state.stage = 'done';
    state.timer = 0;
    if (state.index === 0) {
      // Sal arms you: the pistol, with a full magazine.
      G.player.armed = true;
      G.player.ammo = CFG.pistolMag;
      G.player.reserve = CFG.pistolReserve;
      G.events.radio('Sal: Take this pistol. You earned it. R to reload.');
    }
    if (state.index === 2) {
      G.night = false;
      G.events.radio('Sal: The tide turned tonight. Solmar Bay is ours, kid.');
    }
    G.save();
  }

  function failMission(reason) {
    G.events.toast('MISSION FAILED: ' + reason);
    G.events.radio('Sal: Forget it. Come back when you are ready.');
    G.audio.fail();
    state.stage = 'intro';
    state.timer = 0;
    clearTarget();
    G.night = false;
    // Rivals from the failed attempt stand down.
    for (const r of G.rivals) r.alive = false;
    G.save();
  }

  // M2: a rival crew ambushes each collection.
  function spawnRivalAmbush(G2, x, z) {
    for (let i = 0; i < 2; i++) {
      const r = makeRival(G2.scene, G2.rng, x + G2.rng.range(-8, 8), z + G2.rng.range(-8, 8));
      G2.rivals.push(r);
    }
    G2.events.radio('Rocco: This turf is ours, kid. Walk away.');
    G2.audio.sirenBurst();
  }

  function update(dt) {
    const def = currentDef();
    if (!def) { G.hud.setObjective('Story complete — free roam Solmar Bay'); return; }
    if (state.stage === 'intro') {
      state.timer += dt;
      if (state.timer > 2.5) startMission(state.index);
      return;
    }
    if (state.stage !== 'active') {
      state.timer += dt;
      // A short breather, then the next mission starts itself.
      if (state.timer > 4 && state.index < 2) startMission(state.index + 1);
      else if (state.timer > 4) G.hud.setObjective('Story complete — free roam Solmar Bay');
      return;
    }
    const px = G.player.pos.x, pz = G.player.pos.z;
    const t = state.target;
    // Pulse the beacon ring so the objective reads from across the city.
    ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.12);
    if (!t) return;
    const d = dist2D(px, pz, t.x, t.z);
    if (state.index === 0) {
      // M1: only counts while driving the stolen car into the garage yard.
      if (d < 9 && G.player.inCar) {
        completeMission();
      } else if (d < 9 && !G.player.inCar) {
        G.hud.setObjective('Bring the CAR to the garage — on foot does not count');
      } else {
        G.hud.setObjective("Steal a car and deliver it to Sal's Garage");
      }
    } else if (state.index === 1) {
      const shop = G.city.pierShops[state.collected];
      if (shop && d < 6) {
        state.collectT += dt;
        G.hud.setObjective(`Collecting cash at ${shop.name}… ${Math.ceil(3 - state.collectT)}s`);
        if (state.collectT >= 3) {
          state.collectT = 0;
          state.collected += 1;
          G.cash += 150;
          G.events.radio('Sal: Cash in. ' + state.collected + ' of 3 shops done.');
          G.audio.pickup();
          if (state.collected >= 3) { completeMission(); return; }
          const next = G.city.pierShops[state.collected];
          setTarget(next.x, next.z, next.name + ` (${state.collected + 1}/3)`);
          spawnRivalAmbush(G, next.x, next.z);
        }
      } else if (shop) {
        state.collectT = 0;
        G.hud.setObjective(`Collect protection cash at ${shop.name} (${state.collected}/3)`);
      }
    } else if (state.index === 2) {
      if (!state.packageHeld) {
        if (d < 6) {
          state.packageHeld = true;
          G.events.radio('Sal: Package secured. Now cross town to the Marina and LOSE them.');
          G.audio.pickup();
          setTarget(-81, 108, 'MARINA DEL SOL — LOSE THE COPS');
          G.hud.setObjective('Deliver the package to Marina Del Sol, then lose the cops');
        }
      } else if (d < 9) {
        if (G.wanted === 0) {
          completeMission();
        } else {
          G.hud.setObjective('You are here — but lose the cops first! (' + G.wanted + ' stars)');
        }
      }
    }
    // Failing: the player dies or gets busted mid-mission (handled by main),
    // and M3 fails if the package is dropped — here, if wanted hits 5 the
    // heat is too much and the run is blown.
    if (state.index === 2 && G.wanted >= 5 && state.packageHeld) {
      failMission('The heat got too hot — the package is blown');
    }
  }

  return {
    state, startMission, completeMission, failMission, update,
    // Move the beacon + ring to a new objective (used by screenshot staging).
    setObjectiveTarget(x, z, label) { setTarget(x, z, label); },
    objectiveTarget() { return state.target; },
  };
}
