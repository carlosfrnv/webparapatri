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
  // ---------- Huesos ----------
  {
    id: "esqueleto-posterior",
    layers: ["bones"],
    exclude: "cartilage|disc|sinus|cells of ethmoid",
    label:
      "^(Occipital bone|Parietal bone\\.r|Scapula\\.r|Humerus\\.r|Radius\\.r|Ulna\\.r|Hip bone\\.r|Sacrum|Coccyx|Femur\\.r|Tibia\\.r|Fibula\\.r|Calcaneus\\.r|Vertebra C7|Vertebra T6|Vertebra T12|Vertebra L4|Twelfth rib\\.r|Eighth rib\\.r|Clavicle\\.r)$",
    azimuth: 180,
    w: 700,
    h: 1300,
    zoom: 1.0,
    minArea: 60,
  },
  {
    id: "craneo-inferior",
    layers: ["bones"],
    include: SKULL,
    exclude: "sinus|cells|Mandible",
    frame: "Occipital bone|Maxilla|Temporal bone",
    elevation: -88,
    up: [0, 0, 1],
    zoom: 0.8,
    minArea: 60,
  },
  {
    id: "torax-oseo",
    layers: ["bones"],
    include: "rib|Sternum|Clavicle|Vertebra T|Scapula",
    label: "(rib\\.l|Sternum|Clavicle\\.l|Scapula\\.l|Vertebra T1$|Vertebra T12|Costal cartilage of (first|seventh|tenth) rib\\.l)",
    zoom: 0.75,
    minArea: 80,
  },
  {
    id: "miembro-superior-oseo",
    layers: ["bones"],
    include: `^(Clavicle|Scapula|Humerus|Radius|Ulna)\\.r$|${HAND}.*\\.r$`,
    label: "^(Clavicle|Scapula|Humerus|Radius|Ulna)\\.r$|^(Third metacarpal bone|Scaphoid bone|Proximal phalanx of third finger of hand)\\.r$",
    w: 600,
    h: 1300,
    zoom: 0.95,
    minArea: 60,
  },
  {
    id: "pelvis-osea",
    layers: ["bones"],
    include: "Hip bone|Sacrum|Coccyx|Femur|Vertebra L[45]",
    frame: "Hip bone|Sacrum",
    zoom: 0.85,
    minArea: 80,
  },
  {
    id: "miembro-inferior-oseo",
    layers: ["bones"],
    include: `^(Hip bone|Femur|Patella|Tibia|Fibula)\\.r$|${FOOT}.*\\.r$`,
    label: "^(Hip bone|Femur|Patella|Tibia|Fibula|Talus|Calcaneus|First metatarsal bone|Navicular bone)\\.r$",
    w: 600,
    h: 1400,
    zoom: 1.0,
    minArea: 60,
  },
  // ---------- Corazón, vasos y sistemas ----------
  {
    id: "corazon-posterior",
    layers: ["vessels"],
    include:
      "atrium|ventricle|aorta|aortic arch|pulmonary|vena cava|coronary|brachiocephalic|subclavian|common carotid|cardiac vein|coronary sinus",
    exclude: "papillary|leaflet|abdominal|valve",
    azimuth: 180,
    zoom: 0.62,
    elevation: 5,
  },
  {
    id: "arterias",
    layers: ["vessels"],
    include: "arter|aorta|arch|trunk|carotid",
    exclude: "pulmonary|vein|vena|cerebral|branch|ciliary|ethmoidal|alveolar|labial|meningeal|palatine|septal|striate|digital|metacarpal|metatarsal|intercostal|lumbar|genicular|perforating|renal arteries",
    label:
      "^(Aortic arch|Ascending aorta|Thoracic aorta|Abdominal aorta|Brachiocephalic trunk|Left common carotid artery|Left subclavian artery|Axillary artery\\.l|Brachial artery\\.l|Radial artery\\.l|Ulnar artery\\.l|Coeliac trunk|Superior mesenteric artery|Left renal artery|Common iliac artery\\.l|External iliac artery\\.l|Internal iliac artery\\.l|Femoral artery\\.l|Popliteal artery\\.l|Anterior tibial artery\\.l|Posterior tibial artery\\.l|Dorsalis pedis artery\\.l|External carotid artery\\.l|Internal carotid artery\\.l|Vertebral artery\\.l|Deep femoral artery\\.l|Superficial palmar arch\\.l)$",
    w: 700,
    h: 1400,
    zoom: 1.0,
    minArea: 20,
  },
  {
    id: "venas",
    layers: ["vessels"],
    include: "vein|vena|sinus",
    exclude: "cardiac|pulmonary|digital|metacarpal|metatarsal|intercostal|lumbar|branch|coronary sinus|sinus of|dural|petrosal|sagittal|transverse sinus|sigmoid sinus|cavernous",
    label:
      "^(Superior vena cava|Inferior vena cava \\(thoracic part\\)|Inferior vena cava \\(abdominal part\\)|Left brachiocephalic vein|Internal jugular vein\\.l|External jugular vein\\.l|Subclavian vein\\.l|Left subclavian vein|Axillary vein\\.l|Cephalic vein\\.l|Basilic vein\\.l|Median cubital vein\\.l|Common iliac vein\\.l|External iliac vein\\.l|Femoral vein\\.l|Great saphenous vein\\.l|Small saphenous vein\\.l|Popliteal vein\\.l|Left renal vein|Hepatic portal vein|Azygos vein|Brachial veins\\.l)$",
    w: 700,
    h: 1400,
    zoom: 1.0,
    minArea: 20,
  },
  {
    id: "arterias-encefalo",
    layers: ["vessels"],
    include: "cerebral artery|communicating artery|Basilar artery|Vertebral artery|Internal carotid artery|cerebellar artery|Anterior spinal artery",
    exclude: "branch",
    frame: "cerebral artery|communicating|Basilar",
    elevation: -88,
    up: [0, 0, 1],
    zoom: 0.7,
    minArea: 30,
  },
  {
    id: "rinon-vias-urinarias",
    layers: ["organs", "vessels"],
    include: "Kidney|Renal pelvis|Ureter|Urinary bladder|Suprarenal gland|Abdominal aorta|Inferior vena cava \\(abdominal part\\)|renal artery|renal vein|Common iliac (artery|vein)",
    exclude: "Intrarenal|branch",
    frame: "Kidney|Urinary bladder|Ureter",
    zoom: 0.72,
    minArea: 60,
  },
  {
    id: "cabeza-cuello-visceras",
    layers: ["organs"],
    include: "Tongue|pharynx|Epiglottis|Larynx|Trachea|Oesophagus|Thyroid|parathyroid|Parotid|Submandibular gland|Sublingual gland|Soft palate|Uvula|Mucosa of nasal cavity|Gingiva",
    exclude: "duct|Mucosa of nasal cavity|Gingiva",
    frame: "Tongue|pharynx|Parotid|Thyroid|Larynx|nasal",
    azimuth: 90,
    zoom: 0.72,
    minArea: 60,
  },
  // ---------- Sistema nervioso ----------
  {
    id: "encefalo-lateral",
    layers: ["nerves"],
    include: "gyr|lobule|pole|Insula|Precuneus|Cuneus|cerebell|vermis|Pons|Medulla oblongata|Midbrain|Flocculus",
    exclude: "\.r$|sulcus\.|White matter|tract|fasciculus|horn|nucleus|canal|Spinal",
    label: "gyr|lobule|pole|Cerebell|vermis|Pons|Medulla oblongata",
    azimuth: 90,
    zoom: 0.72,
    minArea: 150,
  },
  {
    id: "encefalo-medial",
    layers: ["nerves"],
    include: "\\.r$|Corpus callosum|Hypothalamus|vermis|Fornix|commissure|Septal|Lingula of cerebellum|Aqueduct|Midbrain|Pons|Medulla oblongata|Thalamus|Pineal|Choroid plexus",
    exclude: "nerve|plexus of|branch|Retina|Sclera|eyeball|Vitreous|Lens|Iris|Cornea|chamber|Auditory|Tympanic|Vestibule|Cochlea|Lacrimal|Nasolacrimal|tract|horn|nucleus|fasciculus|root|ganglion|trunk|cord|Spinal|canal|White matter",
    label: "gyr|Corpus callosum|Thalamus|Hypothalamus|Fornix|Midbrain|Pons|Medulla oblongata|vermis|Cuneus|Precuneus|Lingula",
    azimuth: 90,
    zoom: 0.72,
    minArea: 150,
  },
  {
    id: "pares-craneales",
    layers: ["nerves"],
    include: "\\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\\)|Pons|Medulla oblongata|Midbrain|Optic chiasm|Olfactory bulb|Optic tract",
    frame: "Pons|Medulla oblongata|Midbrain|\\((III|V|VII)\\)",
    elevation: -88,
    up: [0, 0, 1],
    zoom: 0.72,
    minArea: 40,
  },
  {
    id: "plexo-braquial",
    layers: ["nerves", "bones"],
    include: "(brachial plexus|Musculocutaneous nerve|Axillary nerve|Radial nerve|Median nerve|Ulnar nerve|antebrachial cutaneous|interosseous nerve|Clavicle|Humerus|Radius|Ulna|Scapula).*\\.r$",
    exclude: "digital|Muscular branches|Palmar branch|Dorsal branch",
    label: "nerve|plexus|Clavicle|Humerus",
    frame: "Humerus|Radius|Clavicle",
    w: 600,
    h: 1300,
    zoom: 0.95,
    minArea: 40,
  },
  {
    id: "nervios-pierna",
    layers: ["nerves", "bones"],
    include: "(Sciatic nerve|Tibial nerve|Common fibular nerve|Superficial fibular nerve|Deep fibular nerve|Sural nerve|Femoral nerve|Obturator nerve|Saphenous nerve|Posterior femoral cutaneous|Superior gluteal nerve|plantar nerve|Hip bone|Femur|Tibia|Fibula|Sacrum).*",
    exclude: "\\.l$|digital|branch|root",
    label: "nerve|Femur|Tibia",
    frame: "Femur|Tibia|Hip bone",
    azimuth: 180,
    w: 600,
    h: 1400,
    zoom: 1.0,
    minArea: 40,
  },
  {
    id: "ojo",
    layers: ["nerves", "muscles"],
    include: "(Sclera|Cornea|Iris|rectus muscle|oblique muscle|Levator palpebrae|Optic nerve|Lacrimal gland|Trochlea of superior oblique|Common tendinous ring).*\\.r$",
    exclude: "capitis|abdominal",
    elevation: 88,
    up: [0, 0, 1],
    zoom: 1.0,
    minArea: 40,
  },
  {
    id: "oido",
    frame: "Cochlea|Vestibule|Tympanic|Malleus|Incus|Stapes|Semicircular",
    layers: ["nerves", "bones"],
    include: "(Cochlea|Vestibule|Semicircular|Tympanic membrane|Auditory tube|Malleus|Incus|Stapes|Vestibulocochlear|Cochlear nerve|Vestibular nerve|Facial nerve \\(VII\\)).*",
    exclude: "\\.l$",
    azimuth: 0,
    zoom: 0.6,
    minArea: 30,
  },
  // ---------- Músculos ----------
  {
    id: "musculos-cabeza",
    layers: ["muscles", "bones"],
    include: "(Frontalis|Occipitalis|Temporalis|masseter|Orbicularis|Zygomaticus|Buccinator|Bucinator|Risorius|Depressor|Levator labii|Levator anguli|Mentalis|Nasalis|Procerus|Corrugator|Sternocleidomastoid|Platysma|Temporoparietalis|orbicularis oculi|Mandible|Frontal bone|Parietal bone|Temporal bone|Occipital bone|Zygomatic bone|Maxilla|Nasal bone).*",
    exclude: "\\.r$",
    label: "muscle|Orbicularis|orbicularis|Platysma|Bucinator|Buccinator|masseter|Depressor|Levator|Risorius|Mentalis|Procerus|Corrugator",
    frame: "Frontal bone|Mandible|Occipital bone|Temporal bone",
    azimuth: 90,
    zoom: 0.78,
    minArea: 60,
  },
  {
    id: "musculos-tronco-anterior",
    layers: ["muscles", "bones"],
    include: "(pectoralis|Serratus anterior|Rectus abdominis|External abdominal oblique|deltoid|Sternocleidomastoid|trapezius|Latissimus|biceps brachii|Subclavius|Clavicle|Sternum|Humerus|Hip bone|rib\\b|Costal cartilage).*",
    label: "\\.l$",
    w: 900,
    h: 1000,
    zoom: 0.7,
    minArea: 150,
  },
  {
    id: "musculos-espalda",
    layers: ["muscles", "bones"],
    include: "(trapezius|Latissimus|Rhomboid|Infraspinatus|Supraspinatus|Teres|deltoid|Levator scapulae|Serratus posterior|External abdominal oblique|Gluteus|Splenius|Iliocostalis|Longissimus|Spinalis|triceps|Scapula|Humerus|Hip bone|Sacrum|Vertebra|Occipital bone).*",
    label: "\\.r$",
    azimuth: 180,
    w: 900,
    h: 1100,
    zoom: 0.72,
    minArea: 150,
  },
  {
    id: "musculos-brazo-posterior",
    exclude: "fascia|retinaculum|sheath|aponeurosis|bursa",
    layers: ["muscles", "bones"],
    include:
      "(deltoid|triceps|Anconeus|extensor|Brachioradialis|abductor pollicis longus|Infraspinatus|Teres|Supraspinatus|flexor carpi ulnaris|Clavicle|Humerus|Radius|Ulna|Scapula).*\\.r$",
    frame: "^(Humerus|Radius|Ulna)\\.r$",
    azimuth: 180,
    w: 700,
    h: 1200,
    zoom: 0.95,
    minArea: 120,
  },
  {
    id: "musculos-pierna-posterior",
    exclude: "fascia|retinaculum|sheath|aponeurosis|bursa",
    layers: ["muscles", "bones"],
    include:
      "(Gluteus|biceps femoris|Semitendinosus|Semimembranosus|gastrocnemius|Soleus|Plantaris|adductor magnus|Gracilis|Popliteus|fibularis|Iliotibial|tensor fasciae|Femur|Tibia|Fibula|Hip bone|Sacrum|Calcaneus).*\\.r$",
    frame: "^(Femur|Tibia|Hip bone)\\.r$",
    azimuth: 180,
    w: 700,
    h: 1300,
    zoom: 1.12,
    minArea: 120,
  },
  {
    id: "diafragma",
    layers: ["muscles", "bones", "vessels", "organs"],
    include: "Diaphragm|Psoas|Quadratus lumborum|Vertebra T1[0-2]|Vertebra L|rib|Oesophagus|Abdominal aorta|Thoracic aorta|Inferior vena cava|Iliacus",
    exclude: "Costal cartilage",
    label: "Diaphragm|Psoas|Quadratus|Oesophagus|aorta|vena cava|Iliacus|Vertebra L3|Twelfth rib",
    frame: "Diaphragm|Psoas",
    elevation: 20,
    zoom: 0.72,
    minArea: 100,
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
