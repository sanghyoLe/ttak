import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clamp, type SceneId } from './game';
import { advancePressure, approachFit, getTrap } from './traps';

export type StagePhase = 'ready' | 'dragging' | 'near' | 'dropping' | 'jammed' | 'pressing' | 'seated' | 'breaking' | 'failed';
export type StageTelemetry = { fit: number; pressure: number; dodges: number };
export type FeedbackCue = 'lift' | 'align' | 'seat' | 'slip';
export type StageMode = 'demo' | 'play' | 'result';
export type StageController = { dispose: () => void; rotate: () => void; reset: () => void; attempt: () => void; beginPress: () => void; endPress: () => void; setPaused: (paused: boolean) => void };
type Options = {
  host: HTMLDivElement;
  pieceButton: HTMLButtonElement;
  targetMarker: HTMLSpanElement;
  sceneId: SceneId;
  mode: StageMode;
  attemptNumber: number;
  onPhase: (phase: StagePhase) => void;
  onTelemetry: (telemetry: StageTelemetry) => void;
  onFeedback: (cue: FeedbackCue) => void;
  onImpact: () => void;
  onUnavailable: () => void;
};

const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const mix = THREE.MathUtils.lerp;

// Resolve the same named OKLCH tokens used by the interface to sRGB for WebGL.
function readPalette() {
  const style = getComputedStyle(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const color = (token: string) => {
    context.fillStyle = style.getPropertyValue(token).trim();
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  };
  return {
    floor: color('--surface-base'), shell: color('--object-porcelain'), recess: color('--object-recess'),
    yellow: color('--object-yellow'), coral: color('--object-coral'), blue: color('--object-blue'),
    mint: color('--object-mint'), ink: color('--text-primary'), light: color('--light-key'),
    shadow: color('--object-shadow'),
  };
}

export function createStage(options: Options): StageController {
  const { host, pieceButton, targetMarker, sceneId, mode, onPhase, onImpact, onUnavailable } = options;
  const trap = getTrap(sceneId, options.attemptNumber);
  const palette = readPalette();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = palette.floor;
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  const lookAt = new THREE.Vector3(0, 0.4, 0.6);
  const assembly = new THREE.Group();
  scene.add(assembly);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(palette.light, palette.floor, 1.6));
  const keyLight = new THREE.DirectionalLight(palette.light, 2.8);
  keyLight.position.set(-3.5, 9, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  Object.assign(keyLight.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 25 });
  keyLight.shadow.normalBias = 0.035;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: palette.shadow, opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  scene.add(ground);

  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: palette.shell, roughness: 0.3, metalness: 0.04 }),
    recess: new THREE.MeshStandardMaterial({ color: palette.recess, roughness: 0.75 }),
    yellow: new THREE.MeshStandardMaterial({ color: palette.yellow, roughness: 0.27, metalness: 0.04 }),
    coral: new THREE.MeshStandardMaterial({ color: palette.coral, roughness: 0.3 }),
    blue: new THREE.MeshStandardMaterial({ color: palette.blue, roughness: 0.28 }),
    mint: new THREE.MeshStandardMaterial({ color: palette.mint, roughness: 0.28 }),
    detail: new THREE.MeshStandardMaterial({ color: palette.shell, roughness: 0.42 }),
  };
  type MaterialName = keyof typeof materials;
  function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, material: MaterialName, radius = 0.1) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 3, h / 3, d / 3)), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent: THREE.Object3D, radius: number, height: number, x: number, y: number, z: number, material: MaterialName) {
    const points = [new THREE.Vector2(0, -height / 2), new THREE.Vector2(radius - 0.06, -height / 2), new THREE.Vector2(radius, -height / 2 + 0.06), new THREE.Vector2(radius, height / 2 - 0.06), new THREE.Vector2(radius - 0.06, height / 2), new THREE.Vector2(0, height / 2)];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 64), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function marks(parent: THREE.Object3D, y: number, z = 0) {
    for (const x of [-0.14, 0.14]) box(parent, 0.055, 0.018, 0.36, x, y, z, 'detail', 0.015);
  }
  function tray(w: number, d: number, z: number) {
    const group = new THREE.Group();
    group.position.z = z;
    assembly.add(group);
    box(group, w, 0.28, d, 0, 0.08, 0, 'shell', 0.14);
    box(group, w - 0.32, 0.08, d - 0.32, 0, 0.24, 0, 'recess', 0.08);
    for (const x of [-1, 1]) box(group, 0.2, 0.4, d, x * (w / 2 - 0.1), 0.34, 0, 'shell');
    for (const side of [-1, 1]) box(group, w - 0.32, 0.4, 0.2, 0, 0.34, side * (d / 2 - 0.1), 'shell');
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      cylinder(group, 0.045, 0.012, x * (w / 2 - 0.11), 0.546, z * (d / 2 - 0.11), 'recess');
    }
    return group;
  }

  const active = new THREE.Group();
  assembly.add(active);
  const start = new THREE.Vector3();
  const target = new THREE.Vector3();
  let restingY = 0.59;
  let heldY = 1.75;
  let movingSocket: THREE.Group | null = null;
  let shutter: THREE.Mesh | null = null;
  let cabinetLid: THREE.Mesh | null = null;
  let cabinetBack: THREE.Mesh | null = null;
  const dominoes: THREE.Group[] = [];
  const looseObjects: THREE.Mesh[] = [];

  if (sceneId === 'slot') {
    tray(4.35, 4.35, -0.45);
    const blocks: [number, number, MaterialName][] = [[-0.98, -1.43, 'coral'], [0.98, -1.43, 'blue'], [-0.98, 0.53, 'mint']];
    for (const [x, z, material] of blocks) {
      const block = box(assembly, 1.87, 0.64, 1.87, x, 0.6, z, material, 0.12);
      looseObjects.push(block);
    }
    box(active, 1.87, 0.64, 1.87, 0, 0, 0, 'yellow', 0.12);
    marks(active, 0.329);
    target.set(0.98, restingY, 0.53);
    start.set(1.25, 0.24, 3.18);
  } else if (sceneId === 'circle') {
    movingSocket = new THREE.Group();
    movingSocket.position.z = -0.5;
    assembly.add(movingSocket);
    box(movingSocket, 3.6, 0.24, 3.6, 0, 0.02, 0, 'shell', 0.15);
    cylinder(movingSocket, 1.07, 0.06, 0, 0.17, 0, 'recess');
    const shape = new THREE.Shape();
    const half = 1.8, r = 0.22;
    shape.moveTo(-half + r, -half);
    shape.lineTo(half - r, -half); shape.quadraticCurveTo(half, -half, half, -half + r);
    shape.lineTo(half, half - r); shape.quadraticCurveTo(half, half, half - r, half);
    shape.lineTo(-half + r, half); shape.quadraticCurveTo(-half, half, -half, half - r);
    shape.lineTo(-half, -half + r); shape.quadraticCurveTo(-half, -half, -half + r, -half);
    const hole = new THREE.Path();
    hole.absarc(0, 0, 1.055, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.045, bevelThickness: 0.045, curveSegments: 48 });
    geometry.rotateX(-Math.PI / 2);
    const socket = new THREE.Mesh(geometry, materials.shell);
    socket.position.y = 0.2;
    socket.castShadow = socket.receiveShadow = true;
    movingSocket.add(socket);
    shutter = cylinder(movingSocket, 1.025, 0.09, 0, 0.76, 0, 'shell');
    shutter.visible = false;
    cylinder(active, 0.97, 0.63, 0, 0, 0, 'blue');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.018, 8, 64), materials.detail);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.32; active.add(ring);
    restingY = 0.49; target.set(0, restingY, -0.5); start.set(0.9, 0.23, 2.9);
  } else if (sceneId === 'stack') {
    tray(4.95, 2.25, -0.65);
    for (let i = 0; i < 3; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(-1.68 + i * 1.12, 0.29, -0.65);
      assembly.add(pivot);
      box(pivot, 1.01, 1.85, 1.65, 0, 0.925, 0, (['mint', 'blue', 'coral'] as const)[i], 0.12);
      marks(pivot, 1.86);
      dominoes.push(pivot);
    }
    box(active, 1.01, 1.85, 1.65, 0, 0, 0, 'yellow', 0.12);
    marks(active, 0.934);
    restingY = 1.215; heldY = 2.4;
    target.set(1.68, restingY, -0.65); start.set(1.5, 0.81, 2.65);
  } else {
    const cabinet = new THREE.Group();
    cabinet.position.z = -0.7;
    assembly.add(cabinet);
    box(cabinet, 4, 0.2, 3.3, 0, 0.04, 0, 'shell');
    for (const side of [-1, 1]) box(cabinet, 0.23, 1.4, 3.3, side * 1.89, 0.7, 0, 'shell');
    cabinetBack = box(cabinet, 3.7, 1.4, 0.2, 0, 0.7, -1.55, 'shell');
    cabinetLid = box(cabinet, 4, 0.23, 3.3, 0, 1.4, 0, 'shell', 0.1);
    box(cabinetLid, 0.65, 0.015, 0.07, 0, 0.123, 0, 'recess', 0.015);
    box(active, 3.45, 0.15, 2.92, 0, -0.38, 0, 'coral');
    box(active, 3.52, 1.12, 0.22, 0, 0.03, 1.44, 'coral');
    for (const side of [-1, 1]) box(active, 0.16, 0.76, 2.75, side * 1.66, -0.04, -0.1, 'coral');
    box(active, 3.4, 0.76, 0.16, 0, -0.04, -1.4, 'coral');
    box(active, 0.9, 0.15, 0.2, 0, 0.05, 1.62, 'shell', 0.065);
    for (let i = 0; i < 3; i++) {
      looseObjects.push(box(active, 0.7, 0.46, 0.7, (i - 1) * 0.92, -0.07, -0.1, (['yellow', 'mint', 'blue'] as const)[i]));
    }
    restingY = heldY = 0.59;
    target.set(0, restingY, -0.68); start.set(0, restingY, 1.8);
  }
  active.position.copy(start);

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  let phase: StagePhase = 'ready';
  let pointerId: number | null = null;
  let disposed = false;
  let failureAt: number | null = null;
  let seatedAt: number | null = null;
  let impactPlayed = false;
  let failedReported = false;
  let elapsed = 0;
  let lastTime = 0;
  let angle = 0.62;
  let desiredAngle = angle;
  let width = 1, height = 1;
  let frameId = 0;
  let returning = false;
  let paused = false;
  let pressing = false;
  let pressure = 0;
  let dodges = 0;
  let lastDodge = -10;
  let lastTelemetry = -10;
  let previousTelemetry = '';
  let lastNear = false;
  const originalTarget = target.clone();
  const desiredPosition = start.clone();
  const fromPosition = start.clone();
  const raycaster = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -heldY);
  const intersection = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const handlePosition = new THREE.Vector3();
  const markerPosition = new THREE.Vector3();

  const springCurve = new THREE.CatmullRomCurve3(Array.from({ length: 81 }, (_, i) => {
    const a = i / 80 * Math.PI * 10;
    return new THREE.Vector3(Math.cos(a) * 0.24, i / 80, Math.sin(a) * 0.24);
  }));
  const spring = new THREE.Mesh(new THREE.TubeGeometry(springCurve, 80, 0.027, 6, false), materials.recess);
  spring.visible = false;
  spring.castShadow = true;
  assembly.add(spring);

  function setPhase(next: StagePhase) {
    if (phase === next) return;
    phase = next;
    host.dataset.phase = next;
    onPhase(next);
    report(true);
  }
  function report(force = false) {
    if (mode !== 'play' || !force && elapsed - lastTelemetry < 0.08) return;
    lastTelemetry = elapsed;
    const fit = phase === 'seated' ? 100 : phase === 'failed' || phase === 'breaking' ? 0
      : phase === 'jammed' || phase === 'pressing' ? Math.min(99.9, 98.5 + pressure * 1.4)
      : approachFit(Math.hypot(desiredPosition.x - target.x, desiredPosition.z - target.z));
    const values = { fit: Math.round(fit * 10) / 10, pressure: Math.round(pressure * 100), dodges };
    const key = JSON.stringify(values);
    if (key !== previousTelemetry) { previousTelemetry = key; options.onTelemetry(values); }
  }
  function setCamera() {
    camera.position.set(Math.sin(angle) * 12, 12.8, Math.cos(angle) * 12);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
  }
  function resize() {
    width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    const viewWidth = Math.max(7.8, 6.5 * aspect);
    camera.left = -viewWidth / 2; camera.right = viewWidth / 2;
    camera.top = viewWidth / aspect / 2; camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    setCamera();
  }
  resize();

  function updateRay(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    cursor.set((event.clientX - rect.left) / width * 2 - 1, -(event.clientY - rect.top) / height * 2 + 1);
    raycaster.setFromCamera(cursor, camera);
    return raycaster.ray.intersectPlane(plane, intersection);
  }
  function nearTarget() {
    return Math.hypot(desiredPosition.x - target.x, desiredPosition.z - target.z) < (sceneId === 'seal' ? 0.48 : 0.6);
  }
  function commit() {
    if (seatedAt !== null) return;
    pressing = false;
    pressure = 1;
    seatedAt = elapsed;
    active.position.copy(target);
    active.rotation.set(0, 0, 0);
    active.scale.setScalar(1);
    pieceButton.disabled = true;
    setPhase('seated');
    options.onFeedback('seat');
  }
  function beginPress() {
    if (mode !== 'play' || phase !== 'jammed' && phase !== 'pressing') return;
    pressing = true;
    setPhase('pressing');
    wake();
  }
  function endPress() {
    pressing = false;
    if (phase === 'pressing') setPhase('jammed');
    wake();
  }
  function attempt() {
    if (mode !== 'play' || failureAt !== null) return;
    pointerId = null;
    returning = false;
    fromPosition.copy(active.position);
    desiredPosition.copy(target);
    failureAt = elapsed;
    pieceButton.disabled = true;
    setPhase('dropping');
  }
  function pointerDown(event: PointerEvent) {
    if (mode !== 'play' || pointerId !== null || event.button !== 0) return;
    if (!updateRay(event)) return;
    const isHandle = event.target === pieceButton;
    if (!isHandle && raycaster.intersectObject(active, true).length === 0) return;
    if (phase === 'jammed' || phase === 'pressing') {
      event.preventDefault();
      pointerId = event.pointerId;
      host.setPointerCapture(event.pointerId);
      beginPress();
      return;
    }
    if (failureAt !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    host.setPointerCapture(event.pointerId);
    pieceButton.focus({ preventScroll: true });
    returning = false;
    dragOffset.copy(active.position).sub(intersection);
    dragOffset.y = 0;
    desiredPosition.copy(active.position); desiredPosition.y = heldY;
    options.onFeedback('lift');
    setPhase('dragging');
  }
  function pointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId || failureAt !== null || !updateRay(event)) return;
    desiredPosition.copy(intersection).add(dragOffset);
    desiredPosition.x = sceneId === 'seal' ? 0 : clamp(desiredPosition.x, -3.3, 3.3);
    desiredPosition.z = clamp(desiredPosition.z, -2.5, 3.5);
    desiredPosition.y = heldY;
    const near = nearTarget();
    if (near && !lastNear) options.onFeedback('align');
    lastNear = near;
    setPhase(near ? 'near' : 'dragging');
  }
  function release(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    if (phase === 'pressing' || phase === 'jammed' || seatedAt !== null) { endPress(); return; }
    if (event.type !== 'pointercancel' && event.type !== 'lostpointercapture' && nearTarget()) attempt();
    else {
      desiredPosition.copy(start); returning = true;
      setPhase('ready');
    }
  }
  function keyDown(event: KeyboardEvent) {
    if (event.target !== pieceButton || mode !== 'play') return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (phase === 'jammed' || phase === 'pressing') beginPress();
      else if (!event.repeat) attempt();
      return;
    }
    if (failureAt !== null) return;
    const delta = 0.22;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { desiredPosition.copy(start); returning = true; setPhase('ready'); return; }
    if (event.key === 'ArrowUp') desiredPosition.z -= delta;
    if (event.key === 'ArrowDown') desiredPosition.z += delta;
    if (sceneId !== 'seal') {
      if (event.key === 'ArrowLeft') desiredPosition.x -= delta;
      if (event.key === 'ArrowRight') desiredPosition.x += delta;
    }
    desiredPosition.x = clamp(desiredPosition.x, -3.3, 3.3);
    desiredPosition.z = clamp(desiredPosition.z, -2.5, 3.5);
    desiredPosition.y = heldY;
    returning = false;
    setPhase(nearTarget() ? 'near' : 'dragging');
  }

  function animateFailure(time: number) {
    const t = reducedMotion ? 2 : time;
    const p = smooth(t / 0.85);
    active.position.copy(target);
    active.rotation.set(0, 0, 0);
    active.scale.setScalar(1);
    if (sceneId === 'slot') {
      if (trap.id === 'grow') {
        const grow = smooth(t / 0.22);
        active.scale.set(1 + grow * 0.03, 1 - grow * 0.02, 1 + grow * 0.03);
        active.position.set(target.x + p * 1.2, restingY + Math.sin(p * Math.PI) * 1.8, target.z + p * 1.45);
        active.rotation.set(p * 0.85, p * 0.4, -p * 0.8);
        spring.visible = t < 0.7;
        spring.position.set(target.x, 0.27, target.z);
        spring.scale.y = Math.max(0.08, active.position.y - 0.58);
      } else if (trap.id === 'turn') {
        active.rotation.y = p * Math.PI / 4;
        active.position.y += Math.sin(p * Math.PI) * 0.24 + p * 0.2;
        active.rotation.z = p * 0.09;
      } else {
        const block = looseObjects[1];
        block.position.y = 0.6 + Math.sin(p * Math.PI) * 1.8 + p * 0.65;
        block.position.x = 0.98 + p * 1.15;
        block.rotation.set(p * 0.9, 0, p * 0.7);
      }
    } else if (sceneId === 'circle' && movingSocket) {
      if (trap.id === 'escape') {
        movingSocket.position.x = target.x - p * 1.2;
        movingSocket.rotation.y = -p * 0.12;
        active.position.set(target.x + p * 0.9, mix(restingY, 0.88, p) + Math.sin(p * Math.PI) * 0.65, target.z + p * 2);
        active.rotation.z = -p * Math.PI / 2;
      } else if (trap.id === 'lid' && shutter) {
        shutter.visible = true;
        shutter.scale.set(p, 1, p);
        active.position.y = restingY + p * 0.85;
        active.rotation.z = p * 0.3;
      } else {
        const dip = smooth(t / 0.4);
        active.position.y = mix(restingY, -1.2, dip);
        if (t > 0.42) {
          const emerge = smooth((t - 0.42) / 0.55);
          active.position.set(target.x + emerge * 1.15, mix(-1.2, 0.2, emerge), target.z + emerge * 3);
          active.rotation.y = emerge * 2;
        }
      }
    } else if (sceneId === 'stack') {
      if (trap.id === 'domino') {
        active.rotation.z = smooth(t / 0.4) * 0.33;
        active.position.x -= p * 0.15;
        dominoes.forEach((domino, i) => { domino.rotation.z = smooth((t - (2 - i) * 0.19) / 0.48) * 1.38; });
      } else if (trap.id === 'elevator') {
        dominoes[1].position.y = 0.29 + p * 1.4;
        spring.visible = true;
        spring.position.set(dominoes[1].position.x, 0.29, target.z);
        spring.scale.y = Math.max(0.01, p * 1.4);
      } else {
        dominoes.forEach((domino, i) => { domino.rotation.x = smooth((t - i * 0.1) / 0.7) * 1.3; });
        active.rotation.x = smooth((t - 0.3) / 0.7) * 1.3;
        active.position.z += p * 0.5;
        active.position.y -= p * 0.15;
      }
    } else if (sceneId === 'seal') {
      if (trap.id === 'rebound') {
        active.position.z = mix(target.z, start.z + 0.32, 1 - (1 - clamp(t / 0.65, 0, 1)) ** 3);
        active.rotation.x = Math.sin(p * Math.PI) * 0.1;
        looseObjects.forEach((object, i) => {
          object.position.y = -0.07 + Math.sin(p * Math.PI) * (1.3 + i * 0.2);
          object.rotation.set(p * (i + 1) * 0.45, p * 0.4, p * 0.2);
        });
      } else if (trap.id === 'roof' && cabinetLid) {
        cabinetLid.position.y = 1.4 + p * 1.55;
        cabinetLid.rotation.z = p * 0.24;
        looseObjects.forEach((object, i) => {
          object.position.y = -0.07 + smooth((t - i * 0.1) / 0.65) * (1.6 + i * 0.35);
          object.rotation.z = p * (i - 1) * 0.4;
        });
      } else if (cabinetBack) {
        cabinetBack.position.z = -1.55 - p * 1.4;
        cabinetBack.rotation.x = -p * 1.4;
        active.position.z = target.z - p * 2.5;
      }
    }
    if (t >= 1.55 && !failedReported && mode === 'play') {
      failedReported = true;
      setPhase('failed');
    }
  }
  function animatePlay(delta: number) {
    if (seatedAt !== null) {
      const waiting = elapsed - seatedAt;
      if (waiting < trap.suspense) {
        active.position.copy(target);
        active.rotation.set(0, 0, 0);
      } else {
        if (!impactPlayed) { impactPlayed = true; setPhase('breaking'); onImpact(); }
        animateFailure(waiting - trap.suspense);
      }
      return;
    }
    if (phase === 'dropping' && failureAt !== null) {
      const t = reducedMotion ? 1 : elapsed - failureAt;
      const align = smooth(t / 0.35);
      active.position.set(mix(fromPosition.x, target.x, align), mix(fromPosition.y, heldY, align), mix(fromPosition.z, target.z, align));
      active.position.y = mix(heldY, restingY + (sceneId === 'seal' ? 0 : 0.12), smooth((t - 0.35) / 0.35));
      if (sceneId === 'seal') active.position.z = target.z + 0.09;
      if (t >= 0.72) {
        if (sceneId === 'circle') commit();
        else { pieceButton.disabled = false; setPhase('jammed'); options.onFeedback('align'); }
      }
      return;
    }
    if (phase === 'jammed' || phase === 'pressing') {
      pressure = advancePressure(pressure, pressing, delta, trap.holdSeconds);
      const strain = pressure > 0.55 && !reducedMotion ? Math.sin(elapsed * 19) * 0.015 * pressure : 0;
      active.position.set(target.x + strain, restingY + (sceneId === 'seal' ? 0 : 0.12 * (1 - pressure)), target.z + (sceneId === 'seal' ? 0.09 * (1 - pressure) : 0));
      if (sceneId === 'stack') active.rotation.z = !reducedMotion ? Math.sin(elapsed * 3) * 0.06 * (1 - pressure) : 0;
      else if (sceneId === 'slot') active.scale.y = 1 - pressure * 0.07;
      if (pressure >= 1) commit();
      return;
    }
    if (phase === 'dragging' || phase === 'near' || returning) {
      active.position.lerp(desiredPosition, reducedMotion ? 1 : 1 - Math.exp(-24 * delta));
      if (returning && active.position.distanceTo(desiredPosition) < 0.01) returning = false;
      if (sceneId === 'circle' && pointerId !== null && dodges < 2 && elapsed - lastDodge > 0.65 &&
          Math.hypot(desiredPosition.x - target.x, desiredPosition.z - target.z) < 0.85) {
        dodges += 1; lastDodge = elapsed;
        target.x = originalTarget.x + (dodges === 1 ? -0.72 : 0.6);
        target.z = originalTarget.z - (dodges === 1 ? 0.3 : 0.55);
        options.onFeedback('slip');
        setPhase('dragging');
      }
    }
    if (movingSocket) {
      movingSocket.position.x = mix(movingSocket.position.x, target.x, reducedMotion ? 1 : 1 - Math.exp(-18 * delta));
      movingSocket.position.z = mix(movingSocket.position.z, target.z, reducedMotion ? 1 : 1 - Math.exp(-18 * delta));
    }
  }
  function animateDemo() {
    const t = reducedMotion ? 3 : elapsed % 5.8;
    active.rotation.set(0, 0, 0);
    active.scale.setScalar(1);
    const approach = smooth((t - 0.7) / 1.2);
    active.position.set(mix(start.x, target.x, approach), mix(start.y, 2.25, smooth(t / 0.7)), mix(start.z, target.z, approach));
    if (t > 1.9) active.position.y = mix(2.25, restingY, smooth((t - 1.9) / 0.7));
    if (t > 4.4) {
      active.position.y = mix(restingY, 2.25, smooth((t - 4.4) / 0.6));
      active.position.x = mix(target.x, start.x, smooth((t - 5) / 0.8));
      active.position.z = mix(target.z, start.z, smooth((t - 5) / 0.8));
    }
  }
  function positionOverlay(element: HTMLElement, position: THREE.Vector3) {
    projected.copy(position).project(camera);
    element.style.transform = `translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px) translate(-50%, -50%)`;
  }
  function render(now: number) {
    if (disposed) return;
    const delta = lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!paused) elapsed += delta;
    angle = reducedMotion ? desiredAngle : mix(angle, desiredAngle, 1 - Math.exp(-7 * delta));
    setCamera();
    if (mode === 'demo') animateDemo();
    else if (mode === 'result') {
      fromPosition.copy(start);
      animateFailure(2.6);
    } else animatePlay(delta);
    report();
    scene.updateMatrixWorld();
    handlePosition.copy(active.position);
    if (sceneId === 'seal') handlePosition.z += 1.62;
    positionOverlay(pieceButton, handlePosition);
    // This marker is also the accessible drop location for input regression tests.
    markerPosition.set(target.x, start.y, target.z + (sceneId === 'seal' ? 1.62 : 0));
    positionOverlay(targetMarker, markerPosition);
    renderer.render(scene, camera);
    if (mode === 'play' && phase === 'ready' && !returning && Math.abs(angle - desiredAngle) < 0.001) {
      frameId = 0;
    } else if ((mode === 'result' || (reducedMotion || paused) && mode === 'demo' || phase === 'failed') && Math.abs(angle - desiredAngle) < 0.001) {
      frameId = 0;
    } else frameId = requestAnimationFrame(render);
  }
  function wake() { if (!disposed && frameId === 0 && !document.hidden) { lastTime = 0; frameId = requestAnimationFrame(render); } }
  function reset() {
    if (pointerId !== null && host.hasPointerCapture(pointerId)) host.releasePointerCapture(pointerId);
    pointerId = null; failureAt = null; seatedAt = null; impactPlayed = false; failedReported = false; returning = false;
    pressing = false; pressure = 0; dodges = 0; lastDodge = -10; lastNear = false;
    target.copy(originalTarget); spring.visible = false;
    active.position.copy(start); active.rotation.set(0, 0, 0); active.scale.setScalar(1);
    desiredPosition.copy(start); dominoes.forEach((domino) => { domino.rotation.set(0, 0, 0); domino.position.y = 0.29; });
    if (movingSocket) { movingSocket.position.x = originalTarget.x; movingSocket.position.z = originalTarget.z; movingSocket.rotation.y = 0; }
    if (shutter) shutter.visible = false;
    if (cabinetLid) { cabinetLid.position.y = 1.4; cabinetLid.rotation.z = 0; }
    if (cabinetBack) { cabinetBack.position.z = -1.55; cabinetBack.rotation.x = 0; }
    if (sceneId === 'slot') looseObjects[1].position.set(0.98, 0.6, -1.43);
    looseObjects.forEach((object) => { object.rotation.set(0, 0, 0); if (sceneId === 'seal') object.position.y = -0.07; });
    pieceButton.disabled = false;
    setPhase('ready'); wake();
  }
  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId); frameId = 0; lastTime = 0;
      endPress();
      if (pointerId !== null) {
        const captured = pointerId; pointerId = null;
        if (host.hasPointerCapture(captured)) host.releasePointerCapture(captured);
        if (failureAt === null) { desiredPosition.copy(start); returning = true; setPhase('ready'); }
      }
    } else wake();
  };
  const onMotion = () => { reducedMotion = media.matches; wake(); };
  const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frameId); frameId = 0; onUnavailable(); };
  const down = (event: PointerEvent) => { pointerDown(event); wake(); };
  const move = (event: PointerEvent) => { pointerMove(event); wake(); };
  const up = (event: PointerEvent) => { release(event); wake(); };
  const key = (event: KeyboardEvent) => { keyDown(event); wake(); };
  const keyUp = (event: KeyboardEvent) => { if (event.target === pieceButton && (event.key === 'Enter' || event.key === ' ')) endPress(); };
  const onBlur = () => endPress();
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  host.addEventListener('lostpointercapture', up);
  host.addEventListener('keydown', key);
  host.addEventListener('keyup', keyUp);
  window.addEventListener('blur', onBlur);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', onVisibility);
  media.addEventListener('change', onMotion);
  const onResize = () => { resize(); wake(); };
  window.addEventListener('resize', onResize);
  // ResizeObserver also fires when a stage changes size without a window resize.
  const renderObserver = new ResizeObserver(onResize); renderObserver.observe(host);
  if (mode === 'result') { impactPlayed = true; failedReported = true; }
  host.dataset.renderer = 'webgl';
  host.dataset.phase = 'ready';
  host.dataset.trap = trap.id;
  host.dataset.scene = sceneId;
  wake();

  return {
    setPaused(next: boolean) { paused = next; wake(); },
    rotate() { desiredAngle = desiredAngle > 0.3 ? -0.55 : 0.62; wake(); },
    reset,
    beginPress,
    endPress,
    attempt() { attempt(); wake(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId); renderObserver.disconnect();
      host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up);
      host.removeEventListener('lostpointercapture', up); host.removeEventListener('keydown', key);
      host.removeEventListener('keyup', keyUp); window.removeEventListener('blur', onBlur);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize); media.removeEventListener('change', onMotion);
      const geometries = new Set<THREE.BufferGeometry>();
      const usedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material);
        }
      });
      geometries.forEach((geometry) => geometry.dispose()); usedMaterials.forEach((material) => material.dispose());
      Object.values(materials).forEach((material) => material.dispose());
      keyLight.shadow.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
      renderer.domElement.remove(); delete host.dataset.renderer;
    },
  };
}
