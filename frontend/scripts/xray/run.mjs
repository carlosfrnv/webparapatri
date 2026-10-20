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
    const data = await page.evaluate((ex) => window.run(ex), EXAMS);
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(__dirname, "drr-raw.json"), JSON.stringify(data));
    console.log("ok", Object.keys(data));
  });
