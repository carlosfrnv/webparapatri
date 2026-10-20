// Genera los mapas de grosor del simulador de rayos X a partir de los modelos del atlas.
// Uso (desde frontend/): node scripts/xray/run.mjs   y después   python3 scripts/xray/finish.py
// Abre drr.html en Chromium (PLAYWRIGHT=ruta de otra instalación de Playwright, si hace falta) y guarda
// scripts/xray/drr-raw.json; finish.py lo convierte en public/xray/<id>.png y meta.json.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT ?? "playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const root = path.resolve(__dirname, "../..");
const EXAMS = [
  {
    id: "mano",
    bones: "(finger of hand|metacarpal|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate).*\\.r$",
    include:
      "(hand|finger|thumb|pollicis|digit|interosse|lumbrical|palmar|thenar|metacarp|carp|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate|Radius|Ulna|forearm|flexor|extensor|pronator|brachioradialis|radial|ulnar).*\\.r$",
    w: 300,
    h: 400,
    margin: 1.12,
  },
  { id: "rodilla", bones: "^(Patella\\.r)$", w: 300, h: 400, margin: 2.6 },
  { id: "torax", bones: "(rib|Sternum|Clavicle|Vertebra T)", w: 340, h: 400, margin: 1.12, dy: -0.02 },
  { id: "pelvis", bones: "(Hip bone|Sacrum|Coccyx|Vertebra L5)", w: 400, h: 320, margin: 1.15 },
];

// Posicionamiento (node scripts/xray/run.mjs pos): cada región girada cada 5°, con un campo fijo en cm,
// los puntos de centraje y la zona que debe salir. Se guarda en scripts/xray/pos-raw/ (ver finish-pos.py).
const ARMS =
  "(Humerus|Radius|Ulna|hand|finger|carp|metacarp|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate|biceps|triceps|brachi|deltoid|forearm|pronator|supinator|anconeus|coracobrachialis|palmar|thenar|lumbrical|interosse|pollicis)";
const HAND_BONES = "(finger of hand|metacarpal|Scaphoid|Lunate|Triquetr|Pisiform|Trapezi|Capitate|Hamate).*\\.r$";
const range = (a, b) => Array.from({ length: (b - a) / 5 + 1 }, (_, i) => a + i * 5);
const REGIONS = [
  {
    region: "torax",
    angles: [...range(-20, 20), ...range(70, 110)],
    spec: {
      bones: "(rib|Sternum|Clavicle|Vertebra T)",
      exclude: ARMS,
      fieldCm: 70,
      w: 560,
      h: 560,
      points: {
        t7: { re: "^Vertebra T7$" },
        lungsT7: { re: "lobe of (right|left) lung", layer: "organs", yFrom: "^Vertebra T7$" },
      },
      rois: { lungs: [{ re: "lobe of (right|left) lung", layer: "organs" }] },
    },
  },
  {
    region: "mano",
    angles: range(-10, 60),
    spec: {
      bones: HAND_BONES,
      include: EXAMS[0].include,
      fieldCm: 34,
      w: 400,
      h: 400,
      points: { mcp3: { re: "^Third metacarpal bone\\.r$", y: "min" } },
      rois: { hand: [{ re: HAND_BONES }] },
    },
  },
  {
    region: "rodilla",
    angles: [...range(-15, 15), ...range(75, 105)],
    spec: {
      bones: "^Patella\\.r$",
      include: "\\.r$",
      fieldCm: 44,
      w: 400,
      h: 400,
      points: { apex: { re: "^Patella\\.r$", y: "min", dyCm: -1.5 }, joint: { re: "^Tibia\\.r$", y: "max" } },
      rois: { patella: [{ re: "^Patella\\.r$" }] },
    },
  },
  {
    region: "pelvis",
    angles: range(-20, 20),
    spec: {
      bones: "(Hip bone|Sacrum)",
      exclude: ARMS,
      fieldCm: 60,
      w: 480,
      h: 480,
      points: { center: { re: "Hip bone", y: "min", dyCm: 9 } },
      rois: { pelvis: [{ re: "(Hip bone|Sacrum)" }] },
    },
  },
];
const POS = process.argv[2] === "pos";

const server = http
  .createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end();
    const type = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".html")
        ? "text/html"
        : "application/octet-stream";
    res.writeHead(200, { "content-type": type }).end(fs.readFileSync(file));
  })
  .listen(0, async () => {
    const port = server.address().port;
    const browser = await chromium.launch({
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    });
    const page = await browser.newPage();
    page.on("console", (m) => console.log("[page]", m.text()));
    page.on("pageerror", (e) => console.log("[error]", e.message));
    await page.goto(`http://localhost:${port}/scripts/xray/drr.html`);
    await page.waitForFunction(() => window.ready, null, { timeout: 60000 });
    if (POS) {
      const dir = path.join(__dirname, "pos-raw");
      fs.mkdirSync(dir, { recursive: true });
      // node scripts/xray/run.mjs pos [región…] para generar solo algunas.
      const only = process.argv.slice(3);
      for (const r of REGIONS.filter((x) => !only.length || only.includes(x.region))) {
        const exams = r.angles.map((a) => ({ ...r.spec, id: `${r.region}_${a}`, azimuth: a, compact: true }));
        const data = await page.evaluate((ex) => window.run(ex), exams);
        for (const [id, v] of Object.entries(data)) fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(v));
        console.log("ok", r.region, Object.keys(data).length);
      }
    } else {
      const data = await page.evaluate((ex) => window.run(ex), EXAMS);
      fs.writeFileSync(path.join(__dirname, "drr-raw.json"), JSON.stringify(data));
      console.log("ok", Object.keys(data));
    }
    await browser.close();
    server.close();
  });
