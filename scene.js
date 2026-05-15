import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { state } from './physics.js';

let renderer, scene, camera, composer;
let magnet, coil, coilGlow, fieldLines, raycaster, mouse;
let dragPlane, dragOffset = new THREE.Vector3();
let coilShaderMat, magnetGroup;
let arrowRight, arrowLeft, bindArrow, bindLabel;
let coilFlow = 0;
let fieldLineMat;
let onDragCb = () => {};
let lastPolarity = null;

export function initScene(container, onDrag) {
  onDragCb = onDrag;
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000511, 0.04);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0, 4, 12);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(0x000511, 1);
  container.appendChild(renderer.domElement);

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 1.5, 0.4, 0.85);
  bloomPass.threshold = 0.15;
  bloomPass.strength = 1.6;
  bloomPass.radius = 0.6;

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  const amb = new THREE.AmbientLight(0x335577, 0.6);
  scene.add(amb);
  const key = new THREE.PointLight(0x06b6d4, 1.5, 30);
  key.position.set(-8, 6, 6);
  scene.add(key);
  const rim = new THREE.PointLight(0xf97316, 1.2, 30);
  rim.position.set(8, -3, 4);
  scene.add(rim);

  buildFloor();
  buildCoil();
  buildMagnet();
  buildFieldLines();
  buildArrows();
  buildBindArrow();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  attachInteraction(container);
  window.addEventListener('resize', () => onResize(container));
}

function buildFloor() {
  const geo = new THREE.PlaneGeometry(60, 60, 40, 40);
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a1929, wireframe: true, transparent: true, opacity: 0.1 });
  const floor = new THREE.Mesh(geo, mat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3;
  scene.add(floor);
}

function buildCoil() {
  coil = new THREE.Group();
  const turns = 14;
  const radius = state.coilRadius;
  const length = 2.4;
  const segments = 200;

  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * turns * Math.PI * 2;
    const x = (t - 0.5) * length;
    const y = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    points.push(new THREE.Vector3(x, y, z));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 600, 0.06, 8, false);

  coilShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCurrent: { value: 0 },
      uFlow: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uCurrent;
      uniform float uFlow;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      
      void main() {
        vec3 colorBlue = vec3(0.02, 0.71, 0.83); 
        vec3 colorOrange = vec3(0.97, 0.45, 0.08); 
        vec3 baseColor = uCurrent > 0.0 ? colorOrange : colorBlue;
        
        float intensity = clamp(abs(uCurrent) * 4.0, 0.0, 1.0);
        vec3 finalColor = mix(vec3(0.1, 0.15, 0.2), baseColor, intensity);
        
        float streak = sin(vUv.x * 200.0 + uFlow);
        streak = smoothstep(0.8, 1.0, streak);
        
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
        
        vec3 emission = finalColor * (streak * 3.0 + fresnel * 1.5) * intensity;
        
        gl_FragColor = vec4(finalColor * 0.4 + emission, 1.0);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });

  const tube = new THREE.Mesh(tubeGeo, coilShaderMat);
  coil.add(tube);

  const ringGeo = new THREE.TorusGeometry(radius + 0.1, 0.02, 8, 64);
  for (let i = -1; i <= 1; i += 2) {
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.x = i * length / 2;
    ring.rotation.y = Math.PI / 2;
    coil.add(ring);
  }

  coilGlow = new THREE.PointLight(0x06b6d4, 0, 8);
  coil.add(coilGlow);

  scene.add(coil);
}

function updateMagnetTexture(polarity) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  if (polarity === 1) {
    grad.addColorStop(0, '#1e3a8a');
    grad.addColorStop(0.45, '#cbd5e1');
    grad.addColorStop(0.5, '#e5e7eb');
    grad.addColorStop(0.55, '#fca5a5');
    grad.addColorStop(1, '#dc2626');
  } else {
    grad.addColorStop(0, '#dc2626');
    grad.addColorStop(0.45, '#fca5a5');
    grad.addColorStop(0.5, '#e5e7eb');
    grad.addColorStop(0.55, '#cbd5e1');
    grad.addColorStop(1, '#1e3a8a');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 50; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 128, 2, 128);
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  if (polarity === 1) {
    ctx.fillText('S', 100, 95);
    ctx.fillText('N', 412, 95);
  } else {
    ctx.fillText('N', 100, 95);
    ctx.fillText('S', 412, 95);
  }
  const tex = new THREE.CanvasTexture(canvas);
  if (magnetGroup) {
    const body = magnetGroup.children.find(c => c.name === 'magnet-body');
    if (body) {
      if (body.material.map) body.material.map.dispose();
      body.material.map = tex;
      body.material.needsUpdate = true;
    }
  }
}

function buildMagnet() {
  magnetGroup = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(1.8, 0.6, 0.6);
  const bodyMat = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.25 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'magnet-body';
  magnetGroup.add(body);

  const poleGeo = new THREE.PlaneGeometry(0.58, 0.58);
  const matRight = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshRight = new THREE.Mesh(poleGeo, matRight);
  meshRight.position.set(0.91, 0, 0);
  meshRight.rotation.y = Math.PI/2;
  meshRight.name = 'glowMeshRight';
  magnetGroup.add(meshRight);

  const matLeft = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshLeft = new THREE.Mesh(poleGeo, matLeft);
  meshLeft.position.set(-0.91, 0, 0);
  meshLeft.rotation.y = -Math.PI/2;
  meshLeft.name = 'glowMeshLeft';
  magnetGroup.add(meshLeft);

  const glowRight = new THREE.PointLight(0xffffff, 1.2, 4);
  glowRight.position.x = 1.0;
  glowRight.name = 'glowRight';
  magnetGroup.add(glowRight);

  const glowLeft = new THREE.PointLight(0xffffff, 1.2, 4);
  glowLeft.position.x = -1.0;
  glowLeft.name = 'glowLeft';
  magnetGroup.add(glowLeft);

  magnet = magnetGroup;
  magnet.position.set(state.magnetX, 0, 0);
  scene.add(magnet);
}

function buildFieldLines() {
  fieldLines = new THREE.Group();
  
  fieldLineMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: 1.5 }
    },
    vertexShader: `
      uniform float uTime;
      varying float vUv;
      void main() {
        vUv = uv.x;
        vec3 pos = position;
        pos.y += sin(uTime * 4.0 + pos.x * 3.0) * 0.05;
        pos.z += cos(uTime * 4.0 + pos.x * 3.0) * 0.05;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;
      varying float vUv;
      void main() {
        float dash = fract(vUv * 8.0 - uTime * uSpeed);
        float alpha = smoothstep(0.0, 0.2, dash) * smoothstep(1.0, 0.5, dash);
        float fade = smoothstep(0.0, 0.1, vUv) * smoothstep(1.0, 0.9, vUv);
        gl_FragColor = vec4(0.0, 0.8, 1.0, alpha * fade * 0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const numLines = 48;
  for(let i=0; i<numLines; i++) {
    const theta = (i / numLines) * Math.PI * 2;
    const R = 1.0 + Math.pow(Math.random(), 1.5) * 4.0; 
    const segments = 64;
    const pts = new Float32Array(segments * 3);
    const uvs = new Float32Array(segments * 2);
    
    for(let j=0; j<segments; j++) {
      const t = j / (segments - 1);
      const angle = t * Math.PI;
      const x = -0.9 * Math.cos(angle); 
      const r = R * Math.sin(angle);
      
      pts[j*3] = x;
      pts[j*3+1] = r * Math.cos(theta);
      pts[j*3+2] = r * Math.sin(theta);
      uvs[j*2] = t;
      uvs[j*2+1] = 0;
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    
    const line = new THREE.Line(geo, fieldLineMat);
    line.raycast = () => {}; 
    fieldLines.add(line);
  }
  magnetGroup.add(fieldLines);
}

function createCustomArrow(colorHex) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  const cylGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
  cylGeo.translate(0, 0.5, 0);
  const cyl = new THREE.Mesh(cylGeo, mat);
  const coneGeo = new THREE.ConeGeometry(0.12, 0.3, 8);
  coneGeo.translate(0, 0.15, 0);
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.position.y = 1;
  group.add(cyl);
  group.add(cone);
  group.visible = false;
  return group;
}

function buildArrows() {
  arrowRight = createCustomArrow(0xffffff);
  arrowLeft = createCustomArrow(0xffffff);
  arrowRight.position.set(0.9, 0, 0);
  arrowLeft.position.set(-0.9, 0, 0);
  magnet.add(arrowRight);
  magnet.add(arrowLeft);
}

function buildBindArrow() {
  bindArrow = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xcc22ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  
  const cylGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 16);
  cylGeo.translate(0, 0.5, 0); 
  const cyl = new THREE.Mesh(cylGeo, mat);
  
  const coneGeo = new THREE.ConeGeometry(0.25, 0.5, 16);
  coneGeo.translate(0, 0.25, 0); 
  const cone = new THREE.Mesh(coneGeo, mat);
  cone.position.y = 1;
  
  bindArrow.add(cyl);
  bindArrow.add(cone);
  bindArrow.visible = false;
  scene.add(bindArrow);

  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('B_ind', 64, 44);
  const tex = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true });
  bindLabel = new THREE.Sprite(spriteMat);
  bindLabel.scale.set(1.5, 0.75, 1);
  bindLabel.visible = false;
  scene.add(bindLabel);
}

function attachInteraction(container) {
  const onPointerDown = (e) => {
    const rect = container.getBoundingClientRect();
    const cx = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const cy = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    mouse.x = (cx / rect.width) * 2 - 1;
    mouse.y = -(cy / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(magnetGroup, true);
    const bodyHit = hits.find(h => h.object.name === 'magnet-body');
    if (bodyHit) {
      state.dragging = true;
      const intersect = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersect);
      dragOffset.copy(intersect).sub(magnet.position);
    } else {
      let yaw = 0;
      let startX = e.clientX || (e.touches && e.touches[0].clientX);
      const moveCam = (ev) => {
        const x = ev.clientX || (ev.touches && ev.touches[0].clientX);
        const dx = x - startX;
        yaw += dx * 0.005;
        startX = x;
        const r = Math.hypot(camera.position.x, camera.position.z);
        camera.position.x = Math.sin(yaw) * r;
        camera.position.z = Math.cos(yaw) * r;
        camera.lookAt(0, 0, 0);
      };
      const upCam = () => {
        window.removeEventListener('pointermove', moveCam);
        window.removeEventListener('touchmove', moveCam);
        window.removeEventListener('pointerup', upCam);
        window.removeEventListener('touchend', upCam);
      };
      window.addEventListener('pointermove', moveCam);
      window.addEventListener('touchmove', moveCam, { passive: true });
      window.addEventListener('pointerup', upCam);
      window.addEventListener('touchend', upCam);
    }
  };

  const onPointerMove = (e) => {
    if (!state.dragging) return;
    const rect = container.getBoundingClientRect();
    const cx = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const cy = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    mouse.x = (cx / rect.width) * 2 - 1;
    mouse.y = -(cy / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersect = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersect)) {
      const newX = Math.max(-10, Math.min(10, intersect.x - dragOffset.x));
      state.targetMagnetX = newX; 
      onDragCb();
    }
  };

  const onPointerUp = () => { state.dragging = false; };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('touchend', onPointerUp);

  container.addEventListener('wheel', (e) => {
    camera.position.multiplyScalar(1 + e.deltaY * 0.0008);
    const len = camera.position.length();
    if (len < 6) camera.position.setLength(6);
    if (len > 25) camera.position.setLength(25);
    e.preventDefault();
  }, { passive: false });
}

function onResize(container) {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  composer.setSize(container.clientWidth, container.clientHeight);
}

export function updateScene(dt, time) {
  if (lastPolarity !== state.polarity) {
    updateMagnetTexture(state.polarity);
    const meshRight = magnetGroup.getObjectByName('glowMeshRight');
    const meshLeft = magnetGroup.getObjectByName('glowMeshLeft');
    const lightRight = magnetGroup.getObjectByName('glowRight');
    const lightLeft = magnetGroup.getObjectByName('glowLeft');
    
    if (state.polarity === 1) {
      if (lightRight) lightRight.color.setHex(0xff3344);
      if (lightLeft) lightLeft.color.setHex(0x3366ff);
      if (meshRight) meshRight.material.color.setHex(0xff3344);
      if (meshLeft) meshLeft.material.color.setHex(0x3366ff);
    } else {
      if (lightRight) lightRight.color.setHex(0x3366ff);
      if (lightLeft) lightLeft.color.setHex(0xff3344);
      if (meshRight) meshRight.material.color.setHex(0x3366ff);
      if (meshLeft) meshLeft.material.color.setHex(0xff3344);
    }
    lastPolarity = state.polarity;
  }

  magnet.position.x = state.magnetX;

  if (composer.passes.length > 1 && composer.passes[1].strength !== undefined) {
    composer.passes[1].strength = 1.6 + Math.abs(state.current) * 1.5;
  }

  const intensity = Math.min(3, Math.abs(state.current) * 2);
  coilGlow.intensity = intensity * 1.5;
  if (state.current > 0.005) {
    coilGlow.color.setHex(0xf97316);
  } else if (state.current < -0.005) {
    coilGlow.color.setHex(0x06b6d4);
  }

  coilShaderMat.uniforms.uTime.value = time;
  coilFlow += state.current * dt * 200.0;
  coilShaderMat.uniforms.uFlow.value = coilFlow;
  coilShaderMat.uniforms.uCurrent.value = state.current;

  fieldLineMat.uniforms.uTime.value = time;
  fieldLineMat.uniforms.uSpeed.value = 1.5 + Math.abs(state.magnetVx) * 0.5;

  const force = -state.current * state.magnetVx * 0.3;
  const forceAbs = Math.max(0.01, Math.min(2, Math.abs(force) + Math.abs(state.current) * 0.5));

  if (Math.abs(state.magnetVx) > 0.1 && Math.abs(state.current) > 0.01) {
    const dx = state.magnetX - state.coilX;
    const approaching = (dx < 0 && state.magnetVx > 0) || (dx > 0 && state.magnetVx < 0);
    const activeArrow = dx < 0 ? arrowRight : arrowLeft;
    const inactiveArrow = dx < 0 ? arrowLeft : arrowRight;

    const forceDir = approaching ? (dx < 0 ? -1 : 1) : (dx < 0 ? 1 : -1);
    activeArrow.rotation.z = forceDir === 1 ? -Math.PI / 2 : Math.PI / 2;
    activeArrow.scale.set(1, forceAbs, 1);
    
    activeArrow.children[0].material.color.setHex(approaching ? 0xff3366 : 0x33ff66);
    activeArrow.children[1].material.color.setHex(approaching ? 0xff3366 : 0x33ff66);
    activeArrow.visible = true;
    inactiveArrow.visible = false;
  } else {
    arrowRight.visible = false;
    arrowLeft.visible = false;
  }

  if (Math.abs(state.current) > 0.005) {
    bindArrow.visible = true;
    bindLabel.visible = true;
    const bindDir = state.current > 0 ? 1 : -1;
    bindArrow.rotation.z = bindDir === 1 ? -Math.PI / 2 : Math.PI / 2;
    const len = Math.max(0.1, Math.min(3.0, Math.abs(state.current) * 1.5 + 1.0));
    bindArrow.scale.set(1, len, 1);
    
    const tipX = bindDir * (len * 1.5 + 0.5); 
    bindLabel.position.set(tipX, 0.5, 0);

    const cHex = state.current > 0 ? 0xf97316 : 0x06b6d4;
    bindArrow.children[0].material.color.setHex(cHex);
    bindLabel.material.color.setHex(cHex);
  } else {
    bindArrow.visible = false;
    bindLabel.visible = false;
  }

  composer.render();
}
