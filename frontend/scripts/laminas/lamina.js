// Genera las láminas de anatomía (dibujo en color + punto de cada estructura) a partir de los modelos
// del atlas. Se ejecuta en un navegador (ver run.mjs) y no forma parte de la web: la web pone los
// nombres encima (en español o portugués) y los tapa para practicar.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (f) => new Promise((ok, ko) => loader.load(f, (g) => ok(g.scene), undefined, ko));
const FILES = { bones: "huesos", muscles: "musculos", organs: "organos", vessels: "vasos", nerves: "nervios" };

// Colores de libro: arterias rojas, venas azules, hueso marfil, músculo rojo oscuro…
function colorOf(layer, name) {
  if (layer === "bones") return /cartilage|disc|meniscus/i.test(name) ? 0xb9cfd9 : 0xd2bf98;
  if (layer === "muscles") return /tendon|aponeurosis|retinaculum/i.test(name) ? 0xe9e0cf : 0xa63c33;
  if (layer === "nerves") return 0xf0cf5a;
  if (layer === "vessels") {
    if (/atrium|ventricle|auricle/i.test(name)) return 0xb4584b;
    if (/pulmonary (trunk|artery)|bifurcation of pulmonary/i.test(name)) return 0x3f64c4;
    if (/pulmonary vein/i.test(name)) return 0xbf3b32;
    if (/vein|vena|sinus/i.test(name)) return 0x3553b3;
    return 0xbf3b32;
  }
  if (/lung/i.test(name)) return 0xe8a8a2;
  if (/liver/i.test(name)) return 0x7d3328;
  if (/gallbladder/i.test(name)) return 0x5f8f4a;
  if (/kidney/i.test(name)) return 0x8e4434;
  if (/suprarenal/i.test(name)) return 0xd9a441;
  if (/pancreas/i.test(name)) return 0xe3b48d;
  if (/stomach|duoden|jejun|ileum|colon|cecum|appendix|rectum|oesophag|esophag/i.test(name)) return 0xe39a95;
  if (/trachea|bronch|larynx/i.test(name)) return 0xd9a79a;
  if (/thyroid/i.test(name)) return 0xb5544a;
  if (/bladder/i.test(name)) return 0xe5b3a5;
  return 0xd98f80;
}

// Acabado de cada tejido: el hueso mate y poroso, el músculo con fibras y algo húmedo, los órganos brillantes.
function finishOf(layer, name) {
  if (layer === "bones") return { roughness: 0.62, clearcoat: 0.05, scale: 320, strength: 0.18, fibers: 0, tint: 0.1 };
  if (layer === "muscles" && !/tendon|aponeurosis|retinaculum/i.test(name))
    return { roughness: 0.48, clearcoat: 0.35, scale: 260, strength: 0.35, fibers: 1, tint: 0.14 };
  if (layer === "muscles") return { roughness: 0.4, clearcoat: 0.4, scale: 300, strength: 0.12, fibers: 1, tint: 0.06 };
  if (layer === "vessels") return { roughness: 0.38, clearcoat: 0.55, scale: 140, strength: 0.08, fibers: 0, tint: 0.1 };
  return { roughness: 0.42, clearcoat: 0.5, scale: 120, strength: 0.07, fibers: 0, tint: 0.12 };
}

// Relieve y manchas de la superficie con ruido en el espacio (los modelos no tienen coordenadas de textura).
const NOISE = `
  varying vec3 vWPos;
  uniform float uScale; uniform float uStrength; uniform float uFibers; uniform float uTint; uniform vec3 uAxis;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03) + 0.15 * vnoise(p * 4.11); }
  vec3 detailP(vec3 w) {
    // Fibras: el ruido se estira a lo largo del eje del músculo.
    vec3 q = w * uScale;
    float along = dot(q, uAxis);
    return mix(q, q - uAxis * along * 0.88, uFibers);
  }
`;
function withDetail(material, f, axis) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uScale: { value: f.scale },
      uStrength: { value: f.strength },
      uFibers: { value: f.fibers },
      uTint: { value: f.tint },
      uAxis: { value: new THREE.Vector3(...axis).normalize() },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <fog_vertex>", "#include <fog_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + NOISE)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - uTint + 2.0 * uTint * fbm(detailP(vWPos) * 0.35);",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 p = detailP(vWPos); float e = 0.15;
          vec3 g = vec3(fbm(p + vec3(e,0,0)) - fbm(p - vec3(e,0,0)), fbm(p + vec3(0,e,0)) - fbm(p - vec3(0,e,0)),
                        fbm(p + vec3(0,0,e)) - fbm(p - vec3(0,0,e))) / (2.0 * e);
          vec3 gv = (viewMatrix * vec4(g, 0.0)).xyz;
          normal = normalize(normal - uStrength * (gv - dot(gv, normal) * normal));
        }`,
      );
  };
  return material;
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
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
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
    renderer.setPixelRatio(1);
    idRenderer.setSize(W, H);
    idRenderer.setPixelRatio(1);

    // 1) Dibujo en color, con luz de estudio, sombras y oclusión ambiental, a doble resolución.
    const SS = 2;
    cam.near = 10 - radius * 2;
    cam.far = 10 + radius * 2;
    cam.updateProjectionMatrix();
    renderer.setSize(W * SS, H * SS);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.32;
    scene.background = new THREE.Color(0xffffff);
    const key = new THREE.DirectionalLight(0xfff4ea, 2.8);
    key.position.copy(center).add(dir.clone().multiplyScalar(radius * 3)).add(new THREE.Vector3(-radius * 2.6, radius * 2.4, 0));
    key.target.position.copy(center);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -radius * 1.6, right: radius * 1.6, top: radius * 1.6, bottom: -radius * 1.6, near: 0.001, far: radius * 8 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = radius * 0.004;
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.35);
    fill.position.copy(center).add(new THREE.Vector3(radius * 2, -radius * 0.5, radius * 2));
    scene.add(fill);
    const mats = new Map();
    for (const c of clones) {
      const col = colorOf(c.layer, c.name);
      const f = finishOf(c.layer, c.name);
      const k = `${col}-${c.layer}-${f.scale}`;
      if (!mats.has(k))
        mats.set(
          k,
          withDetail(
            new THREE.MeshPhysicalMaterial({ color: col, roughness: f.roughness, clearcoat: f.clearcoat, clearcoatRoughness: 0.35, metalness: 0 }),
            f,
            p.fiberAxis ?? [0, 1, 0],
          ),
        );
      c.clone.material = mats.get(k);
      c.clone.castShadow = true;
      c.clone.receiveShadow = true;
    }
    const composer = new EffectComposer(renderer);
    composer.setSize(W * SS, H * SS);
    composer.addPass(new RenderPass(scene, cam));
    const ao = new GTAOPass(scene, cam, W * SS, H * SS);
    ao.updateGtaoMaterial({ radius: radius * 0.06, distanceExponent: 1.2, thickness: radius * 0.04, scale: 1.7, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    ao.blendIntensity = 1.0;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    composer.render();
    // Reducir a su tamaño (bordes suaves).
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    const sctx = small.getContext("2d");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(renderer.domElement, 0, 0, W, H);
    // El ajuste de tono deja el fondo gris claro: se aclara todo por igual hasta que el fondo sea blanco.
    const pix = sctx.getImageData(0, 0, W, H);
    const bg = [pix.data[0], pix.data[1], pix.data[2]];
    for (let i = 0; i < pix.data.length; i += 4)
      for (let c = 0; c < 3; c++) pix.data[i + c] = 255 * Math.min(1, pix.data[i + c] / Math.max(1, bg[c])) ** 1.25;
    sctx.putImageData(pix, 0, 0);
    const image = small.toDataURL("image/png");
    composer.dispose();
    scene.remove(key, key.target, fill);
    scene.environment = null;
    scene.background = null;

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
