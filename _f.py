import sys; sys.path.insert(0, 'tools')
import numpy as np, study_layout as L, study_shape as S
for name in ("ViridianForest", "ThreeIsland_BerryForest"):
    mask = L.real_walkable(name)
    m = S.measure_mask(name, mask); m.update(L.measure(mask))
    print(f"{name:26} " + "  ".join(f"{k} {m[k]:.3f}" if isinstance(m[k], float) else f"{k} {m[k]}"
        for k in ("stripe","turns","dead","loops","tight","open") if k in m))
