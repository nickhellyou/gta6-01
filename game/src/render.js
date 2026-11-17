// render.js — the three.js stage: renderer, warm afternoon sun + sky, fog,
// the third-person chase camera (and the driving camera), day/night lighting
// and the car headlights that switch on for the night mission.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { lerp } from './random.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(0xffd9a0, 90, 320);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  camera.position.set(0, 8, 20);

  // Sky dome: warm gradient, brighter at the horizon.
  const skyGeo = new THREE.SphereGeometry(420, 24, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
      nightMix: { value: 0 },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 horizon; uniform float nightMix;
      void main(){ float h = normalize(vP).y * 0.5 + 0.5;
        vec3 day = mix(horizon, top, pow(max(h, 0.0), 0.65));
        vec3 night = mix(vec3(0.02, 0.03, 0.10), vec3(0.10, 0.12, 0.28), pow(max(h, 0.0), 0.6));
        gl_FragColor = vec4(mix(day, night, nightMix), 1.0); }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // The sun: a bright disc low in the west + a warm key light with shadows.
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }));
  sunDisc.position.set(-260, 120, -180);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const sun = new THREE.DirectionalLight(0xfff0c0, 2.6);
  sun.position.set(-80, 110, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.15);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8899ff, 0);
  moon.position.set(60, 120, 80);
  scene.add(moon);

  // Headlights for the player's car at night: one spotlight, aimed forward.
  const headlight = new THREE.SpotLight(0xfff2c0, 0, 45, 0.5, 0.45, 1.2);
  headlight.position.set(0, 1.2, 2);
  scene.add(headlight);
  scene.add(headlight.target);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Camera: third-person orbit on foot, lower chase cam while driving.
  // `look` is the point the camera aims at (player head / car centre).
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  function updateCamera(G, dt) {
    const p = G.player;
    const driving = p.inCar && p.car;
    // Driving: the camera sits behind the car, so yaw is the car's yaw plus
    // half a turn (the offset points opposite the direction of travel).
    const yaw = driving ? p.car.yaw + Math.PI : p.camYaw;
    const pitch = driving ? 0.22 : p.camPitch;
    const dist = driving ? 10.5 : 7.5;
    const height = driving ? 3.4 : 2.6;
    const backX = Math.sin(yaw) * Math.cos(pitch);
    const backZ = Math.cos(yaw) * Math.cos(pitch);
    const lookX = p.pos.x, lookY = p.pos.y + (driving ? 1.6 : 1.7), lookZ = p.pos.z;
    camPos.set(lookX + backX * dist, lookY + Math.sin(pitch) * dist + height - 1.2, lookZ + backZ * dist);
    // Keep the camera out of buildings: lift it if it clips a roofline.
    if (camPos.y < 1.2) camPos.y = 1.2;
    camTarget.set(lookX, lookY, lookZ);
    const k = 1 - Math.pow(0.0001, dt); // smooth follow, framerate independent
    camera.position.lerp(camPos, k);
    camera.lookAt(camTarget);
  }

  // Day / night: crossfade the sky, sun, fog and street glow. Night is the
  // M3 mission; day is the bright warm default.
  function updateLighting(G, dt) {
    const target = G.night ? 1 : 0;
    G.nightMix = lerp(G.nightMix || 0, target, Math.min(1, dt * 1.5));
    const n = G.nightMix;
    skyMat.uniforms.nightMix.value = n;
    sun.intensity = lerp(2.6, 0.25, n);
    moon.intensity = lerp(0, 0.7, n);
    hemi.intensity = lerp(1.15, 0.35, n);
    scene.fog.color.setHex(n > 0.5 ? 0x0d1526 : 0xffd9a0);
    sunDisc.material.color.setHex(n > 0.5 ? 0x223344 : PALETTE.sun);
    sunDisc.visible = n < 0.9;
    const driving = G.player.inCar && G.player.car;
    if (driving && n > 0.4) {
      const car = G.player.car;
      headlight.intensity = 260;
      headlight.position.set(car.x, 1.4, car.z);
      headlight.target.position.set(
        car.x + Math.sin(car.yaw) * 25, 0.4, car.z + Math.cos(car.yaw) * 25);
    } else {
      headlight.intensity = 0;
    }
    renderer.toneMappingExposure = lerp(1.05, 0.9, n);
  }

  return {
    renderer, scene, camera,
    render() { renderer.render(scene, camera); },
    updateCamera, updateLighting,
  };
}
