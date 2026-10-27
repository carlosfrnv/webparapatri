"use client";

import { ArrowsClockwise, Crosshair, Eye, EyeSlash, MagnifyingGlass, Question, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  type AtlasLang,
  type Layer,
  LAYERS,
  normalize,
  parsePart,
  type Part,
  sideLabel,
  translate,
} from "@/lib/atlas/names";
import { partColor } from "@/lib/atlas/colors";
import { api, errorMessage } from "@/lib/api";
import { useLang, useT } from "@/lib/i18n";

/**
 * Atlas anatómico en 3D: esqueleto, músculos, órganos, corazón y vasos, y sistema nervioso
 * (modelos Z-Anatomy, CC BY-SA 4.0). Cada capa se descarga solo cuando se activa.
 * Tocar una pieza muestra su nombre; también hay buscador, capas y un modo examen.
 * Solo se dibuja cuando algo cambia (al girar, tocar…), para no gastar batería.
 */

const FILES: Record<Layer, string> = {
  bones: "/atlas/huesos.glb",
  muscles: "/atlas/musculos.glb",
  organs: "/atlas/organos.glb",
  vessels: "/atlas/vasos.glb",
  nerves: "/atlas/nervios.glb",
};
const ICONS: Record<Layer, string> = { bones: "🦴", muscles: "💪", organs: "🫁", vessels: "🫀", nerves: "🧠" };
const allLayers = (v: boolean) => Object.fromEntries(LAYERS.map((l) => [l, v])) as Record<Layer, boolean>;
const COLORS = { bones: "#efe6d2", selected: "#ec4899", right: "#16a34a", wrong: "#dc2626", mine: "#f59e0b" };

type Quiz = { target: string; answered: null | { ok: boolean; tapped: string } };
type Info = Record<
  "funcion" | "localizacion" | "tamano" | "irrigacion" | "inervacion" | "tejido" | "imagen" | "dato",
  string
>;
const INFO_FIELDS = [
  "funcion",
  "localizacion",
  "tamano",
  "tejido",
  "irrigacion",
  "inervacion",
  "imagen",
  "dato",
] as const;
// Centro del cuerpo (de donde se separan las piezas al "Separar piezas").
const BODY_CENTER = new THREE.Vector3(0, 0.9, 0);

export default function Atlas3D({ subjectId }: { subjectId?: string }) {
  const t = useT();
  const ta = t.atlas;
  const lang = useLang() as AtlasLang;
  const mountRef = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    render: () => void;
    /** Mallas de cada pieza (una pieza puede tener varias). */
    meshes: Map<string, THREE.Mesh[]>;
    groups: Partial<Record<Layer, THREE.Group>>;
    bonesMaterial: THREE.MeshStandardMaterial;
    flash: Map<string, THREE.Material>;
  } | null>(null);

  const [loaded, setLoaded] = useState<Record<Layer, boolean>>(() => allLayers(false));
  const [loading, setLoading] = useState<Layer | null>("bones");
  const [visible, setVisible] = useState<Record<Layer, boolean>>(() => ({ ...allLayers(false), bones: true }));
  const [seeThrough, setSeeThrough] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // "Aislar": solo se ve esta pieza.
  const [isolated, setIsolated] = useState<string | null>(null);
  // "Separar piezas": 0 = juntas; 1 = separadas del centro del cuerpo.
  const [explode, setExplode] = useState(0);
  // "Desmontar en filas": cada pieza colocada en filas horizontales, como un catálogo (0 = en el cuerpo, 1 = en filas).
  const [rows, setRows] = useState(false);
  const rowsT = useRef(0);
  // Fichas ya pedidas (nombre en inglés → ficha), para no pedir dos veces la misma.
  const [infos, setInfos] = useState<Record<string, Info | "loading" | "error">>({});
  const [showInfo, setShowInfo] = useState(false);
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const [error, setError] = useState("");
  // "En mis apuntes": nombres (en inglés, sin lado) de las piezas que salen en sus apuntes de la asignatura.
  const [mine, setMine] = useState<{
    on: boolean;
    loading: boolean;
    found: Set<string> | null;
    docs: number;
    error: string;
  }>({ on: false, loading: false, found: null, docs: 0, error: "" });
  const mineOn = mine.on && !!mine.found;
  // Pieza elegida en el buscador cuya capa aún se está cargando: se enfoca al terminar.
  const pending = useRef<string | null>(null);

  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);
  const nameOf = useCallback(
    (id: string, l: AtlasLang = lang) => {
      const p = partById.get(id);
      return p ? translate(p.en, l) : id;
    },
    [partById, lang],
  );

  // ---------- Escena ----------
  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.01, 50);
    camera.position.set(0, 0.95, 3.6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x886677, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 3);
    camera.add(sun);
    scene.add(camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.9, 0);
    controls.enableDamping = true;
    // Menos sensible que lo que trae three.js por defecto: en el iPad un toque pequeño lo giraba demasiado.
    controls.rotateSpeed = 0.4;
    controls.zoomSpeed = 0.6;
    controls.panSpeed = 0.5;
    // Al soltar el dedo se para enseguida en vez de seguir girando.
    controls.dampingFactor = 0.2;
    controls.minDistance = 0.15;
    controls.maxDistance = 6;

    let frame = 0;
    const render = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // La amortiguación necesita unos fotogramas más hasta que el giro se para.
        if (controls.update()) render();
        renderer.render(scene, camera);
      });
    };
    controls.addEventListener("change", render);

    const resize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    three.current = {
      renderer,
      scene,
      camera,
      controls,
      render,
      meshes: new Map(),
      groups: {},
      bonesMaterial: new THREE.MeshStandardMaterial({ color: COLORS.bones, roughness: 0.65 }),
      flash: new Map(),
    };
    render();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      controls.dispose();
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // ---------- Carga de capas (los músculos solo cuando se activan) ----------
  const loadLayer = useCallback(
    (layer: Layer) => {
      const s = three.current;
      if (!s || s.groups[layer]) return;
      setLoading(layer);
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
        FILES[layer],
        (gltf) => {
          const group = gltf.scene;
          group.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            // El nombre original va en userData.n del nodo (o de su grupo, si la pieza tiene varias partes).
            let node: THREE.Object3D | null = mesh;
            while (node && !node.userData.n) node = node.parent;
            const id = (node?.userData.n as string) ?? mesh.name;
            mesh.geometry.computeVertexNormals();
            // Cada músculo con su propio tono (los vecinos se distinguen); los huesos, todos color hueso;
            // arterias rojas, venas azules y nervios amarillos, como en los atlas.
            const base = layer === "bones" ? s.bonesMaterial : partMaterial(layer, parsePart(id, layer).en);
            mesh.material = base;
            mesh.userData.base = base;
            mesh.userData.layer = layer;
            mesh.userData.id = id;
            s.meshes.set(id, [...(s.meshes.get(id) ?? []), mesh]);
          });
          s.groups[layer] = group;
          s.scene.add(group);
          // Para "Separar piezas": posición original de cada malla y hacia dónde se aleja del centro del cuerpo
          // (en las coordenadas de su grupo, que pueden ir escaladas).
          group.updateMatrixWorld(true);
          group.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh || !mesh.parent) return;
            const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
            const away = center.clone().add(center.clone().sub(BODY_CENTER));
            mesh.userData.basePos = mesh.position.clone();
            mesh.userData.explode = mesh.parent.worldToLocal(away).sub(mesh.parent.worldToLocal(center.clone()));
          });
          setLoaded((l) => ({ ...l, [layer]: true }));
          setLoading(null);
          s.render();
          if (pending.current && s.meshes.has(pending.current)) {
            focus(pending.current);
            pending.current = null;
          }
        },
        undefined,
        () => {
          setLoading(null);
          setError(ta.loadError);
        },
      );
    },
    [ta.loadError],
  );

  useEffect(() => {
    loadLayer("bones");
    // Lista de todas las piezas (pesa poco): el buscador encuentra también los músculos aunque aún no estén cargados.
    fetch("/atlas/piezas.json")
      .then((r) => r.json())
      .then((index: Partial<Record<Layer, string[]>>) =>
        setParts(LAYERS.flatMap((layer) => (index[layer] ?? []).map((n) => parsePart(n, layer)))),
      )
      .catch(() => setError(ta.loadError));
  }, [loadLayer, ta.loadError]);

  // ---------- Aspecto: capas visibles, ocultas, transparencia y selección ----------
  useEffect(() => {
    const s = three.current;
    if (!s) return;
    for (const layer of LAYERS) if (s.groups[layer]) s.groups[layer]!.visible = visible[layer];
    for (const m of musclePalette.values()) {
      m.opacity = seeThrough ? 0.3 : 1;
      m.depthWrite = !seeThrough;
    }
    for (const [id, meshes] of s.meshes)
      for (const mesh of meshes) {
        mesh.visible = !hidden.has(id) && (!isolated || id === isolated);
        const base = mesh.userData.base as THREE.MeshStandardMaterial;
        const marked = mineOn ? (mine.found!.has(partById.get(id)?.en ?? "") ? mineMaterial(base) : DIM) : base;
        mesh.material = s.flash.get(id) ?? (id === selected ? selectedMaterial(base) : marked);
      }
    s.render();
  }, [visible, seeThrough, hidden, isolated, selected, loaded, quiz, mineOn, mine.found, partById]);

  // ---------- Separar piezas y desmontar en filas ----------
  const place = useCallback(() => {
    const s = three.current;
    if (!s) return;
    const t = rowsT.current;
    for (const meshes of s.meshes.values())
      for (const mesh of meshes) {
        const base = mesh.userData.basePos as THREE.Vector3 | undefined;
        const dir = mesh.userData.explode as THREE.Vector3 | undefined;
        const grid = mesh.userData.grid as THREE.Vector3 | undefined;
        if (!base || !dir) continue;
        mesh.position.copy(base).addScaledVector(dir, explode * 0.8 * (1 - t));
        if (grid && t > 0) mesh.position.addScaledVector(grid, t);
      }
    s.render();
  }, [explode]);

  useEffect(place, [place, loaded]);

  /**
   * Coloca las piezas visibles en filas (primero los huesos, luego músculos, órganos…; de la cabeza a los pies),
   * cada una a su tamaño real, y encuadra la cámara. Devuelve el centro y el tamaño del conjunto.
   */
  const layoutRows = useCallback(() => {
    const s = three.current;
    if (!s) return null;
    for (const meshes of s.meshes.values())
      for (const mesh of meshes) if (mesh.userData.basePos) mesh.position.copy(mesh.userData.basePos as THREE.Vector3);
    s.scene.updateMatrixWorld(true);
    const items: { meshes: THREE.Mesh[]; box: THREE.Box3; order: number }[] = [];
    for (const [id, meshes] of s.meshes) {
      const layer = meshes[0].userData.layer as Layer;
      if (!visible[layer] || hidden.has(id) || (isolated && id !== isolated)) continue;
      const box = new THREE.Box3();
      for (const m of meshes) box.expandByObject(m);
      items.push({ meshes, box, order: LAYERS.indexOf(layer) });
    }
    const c = (b: THREE.Box3) => b.getCenter(new THREE.Vector3());
    items.sort((a, b) => a.order - b.order || c(b.box).y - c(a.box).y || c(a.box).x - c(b.box).x);
    const W = Math.max(
      1.6,
      Math.sqrt(
        items.reduce((sum, i) => {
          const z = i.box.getSize(new THREE.Vector3());
          return sum + (z.x + 0.02) * (z.y + 0.02);
        }, 0),
      ) * 1.6,
    );
    const gap = 0.02;
    let x = 0;
    let y = 0;
    let rowH = 0;
    let lastOrder = items[0]?.order ?? 0;
    const placed: { meshes: THREE.Mesh[]; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
    for (const it of items) {
      const size = it.box.getSize(new THREE.Vector3());
      // Cada capa empieza fila nueva; y una fila se cierra cuando ya no cabe la pieza.
      if (x > 0 && (x + size.x > W || it.order !== lastOrder)) {
        y -= rowH + gap * (it.order !== lastOrder ? 4 : 1);
        x = 0;
        rowH = 0;
      }
      lastOrder = it.order;
      placed.push({
        meshes: it.meshes,
        from: c(it.box),
        to: new THREE.Vector3(x + size.x / 2 - W / 2, y - size.y / 2, 0),
      });
      x += size.x + gap;
      rowH = Math.max(rowH, size.y);
    }
    const height = -(y - rowH);
    // El conjunto, centrado donde estaba el cuerpo.
    const shift = new THREE.Vector3(0, BODY_CENTER.y + height / 2, 0);
    for (const p of placed) {
      const to = p.to.add(shift);
      for (const mesh of p.meshes) {
        const parent = mesh.parent!;
        mesh.userData.grid = parent.worldToLocal(to.clone()).sub(parent.worldToLocal(p.from.clone()));
      }
    }
    // Las que no se colocan (ocultas o de capas apagadas) se quedan donde están.
    const moving = new Set(placed.flatMap((p) => p.meshes));
    for (const meshes of s.meshes.values()) for (const m of meshes) if (!moving.has(m)) m.userData.grid = undefined;
    return { width: W, height };
  }, [visible, hidden, isolated]);

  function frameRows(box: { width: number; height: number }) {
    const s = three.current;
    if (!s) return;
    const fov = (s.camera.fov * Math.PI) / 180;
    const fit = Math.max(box.height, box.width / s.camera.aspect) / (2 * Math.tan(fov / 2));
    // Con muchas piezas en filas hay que alejarse más de lo normal.
    s.controls.maxDistance = Math.max(6, fit * 1.6);
    s.controls.target.copy(BODY_CENTER);
    s.camera.position.set(0, BODY_CENTER.y, fit * 1.08 + 0.2);
    s.controls.update();
  }

  function animateRows(on: boolean) {
    const from = rowsT.current;
    const to = on ? 1 : 0;
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 900);
      rowsT.current = from + (to - from) * (1 - Math.pow(1 - k, 3));
      place();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  function toggleRows() {
    const on = !rows;
    setRows(on);
    if (on) {
      setExplode(0);
      const box = layoutRows();
      if (box) frameRows(box);
    } else {
      const s = three.current;
      s?.controls.target.set(0, 0.9, 0);
      s?.camera.position.set(0, 0.95, 3.6);
    }
    animateRows(on);
  }

  // Si cambian las capas o las piezas ocultas con las filas puestas, se vuelven a colocar.
  useEffect(() => {
    if (!rows) return;
    const box = layoutRows();
    if (box) frameRows(box);
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar lo que se ve
  }, [rows, layoutRows, loaded]);

  // ---------- Tocar y pasar el ratón ----------
  const pick = useCallback(
    (clientX: number, clientY: number): string | null => {
      const s = three.current;
      if (!s) return null;
      const rect = s.renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointer, s.camera);
      const targets = [...s.meshes.values()]
        .flat()
        .filter((m) => m.visible && s.groups[m.userData.layer as Layer]?.visible);
      // Con los músculos transparentes, se puede tocar lo que hay detrás.
      const hits = ray.intersectObjects(targets, false);
      const hit = seeThrough ? (hits.find((h) => h.object.userData.layer !== "muscles") ?? hits[0]) : hits[0];
      return hit ? (hit.object.userData.id as string) : null;
    },
    [seeThrough],
  );

  useEffect(() => {
    const el = three.current?.renderer.domElement;
    if (!el) return;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      down = null;
      const id = pick(e.clientX, e.clientY);
      if (quiz && !quiz.answered) {
        if (!id) return;
        answerQuiz(id);
        return;
      }
      setSelected(id);
    };
    let last = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons) return setHover(null);
      const now = performance.now();
      if (now - last < 60) return;
      last = now;
      const id = pick(e.clientX, e.clientY);
      const rect = el.getBoundingClientRect();
      setHover(id ? { x: e.clientX - rect.left, y: e.clientY - rect.top, id } : null);
    };
    const onLeave = () => setHover(null);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  });

  // ---------- Acercar la cámara a una pieza ----------
  function focus(id: string, distance = 3.2) {
    const s = three.current;
    const meshes = s?.meshes.get(id);
    if (!s || !meshes) return;
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.05);
    const dir = s.camera.position.clone().sub(s.controls.target).normalize();
    const from = { target: s.controls.target.clone(), pos: s.camera.position.clone() };
    const to = { target: center, pos: center.clone().add(dir.multiplyScalar(size * distance + 0.15)) };
    const start = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - start) / 600);
      const e = 1 - Math.pow(1 - k, 3);
      s.controls.target.lerpVectors(from.target, to.target, e);
      s.camera.position.lerpVectors(from.pos, to.pos, e);
      s.render();
      if (k < 1) requestAnimationFrame(step);
    };
    step();
  }

  function resetView() {
    const s = three.current;
    if (!s) return;
    s.controls.target.set(0, 0.9, 0);
    s.camera.position.set(0, 0.95, 3.6);
    setHidden(new Set());
    setIsolated(null);
    setExplode(0);
    setRows(false);
    rowsT.current = 0;
    setSelected(null);
    s.render();
  }

  function toggleLayer(layer: Layer) {
    if (!loaded[layer]) loadLayer(layer);
    setVisible((v) => ({ ...v, [layer]: !v[layer] }));
  }

  // ---------- Modo examen ----------
  function quizCandidates() {
    const seen = new Set<string>();
    return parts.filter((p) => {
      if (!visible[p.layer] || !loaded[p.layer] || hidden.has(p.id) || seen.has(p.en)) return false;
      if (mineOn && !mine.found!.has(p.en)) return false;
      // Fuera las piezas pequeñas o escondidas que no se pueden tocar bien.
      if (
        /cells of ethmoid|incus|malleus|stapes|sesamoid|tarsus|trochlea|ring|cartilage|tooth|incisor|canine|premolar|phalanx|arytenoid|intertransvers|interspinal|rotatores|levatores|tendinous|branch|digital|leaflet|papillary|segmental|nucleus|tract|fasciculus|commissure|stria|lobule|duct|canaliculus|ganglion|root/i.test(
          p.en,
        )
      )
        return false;
      seen.add(p.en);
      return true;
    });
  }

  function nextQuestion() {
    const list = quizCandidates();
    if (list.length === 0) {
      if (mineOn) alert(ta.mineQuizEmpty);
      return;
    }
    const target = list[Math.floor(Math.random() * list.length)].id;
    three.current?.flash.clear();
    setSelected(null);
    setQuiz({ target, answered: null });
  }

  function answerQuiz(id: string) {
    const s = three.current;
    if (!s || !quiz) return;
    const target = partById.get(quiz.target)!;
    const tapped = partById.get(id)!;
    // Vale cualquiera de los dos lados (izquierdo o derecho).
    const ok = tapped.en === target.en;
    s.flash.clear();
    const mark = (pid: string, color: string) =>
      s.flash.set(pid, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    if (ok) mark(id, COLORS.right);
    else {
      mark(id, COLORS.wrong);
      for (const p of parts) if (p.en === target.en) mark(p.id, COLORS.right);
      // Se acerca la cámara a la pieza correcta para que la vea.
      focus(quiz.target);
    }
    setScore((sc) => ({ ok: sc.ok + (ok ? 1 : 0), total: sc.total + 1 }));
    setQuiz({ ...quiz, answered: { ok, tapped: id } });
  }

  function stopQuiz() {
    three.current?.flash.clear();
    setQuiz(null);
    setScore({ ok: 0, total: 0 });
  }

  // ---------- En mis apuntes ----------
  async function toggleMine() {
    if (mine.on) return setMine((m) => ({ ...m, on: false }));
    if (mine.found) return setMine((m) => ({ ...m, on: true }));
    if (!subjectId) return;
    setMine((m) => ({ ...m, on: true, loading: true, error: "" }));
    // Se manda cada pieza una vez (sin lados), con su nombre en los dos idiomas.
    const unique = [...new Set(parts.map((p) => p.en))];
    try {
      const r = await api.post<{ documents: number; found: string[] }>("/atlas/mentions", {
        subject_id: subjectId,
        parts: unique.map((en) => ({ key: en, terms: [translate(en, "es"), translate(en, "pt")] })),
      });
      setMine({ on: true, loading: false, found: new Set(r.found), docs: r.documents, error: "" });
    } catch (err) {
      setMine({ on: false, loading: false, found: null, docs: 0, error: errorMessage(err) });
    }
  }

  // Piezas de sus apuntes que están en capas aún apagadas (para poder activarlas).
  const mineLayers = useMemo(() => {
    if (!mine.found) return [];
    const count = new Map<Layer, number>();
    const seen = new Set<string>();
    for (const p of parts)
      if (mine.found.has(p.en) && !seen.has(p.en)) {
        seen.add(p.en);
        count.set(p.layer, (count.get(p.layer) ?? 0) + 1);
      }
    return LAYERS.filter((l) => count.has(l)).map((l) => ({ layer: l, n: count.get(l)! }));
  }, [mine.found, parts]);

  // ---------- Buscador ----------
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    const seen = new Set<string>();
    return parts
      .filter((p) => {
        const hay = normalize(`${translate(p.en, lang)} ${translate(p.en, lang === "es" ? "pt" : "es")} ${p.en}`);
        if (!hay.includes(q) || seen.has(p.en)) return false;
        seen.add(p.en);
        return true;
      })
      .slice(0, 8);
  }, [query, parts, lang]);

  function choose(id: string) {
    const p = partById.get(id)!;
    if (!visible[p.layer]) setVisible((v) => ({ ...v, [p.layer]: true }));
    setHidden((h) => {
      const n = new Set(h);
      n.delete(id);
      return n;
    });
    setQuery("");
    setSelected(id);
    if (three.current?.meshes.has(id)) focus(id);
    else {
      pending.current = id;
      loadLayer(p.layer);
    }
  }

  const sel = selected ? partById.get(selected) : null;

  async function loadInfo(en: string) {
    setShowInfo(true);
    const key = `${lang}:${en}`;
    if (infos[key] && infos[key] !== "error") return;
    try {
      const saved = localStorage.getItem(`atlas-info:${key}`);
      if (saved) return setInfos((m) => ({ ...m, [key]: JSON.parse(saved) as Info }));
    } catch {
      /* sin almacenamiento: se pide al servidor */
    }
    setInfos((m) => ({ ...m, [key]: "loading" }));
    try {
      const info = await api.post<Info>("/atlas/info", { en, name: translate(en, lang), lang });
      setInfos((m) => ({ ...m, [key]: info }));
      try {
        localStorage.setItem(`atlas-info:${key}`, JSON.stringify(info));
      } catch {
        /* sin almacenamiento */
      }
    } catch {
      setInfos((m) => ({ ...m, [key]: "error" }));
    }
  }
  const info = sel ? infos[`${lang}:${sel.en}`] : undefined;
  const other: AtlasLang = lang === "es" ? "pt" : "es";
  // La pregunta se deja preparada para el chat (la lee al abrirse).
  const ask = () => {
    if (!sel) return;
    try {
      sessionStorage.setItem("chat-draft", ta.askQuestion(translate(sel.en, lang)));
    } catch {
      /* sin almacenamiento: se abre el chat vacío */
    }
  };

  return (
    <div className="space-y-3">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        {LAYERS.map((layer) => (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            aria-pressed={visible[layer]}
            className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${
              visible[layer] ? "border-accent bg-accent-soft text-accent" : "border-border"
            }`}
          >
            {ICONS[layer]} {ta.layers[layer]}
            {loading === layer && " …"}
          </button>
        ))}
        {visible.muscles && (
          <label className="flex min-h-10 items-center gap-2 px-2 text-sm">
            <input type="checkbox" checked={seeThrough} onChange={(e) => setSeeThrough(e.target.checked)} />
            {ta.seeThrough}
          </label>
        )}
        {!rows && (
          <label className="flex min-h-10 items-center gap-2 px-2 text-sm">
            {ta.explode}
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={explode}
              onChange={(e) => setExplode(Number(e.target.value))}
              className="w-28 accent-[var(--accent)]"
            />
          </label>
        )}
        <button
          onClick={toggleRows}
          aria-pressed={rows}
          disabled={parts.length === 0}
          className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${
            rows ? "border-accent bg-accent-soft text-accent" : "border-border"
          }`}
        >
          {rows ? ta.rowsOff : ta.rowsOn}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          {subjectId && (
            <button
              className={`min-h-10 rounded-full border-2 px-4 text-sm font-semibold ${mine.on ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-border"}`}
              onClick={toggleMine}
              aria-pressed={mine.on}
              disabled={parts.length === 0 || mine.loading}
            >
              {ta.mine}
            </button>
          )}
          {quiz ? (
            <button className="btn-ghost min-h-10 text-sm" onClick={stopQuiz}>
              <X size={18} aria-hidden="true" /> {ta.quizStop}
            </button>
          ) : (
            <button className="btn-secondary min-h-10 text-sm" onClick={nextQuestion} disabled={parts.length === 0}>
              <Question size={18} weight="duotone" aria-hidden="true" /> {ta.quiz}
            </button>
          )}
          <button
            className="btn-ghost min-h-10 px-3 text-sm"
            onClick={resetView}
            aria-label={ta.reset}
            title={ta.reset}
          >
            <ArrowsClockwise size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {mine.error && <p className="text-danger text-sm">{mine.error}</p>}
      {mine.on && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30" role="status">
          {mine.loading || !mine.found ? (
            ta.mineLoading
          ) : mine.docs === 0 ? (
            ta.mineNoDocs
          ) : (
            <>
              <p>{ta.mineCount(mine.found.size)}</p>
              {mineLayers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mineLayers.map(({ layer, n }) => (
                    <button
                      key={layer}
                      onClick={() => !visible[layer] && toggleLayer(layer)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${visible[layer] ? "bg-amber-200 text-amber-900" : "border border-amber-400"}`}
                    >
                      {ICONS[layer]} {ta.layers[layer]} · {n}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!quiz && (
        <div className="relative">
          <MagnifyingGlass
            size={18}
            className="text-muted absolute top-1/2 left-3 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            className="input pl-10"
            placeholder={ta.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={ta.search}
          />
          {results.length > 0 && (
            <ul className="card absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto p-1 shadow-lg">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    className="hover:bg-surface-2 w-full rounded-lg px-3 py-2 text-left text-sm"
                    onClick={() => choose(p.id)}
                  >
                    <span className="font-medium">{translate(p.en, lang)}</span>
                    <span className="text-muted"> · {ta.layers[p.layer]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {quiz && (
        <div className="bg-accent-soft flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" role="status">
          <div>
            <p className="text-sm font-semibold">{ta.quizScore(score.ok, score.total)}</p>
            <p className="font-display text-lg font-bold">{ta.quizAsk(nameOf(quiz.target))}</p>
            {!quiz.answered ? null : quiz.answered.ok ? (
              <p className="font-display text-success text-lg font-bold">{ta.quizRight}</p>
            ) : (
              <p className="font-semibold">
                <span className="text-danger">{ta.quizWrong(nameOf(quiz.answered.tapped))}</span> {ta.quizShown}
              </p>
            )}
          </div>
          {quiz.answered && (
            <button className="btn-primary" onClick={nextQuestion}>
              {ta.quizNext}
            </button>
          )}
        </div>
      )}

      {/* Visor */}
      <div className="card relative h-[68dvh] min-h-[420px] overflow-hidden p-0">
        <div ref={mountRef} className="h-full w-full touch-none select-none" />
        {(loading || parts.length === 0) && !error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="bg-surface/90 rounded-full px-4 py-2 text-sm font-medium shadow">
              {loading === "muscles"
                ? ta.loadingMuscles
                : loading && loading !== "bones"
                  ? ta.loadingLayer(ta.layers[loading])
                  : ta.loading}
            </span>
          </div>
        )}
        {error && <p className="bg-danger-soft absolute inset-x-4 top-4 rounded-xl p-3 text-sm">{error}</p>}
        {hover && !quiz && (
          <span
            className="bg-text text-surface pointer-events-none absolute z-10 rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap shadow"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            {nameOf(hover.id)}
          </span>
        )}
        {!sel && !quiz && parts.length > 0 && (
          <p className="text-muted pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs">{ta.hint}</p>
        )}

        {/* Ficha de la pieza tocada */}
        {sel && !quiz && (
          <div className="bg-surface/95 absolute inset-x-3 bottom-3 max-h-[60%] overflow-y-auto rounded-2xl p-4 shadow-lg backdrop-blur sm:right-auto sm:left-3 sm:w-96">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-lg leading-tight font-bold">{translate(sel.en, lang)}</p>
                <p className="text-muted mt-0.5 text-xs">
                  {[ta.layers[sel.layer], sel.side ? `${ta.side} ${sideLabel(sel.side, lang)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {other.toUpperCase()}: {translate(sel.en, other)} · EN: {sel.en}
                </p>
              </div>
              <button
                className="btn-ghost min-h-8 px-2"
                onClick={() => {
                  setSelected(null);
                  setShowInfo(false);
                }}
                aria-label={t.common.close}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={`${showInfo ? "btn-secondary" : "btn-primary"} min-h-9 px-3 text-sm`}
                onClick={() => (showInfo ? setShowInfo(false) : loadInfo(sel.en))}
                aria-expanded={showInfo}
              >
                {ta.info}
              </button>
              <button
                className="btn-secondary min-h-9 px-3 text-sm"
                onClick={() => {
                  setIsolated(sel.id);
                  // Más lejos que "Acercar": la pieza sola, entera y con sitio para la ficha.
                  focus(sel.id, 7);
                  setShowInfo(false);
                }}
              >
                <Crosshair size={16} aria-hidden="true" /> {ta.isolate}
              </button>
              <Link href="/chat" onClick={ask} className="btn-secondary min-h-9 px-3 text-sm">
                {ta.explain}
              </Link>
              <button className="btn-secondary min-h-9 px-3 text-sm" onClick={() => focus(sel.id)}>
                <MagnifyingGlass size={16} aria-hidden="true" /> {ta.zoom}
              </button>
              <button
                className="btn-ghost min-h-9 px-3 text-sm"
                onClick={() => {
                  setHidden((h) => new Set(h).add(sel.id));
                  setSelected(null);
                }}
              >
                <EyeSlash size={16} aria-hidden="true" /> {ta.hide}
              </button>
            </div>
            {showInfo && (
              <div className="mt-3 space-y-2 text-sm">
                {info === "loading" || !info ? (
                  <p className="text-muted">{ta.infoLoading}</p>
                ) : info === "error" ? (
                  <p className="text-danger">{ta.loadError}</p>
                ) : (
                  INFO_FIELDS.filter((f) => info[f]?.trim()).map((f) => (
                    <div key={f}>
                      <p className="text-accent text-[11px] font-bold tracking-wide uppercase">{ta.infoFields[f]}</p>
                      <p>{info[f]}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
        {isolated && !quiz && (
          <button
            className="bg-surface/95 absolute top-3 left-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow"
            onClick={() => setIsolated(null)}
          >
            <Eye size={14} aria-hidden="true" /> {ta.showAll}
          </button>
        )}
        {hidden.size > 0 && !quiz && (
          <button
            className="bg-surface/95 absolute top-3 right-3 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow"
            onClick={() => setHidden(new Set())}
          >
            <Eye size={14} aria-hidden="true" /> {ta.showHidden(hidden.size)}
          </button>
        )}
      </div>

      <p className="text-muted text-xs">{ta.credits}</p>
    </div>
  );
}

// Un material por color y capa (se comparten: así hay pocos y se cambian todos a la vez).
const musclePalette = new Map<string, THREE.MeshStandardMaterial>();
const otherPalette = new Map<string, THREE.MeshStandardMaterial>();
function partMaterial(layer: Layer, en: string) {
  const color = partColor(layer, en);
  const palette = layer === "muscles" ? musclePalette : otherPalette;
  let m = palette.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, transparent: layer === "muscles" });
    palette.set(color, m);
  }
  return m;
}

// "En mis apuntes": lo que sale se ve con su color y un brillo ámbar; el resto, casi transparente.
const DIM = new THREE.MeshStandardMaterial({ color: "#9ca3af", transparent: true, opacity: 0.12, depthWrite: false });
const mineCache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
function mineMaterial(base: THREE.MeshStandardMaterial) {
  let m = mineCache.get(base);
  if (!m) {
    m = base.clone();
    m.opacity = 1;
    m.transparent = false;
    m.depthWrite = true;
    m.emissive.set(COLORS.mine);
    m.emissiveIntensity = 0.35;
    mineCache.set(base, m);
  }
  return m;
}

const highlightCache = new WeakMap<THREE.Material, THREE.MeshStandardMaterial>();
function selectedMaterial(base: THREE.MeshStandardMaterial) {
  let m = highlightCache.get(base);
  if (!m) {
    m = base.clone();
    m.color.set(COLORS.selected);
    m.opacity = 1;
    m.transparent = false;
    m.depthWrite = true;
    m.emissive.set("#5b0f33");
    highlightCache.set(base, m);
  }
  return m;
}
