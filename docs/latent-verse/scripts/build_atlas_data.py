"""Rebuild Latent Verse Parts 4-5 from matched real models.

One lens for both instruments: every joke is embedded with
sentence-transformers/all-MiniLM-L6-v2, the model the basemap and the SAE
were trained on.

  lens     all-MiniLM-L6-v2 embeddings of the dadabase jokes (52,566),
           plus seven classic jokes Parts 4-5 feature that dadabase lacks
  map      parametric UMAP basemap minilm-50m-r0267 (50M MiniLM chunks of
           FineWeb-edu, RedPajama and the Pile)
  filter   Matryoshka TopK SAE, 49,152 features, k=64, trained on MiniLM
           embeddings of the same corpora; labels written by an LLM from
           each feature's top-activating web-text exemplars

Writes data/sae-real.json (Part 4) and data/atlas-real.json (Part 5).
Run with the latent-basemap venv (torch, umap-learn, its ParametricUMAP):

  ~/code/latent-basemap/.venv/bin/python scripts/build_atlas_data.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from safetensors.numpy import load_file

HERE = Path(__file__).resolve().parent.parent
DATA = HERE / "data"
JOKES = Path("/data/embeddings/dadabase/jokes.parquet")
EMB = Path("/data/embeddings/dadabase/minilm.npy")
MAP = Path("/data/checkpoints/pumap/maps/minilm-50m-r0267-seed42")
SAE_RUN = Path(
    "/data/latent-sae/experiments/results/"
    "minilm_l6_stagej_49K_oldrecipe_replay2_k64_20260620_012003"
)
SAE = SAE_RUN / "checkpoints/sae_matryoshka_64_128.pooled/sae.safetensors"
LABELS = SAE_RUN / "exemplars/labels_full.parquet"

# The twelve jokes Parts 4 and 5 walk through.
FEATURED = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I'm reading a book about anti-gravity. It's impossible to put down.",
    "What do you call a fake noodle? An impasta.",
    "Why did the scarecrow win an award? He was outstanding in his field.",
    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    "What do you call a bear with no teeth? A gummy bear.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "I used to hate facial hair, but then it grew on me.",
    "What do you call a dog that does magic tricks? A labracadabrador.",
    "Why can't a bicycle stand on its own? It's two tired.",
    "Did you hear about the restaurant on the moon? Great food, no atmosphere.",
    "I told a chemistry joke. There was no reaction.",
]

# Features offered in Part 5's picker: topic features that fire on a few
# hundred jokes, then broad ones that fire on tens of thousands. Chosen
# from the printed table below, by eye, for labels a reader can check
# against the jokes.
MAP_FEATURES = [
    25590,  # cats and cat-related topics
    12763,  # fish and related concepts
    45468,  # cheese production and characteristics
    19391,  # rock music and bands
    8445,  # space exploration and concepts
    48232,  # superheroes and comic books
    37330,  # christmas traditions and literature
    16793,  # dog breeds and history
    17032,  # baking and pastry techniques
    446,  # fatherhood roles and expectations
    1879,  # definitions and meanings
    393,  # personal experiences and reflections
]

# Jokes a reader sees as text (map samples, neighbours, the local-UMAP
# comparison) skip r/dadjokes' crude and bigoted ones: anything over 200
# characters, matching this word list, or activating one of these SAE
# features (racial references, sexual behaviour, intimate interactions,
# racism, Asian stereotypes, sexuality norms, Nazi Germany, suicide,
# domestic abuse, swearing, profanity, race and ethnicity, WWII Nazis,
# abuse, trauma) among its 16 strongest. Feature counts and spreads still
# use every joke.
SENSITIVE = {241, 663, 1552, 5402, 5608, 1587, 455, 1239, 833, 3490, 4608, 12107, 2739, 14509, 2901, 12333}
WORDS = re.compile(
    r"\b(fuck\w*|shit\w*|sex\w*|porn\w*|penis|vagina|dick\w*|cock\w*|boob\w*|tits?|nsfw|rap(e|ed|ist)|nazis?"
    r"|hitler|sluts?|whores?|gay|retard\w*|nig\w*|jews?|jewish|muslims?|mexicans?|chinese|asians?|blacks?|negro"
    r"|midgets?|cum|horny|naked|nude|ass(hole)?|bitch\w*|damn|hell|crap|piss\w*|condoms?|viagra|orgasm\w*"
    r"|virgin\w*|erect\w*|pussy|balls?|blowjob|anal|suicid\w*|kill(ed|ing|s)?|dead baby|abortion|holocaust"
    r"|isis|terroris\w*)\b",
    re.I,
)

N_CONTEXT = 12_000  # background sample of the basemap's own training points
N_MAP = 4_000  # jokes drawn as the map's base layer
N_LOCAL = 400  # jokes in the local-UMAP vs basemap comparison
MAX_POINTS = 1_500  # firing jokes drawn per picked feature
MIN_FIRES = 60
SEED = 7


def sae_encode(x: np.ndarray, w: dict, k: int = 64, batch: int = 4096):
    W = w["encoder.weight"].astype(np.float32)
    b = w["encoder.bias"].astype(np.float32)
    b_dec = w["b_dec"].astype(np.float32)
    idx = np.zeros((len(x), k), np.int32)
    act = np.zeros((len(x), k), np.float32)
    for s in range(0, len(x), batch):
        pre = np.maximum((x[s : s + batch] - b_dec) @ W.T + b, 0)
        top = np.argpartition(-pre, k, axis=1)[:, :k]
        val = np.take_along_axis(pre, top, 1)
        order = np.argsort(-val, axis=1)
        idx[s : s + batch] = np.take_along_axis(top, order, 1)
        act[s : s + batch] = np.take_along_axis(val, order, 1)
    return idx, act


def project(x: np.ndarray) -> np.ndarray:
    sys.path.insert(0, str(Path.home() / "code/latent-basemap"))
    from basemap.pumap.parametric_umap.core import ParametricUMAP

    model = ParametricUMAP.load(str(MAP / "model.pt"), device="cpu")
    return np.asarray(model.transform(x, batch_size=8192), dtype=np.float32)


def r2(v) -> float:
    return round(float(v), 2)


def main() -> None:
    rng = np.random.default_rng(SEED)
    jokes = pd.read_parquet(JOKES)["joke"].tolist()
    x = np.load(EMB).astype(np.float32)
    assert len(jokes) == len(x)
    x /= np.linalg.norm(x, axis=1, keepdims=True)
    lookup = {t.strip(): i for i, t in enumerate(jokes)}

    extra = [t for t in FEATURED if t not in lookup]
    if extra:
        from sentence_transformers import SentenceTransformer

        st = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
        # Same recipe as the dadabase file: fp16 storage, unit norm.
        e = st.encode(extra, normalize_embeddings=True).astype(np.float16).astype(np.float32)
        for t in extra:
            lookup[t] = len(jokes)
            jokes.append(t)
        x = np.concatenate([x, e / np.linalg.norm(e, axis=1, keepdims=True)])
    featured = [lookup[t] for t in FEATURED]

    w = load_file(str(SAE))
    idx, act = sae_encode(x, w)
    xy = project(x)
    labels = pd.read_parquet(LABELS).set_index("feature")["label"].to_dict()
    showable = np.array([
        len(t) <= 200 and not WORDS.search(t) and not (set(idx[i][:16].tolist()) & SENSITIVE)
        for i, t in enumerate(jokes)
    ])
    showable[featured] = True
    print(f"showable jokes: {showable.sum()} of {len(jokes)}")

    fires: dict[int, list[int]] = {}
    for j in range(len(jokes)):
        for f, a in zip(idx[j], act[j]):
            if a > 0:
                fires.setdefault(int(f), []).append(j)

    # Spatial concentration: median map distance between jokes that fire
    # the feature, over the median between random jokes. 1.0 = spread like
    # the jokes as a whole; 0.1 = packed into a patch a tenth that size.
    def med_dist(pts: np.ndarray, n: int = 600) -> float:
        a = pts[rng.integers(0, len(pts), n)]
        b = pts[rng.integers(0, len(pts), n)]
        return float(np.median(np.linalg.norm(a - b, axis=1)))

    base = med_dist(xy, 4000)
    stats = {}
    for f, js in fires.items():
        if len(js) >= MIN_FIRES and f in labels:
            stats[f] = {"n": len(js), "spread": round(med_dist(xy[js]) / base, 2)}

    def joke_features(j: int, n: int = 8) -> list:
        return [[int(f), round(float(a), 3)] for f, a in zip(idx[j][:n], act[j][:n]) if a > 0]

    # ---- Part 4: the twelve jokes, decomposed --------------------------
    sae_out = {
        "provenance": provenance(len(jokes)),
        "jokes": [{"text": jokes[j], "features": joke_features(j)} for j in featured],
    }
    used = {f for jk in sae_out["jokes"] for f, _ in jk["features"]}
    sae_out["labels"] = {str(f): labels.get(f, f"feature {f}") for f in sorted(used)}
    sae_out["fires"] = {str(f): len(fires.get(f, [])) for f in sorted(used)}
    write(DATA / "sae-real.json", sae_out)

    # ---- Part 5: the atlas ---------------------------------------------
    coords = np.load(MAP / "coordinates.npy", mmap_mode="r")
    pick = np.sort(rng.choice(len(coords), N_CONTEXT, replace=False))
    context = np.asarray(coords[pick], dtype=np.float32)

    shown = np.unique(np.concatenate([rng.choice(np.where(showable)[0], N_MAP, replace=False), featured]))
    pos = {int(j): i for i, j in enumerate(shown)}

    # Neighbours among ALL jokes, for every joke a reader can click.
    nbrs = []
    for j in shown:
        sims = x @ x[j]
        sims[j] = -1
        sims[~showable] = -1
        top = np.argpartition(-sims, 3)[:3]
        top = top[np.argsort(-sims[top])]
        nbrs.append([[jokes[t], round(float(sims[t]), 2)] for t in top])

    map_features = []
    for f in MAP_FEATURES:
        js = np.array(fires[f])
        a = np.array([act[j][list(idx[j]).index(f)] for j in js])
        keep = np.argsort(-a)[:MAX_POINTS]
        map_features.append({
            "idx": f,
            "label": labels[f],
            **stats[f],
            "points": [[r2(xy[j, 0]), r2(xy[j, 1]), round(float(v), 3)] for j, v in zip(js[keep], a[keep])],
        })

    # Local UMAP vs basemap for the same jokes. Colour = k-means cluster of
    # the LOCAL layout, so a reader can see which local neighbourhoods
    # stay together on the basemap.
    import umap
    from sklearn.cluster import KMeans

    local_ids = rng.choice(np.where(showable[: len(jokes) - len(extra)])[0], N_LOCAL, replace=False)
    local = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=SEED).fit_transform(x[local_ids])
    groups = KMeans(n_clusters=6, n_init=10, random_state=SEED).fit_predict(local)

    # How much of each joke's true neighbourhood (cosine, 10-NN among the
    # same 400 jokes) each 2-D map keeps. Quoted in Part 5's prose.
    def kept(Y: np.ndarray, k: int = 10) -> float:
        S = x[local_ids] @ x[local_ids].T
        np.fill_diagonal(S, -9)
        true = np.argsort(-S, 1)[:, :k]
        D = ((Y[:, None] - Y[None]) ** 2).sum(-1)
        np.fill_diagonal(D, np.inf)
        got = np.argsort(D, 1)[:, :k]
        return round(float(np.mean([len(set(got[i]) & set(true[i])) / k for i in range(len(Y))])), 3)

    local_stats = {"k": 10, "local": kept(local), "basemap": kept(xy[local_ids]), "chance": round(10 / (N_LOCAL - 1), 3)}
    print("neighbourhood kept:", local_stats)

    used = {f for j in shown for f, _ in joke_features(int(j), 6)}
    atlas = {
        "provenance": provenance(len(jokes)),
        "context": [[r2(a), r2(b)] for a, b in context],
        "jokes": [[jokes[j], r2(xy[j, 0]), r2(xy[j, 1])] for j in shown],
        "featured": [pos[j] for j in featured],
        "featured_embeddings": [[round(float(v), 4) for v in x[j]] for j in featured],
        "features": [joke_features(int(j), 6) for j in shown],
        "neighbors": nbrs,
        "labels": {str(f): labels.get(f, f"feature {f}") for f in sorted(used)},
        "fires": {str(f): len(fires.get(f, [])) for f in sorted(used)},
        "map_features": map_features,
        "local_stats": local_stats,
        "local": [
            [jokes[j], r2(lx), r2(ly), r2(xy[j, 0]), r2(xy[j, 1]), int(g)]
            for j, (lx, ly), g in zip(local_ids, local, groups)
        ],
    }
    write(DATA / "atlas-real.json", atlas)
    # 600 jokes for the series index's Part 5 thumbnail.
    write(DATA / "atlas-thumb.json", {"jokes": [[j[1], j[2]] for j in atlas["jokes"][:: max(1, len(shown) // 600)]]})

    ranked = sorted(stats.items(), key=lambda kv: kv[1]["spread"])
    print("most concentrated (n>=250):")
    for f, s in [kv for kv in ranked if kv[1]["n"] >= 250][:20]:
        print(f"  {s['spread']:.2f}  n={s['n']:5d}  {f:6d}  {labels[f]}")
    print("picked:")
    for m in map_features:
        print(f"  {m['spread']:.2f}  n={m['n']:5d}  {m['idx']:6d}  {m['label']}")


def provenance(n: int) -> dict:
    return {
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "basemap": "minilm-50m-r0267-seed42: parametric UMAP trained on 50M MiniLM embeddings of FineWeb-edu, RedPajama and the Pile",
        "sae": "Matryoshka TopK SAE, 49,152 features, k=64, trained on MiniLM embeddings of the same corpora (hf:enjalot/sae-all-MiniLM-L6-v2-stagej-49K)",
        "labels": "written by an LLM (qwen2.5 32b) from each feature's top-activating web-text exemplars, never from jokes",
        "n_jokes": n,
        "spread": "median map distance between jokes that fire the feature / median between random jokes",
        "shown_jokes": "jokes shown as text skip ones over 200 characters or flagged by a word list or by SAE features about sex, race or profanity; counts use all jokes",
        "script": "scripts/build_atlas_data.py",
    }


def write(path: Path, obj: dict) -> None:
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {path.name} ({path.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
