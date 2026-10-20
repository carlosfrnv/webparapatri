"""Termina las radiografías del posicionamiento (después de: node scripts/xray/run.mjs pos).

Lee scripts/xray/pos-raw/<región>_<ángulo>.json, suaviza, añade piel y grasa (como finish.py) y guarda
public/xray/pos/<región>_<ángulo>.png (R = hueso, G = tejido blando) y public/xray/pos/meta.json con la
escala, los puntos de centraje y la zona que debe salir en cada ángulo.
Uso (desde frontend/): python3 scripts/xray/finish-pos.py  (necesita numpy y Pillow)
"""
import base64
import glob
import json
import os

import numpy as np
from PIL import Image

from finish import BONE_SCALE, ENVELOPE, SOFT_SCALE, blur, median3

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "../../public/xray/pos")


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {"boneScale": BONE_SCALE, "softScale": SOFT_SCALE, "regions": {}}
    for f in sorted(glob.glob(os.path.join(HERE, "pos-raw", "*.json"))):
        v = json.load(open(f))
        name = os.path.basename(f)[:-5]
        region, angle = name.rsplit("_", 1)
        w, h, cm = v["w"], v["h"], v["cmPerPx"]
        bone = np.frombuffer(base64.b64decode(v["bone"]), dtype=np.uint8).reshape(h, w) * 0.05
        soft = np.frombuffer(base64.b64decode(v["soft"]), dtype=np.uint8).reshape(h, w) * 0.2
        bone = median3(bone)
        soft = median3(soft)
        thick, spread = ENVELOPE[region]
        body = ((bone > 0.05) | (soft > 0.3)).astype(float)
        soft = soft + np.clip(blur(body, spread / cm) * 1.6, 0, 1) * thick
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[..., 0] = np.round(np.clip(bone, 0, 255 * BONE_SCALE) / BONE_SCALE)
        img[..., 1] = np.round(np.clip(soft, 0, 255 * SOFT_SCALE) / SOFT_SCALE)
        Image.fromarray(img).save(os.path.join(OUT, f"{name}.png"), optimize=True)
        r = meta["regions"].setdefault(region, {"w": w, "h": h, "cmPerPx": round(cm, 4), "angles": {}})
        r["angles"][angle] = {"points": v["points"], "rois": v["rois"]}
    for r in meta["regions"].values():
        r["angles"] = dict(sorted(r["angles"].items(), key=lambda kv: int(kv[0])))
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"))
    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "*.png")))
    print({k: len(r["angles"]) for k, r in meta["regions"].items()}, f"{total // 1024} KB")


main()
