// Renderer, camera and day/night lighting: third-person orbit camera on
// foot, chase camera in a car, sun and sky that follow the time of day,
// headlights at night.

import * as THREE from 'three';
import { COLORS, WORLD } from './config.js';

export function createRender(scene, canvas) {
  // ?lowfx=1 (used by the automated playtest) disables shadows and
  // antialiasing so software rendering stays fast; the real game and the
  // screenshots always run at full quality.
  const lowfx = new URLSearchParams(window.location.search).get('lowfx') === '1';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowfx });
  renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !lowfx;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3a2f26, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  // car headlights (spotlight, attached to the player's car at night)
  const headlight = new THREE.SpotLight(0xfff2b0, 0, 60, 0.55, 0.5, 1.2);
  headlight.castShadow = false;
  scene.add(headlight);
  scene.add(headlight.target);

  scene.fog = new THREE.Fog(0x87b5e0, 120, 420);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, camera, sun, hemi, headlight, scene };
}

function skyForHour(hour) {
  // returns { sky, fog, sunColor, sunIntensity, hemiIntensity, sunElevation }
  if (hour >= 6 && hour < 17) {
    return { sky: COLORS.skyDay, fog: 0x87b5e0, sunColor: 0xfff2d0, sunI: 2.2, hemiI: 0.9, elev: 0.9, night: false };
  }
  if (hour >= 17 && hour < 20) {
    return { sky: COLORS.skyDusk, fog: 0xe89a6a, sunColor: 0xffb36a, sunI: 1.4, hemiI: 0.6, elev: 0.25, night: false };
  }
  return { sky: COLORS.skyNight, fog: 0x0b1026, sunColor: 0x8fb0ff, sunI: 0.35, hemiI: 0.35, elev: 0.5, night: true };
}

// orbit the camera with the mouse (pointer locked) and follow the player
export function updateRender(render, state, dt) {
  const player = state.player;
  const input = state.input;
  // mouse orbit
  player.camYaw -= input.mouseDX * 0.0026;
  player.camPitch += input.mouseDY * 0.0022;
  player.camPitch = Math.max(-0.15, Math.min(0.9, player.camPitch));

  const cam = render.camera;
  if (player.onFoot) {
    const dist = 7.5;
    const cx = player.pos.x + Math.sin(player.camYaw) * Math.cos(player.camPitch) * dist;
    const cz = player.pos.z + Math.cos(player.camYaw) * Math.cos(player.camPitch) * dist;
    const cy = player.pos.y + 2.2 + Math.sin(player.camPitch) * dist;
    const target = new THREE.Vector3(cx, cy, cz);
    // snap after a teleport (screenshot staging, respawn) instead of
    // gliding across the map from the old camera position
    if (cam.position.distanceTo(target) > 25) cam.position.copy(target);
    else cam.position.lerp(target, Math.min(1, dt * 10));
    cam.lookAt(player.pos.x, player.pos.y + 1.6, player.pos.z);
  } else if (player.car) {
    const car = player.car;
    const dist = 10;
    const backX = car.pos.x - Math.sin(car.heading) * dist;
    const backZ = car.pos.z - Math.cos(car.heading) * dist;
    const target = new THREE.Vector3(backX, 4.6, backZ);
    if (cam.position.distanceTo(target) > 25) cam.position.copy(target);
    else cam.position.lerp(target, Math.min(1, dt * 5));
    cam.lookAt(car.pos.x + Math.sin(car.heading) * 6, 1.4, car.pos.z + Math.cos(car.heading) * 6);
  }

  // day / night
  const sky = skyForHour(state.hour);
  render.renderer.setClearColor(sky.sky);
  if (render.scene) render.scene.background = new THREE.Color(sky.sky);
  render.sun.color.setHex(sky.sunColor);
  render.sun.intensity = sky.sunI;
  render.hemi.intensity = sky.hemiI;
  const sunAngle = ((state.hour - 6) / 12) * Math.PI;
  const sx = Math.cos(sunAngle) * 150;
  const sy = Math.sin(sunAngle) * 120 + 20;
  const sz = 60;
  render.sun.position.set(player.pos.x + sx, sy, player.pos.z + sz);
  render.sun.target.position.set(player.pos.x, 0, player.pos.z);
  if (state.scene) state.scene.fog.color.setHex(sky.fog);

  // headlights at night when driving
  const hl = render.headlight;
  if (!player.onFoot && player.car && sky.night) {
    hl.intensity = 60;
    hl.position.set(player.car.pos.x, 1.2, player.car.pos.z);
    const tx = player.car.pos.x + Math.sin(player.car.heading) * 20;
    const tz = player.car.pos.z + Math.cos(player.car.heading) * 20;
    hl.target.position.set(tx, 0.5, tz);
  } else {
    hl.intensity = 0;
  }

  render.renderer.render(state.scene, cam);
}
