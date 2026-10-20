// Genera los "maniquíes" del simulador de rayos X a partir de los modelos 3D del atlas:
// para cada exploración, cuántos cm de hueso y de tejido blando atraviesa el haz en cada punto
// (radiografía reconstruida, DRR). Se ejecuta en un navegador (ver run.mjs) y no forma parte de la web.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const load = (f) => new Promise((ok, ko) => loader.load(f, (g) => ok(g.scene), undefined, ko));

// Densidad relativa al tejido blando de cada pieza (0 = no cuenta). Los pulmones son casi aire.
function softWeight(layer, name) {
  if (layer === "muscles") return 1;
  if (layer === "vessels") return 1; // corazón y vasos llenos de sangre
  if (layer === "organs") {
    if (/segment of liver|bronch|trachea|nasal|pharynx/i.test(name)) return 0;
    if (/lung/i.test(name)) return 0.22;
    if (/colon|jejunum|duodenum|stomach/i.test(name)) return 0.55; // con gas
    return 1;
  }
  if (layer === "bones" && /cartilage|disc/i.test(name)) return 1;
  return 0;
}
const isBone = (layer, name) => layer === "bones" && !/cartilage|disc/i.test(name);

// Grosor atravesado: + profundidad en las caras de atrás y − en las de delante. La profundidad se mide
// desde el centro de cada pieza: si una malla tiene un agujerito, el error es como mucho su tamaño
// (y luego se quita con un filtro de mediana), no la distancia a la cámara.
const thicknessMaterial = (weight) =>
  new THREE.ShaderMaterial({
    uniforms: { w: { value: weight }, ref: { value: 0 } },
    vertexShader: `uniform float ref; varying float vDepth;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z - ref; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float w; varying float vDepth;
      void main() { gl_FragColor = vec4(gl_FrontFacing ? -vDepth * w : vDepth * w, gl_FrontFacing ? -1.0 : 1.0, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

// Corazón y vasos: están huecos en el modelo pero llenos de sangre en el cuerpo. Se mide de la superficie
// más cercana a la más lejana (R = la más lejana, G = 100 − la más cercana, con el máximo).
const chordMaterial = () =>
  new THREE.ShaderMaterial({
    vertexShader: `varying float vDepth;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vDepth; void main() { gl_FragColor = vec4(vDepth, 100.0 - vDepth, 0.0, 1.0); }`,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });

window.run = async (exams) => {
  const layers = {};
  for (const [l, f] of [
    ["bones", "huesos"],
    ["muscles", "musculos"],
    ["organs", "organos"],
    ["vessels", "vasos"],
  ])
    layers[l] = await load(`/public/atlas/${f}.glb`);

  // Cada malla con su capa y nombre.
  const meshes = [];
  for (const [layer, root] of Object.entries(layers)) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      let n = o;
      while (n && !n.userData.n) n = n.parent;
      meshes.push({ mesh: o, layer, name: n?.userData.n ?? o.name });
    });
  }
  // Una pieza puede venir en varios trozos (p. ej. la superficie articular aparte): se calculan juntos.
  const parts = new Map();
  for (const m of meshes) {
    // El corazón (cavidades, válvulas y grandes vasos de su base) se mide como una sola pieza llena de sangre.
    const heart =
      m.layer === "vessels" &&
      /atrium|ventricle|valve|papillary|ascending aorta|pulmonary trunk|superior vena cava/i.test(m.name);
    const key = heart ? "vessels|heart" : `${m.layer}|${m.name}`;
    if (!parts.has(key)) parts.set(key, { layer: m.layer, name: heart ? "Heart" : m.name, meshes: [] });
    parts.get(key).meshes.push(m.mesh);
  }
  const closed = [...parts.values()];
  const box = (re, layer = "bones") => {
    const b = new THREE.Box3();
    for (const m of meshes) if (m.layer === layer && re.test(m.name)) b.expandByObject(m.mesh);
    return b;
  };

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.autoClear = false;
  const out = {};
  for (const ex of exams) {
    const b = box(new RegExp(ex.bones));
    const c = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    // Encuadre: ancho y alto del campo en unidades del modelo, centrado en las piezas elegidas
    // (o un campo fijo en cm, para el posicionamiento).
    const fieldH = ex.fieldCm ? ex.fieldCm / 100 : Math.max(size.y, (size.x * ex.h) / ex.w) * ex.margin;
    const fieldW = (fieldH * ex.w) / ex.h;
    const cam = new THREE.OrthographicCamera(-fieldW / 2, fieldW / 2, fieldH / 2, -fieldH / 2, 0.01, 10);
    // Azimut: desde dónde mira el haz alrededor del eje vertical (0 = de frente; 90 = desde la izquierda del paciente).
    const az = ((ex.azimuth ?? 0) * Math.PI) / 180;
    const target = new THREE.Vector3(c.x + (ex.dx ?? 0) * fieldW, c.y + (ex.dy ?? 0) * fieldH, c.z);
    cam.position.set(target.x + Math.sin(az) * 3, target.y, target.z + Math.cos(az) * 3);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    // Puntos de referencia (centraje) y zona que debe salir (colimación), en píxeles de esta imagen.
    const toPx = (v) => {
      const p = v.clone().project(cam);
      return [((p.x + 1) / 2) * ex.w, ((1 - p.y) / 2) * ex.h];
    };
    const points = {};
    for (const [key, spec] of Object.entries(ex.points ?? {})) {
      const pb = box(new RegExp(spec.re), spec.layer ?? "bones");
      const p = pb.getCenter(new THREE.Vector3());
      if (spec.y === "min") p.y = pb.min.y;
      if (spec.y === "max") p.y = pb.max.y;
      if (spec.yFrom) p.y = box(new RegExp(spec.yFrom)).getCenter(new THREE.Vector3()).y;
      p.y += (spec.dyCm ?? 0) / 100;
      points[key] = toPx(p);
    }
    const rois = {};
    for (const [key, spec] of Object.entries(ex.rois ?? {})) {
      const rb = new THREE.Box3();
      for (const part of spec) rb.union(box(new RegExp(part.re), part.layer ?? "bones"));
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const xx of [rb.min.x, rb.max.x])
        for (const yy of [rb.min.y, rb.max.y])
          for (const zz of [rb.min.z, rb.max.z]) {
            const [px, py] = toPx(new THREE.Vector3(xx, yy, zz));
            x0 = Math.min(x0, px);
            y0 = Math.min(y0, py);
            x1 = Math.max(x1, px);
            y1 = Math.max(y1, py);
          }
      rois[key] = [x0, y0, x1, y1];
    }
    renderer.setSize(ex.w, ex.h);
    const rt = new THREE.WebGLRenderTarget(ex.w, ex.h, { type: THREE.FloatType, format: THREE.RGBAFormat });

    // Cada pieza se calcula por separado y su grosor se limita a [0, su diámetro] antes de sumarlo:
    // así un hueco en una malla no puede restar ni inventar centímetros.
    const one = new THREE.WebGLRenderTarget(ex.w, ex.h, { type: THREE.FloatType, format: THREE.RGBAFormat });
    const accum = new THREE.ShaderMaterial({
      uniforms: { src: { value: one.texture }, maxT: { value: 1 }, chord: { value: 0 }, w: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D src; uniform float maxT; uniform float chord; uniform float w; varying vec2 vUv;
        void main() {
          vec4 v = texture2D(src, vUv);
          if (chord > 0.5) {
            float t = v.g > 0.0 ? (v.r + v.g - 100.0) * w : 0.0;
            gl_FragColor = vec4(clamp(t, 0.0, maxT), 0.0, 0.0, 1.0);
            return;
          }
          // Entradas y salidas del haz descompensadas = pasó por un hueco de la malla (p. ej. las válvulas del
          // corazón). Falta una de las dos caras: se estima el grosor como el doble de la distancia al centro.
          bool ok = abs(v.g) < 0.5;
          float t = ok ? v.r : 2.0 * v.r;
          gl_FragColor = vec4(clamp(t, 0.0, maxT), ok ? 0.0 : 1.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    const quadScene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), accum));
    const quadCam = new THREE.Camera();
    const single = new THREE.Scene();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse),
    );

    const pass = (pick) => {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      for (const m of closed) {
        if (ex.include && !new RegExp(ex.include, "i").test(m.name)) continue;
        if (ex.exclude && new RegExp(ex.exclude, "i").test(m.name)) continue;
        const w = pick(m.layer, m.name);
        if (!w) continue;
        const sphere = new THREE.Box3();
        for (const mesh of m.meshes) sphere.expandByObject(mesh);
        const bs = sphere.getBoundingSphere(new THREE.Sphere());
        if (!frustum.intersectsSphere(bs)) continue;
        const isChord = m.layer === "vessels";
        const mat = isChord ? chordMaterial() : thicknessMaterial(w);
        accum.uniforms.chord.value = isChord ? 1 : 0;
        accum.uniforms.w.value = w;
        if (!isChord) mat.uniforms.ref.value = -bs.center.clone().applyMatrix4(cam.matrixWorldInverse).z;
        single.clear();
        for (const mesh of m.meshes) {
          const clone = new THREE.Mesh(mesh.geometry, mat);
          clone.matrixAutoUpdate = false;
          clone.matrix.copy(mesh.matrixWorld);
          single.add(clone);
        }
        renderer.setRenderTarget(one);
        renderer.clear();
        renderer.render(single, cam);
        mat.dispose();
        accum.uniforms.maxT.value = 2 * bs.radius * w;
        renderer.setRenderTarget(rt);
        renderer.render(quadScene, quadCam);
      }
      const buf = new Float32Array(ex.w * ex.h * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, ex.w, ex.h, buf);
      // De arriba abajo y en cm (el modelo está en metros).
      const res = new Float32Array(ex.w * ex.h);
      const holes = new Uint8Array(ex.w * ex.h);
      for (let y = 0; y < ex.h; y++)
        for (let x = 0; x < ex.w; x++) {
          const i = ((ex.h - 1 - y) * ex.w + x) * 4;
          res[y * ex.w + x] = buf[i] * 100;
          holes[y * ex.w + x] = buf[i + 1] > 0.5 ? 1 : 0;
        }
      return { res, holes };
    };
    // Etiquetas: en cada punto, qué pieza atraviesa el haz con más grosor (para "¿Qué es esto?").
    // Se codifica grosor·1024 + número de pieza y se queda el máximo.
    const labelRT = new THREE.WebGLRenderTarget(ex.w, ex.h, { type: THREE.FloatType, format: THREE.RGBAFormat });
    const labelMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: one.texture }, chord: { value: 0 }, idx: { value: 0 }, maxT: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform sampler2D src; uniform float chord; uniform float idx; uniform float maxT; varying vec2 vUv;
        void main() {
          vec4 v = texture2D(src, vUv);
          float t = chord > 0.5 ? (v.g > 0.0 ? v.r + v.g - 100.0 : 0.0) : (abs(v.g) < 0.5 ? v.r : 2.0 * v.r);
          t = clamp(t, 0.0, maxT);
          float units = floor(min(t * 10000.0, 15000.0));
          gl_FragColor = vec4(units >= 20.0 ? units * 1024.0 + idx : 0.0, 0.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    const labelScene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), labelMat));
    const labels = (pick) => {
      renderer.setRenderTarget(labelRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      const names = [];
      for (const m of closed) {
        if (ex.include && !new RegExp(ex.include, "i").test(m.name)) continue;
        if (ex.exclude && new RegExp(ex.exclude, "i").test(m.name)) continue;
        if (!pick(m.layer, m.name)) continue;
        const box = new THREE.Box3();
        for (const mesh of m.meshes) box.expandByObject(mesh);
        const bs = box.getBoundingSphere(new THREE.Sphere());
        if (!frustum.intersectsSphere(bs)) continue;
        const isChord = m.layer === "vessels";
        const mat = isChord ? chordMaterial() : thicknessMaterial(1);
        if (!isChord) mat.uniforms.ref.value = -bs.center.clone().applyMatrix4(cam.matrixWorldInverse).z;
        single.clear();
        for (const mesh of m.meshes) {
          const clone = new THREE.Mesh(mesh.geometry, mat);
          clone.matrixAutoUpdate = false;
          clone.matrix.copy(mesh.matrixWorld);
          single.add(clone);
        }
        renderer.setRenderTarget(one);
        renderer.clear();
        renderer.render(single, cam);
        mat.dispose();
        names.push(m.name);
        labelMat.uniforms.chord.value = isChord ? 1 : 0;
        labelMat.uniforms.idx.value = names.length; // 0 = nada
        labelMat.uniforms.maxT.value = 2 * bs.radius;
        renderer.setRenderTarget(labelRT);
        renderer.render(labelScene, quadCam);
      }
      const buf = new Float32Array(ex.w * ex.h * 4);
      renderer.readRenderTargetPixels(labelRT, 0, 0, ex.w, ex.h, buf);
      const ids = new Uint16Array(ex.w * ex.h);
      for (let y = 0; y < ex.h; y++)
        for (let x = 0; x < ex.w; x++) ids[y * ex.w + x] = buf[((ex.h - 1 - y) * ex.w + x) * 4] % 1024;
      return { ids: Array.from(ids), names };
    };

    const bone = pass((l, n) => (isBone(l, n) ? 1 : 0));
    const soft = pass(softWeight);
    if (ex.compact) {
      // Posicionamiento: mapas en 8 bits (hueso cada 0,05 cm, tejido blando cada 0,2 cm) y sin etiquetas.
      const q = (arr, step) => {
        const u = new Uint8Array(arr.length);
        for (let i = 0; i < arr.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(arr[i] / step)));
        let bin = "";
        for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
        return btoa(bin);
      };
      out[ex.id] = {
        w: ex.w,
        h: ex.h,
        cmPerPx: (fieldW * 100) / ex.w,
        bone: q(bone.res, 0.05),
        soft: q(soft.res, 0.2),
        points,
        rois,
      };
      continue;
    }
    const boneLabels = labels((l, n) => isBone(l, n));
    // Órganos que se reconocen en una radiografía (sin músculos ni vasos pequeños).
    const softLabels = labels(
      (l, n) =>
        (l === "organs" && softWeight(l, n) > 0) ||
        (l === "vessels" &&
          /^(Heart|Thoracic aorta|Abdominal aorta|Ascending aorta|Arch of aorta|Pulmonary trunk|Superior vena cava|Inferior vena cava.*)$/i.test(
            n,
          )),
    );
    out[ex.id] = {
      w: ex.w,
      h: ex.h,
      cmPerPx: (fieldW * 100) / ex.w,
      bone: Array.from(bone.res),
      soft: Array.from(soft.res),
      holes: Array.from(bone.holes.map((v, i) => v | soft.holes[i])),
      boneLabels,
      softLabels,
    };
  }
  return out;
};
window.ready = true;
