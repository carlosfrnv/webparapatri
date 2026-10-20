"""Termina los maniquíes del simulador de rayos X (después de run.mjs).

Quita los puntos sueltos que dejan los huecos de las mallas, añade la piel y la grasa
(el atlas no las tiene) y guarda public/xray/<id>.png (R = hueso, G = tejido blando), <id>-labels.png (qué pieza hay en cada
punto) y meta.json.
Uso (desde frontend/): python3 scripts/xray/finish.py  (necesita numpy y Pillow)
"""
import json
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "../../public/xray")
BONE_SCALE = 0.05  # cm por nivel (máx. 12,75 cm)
SOFT_SCALE = 0.2  # cm por nivel (máx. 51 cm)
# Grosor de piel y grasa que se añade alrededor del cuerpo (cm) y cuánto se difumina (cm).
ENVELOPE = {"mano": (1.0, 0.3), "rodilla": (1.2, 0.6), "torax": (1.0, 1.0), "pelvis": (1.5, 1.2)}


def blur(a, sigma):
    r = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode="edge"), k, "valid"), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(np.pad(v, r, mode="edge"), k, "valid"), 1, a)


def median3(a):
    p = np.pad(a, 1, mode="edge")
    h, w = a.shape
    return np.median(np.stack([p[y : y + h, x : x + w] for y in range(3) for x in range(3)]), axis=0)


def main():
    raw = json.load(open(os.path.join(HERE, "drr-raw.json")))
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for exam, v in raw.items():
        w, h, cm = v["w"], v["h"], v["cmPerPx"]
        bone = np.array(v["bone"], dtype=float).reshape(h, w)
        soft = np.array(v["soft"], dtype=float).reshape(h, w)
        holes = np.array(v["holes"], dtype=bool).reshape(h, w)
        # Donde el haz pasó por huecos de las mallas queda algún punto suelto: se suaviza con una mediana.
        bone = median3(bone)
        soft = median3(soft)
        # Piel y grasa: un borde suave alrededor de todo lo que hay.
        thick, spread = ENVELOPE[exam]
        body = ((bone > 0.05) | (soft > 0.3)).astype(float)
        envelope = np.clip(blur(body, spread / cm) * 1.6, 0, 1) * thick
        soft = soft + envelope
        bone = np.clip(bone, 0, 255 * BONE_SCALE)
        soft = np.clip(soft, 0, 255 * SOFT_SCALE)
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[..., 0] = np.round(bone / BONE_SCALE)
        img[..., 1] = np.round(soft / SOFT_SCALE)
        Image.fromarray(img).save(os.path.join(OUT, f"{exam}.png"), optimize=True)
        # Etiquetas ("¿Qué es esto?"): R = hueso, G = órgano (número en la lista de nombres; 0 = nada).
        # Se quitan las piezas que ocupan muy poco (unos píxeles sueltos).
        lab = np.zeros((h, w, 3), dtype=np.uint8)
        names = {}
        for ch, kind in ((0, "boneLabels"), (1, "softLabels")):
            ids = np.array(v[kind]["ids"], dtype=int).reshape(h, w)
            for i in np.unique(ids):
                if i and (ids == i).sum() < 40:
                    ids[ids == i] = 0
            lab[..., ch] = ids
            names["bones" if ch == 0 else "organs"] = v[kind]["names"]
        Image.fromarray(lab).save(os.path.join(OUT, f"{exam}-labels.png"), optimize=True)
        meta[exam] = {"w": w, "h": h, "cmPerPx": round(cm, 4), "labels": names}
        print(exam, f"{os.path.getsize(os.path.join(OUT, exam + '.png')) // 1024} KB", f"huecos {holes.mean():.1%}")
    json.dump({"boneScale": BONE_SCALE, "softScale": SOFT_SCALE, "exams": meta}, open(os.path.join(OUT, "meta.json"), "w"))


if __name__ == "__main__":
    main()
