"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ErrorBox, Spinner } from "@/components/ui";
import { partColor } from "@/lib/atlas/colors";
import { type Layer, parsePart, sideLabel, translate } from "@/lib/atlas/names";
import { useLang } from "@/lib/i18n";
import { createViewer, type Viewer } from "@/lib/viewer3d";

/**
 * Cortes del cuerpo en 3D: un plano axial, coronal o sagital corta los modelos del Atlas y,
 * al lado, se ve el corte de frente como en una TC o una RM (orientación radiológica).
 * Reutiliza los modelos del Atlas (no descarga nada nuevo) y no usa IA ni el servidor.
 */

type Axis = "axial" | "coronal" | "sagital";
type SliceLayer = Exclude<Layer, "nerves">;

const FILES: Record<SliceLayer, string> = {
  bones: "/atlas/huesos.glb",
  organs: "/atlas/organos.glb",
  vessels: "/atlas/vasos.glb",
  muscles: "/atlas/musculos.glb",
};
const LAYER_ORDER: SliceLayer[] = ["bones", "organs", "vessels", "muscles"];

// Eje del mundo de cada plano (el modelo mira hacia +z y tiene la cabeza hacia +y).
const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  axial: new THREE.Vector3(0, 1, 0),
  coronal: new THREE.Vector3(0, 0, 1),
  sagital: new THREE.Vector3(1, 0, 0),
};
const AXIS_KEY: Record<Axis, "x" | "y" | "z"> = { axial: "y", coronal: "z", sagital: "x" };

// Atajos (fracción de la altura desde los pies, o del ancho/fondo para los otros planos).
const PRESETS: Record<Axis, { key: string; at: number }[]> = {
  axial: [
    { key: "brain", at: 0.93 },
    { key: "thorax", at: 0.76 },
    { key: "abdomen", at: 0.65 },
    { key: "pelvis", at: 0.52 },
    { key: "knee", at: 0.28 },
  ],
  coronal: [
    { key: "front", at: 0.62 },
    { key: "middle", at: 0.48 },
    { key: "back", at: 0.3 },
  ],
  sagital: [
    { key: "midline", at: 0.5 },
    { key: "right", at: 0.32 },
    { key: "left", at: 0.68 },
  ],
};

const TEXT = {
  es: {
    axes: { axial: "Axial", coronal: "Coronal", sagital: "Sagital" } as Record<Axis, string>,
    help: {
      axial:
        "Plano axial (transversal): separa lo superior de lo inferior. Es el corte típico de la TC. Se mira desde los pies: la derecha del paciente queda a la izquierda de la pantalla.",
      coronal:
        "Plano coronal (frontal): separa lo anterior de lo posterior. Es como mirar al paciente de frente, con su derecha a tu izquierda.",
      sagital:
        "Plano sagital: separa la derecha de la izquierda. El sagital medio pasa justo por el centro del cuerpo. Se mira desde el lado izquierdo, con lo anterior a la izquierda de la pantalla.",
    } as Record<Axis, string>,
    presets: {
      brain: "Cerebro",
      thorax: "Tórax",
      abdomen: "Abdomen",
      pelvis: "Pelvis",
      knee: "Rodilla",
      front: "Anterior",
      middle: "Medio",
      back: "Posterior",
      midline: "Línea media",
      right: "Lado derecho",
      left: "Lado izquierdo",
    } as Record<string, string>,
    layers: {
      bones: "🦴 Huesos",
      organs: "🫁 Órganos",
      vessels: "🫀 Corazón y vasos",
      muscles: "💪 Músculos",
    } as Record<SliceLayer, string>,
    position: "Posición del corte",
    view3d: "Cuerpo cortado",
    slice: "Corte (como en la TC)",
    tap: "Toca una estructura del corte para ver qué es.",
    loading: "Cargando los modelos del atlas…",
    error: "No se han podido cargar los modelos. Comprueba la conexión.",
    flip: "Ver el otro lado",
    marks: { sup: "Sup", inf: "Inf", ant: "Ant", post: "Post", right: "Dcha", left: "Izda" },
  },
  pt: {
    axes: { axial: "Axial", coronal: "Coronal", sagital: "Sagital" } as Record<Axis, string>,
    help: {
      axial:
        "Plano axial (transversal): separa o superior do inferior. É o corte típico da TC. Vê-se a partir dos pés: a direita do doente fica à esquerda do ecrã.",
      coronal:
        "Plano coronal (frontal): separa o anterior do posterior. É como olhar para o doente de frente, com a direita dele à tua esquerda.",
      sagital:
        "Plano sagital: separa a direita da esquerda. O sagital mediano passa mesmo pelo centro do corpo. Vê-se pelo lado esquerdo, com o anterior à esquerda do ecrã.",
    } as Record<Axis, string>,
    presets: {
      brain: "Cérebro",
      thorax: "Tórax",
      abdomen: "Abdómen",
      pelvis: "Pélvis",
      knee: "Joelho",
      front: "Anterior",
      middle: "Médio",
      back: "Posterior",
      midline: "Linha média",
      right: "Lado direito",
      left: "Lado esquerdo",
    } as Record<string, string>,
    layers: { bones: "🦴 Ossos", organs: "🫁 Órgãos", vessels: "🫀 Coração e vasos", muscles: "💪 Músculos" } as Record<
      SliceLayer,
      string
    >,
    position: "Posição do corte",
    view3d: "Corpo cortado",
    slice: "Corte (como na TC)",
    tap: "Toca numa estrutura do corte para ver o que é.",
    loading: "A carregar os modelos do atlas…",
    error: "Não foi possível carregar os modelos. Verifica a ligação.",
    flip: "Ver o outro lado",
    marks: { sup: "Sup", inf: "Inf", ant: "Ant", post: "Post", right: "Dir", left: "Esq" },
  },
};

// Un material por color, de doble cara (al cortar se ve el interior de las piezas).
const palette = new Map<string, THREE.MeshStandardMaterial>();
function materialFor(layer: SliceLayer, en: string) {
  const color = layer === "bones" ? "#efe6d2" : partColor(layer, en);
  let m = palette.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
    palette.set(color, m);
  }
  return m;
}

export default function Slices3D() {
  const lang = useLang();
  const tx = TEXT[lang];
  const mainMount = useRef<HTMLDivElement>(null);
  const sliceMount = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const slice = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
  } | null>(null);
  // Medio alto (en unidades del modelo) que se ve en el corte sin ampliar.
  const sliceHalf = useRef(1);
  const groups = useRef<Partial<Record<SliceLayer, THREE.Group>>>({});
  const bounds = useRef<THREE.Box3 | null>(null);
  const quad = useRef<THREE.Mesh | null>(null);
  const planes = useRef({ main: new THREE.Plane(), slabA: new THREE.Plane(), slabB: new THREE.Plane() });

  const [axis, setAxis] = useState<Axis>("axial");
  const [pos, setPos] = useState(0.76);
  const [flip, setFlip] = useState(false);
  const [visible, setVisible] = useState<Record<SliceLayer, boolean>>({
    bones: true,
    organs: true,
    vessels: false,
    muscles: false,
  });
  const [loading, setLoading] = useState<SliceLayer | null>("bones");
  // Capas que se están descargando (para no pedir la misma dos veces).
  const downloading = useRef(new Set<SliceLayer>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [label, setLabel] = useState<string | null>(null);

  // Referencias a la última versión de funciones y estado, para los manejadores creados una sola vez.
  const setLabelRef = useRef<(o: THREE.Object3D | null) => void>(() => undefined);
  const drawRef = useRef<() => void>(() => undefined);
  const visibleRef = useRef(visible);
  const fitSliceRef = useRef<() => void>(() => undefined);

  // Ajusta el encuadre del corte al tamaño de su recuadro.
  const fitSlice = useCallback(() => {
    const sl = slice.current;
    if (!sl) return;
    const el = sl.renderer.domElement;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const half = sliceHalf.current;
    sl.camera.left = -half * aspect;
    sl.camera.right = half * aspect;
    sl.camera.top = half;
    sl.camera.bottom = -half;
    sl.camera.updateProjectionMatrix();
  }, []);

  const nameOf = useCallback(
    (o: THREE.Object3D) => {
      let node: THREE.Object3D | null = o;
      while (node && !node.userData.id) node = node.parent;
      if (!node) return null;
      const p = parsePart(node.userData.id as string, node.userData.layer as Layer);
      const side = sideLabel(p.side, lang);
      return `${translate(p.en, lang)}${side ? ` (${side})` : ""}`;
    },
    [lang],
  );

  // ---------- Escena y las dos vistas ----------
  useEffect(() => {
    const v = createViewer(mainMount.current!, { distance: 3.4, minDistance: 0.4, maxDistance: 7 });
    v.camera.layers.enable(1);
    v.renderer.clippingPlanes = [planes.current.main];
    viewer.current = v;

    const sm = sliceMount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(sm.clientWidth, sm.clientHeight);
    renderer.setClearColor(0x000000, 1);
    renderer.clippingPlanes = [planes.current.slabA, planes.current.slabB];
    sm.appendChild(renderer.domElement);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    // En el corte solo se amplía y se desplaza (con dos dedos o arrastrando), sin girar.
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.zoomSpeed = 0.8;
    controls.minZoom = 0.6;
    controls.maxZoom = 8;
    controls.addEventListener("change", () => renderer.render(v.scene, camera));
    slice.current = { renderer, camera, controls };
    const ro = new ResizeObserver(() => {
      renderer.setSize(sm.clientWidth, sm.clientHeight);
      fitSliceRef.current();
      drawRef.current();
    });
    ro.observe(sm);

    // Toques: en la vista 3D, lo que queda del lado visible del corte; en el corte, lo que está en la loncha.
    const pickable = () => LAYER_ORDER.map((l) => groups.current[l]).filter((g): g is THREE.Group => !!g && g.visible);
    const raycaster = new THREE.Raycaster();
    const tapIn = (el: HTMLElement, cam: THREE.Camera, ok: (p: THREE.Vector3) => boolean) => {
      let down: { x: number; y: number } | null = null;
      el.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
      el.addEventListener("pointerup", (e) => {
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
        const r = el.getBoundingClientRect();
        raycaster.setFromCamera(
          new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
          cam,
        );
        const hit = raycaster.intersectObjects(pickable(), true).find((h) => ok(h.point));
        setLabelRef.current(hit ? hit.object : null);
      });
    };
    tapIn(v.renderer.domElement, v.camera, (p) => planes.current.main.distanceToPoint(p) >= -0.002);
    tapIn(
      renderer.domElement,
      camera,
      (p) => planes.current.slabA.distanceToPoint(p) >= -0.004 && planes.current.slabB.distanceToPoint(p) >= -0.004,
    );

    return () => {
      ro.disconnect();
      controls.dispose();
      v.dispose();
      renderer.dispose();
      sm.removeChild(renderer.domElement);
      viewer.current = null;
      slice.current = null;
      groups.current = {};
    };
  }, []);

  useEffect(() => {
    setLabelRef.current = (o) => setLabel(o ? nameOf(o) : null);
  }, [nameOf]);

  // ---------- Planos, cámaras y dibujo ----------
  const draw = useCallback(() => {
    const v = viewer.current;
    const s = slice.current;
    const b = bounds.current;
    if (!v || !s || !b) return;
    const k = AXIS_KEY[axis];
    const n = AXIS_VEC[axis];
    const size = b.getSize(new THREE.Vector3());
    const center = b.getCenter(new THREE.Vector3());
    const at = b.min[k] + pos * size[k];
    const thick = size.y * 0.006;

    // Vista 3D: se quita lo que hay delante del plano (o detrás, con "ver el otro lado").
    const dir = flip ? -1 : 1;
    planes.current.main.set(n.clone().multiplyScalar(-dir), dir * at);
    // Loncha fina alrededor del plano para la vista de corte.
    planes.current.slabA.set(n.clone().negate(), at + thick);
    planes.current.slabB.set(n.clone(), -(at - thick));

    // Marco del plano en la vista 3D.
    const q = quad.current!;
    q.position.copy(center);
    q.position[k] = at - dir * 0.001;
    q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const w = axis === "sagital" ? size.z : size.x;
    const h = axis === "axial" ? size.z : size.y;
    q.scale.set(w * 1.15, h * 1.08, 1);
    v.render();

    s.renderer.render(v.scene, s.camera);
  }, [axis, pos, flip]);
  useEffect(() => {
    drawRef.current = draw;
    fitSliceRef.current = fitSlice;
    draw();
  }, [draw, fitSlice]);

  // Al cambiar de plano, las dos cámaras se colocan para ver bien el corte.
  useEffect(() => {
    const v = viewer.current;
    const sl = slice.current;
    const b = bounds.current;
    if (!v || !sl || !b || !ready) return;
    const size = b.getSize(new THREE.Vector3());
    const c = b.getCenter(new THREE.Vector3());
    const s = flip ? -1 : 1;
    // Vista 3D: en el axial se mira la zona del corte desde arriba y de lado; en los otros, el cuerpo entero.
    const target = axis === "axial" ? new THREE.Vector3(c.x, b.min.y + PRESETS.axial[1].at * size.y, c.z) : c.clone();
    const d = axis === "axial" ? size.y * 0.75 : size.y * 1.5;
    const offsets: Record<Axis, THREE.Vector3> = {
      axial: new THREE.Vector3(0.35 * s, 0.9 * s, 1).normalize(),
      coronal: new THREE.Vector3(0.45, 0.2, 1 * s).normalize(),
      sagital: new THREE.Vector3(1 * s, 0.2, 0.45).normalize(),
    };
    v.controls.target.copy(target);
    v.camera.position.copy(target).addScaledVector(offsets[axis], d);
    v.controls.update();

    // Corte, con la orientación radiológica: axial visto desde los pies (anterior arriba),
    // coronal de frente y sagital desde la izquierda del paciente. Coronal y sagital empiezan en el tronco.
    const cam = sl.camera;
    const look = axis === "axial" ? c.clone() : new THREE.Vector3(c.x, b.min.y + 0.63 * size.y, c.z);
    if (axis === "axial") {
      cam.position.set(look.x, b.min.y - 1, look.z);
      cam.up.set(0, 0, 1);
    } else if (axis === "coronal") {
      cam.position.set(look.x, look.y, b.max.z + 1);
      cam.up.set(0, 1, 0);
    } else {
      cam.position.set(b.max.x + 1, look.y, look.z);
      cam.up.set(0, 1, 0);
    }
    cam.lookAt(look);
    sl.controls.target.copy(look);
    const halfW = (axis === "sagital" ? size.z : size.x) / 2;
    sliceHalf.current = axis === "axial" ? Math.max(size.z * 0.62, halfW * 0.62) : size.y * 0.3;
    cam.zoom = 1;
    cam.near = 0.01;
    cam.far = Math.max(size.x, size.y, size.z) + 4;
    fitSlice();
    sl.controls.update();
    drawRef.current();
  }, [axis, flip, ready, fitSlice]);

  // ---------- Capas (cada una se descarga solo cuando se activa) ----------
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    for (const layer of LAYER_ORDER) {
      const g = groups.current[layer];
      if (g) g.visible = visible[layer];
      if (!visible[layer] || g || downloading.current.has(layer)) continue;
      {
        downloading.current.add(layer);
        setLoading(layer);
        new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
          FILES[layer],
          (gltf) => {
            const group = gltf.scene;
            group.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (!mesh.isMesh) return;
              let node: THREE.Object3D | null = mesh;
              while (node && !node.userData.n) node = node.parent;
              const id = (node?.userData.n as string) ?? mesh.name;
              mesh.geometry.computeVertexNormals();
              mesh.material = materialFor(layer, parsePart(id, layer).en);
              mesh.userData.id = id;
              mesh.userData.layer = layer;
            });
            groups.current[layer] = group;
            group.visible = visibleRef.current[layer];
            v.scene.add(group);
            if (layer === "bones") {
              bounds.current = new THREE.Box3().setFromObject(group);
              const plane = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1),
                new THREE.MeshBasicMaterial({
                  color: 0xec4899,
                  transparent: true,
                  opacity: 0.18,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                }),
              );
              plane.layers.set(1); // solo en la vista 3D, no en la del corte
              quad.current = plane;
              v.scene.add(plane);
              setReady(true);
            }
            downloading.current.delete(layer);
            setLoading((l) => (l === layer ? null : l));
            drawRef.current();
          },
          undefined,
          () => {
            downloading.current.delete(layer);
            setLoading(null);
            setError(tx.error);
          },
        );
      }
    }
    drawRef.current();
  }, [visible, tx.error]);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  if (error) return <ErrorBox message={error} />;

  const m = tx.marks;
  const marks: Record<Axis, [string, string, string, string]> = {
    axial: [m.ant, m.post, m.right, m.left],
    coronal: [m.sup, m.inf, m.right, m.left],
    sagital: [m.sup, m.inf, m.ant, m.post],
  };
  const [top, bottom, left, right] = marks[axis];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(tx.axes) as Axis[]).map((a) => (
          <button
            key={a}
            onClick={() => {
              setAxis(a);
              setPos(PRESETS[a][0].at);
              setFlip(false);
              setLabel(null);
            }}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
              axis === a ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            {tx.axes[a]}
          </button>
        ))}
      </div>
      <p className="text-muted text-sm">{tx.help[axis]}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <figure>
          <figcaption className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">{tx.view3d}</figcaption>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#2a1b28] to-[#120c11] shadow-lg">
            <div ref={mainMount} className="aspect-square w-full touch-none" />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Spinner label={tx.loading} />
              </div>
            )}
          </div>
        </figure>
        <figure>
          <figcaption className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">{tx.slice}</figcaption>
          <div className="relative overflow-hidden rounded-2xl bg-black shadow-lg">
            <div ref={sliceMount} className="aspect-square w-full" />
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white/70">{top}</span>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs font-bold text-white/70">
              {bottom}
            </span>
            <span className="absolute top-1/2 left-2 -translate-y-1/2 text-xs font-bold text-white/70">{left}</span>
            <span className="absolute top-1/2 right-2 -translate-y-1/2 text-xs font-bold text-white/70">{right}</span>
          </div>
        </figure>
      </div>

      <div
        className={`rounded-2xl p-3 text-center font-semibold ${label ? "bg-accent-soft" : "bg-surface-2 text-muted"}`}
      >
        {label ?? tx.tap}
      </div>

      <label className="block">
        <span className="flex items-baseline justify-between">
          <span className="font-semibold">{tx.position}</span>
          <span className="text-accent font-mono font-bold">{Math.round(pos * 100)} %</span>
        </span>
        <input
          type="range"
          className="slider"
          min={0}
          max={1}
          step={0.005}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {PRESETS[axis].map((p) => (
          <button
            key={p.key}
            onClick={() => setPos(p.at)}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
              Math.abs(pos - p.at) < 0.003
                ? "bg-accent text-accent-contrast"
                : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            {tx.presets[p.key]}
          </button>
        ))}
        <button className="btn-ghost min-h-9 text-sm" onClick={() => setFlip((f) => !f)}>
          ⇄ {tx.flip}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {LAYER_ORDER.map((l) => (
          <button
            key={l}
            onClick={() => setVisible((v) => ({ ...v, [l]: !v[l] }))}
            aria-pressed={visible[l]}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
              visible[l] ? "bg-accent text-accent-contrast" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            {tx.layers[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
