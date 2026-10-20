import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * Visor 3D común de las herramientas (moléculas, célula, cortes): escena, cámara, luces y control con el dedo.
 * Solo dibuja cuando algo cambia (o mientras gira solo), para no gastar batería en el iPad.
 */
export interface Viewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  render: () => void;
  /** Gira solo hasta que se toca la pantalla. */
  setAutoRotate: (on: boolean) => void;
  /** Objeto tocado (sin arrastrar) entre los candidatos. */
  onTap: (candidates: () => THREE.Object3D[], cb: (hit: THREE.Intersection | null) => void) => void;
  dispose: () => void;
}

export function createViewer(
  mount: HTMLElement,
  opts: { distance: number; target?: THREE.Vector3; fov?: number; minDistance?: number; maxDistance?: number },
): Viewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.localClippingEnabled = true;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, mount.clientWidth / mount.clientHeight, 0.01, 500);
  const target = opts.target ?? new THREE.Vector3();
  camera.position.set(target.x, target.y, target.z + opts.distance);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x886677, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(1, 2, 3);
  camera.add(sun);
  scene.add(camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.2;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.panSpeed = 0.5;
  controls.minDistance = opts.minDistance ?? opts.distance * 0.25;
  controls.maxDistance = opts.maxDistance ?? opts.distance * 3;
  controls.autoRotateSpeed = 1.2;

  let frame = 0;
  const render = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (controls.update() || controls.autoRotate) render();
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener("change", render);
  // Al tocar, deja de girar solo.
  const stopAuto = () => {
    controls.autoRotate = false;
  };
  renderer.domElement.addEventListener("pointerdown", stopAuto);

  const resize = () => {
    if (!mount.clientWidth || !mount.clientHeight) return;
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(mount);

  // Toque corto (sin arrastrar) → qué objeto hay debajo del dedo.
  const raycaster = new THREE.Raycaster();
  const taps: (() => void)[] = [];
  const onTap: Viewer["onTap"] = (candidates, cb) => {
    let down: { x: number; y: number } | null = null;
    const pd = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pu = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      const r = renderer.domElement.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(p, camera);
      const hits = raycaster.intersectObjects(candidates(), true);
      cb(hits[0] ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", pd);
    renderer.domElement.addEventListener("pointerup", pu);
    taps.push(() => {
      renderer.domElement.removeEventListener("pointerdown", pd);
      renderer.domElement.removeEventListener("pointerup", pu);
    });
  };

  render();
  return {
    scene,
    camera,
    renderer,
    controls,
    render,
    setAutoRotate: (on) => {
      controls.autoRotate = on;
      render();
    },
    onTap,
    dispose: () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      taps.forEach((off) => off());
      renderer.domElement.removeEventListener("pointerdown", stopAuto);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    },
  };
}

/** Vacía un grupo liberando la memoria de la GPU. */
export function clearGroup(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  });
  group.clear();
}
