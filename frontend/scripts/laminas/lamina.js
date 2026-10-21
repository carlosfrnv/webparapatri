// Genera las láminas de anatomía (dibujo en color + punto de cada estructura) a partir de los modelos
// del atlas. Se ejecuta en un navegador (ver run.mjs) y no forma parte de la web: la web pone los
// nombres encima (en español o portugués) y los tapa para practicar.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (f) => new Promise((ok, ko) => loader.load(f, (g) => ok(g.scene), undefined, ko));
const FILES = { bones: "huesos", muscles: "musculos", organs: "organos", vessels: "vasos", nerves: "nervios" };

// Colores de libro: arterias rojas, venas azules, hueso marfil, músculo rojo oscuro…
function colorOf(layer, name) {
  if (layer === "bones") return /cartilage|disc|meniscus/i.test(name) ? 0xbfd8e6 : 0xeee3c8;
  if (layer === "muscles") return /tendon|aponeurosis/i.test(name) ? 0xe8dcc8 : 0xb8473f;
  if (layer === "nerves") return 0xf2c94c;
  if (layer === "vessels") {
    if (/atrium|ventricle|auricle/i.test(name)) return 0xc0645a;
    if (/pulmonary (trunk|artery)|bifurcation of pulmonary/i.test(name)) return 0x4a6fd1;
    if (/pulmonary vein/i.test(name)) return 0xc8463c;
    if (/vein|vena|sinus/i.test(name)) return 0x3b5bbf;
    return 0xc8463c;
  }
  if (/lung/i.test(name)) return 0xf0b6b0;
  if (/liver/i.test(name)) return 0x8e3b2f;
  if (/kidney/i.test(name)) return 0x9c4a3a;
  if (/stomach|duoden|jejun|ileum|colon|cecum|rectum|esophag/i.test(name)) return 0xe8a2a0;
  if (/brain|cerebr|cerebell/i.test(name)) return 0xe9c4b8;
  return 0xd98f80;
}

window.run = async (plates) => {
  const roots = {};
  const meshes = [];
  for (const layer of [...new Set(plates.flatMap((p) => p.layers))]) {
    roots[layer] = await load(`/public/atlas/${FILES[layer]}.glb`);
    roots[layer].updateMatrixWorld(true);
    roots[layer].traverse((o) => {
      if (!o.isMesh) return;
      let n = o;
      while (n && !n.userData.n) n = n.parent;
      o.geometry.computeVertexNormals();
      meshes.push({ mesh: o, layer, name: n?.userData.n ?? o.name });
    });
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  // Para saber qué pieza hay en cada punto: sin suavizado de bordes ni conversión de color (colores exactos).
  const idRenderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  idRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const out = {};
  for (const p of plates) {
    const inc = p.include ? new RegExp(p.include, "i") : null;
    const exc = p.exclude ? new RegExp(p.exclude, "i") : null;
    const lab = p.label ? new RegExp(p.label, "i") : null;
    const used = meshes.filter(
      (m) => p.layers.includes(m.layer) && (!inc || inc.test(m.name)) && (!exc || !exc.test(m.name)),
    );
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const clones = used.map((m) => {
      const c = new THREE.Mesh(m.mesh.geometry, null);
      c.matrixAutoUpdate = false;
      c.matrix.copy(m.mesh.matrixWorld);
      group.add(c);
      return { ...m, clone: c };
    });
    const box = new THREE.Box3();
    for (const c of clones) if (!p.frame || new RegExp(p.frame, "i").test(c.name)) box.expandByObject(c.mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Cámara ortográfica alrededor de la pieza (azimut y elevación en grados).
    const W = p.w ?? 900;
    const H = p.h ?? 900;
    const az = ((p.azimuth ?? 0) * Math.PI) / 180;
    const el = ((p.elevation ?? 0) * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const radius = size.length() / 2;
    const half = radius * (p.zoom ?? 1.02);
    const cam = new THREE.OrthographicCamera(-half * (W / H), half * (W / H), half, -half, 0.01, 50);
    cam.position.copy(center).addScaledVector(dir, 10);
    cam.up.set(...(p.up ?? [0, 1, 0]));
    cam.lookAt(center);
    cam.updateMatrixWorld();
    renderer.setSize(W, H);
    renderer.setPixelRatio(1);
    idRenderer.setSize(W, H);
    idRenderer.setPixelRatio(1);

    // 1) Dibujo en color.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.copy(dir).add(new THREE.Vector3(0.4, 0.8, 0.2)).multiplyScalar(10);
    scene.add(sun);
    const mats = new Map();
    for (const c of clones) {
      const col = colorOf(c.layer, c.name);
      if (!mats.has(col)) mats.set(col, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0 }));
      c.clone.material = mats.get(col);
    }
    renderer.setClearColor(0xffffff, 0);
    renderer.render(scene, cam);
    const image = renderer.domElement.toDataURL("image/png");

    // 2) Qué pieza se ve en cada punto (un color por estructura con nombre propio).
    const names = [...new Set(clones.filter((c) => !lab || lab.test(c.name)).map((c) => c.name))];
    const idx = new Map(names.map((n, i) => [n, i + 1]));
    for (const c of clones) {
      const i = idx.get(c.name) ?? 0;
      c.clone.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(((i >> 8) & 255) / 255, (i & 255) / 255, 0) });
    }
    idRenderer.setClearColor(0x000000, 1);
    idRenderer.render(scene, cam);
    const gl = idRenderer.getContext();
    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const id = new Uint16Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4; // readPixels va de abajo arriba
        id[y * W + x] = (px[s] << 8) | px[s + 1];
      }
    // Punto de cada estructura: el más "de dentro" (lejos de sus bordes) cerca de su centro.
    const stats = new Map();
    for (let i = 0; i < id.length; i++) {
      const k = id[i];
      if (!k) continue;
      const s = stats.get(k) ?? { n: 0, sx: 0, sy: 0 };
      s.n++;
      s.sx += i % W;
      s.sy += Math.floor(i / W);
      stats.set(k, s);
    }
    const parts = [];
    for (const [k, s] of stats) {
      if (s.n < (p.minArea ?? 250)) continue;
      const cx = s.sx / s.n;
      const cy = s.sy / s.n;
      let best = null;
      for (let y = 6; y < H - 6; y += 3)
        for (let x = 6; x < W - 6; x += 3) {
          if (id[y * W + x] !== k) continue;
          let inside = 0;
          for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) inside += id[(y + dy) * W + x + dx] === k ? 1 : 0;
          const score = inside * 40 - Math.hypot(x - cx, y - cy);
          if (!best || score > best.score) best = { x, y, score };
        }
      if (best) parts.push({ name: names[k - 1], x: best.x, y: best.y, area: s.n });
    }
    out[p.id] = { w: W, h: H, image, parts };
    scene.remove(group);
  }
  return out;
};
window.ready = true;
