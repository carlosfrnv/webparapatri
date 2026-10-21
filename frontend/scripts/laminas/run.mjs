// Genera las láminas de anatomía (public/laminas/<id>.png y laminas.json) a partir del atlas 3D.
// Uso (desde frontend/): node scripts/laminas/run.mjs [id…]
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "public/laminas");

// Cada lámina: capas del atlas, qué piezas entran, desde dónde se mira y cuáles llevan nombre.
const SKULL = "Parietal bone|Frontal bone|Occipital bone|Sphenoid bone|Temporal bone|Ethmoid bone|Lacrimal bone|Nasal bone|Maxilla|Zygomatic bone|Mandible|Vomer|Palatine bone|Inferior nasal concha";
const HAND = "(phalanx of .* finger of hand|metacarpal bone|Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate)";
const FOOT = "(Talus|Calcaneus|Navicular|Cuboid|cuneiform|metatarsal|phalanx of .* finger of foot)";
export const PLATES = [
  {
    id: "corazon",
    layers: ["vessels"],
    include:
      "atrium|ventricle|aorta|pulmonary|vena cava|coronary|brachiocephalic|subclavian|common carotid|cardiac vein|coronary sinus",
    exclude: "papillary|leaflet|abdominal|valve",
    zoom: 0.62,
    elevation: 5,
  },
  {
    id: "esqueleto",
    layers: ["bones"],
    exclude: "cartilage|disc|sinus|cells of ethmoid",
    label:
      "^(Frontal bone|Parietal bone\\.l|Mandible|Maxilla\\.l|Zygomatic bone\\.l|Clavicle\\.l|Scapula\\.l|Sternum|Humerus\\.l|Radius\\.l|Ulna\\.l|Hip bone\\.l|Sacrum|Femur\\.l|Patella\\.l|Tibia\\.l|Fibula\\.l|Calcaneus\\.l|Talus\\.l|Seventh rib\\.l|First rib\\.l|Vertebra L3|Vertebra C4|Vertebra T8|Coccyx|Third metacarpal bone\\.l|First metatarsal bone\\.l)$",
    w: 700,
    h: 1300,
    zoom: 1.0,
    minArea: 60,
  },
  {
    id: "craneo-frontal",
    layers: ["bones"],
    include: SKULL,
    exclude: "sinus|cells",
    frame: "Frontal bone|Mandible|Parietal",
    zoom: 0.8,
    minArea: 80,
  },
  {
    id: "craneo-lateral",
    layers: ["bones"],
    include: SKULL + "|Hyoid|Atlas|Axis|Vertebra C[3-4]",
    exclude: "sinus|cells",
    frame: "Frontal bone|Mandible|Parietal|Occipital",
    azimuth: 90,
    zoom: 0.78,
    minArea: 80,
  },
  {
    id: "mano",
    layers: ["bones"],
    include: `${HAND}.*\\.r$|^(Radius|Ulna)\\.r$`,
    frame: `${HAND}.*\\.r$`,
    up: [0, -1, 0], // dedos hacia arriba, como en los libros
    w: 800,
    h: 1000,
    zoom: 0.92,
    minArea: 60,
  },
  {
    id: "pie",
    layers: ["bones"],
    include: `${FOOT}.*\\.r$`,
    frame: `${FOOT}.*\\.r$`,
    elevation: 88,
    up: [0, 0, 1],
    w: 800,
    h: 1000,
    zoom: 0.92,
    minArea: 60,
  },
  {
    id: "columna",
    layers: ["bones"],
    include: "Vertebra|Atlas|Axis|Sacrum|Coccyx",
    azimuth: 90,
    w: 600,
    h: 1400,
    zoom: 0.98,
    minArea: 60,
  },
  {
    id: "pulmones",
    layers: ["organs"],
    include: "lobe of (right|left) lung|^Trachea$|main bronchus|^Larynx|Thyroid gland|Epiglottis",
    frame: "lung|Trachea",
    zoom: 0.72,
  },
  {
    id: "abdomen",
    layers: ["organs"],
    include:
      "^Liver$|Gallbladder|Stomach|Pancreas$|Duodenum|Jejunum|appendix|colon|^Kidney|Suprarenal gland|Urinary bladder|Oesophagus|^Ureter",
    zoom: 0.62,
    minArea: 150,
  },
  {
    id: "musculos-brazo",
    layers: ["muscles", "bones"],
    include:
      "(deltoid|biceps brachii|brachialis|triceps|coracobrachialis|brachioradialis|pronator teres|flexor carpi|extensor carpi|palmaris longus|flexor digitorum superficialis|pectoralis major|Clavicle|Humerus|Radius|Ulna|Scapula).*\\.r$",
    frame: "^(Humerus|Radius|Ulna)\\.r$",
    w: 700,
    h: 1200,
    zoom: 0.95,
    minArea: 120,
  },
  {
    id: "musculos-pierna",
    layers: ["muscles", "bones"],
    include:
      "(gluteus medius|sartorius|rectus femoris|vastus|gracilis|adductor longus|pectineus|tensor fasciae|iliacus|psoas major|tibialis anterior|fibularis longus|gastrocnemius|soleus|extensor digitorum longus|Femur|Tibia|Fibula|Patella|Hip bone).*\\.r$",
    frame: "^(Femur|Tibia|Hip bone)\\.r$",
    w: 700,
    h: 1300,
    zoom: 0.95,
    minArea: 120,
  },
];

const only = process.argv.slice(2);
const plates = PLATES.filter((p) => !only.length || only.includes(p.id));

const server = http
  .createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream";
    res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
  })
  .listen(0, async () => {
    const browser = await chromium.launch({
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage();
    page.on("console", (m) => console.log("[page]", m.text()));
    page.on("pageerror", (e) => console.log("[error]", e.message));
    await page.goto(`http://localhost:${server.address().port}/scripts/laminas/lamina.html`);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    const data = await page.evaluate((p) => window.run(p), plates);
    fs.mkdirSync(outDir, { recursive: true });
    const metaFile = path.join(outDir, "laminas.json");
    const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
    for (const [id, v] of Object.entries(data)) {
      fs.writeFileSync(path.join(outDir, `${id}.png`), Buffer.from(v.image.split(",")[1], "base64"));
      meta[id] = { w: v.w, h: v.h, parts: v.parts };
      console.log("ok", id, v.parts.length, "estructuras");
    }
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    await browser.close();
    server.close();
  });
