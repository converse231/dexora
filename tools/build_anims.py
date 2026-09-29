"""MOVE ANIMATIONS: the games' own, compiled (docs/battles.md, *Art*, phase 7).

pokeemerald-expansion carries an animation script for every move through Gen
9, written in a small language (`createsprite`, `delay`, `call`, visual
tasks) whose motion lives in several hundred C callbacks. A browser cannot
run that, so this COMPILES each of our moves' scripts into a flat timeline
at 60 frames a second:

  - every sprite a script spawns: its sheet, palette, frame sequence and
    scale/rotation table (data in the C, read exactly), when, from which
    battler, and a MOTION - the most-used callbacks ported one by one
    (PORTS), the rest classified by the movement helpers their C calls;
  - the visual tasks as mon shakes, lunges, slides, tints, screen flashes;
  - background fades (`fadetobg`), composed from their tiles.

Writes src/data/anims.js (the League chunk only) and public/battle/anim/.
Everything upstream is pinned to COMMIT and cached in .assets-src/anims/.

Run: npm run anims
"""
import json, math, os, re, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "rh-hideout/pokeemerald-expansion"
COMMIT = "d946dc6515e11b0aa85d2e11824eceb31e8cff1a"   # 2026-09-28, master
CACHE = ROOT / ".assets-src" / "anims" / COMMIT[:10]
OUT_DATA = ROOT / "src" / "data" / "anims.js"
OUT_ART = ROOT / "public" / "battle" / "anim"

# Our moves' spelling -> the script's, where the camel-cased slug is not it.
ALIAS = {"vice-grip": "ViseGrip"}

# ------------------------------------------------------------------ fetching
def fetch(path, binary=False):
    """One upstream file at COMMIT, cached forever (the commit never changes)."""
    f = CACHE / path
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}/{path}"
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                f.write_bytes(r.read())
        except Exception as e:
            raise FileNotFoundError(f"{path}: {e}") from None
    return f.read_bytes() if binary else f.read_text(encoding="utf-8", errors="replace")

C_FILES = ["battle_anim", "battle_anim_bug", "battle_anim_dark", "battle_anim_dragon", "battle_anim_effects_1",
           "battle_anim_effects_2", "battle_anim_effects_3", "battle_anim_electric", "battle_anim_fight",
           "battle_anim_fire", "battle_anim_flying", "battle_anim_ghost", "battle_anim_ground", "battle_anim_ice",
           "battle_anim_mon_movement", "battle_anim_mons", "battle_anim_new", "battle_anim_normal",
           "battle_anim_poison", "battle_anim_psychic", "battle_anim_rock", "battle_anim_smokescreen",
           "battle_anim_status_effects", "battle_anim_throw", "battle_anim_utility_funcs", "battle_anim_water"]

# ------------------------------------------------------------------ constants
class Consts:
    """#defines and enums from the headers, evaluated on demand."""
    def __init__(self, texts):
        self.raw = {}
        self.cache = {"TRUE": 1, "FALSE": 0, "NULL": 0}
        for t in texts:
            t = re.sub(r"//[^\n]*|/\*.*?\*/", "", t, flags=re.S)
            for m in re.finditer(r"^#define\s+(\w+)\s+(.+?)\s*$", t, re.M):
                self.raw.setdefault(m.group(1), m.group(2))
            for m in re.finditer(r"enum\s*\w*\s*\{(.*?)\}", t, re.S):
                n = -1
                for item in m.group(1).split(","):
                    item = item.strip()
                    if not item:
                        continue
                    name, _, val = item.partition("=")
                    name = name.strip()
                    if not re.match(r"^\w+$", name):
                        continue
                    n = self.eval(val) if val.strip() else (n + 1 if isinstance(n, int) else None)
                    if isinstance(n, int):
                        self.raw.setdefault(name, str(n))

    def eval(self, expr, depth=0):
        """A C integer expression, or None when it is not one."""
        expr = expr.strip()
        if expr in self.cache:
            return self.cache[expr]
        if depth > 40:
            return None
        e = re.sub(r"\bRGB\s*\(", "_rgb(", expr)
        e = e.replace("&&", " and ").replace("||", " or ").replace("!=", " != ")
        e = re.sub(r"!(?!=)", " not ", e)
        e = re.sub(r"(\w+)\s*\?\s*([^:]+):\s*(.+)", r"(\2 if \1 else \3)", e)

        def name(m):
            w = m.group(0)
            if w in ("_rgb", "and", "or", "not", "if", "else"):
                return w
            if w in self.raw:
                v = self.eval(self.raw[w], depth + 1)
                self.cache[w] = v
                return "None" if v is None else str(v)
            return w
        e = re.sub(r"\b(?:0x[0-9a-fA-F]+|[A-Za-z_]\w*)\b", lambda m: m.group(0) if m.group(0).startswith("0x") else name(m), e)
        try:
            v = eval(e, {"__builtins__": {}}, {"_rgb": lambda r, g, b: r | (g << 5) | (b << 10)})
            return int(v) if isinstance(v, (int, bool)) else None
        except Exception:
            return None

# ------------------------------------------------------------------ C tables
def c_blocks(text, kind):
    """`const struct <kind> NAME = { ... };` -> {NAME: body}."""
    out = {}
    for m in re.finditer(r"(?:static\s+)?const\s+struct\s+" + kind + r"\s+(\w+)\s*=\s*\{(.*?)\};", text, re.S):
        out[m.group(1)] = m.group(2)
    return out

def c_fields(body):
    return {k: v.strip() for k, v in re.findall(r"\.(\w+)\s*=\s*([^,\n]+(?:\([^)]*\))?[^,\n]*)", body)}

def parse_cmd_tables(text, union):
    """`union AnimCmd name[] = {...}` lists, and `*const name[] = {a, b}` pointer tables."""
    lists, tables = {}, {}
    for m in re.finditer(r"const\s+union\s+" + union + r"\s+(\w+)\[\]\s*=\s*\{(.*?)\};", text, re.S):
        lists[m.group(1)] = re.findall(r"(\w+CMD_\w+)\s*(?:\(([^)]*)\))?", m.group(2))
    for m in re.finditer(r"const\s+union\s+" + union + r"\s*\*\s*const\s+(\w+)\[\]\s*=\s*\{(.*?)\};", text, re.S):
        tables[m.group(1)] = re.findall(r"(\w+)", re.sub(r"\[[^\]]*\]\s*=", "", m.group(2)))
    return lists, tables


# ------------------------------------------------------------------ scripts
class Script:
    """battle_anim_scripts.s with its macros expanded: labels -> command lists.

    A macro whose body emits bytes (`createsprite`, `delay`, ...) is a
    PRIMITIVE and stays; any other is expanded, with its parameters, keyword
    arguments, defaults and `.if`/`.ifb`/`.ifnb` blocks."""
    def __init__(self, text, macros_text, consts):
        self.consts = consts
        self.macros = {}
        for m in re.finditer(r"^[ \t]*\.macro[ \t]+(\w+)[ \t]*([^\n]*)\n(.*?)^[ \t]*\.endm", macros_text, re.M | re.S):
            params = []
            for p in [x.strip() for x in m.group(2).split(",") if x.strip()]:
                name, _, default = p.partition("=")
                params.append((name.split(":")[0].strip(), default.strip()))
            body = m.group(3)
            prim = bool(re.search(r"^\s*\.(?:2|4)?byte\b", body, re.M))
            self.macros[m.group(1)] = (params, body, prim)
        self.labels = {}
        cur = None
        for line in text.splitlines():
            line = line.split("@")[0].rstrip()
            lm = re.match(r"^(\w+):{1,2}\s*$", line)
            if lm:
                cur = lm.group(1)
                self.labels[cur] = []
                continue
            if cur and line.strip() and not line.strip().startswith("."):
                self.labels[cur] += self.expand(line.strip())

    @staticmethod
    def split(line):
        op, _, rest = line.partition(" ")
        if "\t" in op:
            op, _, r2 = op.partition("\t")
            rest = (r2 + " " + rest).strip()
        args, depth, cur = [], 0, ""
        for ch in rest:
            if ch == "," and depth == 0:
                args.append(cur.strip()); cur = ""
                continue
            depth += ch == "("
            depth -= ch == ")"
            cur += ch
        if cur.strip():
            args.append(cur.strip())
        return op.strip(), args

    def expand(self, line, depth=0):
        op, args = self.split(line)
        mac = self.macros.get(op)
        if not mac or mac[2] or depth > 8:
            return [(op, args)]
        params, body, _ = mac
        vals = {n: d for n, d in params}
        pos = 0
        for a in args:
            k, eq, v = a.partition("=")
            if eq and re.match(r"^\w+$", k.strip()) and k.strip() in vals:
                vals[k.strip()] = v.strip()
            elif pos < len(params):
                vals[params[pos][0]] = a
                pos += 1
        out, keep = [], [True]
        for raw in body.splitlines():
            ln = raw.split("@")[0].strip()
            for n, v in sorted(vals.items(), key=lambda kv: -len(kv[0])):
                ln = ln.replace("\\" + n, v)
            if not ln or ln.startswith(".L"):
                continue
            d = ln.split()[0]
            if d == ".if":
                keep.append(keep[-1] and bool(self.consts.eval(ln[3:].replace("==", "==")) or 0)); continue
            if d == ".ifb":
                keep.append(keep[-1] and not ln[4:].strip()); continue
            if d == ".ifnb":
                keep.append(keep[-1] and bool(ln[5:].strip())); continue
            if d == ".else":
                prev = keep.pop(); keep.append((not prev) and keep[-1]); continue
            if d == ".endif":
                keep.pop(); continue
            if d.startswith(".") or not keep[-1]:
                continue
            out += self.expand(ln, depth + 1)
        return out

    # Branches: a two-turn move plays its attack turn; a battle here is
    # never a contest nor a double; an argument test takes its fall-through.
    TAKE_SECOND = {"choosetwoturnanim"}
    SKIP = {"jumpifcontest", "jumpifdoublebattle", "jumpargeq", "jumpreteq", "jumpretfalse", "jumprettrue",
            "jumpifmoveturn", "jumpifargmatches", "jumpifsubstitute"}

    def walk(self, label, depth=0, seen=(), first=False):
        """The commands a move runs, calls and gotos resolved. `first` takes
        the first argument branch instead of the fall-through - for a script
        that is all branches (Return's four strengths)."""
        out = []
        if label not in self.labels or depth > 10 or label in seen:
            return out
        for op, args in self.labels[label]:
            if len(args) == 1 and " " in args[0].strip():
                args = args[0].split()
            if op in ("call", "Call") and args:
                out += self.walk(args[0], depth + 1, seen + (label,), first)
            elif op == "goto" and args:
                return out + self.walk(args[0], depth + 1, seen + (label,), first)
            elif op in self.TAKE_SECOND and len(args) > 1:
                return out + self.walk(args[1], depth + 1, seen + (label,), first)
            elif first and op in ("jumpargeq", "jumpreteq", "jumpifmoveturn", "jumpifargmatches", "jumpifmovetypeequal") and args:
                return out + self.walk(args[-1], depth + 1, seen + (label,), first)
            elif op in self.SKIP or op in ("return",):
                if op == "return":
                    return out
                continue
            elif op == "end":
                return out
            else:
                out.append((op, args))
        return out


# ------------------------------------------------------------------ motion
# A timeline sprite's MOTION, in GBA pixels and frames (60 a second):
#   o   [b, x, y]  where it starts: b 0 the attacker, 1 the target, 2 the
#                   screen (x, y absolute); x is MIRRORED when the foe
#                   attacks (the scripts are written for the player's side)
#   k   the path - "stay", "line"/"arc"/"wave" to `to` [b, x, y] over `f`,
#       "vel" (vx, vy per frame), "rise" (vy, a sway amplitude, sp its
#       speed), "orbit" (r, a0 start angle, sp, rs radius growth)
#   f   frames alive; 0 = until its frame or scale sequence ends
#   d   frames hidden before it starts;  fl  blink every n frames
#   fy  mirror y too when the foe attacks (a few callbacks do)
A, T, SCREEN = 0, 1, 2

def who(v):
    """An `ANIM_*` battler to 0 attacker / 1 target (partners are the same side in a single battle)."""
    return A if v in (0, 2) else T

def rnd(i, lo, hi):
    """Deterministic 'random' for a spawn: the scripts call Random2(); a build must not change run to run."""
    x = (i * 2654435761 + 97) & 0xFFFFFFFF
    return lo + x % (hi - lo + 1)

def sin_t(a, amp):
    return round(math.sin(a * 2 * math.pi / 256) * amp)

def cos_t(a, amp):
    return round(math.cos(a * 2 * math.pi / 256) * amp)

def stay(b, x, y, f=0, **kw):
    return dict(o=[b, x, y], k="stay", f=f, **kw)

def line(b, x, y, tb, tx, ty, f, **kw):
    return dict(o=[b, x, y], k="line", to=[tb, tx, ty], f=max(1, f), **kw)

# The most-used callbacks, ported from their C one by one (top 100 by spawns
# are 86% of every sprite a script creates). `g` is the argument list (ints,
# padded), `cb` the battler `createsprite` named, `n` the spawn's index.
def _needle(g, cb, n):
    base = A if g[0] == 0 else T
    if g[1] == 0:
        return line(base, g[2], g[3], base, 0, 0, g[4], fx=0)
    return line(base, 0, 0, base, g[2], g[3], g[4], fx=0)

def _spark(g, cb, n):
    b = {0: A, 1: T}.get(g[4], T)
    return stay(b, sin_t(g[0], g[1]), cos_t(g[0], g[1]), g[3], fx=0, rot=g[2] * 360 // 256)

def _drift_bubbles(g, cb, n):
    vx = rnd(n, 256, 511) / 256 * (-1 if rnd(n, 0, 1) else 1)
    vy = rnd(n + 7, -255, 255) / 256
    return dict(o=[T, g[0], g[1]], k="vel", vx=vx, vy=vy, f=21)

def _flash_spark(g, cb, n):
    b = T if g[7] & 0x8000 else A
    return dict(o=[b, -g[0], g[1]], k="orbit", r=g[2], a0=g[4], sp=g[5], rs=0, f=g[3], fl=2, tile=g[6] * 4)

def _endure(g, cb, n):
    b = who(g[0])
    return dict(o=[b, g[1], g[2]], k="rise", vy=-max(1, g[3]) / 2, a=0, sp=0, f=0)

def _smoke(g, cb, n):
    return dict(o=[cb, g[0], g[1]], k="vel", vx=(g[2] if not g[3] else -g[2]) / 256, vy=0, f=g[4], fl=1, fx=0)

def _twister(g, cb, n):
    return dict(o=[T, 0, 32], k="rise", vy=-2, stop=(g[1] // 2 if g[1] != 0xFF else 0), a=g[3], sp=g[2], f=g[0])

def _petal(g, cb, n):
    return dict(o=[SCREEN, 0, g[0]], k="vel", vx=2, vy=0.5, f=120, anim=g[1], sway=6)

def _air_crescent(g, cb, n):
    return line(A, g[0], g[1], T, g[2], g[3], g[4], fy=1)

PORTS = {
    "AnimSpriteOnMonPos": lambda g, cb, n: stay(who(g[2]), g[0], g[1]),
    "AnimHitSplatBasic": lambda g, cb, n: stay(who(g[2]), g[0], g[1], aff=g[3]),
    "AnimHitSplatRandom": lambda g, cb, n: stay(who(g[2]), rnd(n, -24, 24), rnd(n + 3, -24, 16), aff=g[4] if len(g) > 4 else 0),
    "AnimHitSplatPersistent": lambda g, cb, n: stay(who(g[2]), g[0], g[1], aff=g[3], f=g[4] + 8),
    "AnimHitSplatHandleInvert": lambda g, cb, n: stay(who(g[2]), g[0], g[1], aff=g[3]),
    "AnimFireSpread": lambda g, cb, n: dict(o=[cb, g[0], g[1]], k="vel", vx=g[2] / 256, vy=g[3] / 256, f=g[4]),
    "AnimParticleInVortex": lambda g, cb, n: dict(o=[who(g[6]), g[0], g[1]], k="rise", vy=-g[2] / 256, a=g[5], sp=g[4], f=g[3] + 1, fx=0),
    "AnimGrowingChargeOrb": lambda g, cb, n: stay(who(g[0]), 0, 0),
    "AnimGrowingShockWaveOrb": lambda g, cb, n: stay(who(g[0]), 0, 0),
    "TranslateAnimSpriteToTargetMonLocation": lambda g, cb, n: line(A, g[0], g[1], T, g[2], g[3], g[4]),
    "AnimToTargetInSinWave": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="wave", to=[T, 0, 0], f=30, a=g[3] or 8, w=0.82),
    "AnimNeedleArmSpike": _needle,
    "AnimSparkElectricity": _spark,
    "AnimIceEffectParticle": lambda g, cb, n: stay(T, g[0], g[1], after=20),
    "AnimSmallDriftingBubbles": _drift_bubbles,
    "AnimSmallBubblePair": lambda g, cb, n: dict(o=[A if g[3] == 0 else T, g[0], g[1]], k="rise", vy=-48 / 256, a=4, sp=11, f=g[2] + 1),
    "AnimBubbleEffect": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="rise", vy=-0x30 / 256, a=4, sp=11, f=0),
    "AnimTealAlert": lambda g, cb, n: line(T, g[0], g[1], T, 0, 0, g[2]),
    "AnimZapCannonSpark": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="line", to=[T, 0, 0], f=max(1, g[3]), wob=g[2], a0=g[4], sp=g[5], fl=3, tile=g[6] * 4),
    "AnimElectricity": lambda g, cb, n: stay(who(g[4]), g[0], g[1], g[2], tile=g[3] * 4, hf=int(g[3] == 1), vf=int(g[3] == 2)),
    "AnimSparkElectricityFlashing": _flash_spark,
    "AnimEndureEnergy": _endure,
    "AnimRockFragment": lambda g, cb, n: line(cb, g[0], g[1], cb, g[0] + g[2], g[1] + g[3], g[4], anim=g[5]),
    "AnimBlackSmoke": _smoke,
    "AnimFireSpiralOutward": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="orbit", r=0, a0=0, sp=10, rs=0xD0 / 256, f=g[2] + 1, d=g[3]),
    "AnimMoveTwisterParticle": _twister,
    "AnimSweetScentPetal": _petal,
    "AnimUproarRing": lambda g, cb, n: stay(who(g[2]), g[0], g[1], aff=1),
    "AnimFallingRock": lambda g, cb, n: line(cb, g[0], 14 - 70, cb, g[0], 14, 18, anim=g[1]),
    "AnimPowerAbsorptionOrb": lambda g, cb, n: line(A, g[0], g[1], A, 0, 0, g[2]),
    "AnimAirWaveCrescent": _air_crescent,
    "AnimWaveFromCenterOfTarget": lambda g, cb, n: stay(T, g[0], g[1]),
    "AnimLightning": lambda g, cb, n: stay(cb, g[0], g[1]),
    "AnimSludgeBombHitParticle": lambda g, cb, n: line(cb, 0, 0, cb, g[0], g[1], g[2]),
    "AnimShadowBall": lambda g, cb, n: dict(o=[A, 0, 0], k="line", to=[T, 0, 0], f=max(8, g[2] * 2 if len(g) > 2 else 24)),
    "AnimThrowProjectile": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="arc", to=[T, g[2], g[3]], f=max(1, g[4]), h=g[5] or -24),
    "AnimMissileArc": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="arc", to=[T, g[2], g[3]], f=max(1, g[4]), h=g[5] or -24),
    "AnimCuttingSlice": lambda g, cb, n: stay(T, g[0] if len(g) > 0 else 0, g[1] if len(g) > 1 else 0),
    "AnimSlashSlice": lambda g, cb, n: stay(T, g[1] if len(g) > 1 else 0, g[2] if len(g) > 2 else 0),
    "AnimClawSlash": lambda g, cb, n: stay(T, g[0], g[1]),
    "AnimFistOrFootRandomPos": lambda g, cb, n: stay(who(g[0]), rnd(n, -24, 24), rnd(n + 5, -24, 16), f=g[1] + 8 if len(g) > 1 else 16),
    "AnimSpinningKickOrPunch": lambda g, cb, n: stay(T, g[0], g[1], aff=1),
    "AnimStompFoot": lambda g, cb, n: line(T, g[0], g[1] - 32, T, g[0], g[1], 10),
    "AnimJumpKick": lambda g, cb, n: line(A, g[0], g[1], T, 0, 0, 16),
    "AnimGrantingStars": lambda g, cb, n: dict(o=[who(g[2]), g[0], g[1]], k="rise", vy=-0.6, a=6, sp=9, f=40),
    "AnimMagentaHeart": lambda g, cb, n: dict(o=[who(g[2]) if len(g) > 2 else T, g[0], g[1]], k="rise", vy=-0.7, a=5, sp=8, f=44),
    "AnimJaggedMusicNote": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="wave", to=[T, 0, -8], f=40, a=10, w=1.5),
    "AnimWavyMusicNotes": lambda g, cb, n: dict(o=[A, 0, -8], k="wave", to=[T, 0, -12], f=48, a=12, w=2),
    "AnimRoarNoiseLine": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="vel", vx=3, vy=(g[2] - 1) * 0.8 if len(g) > 2 else 0, f=24),
    "AnimLargeFlame": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="vel", vx=2.2, vy=0, f=g[3] if len(g) > 3 and g[3] else 28),
    "AnimTearDrop": lambda g, cb, n: dict(o=[A, 0, -8], k="arc", to=[A, (1 if g[0] % 2 else -1) * 20, 12], f=20, h=-16),
    "AnimOrbitScatter": lambda g, cb, n: dict(o=[T, 0, 0], k="vel", vx=sin_t(g[0] if g else 0, 3), vy=cos_t(g[0] if g else 0, 3), f=24),
    "AnimParticleBurst": lambda g, cb, n: dict(o=[cb, 0, 0], k="vel", vx=sin_t(g[0] if g else 0, max(1, g[1] if len(g) > 1 else 2)) / 1.5, vy=cos_t(g[0] if g else 0, max(1, g[1] if len(g) > 1 else 2)) / 1.5, f=g[2] if len(g) > 2 and g[2] else 20),
    "AnimDirtPlumeParticle": lambda g, cb, n: dict(o=[cb, g[1] if len(g) > 1 else 0, 0], k="arc", to=[cb, (g[2] if len(g) > 2 else 16), 8], f=24, h=-(g[3] if len(g) > 3 and g[3] else 24)),
    "AnimRockScatter": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="arc", to=[T, g[0] + rnd(n, -32, 32), g[1] + 24], f=24, h=-20),
    "AnimFlyingSandCrescent": lambda g, cb, n: dict(o=[SCREEN, 0, g[0] if g else 40], k="vel", vx=4, vy=0, f=64),
    "AnimPoisonJabProjectile": lambda g, cb, n: line(A, g[0], g[1], T, 0, 0, 16),
    "AnimAcidPoisonDroplet": lambda g, cb, n: dict(o=[T, g[0], g[1] - 30], k="line", to=[T, g[0], g[1]], f=16),
    "AnimFlyBallUp": lambda g, cb, n: dict(o=[A, 0, 0], k="line", to=[A, 0, -120], f=20),
    "AnimFlyBallAttack": lambda g, cb, n: dict(o=[SCREEN, 120, -30], k="line", to=[T, 0, 0], f=16),
    "AnimSimplePaletteBlend": None,     # handled as a tint, below
    "AnimComplexPaletteBlend": None,
}


PORTS.update({
    "AnimHyperBeamOrb": lambda g, cb, n: dict(o=[A, 20, rnd(n, -6, 6)], k="line", to=[T, 0, rnd(n + 1, -8, 8)], f=rnd(n, 18, 30), anim=rnd(n, 0, 2)),
    "AnimAbsorptionOrb": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="arc", to=[A, 0, 0], f=max(1, g[3]), h=-(g[2] or 16)),
    "SpriteCB_Geyser": lambda g, cb, n: dict(o=[A, g[1], g[2]], k="arc", to=[A, g[1] + (12 if g[1] > 0 else -12), g[2] - 8], f=20, h=-36),
    "AnimMudSportDirt": lambda g, cb, n: (dict(o=[A, g[1], g[2]], k="arc", to=[A, g[1] * 2, g[2] + 8], f=20, h=-36) if g[0] == 0
                                            else dict(o=[SCREEN, g[1], -8], k="line", to=[SCREEN, g[1], g[2]], f=20)),
    "AnimDirtScatter": lambda g, cb, n: line(A, g[0], g[1], T, rnd(n, -16, 16), rnd(n + 2, -16, 16), g[2]),
    "AnimOverheatFlame": lambda g, cb, n: dict(o=[A, cos_t(g[1], g[2]) * g[0] // 8, sin_t(g[1], g[2] * 3 // 5) * g[0] // 8 + g[4]], k="vel",
                                               vx=cos_t(g[1], g[2]) / 8, vy=sin_t(g[1], g[2] * 3 // 5) / 8, f=max(1, g[3]), fx=0),
    "SpriteCB_RandomCentredHits": lambda g, cb, n: stay(who(g[0]), rnd(n, -24, 23), rnd(n + 4, -12, 11), aff=(rnd(n, 0, 3) if g[1] in (-1, 0xFFFF) else g[1])),
    "AnimMovePowderParticle": lambda g, cb, n: dict(o=[cb, g[0], g[1]], k="rise", vy=g[3] / 256 if abs(g[3]) > 8 else g[3] or 0.5, a=g[4], sp=g[5], f=max(1, g[2])),
    "AnimSporeParticle": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="rise", vy=0.5, a=12, sp=6, f=max(1, g[3]), anim=g[4]),
    "AnimDragonDanceOrb": lambda g, cb, n: dict(o=[A, 0, 0], k="orbit", r=24, a0=g[0], sp=8, rs=0, f=60),
    "AnimOrbitFast": lambda g, cb, n: dict(o=[A, 0, 0], k="orbit", r=24, a0=g[0], sp=g[1] or 12, rs=0, f=32),
    "AnimOrbitScatter": lambda g, cb, n: dict(o=[T, 0, 0], k="vel", vx=sin_t(g[0], 3), vy=cos_t(g[0], 3), f=24),
    "AnimSwirlingSnowball": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="wave", to=[T, 0, g[3]], f=max(1, g[4]), a=8, w=1),
    "AnimFlashingHitSplat": lambda g, cb, n: stay(who(g[2]), g[0], g[1], aff=g[3], fl=1),
    "AnimBasicFistOrFoot": lambda g, cb, n: stay(who(g[2]), g[0], g[1], f=max(8, g[3])),
    "AnimBite": lambda g, cb, n: stay(cb, g[0], g[1], aff=g[2], f=max(8, g[5] * 2 + 8)),
    "AnimSwordsDanceBlade": lambda g, cb, n: stay(A, 0, 0),
    "AnimSludgeProjectile": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="arc", to=[T, 0, 0], f=max(1, g[2]), h=-24),
    "AnimWaterBubbleProjectile": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="wave", to=[T, g[2], g[3]], f=max(1, g[6] or 24), a=6, w=2),
    "AnimIceBeamParticle": lambda g, cb, n: line(A, g[0], g[1], T, g[2], g[3], g[4]),
    "AnimAuroraBeamRings": lambda g, cb, n: line(A, g[0], g[1], T, g[2], g[3], g[4]),
    "AnimTranslateWebThread": lambda g, cb, n: line(A, g[0], g[1], T, 0, 0, g[2] or 20),
    "AnimPetalDanceSmallFlower": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="rise", vy=-0.8, a=12, sp=8, f=max(1, g[2] or 40)),
    "AnimConversion": lambda g, cb, n: stay(A, g[0], g[1]),
    "AnimDizzyPunchDuck": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="orbit", r=18, a0=g[2] * 64 if len(g) > 2 else 0, sp=6, rs=0, f=40),
    "AnimSprayWaterDroplet": lambda g, cb, n: dict(o=[A, 0, -8], k="arc", to=[A, rnd(n, -24, 24), 16], f=18, h=-20),
    "AnimFireCross": lambda g, cb, n: dict(o=[T, g[0], g[1]], k="vel", vx=g[3] / 256 if len(g) > 3 else 0, vy=g[4] / 256 if len(g) > 4 else 0, f=max(1, g[2])),
    "AnimOutrageFlame": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="vel", vx=(g[2] or 128) / 128, vy=(g[3] or 0) / 128, f=max(1, g[4] or 24)),
    "AnimGunkShotParticles": lambda g, cb, n: dict(o=[A, g[0], g[1]], k="wave", to=[T, 0, 0], f=24, a=10, w=1),
    "AnimFlatterConfetti": lambda g, cb, n: dict(o=[SCREEN, rnd(n, 0, 240), -8], k="rise", vy=1.2, a=10, sp=8, f=90),
    "AnimFallingObject": lambda g, cb, n: line(T, g[0], -80, T, g[0], g[1], 20),
    "SpriteCB_FallingObject": lambda g, cb, n: line(T, g[0], -80, T, g[0], g[1], 20),
})

# Sprites that are really a Pokemon moving: emitted as mon events.
# Invisible sprites whose callback moves the mons (the partner's, a doubles slot, moves nothing here).
MON_SPRITES = {"DoHorizontalLunge", "SlideMonToOffset", "SlideMonToOriginalPos", "DoVerticalDip", "AnimBowMon",
               "SlideMonToOffsetAndBack", "SlideMonToOffsetPartner", "SlideMonToOriginalPosPartner",
               "AnimShakeMonOrBattlePlatforms"}

def classify(cb_name, c_all):
    """A callback nobody ported, from the movement helpers its C calls."""
    body = c_function(cb_name, c_all)
    steps = re.findall(r"callback\s*=\s*(\w+)|StoreSpriteCallbackInData6\(sprite,\s*(\w+)\)", body)
    full = body + "".join(c_function(a or b, c_all) for a, b in steps[:4] if (a or b) not in ("DestroyAnimSprite", "DestroySpriteAndMatrix"))
    dur = re.search(r"sprite->data\[0\]\s*=\s*(?:gBattleAnimArgs|cmd->\w+)\[?(\d)?", full)
    di = int(dur.group(1)) if dur and dur.group(1) else None
    origin = T if "InitSpritePosToAnimTarget" in full else A if "InitSpritePosToAnimAttacker" in full else None
    if re.search(r"InitAnimArcTranslation", full):
        return "arc", origin, di
    if re.search(r"StartAnimLinearTranslation|InitAnimLinearTranslation|AnimTranslateLinear|TranslateAnimSpriteToTargetMonLocation|AnimTravelDiagonally", full):
        return "line", origin, di
    if re.search(r"TranslateSpriteLinear\w*|data\[1\] \+= |x2 \+= ", full):
        return "vel", origin, di
    if re.search(r"\bSin\(|\bCos\(", full):
        return "sway", origin, di
    return "stay", origin, di

_FN_CACHE = {}
def c_function(name, c_all):
    if not name:
        return ""
    if name in _FN_CACHE:
        return _FN_CACHE[name]
    m = re.search(r"^[\w ]*\b" + re.escape(name) + r"\s*\([^)]*\)\s*\{", c_all, re.M)
    out = ""
    if m:
        depth = 0
        for j in range(m.end() - 1, len(c_all)):
            if c_all[j] == "{":
                depth += 1
            elif c_all[j] == "}":
                depth -= 1
                if depth == 0:
                    out = c_all[m.start():j + 1]
                    break
    _FN_CACHE[name] = out
    return out

def classified_motion(kind, origin, di, g, cb):
    f = g[di] if di is not None and di < len(g) and 0 < g[di] < 240 else 24
    o = origin if origin is not None else cb
    if kind == "line":
        return line(o, g[0] if o != T else g[0], g[1], T if o == A else T, 0, 0, f)
    if kind == "arc":
        return dict(o=[o, g[0], g[1]], k="arc", to=[T, 0, 0], f=f, h=-24)
    if kind == "vel":
        return dict(o=[o, g[0], g[1]], k="vel", vx=1.2, vy=-0.4, f=f)
    if kind == "sway":
        return dict(o=[o, g[0], g[1]], k="rise", vy=-0.3, a=6, sp=8, f=f)
    return stay(o, g[0], g[1], f if di is not None else 0)


# ------------------------------------------------------------------ compile
HIT_CALLBACKS = {"AnimHitSplatBasic", "AnimHitSplatRandom", "AnimHitSplatPersistent", "AnimHitSplatHandleInvert",
                 "AnimHitSplatOnMonEdge", "AnimFistOrFootRandomPos", "AnimCuttingSlice", "AnimSlashSlice", "AnimClawSlash"}
HIT_CALLBACKS.update({"AnimFlashingHitSplat", "SpriteCB_RandomCentredHits", "AnimBasicFistOrFoot", "AnimBite"})
DEFAULT_LIFE = 30
FADE_FRAMES = 16

class Compiler:
    def __init__(self, consts, templates, anims, anim_tables, affs, aff_tables, c_all, script):
        self.c, self.templates, self.script, self.c_all = consts, templates, script, c_all
        self.anims, self.anim_tables, self.affs, self.aff_tables = anims, anim_tables, affs, aff_tables
        self.sprites, self.sprite_ix = [], {}
        self.sheets, self.sheet_ix = [], {}      # (tile tag, pal tag, w, h) -> [offsets]
        self.bgs, self.bg_ix = [], {}
        self.stats = {"ported": 0, "classified": 0, "tasks": 0, "unknown_task": {}, "unknown_tmpl": 0}

    def val(self, a, default=0):
        a = a.strip()
        if "=" in a and re.match(r"^\w+\s*=", a):
            a = a.split("=", 1)[1]
        v = self.c.eval(a)
        return default if v is None else v

    # ---- sprite specs: a template's sheet, frames, scale table and blend
    def seq(self, table_name, index, cmds_db, tables_db):
        names = tables_db.get(table_name) or []
        if not names:
            return None
        lst = cmds_db.get(names[min(max(index, 0), len(names) - 1)], [])
        out, loop = [], 0
        for op, a in lst:
            parts = [x.strip() for x in a.split(",")] if a else []
            if op in ("ANIMCMD_FRAME", "AFFINEANIMCMD_FRAME"):
                nums = [self.val(p.split("=")[-1]) for p in parts if "=" not in p or p.strip().startswith(".") is False]
                flags = [p for p in parts if "=" in p]
                if op == "ANIMCMD_FRAME":
                    hf = int(any("hFlip" in f and "TRUE" in f for f in flags))
                    vf = int(any("vFlip" in f and "TRUE" in f for f in flags))
                    nums = [self.val(p) for p in parts if "=" not in p]
                    out.append([nums[0], max(1, nums[1] if len(nums) > 1 else 1), hf, vf])
                else:
                    nums = [self.val(p) for p in parts if "=" not in p]
                    xs, ys, rot, dur = (nums + [0, 0, 0, 0])[:4]
                    out.append([self.s16(xs), self.s16(ys), self.s8(rot), dur])
            elif op in ("ANIMCMD_JUMP", "AFFINEANIMCMD_JUMP", "ANIMCMD_LOOP", "AFFINEANIMCMD_LOOP"):
                loop = 1
                break
            elif op in ("ANIMCMD_END", "AFFINEANIMCMD_END"):
                break
        return out, loop

    @staticmethod
    def s16(v):
        return v - 0x10000 if v >= 0x8000 else v

    @staticmethod
    def s8(v):
        v &= 0xFF
        return v - 0x100 if v >= 0x80 else v

    def sprite_spec(self, tmpl_name, motion):
        t = self.templates[tmpl_name]
        oam = t.get("oam", "")
        m = re.search(r"(\d+)x(\d+)", oam)
        w, h = (int(m.group(1)), int(m.group(2))) if m else (32, 32)
        blend = int("Blend" in oam)
        tile_tag, pal_tag = t.get("tileTag", "0"), t.get("paletteTag", t.get("tileTag", "0"))
        anim_i, tile_add, aff_i = motion.pop("anim", 0), motion.pop("tile", 0), motion.pop("aff", 0)
        key = (tmpl_name, anim_i, tile_add, aff_i)
        if key in self.sprite_ix:
            return self.sprite_ix[key]
        frames = self.seq(t.get("anims", ""), anim_i, self.anims, self.anim_tables)
        frames, loop = frames if frames else ([[0, 1, 0, 0]], 1)
        aff = self.seq(t.get("affineAnims", ""), aff_i, self.affs, self.aff_tables)
        sk = (tile_tag, pal_tag, w, h)
        if sk not in self.sheet_ix:
            self.sheet_ix[sk] = len(self.sheets)
            self.sheets.append([sk, []])
        offs = self.sheets[self.sheet_ix[sk]][1]
        seq = []
        for off, dur, hf, vf in frames:
            o = off + tile_add
            if o not in offs:
                offs.append(o)
            seq.append([offs.index(o), dur, hf, vf])
        spec = [self.sheet_ix[sk], seq, loop, (aff[0] if aff and aff[0] else 0), blend]
        self.sprite_ix[key] = len(self.sprites)
        self.sprites.append(spec)
        return self.sprite_ix[key]

    def life(self, spec_i, motion):
        f = motion.get("f", 0)
        if f:
            return f + motion.get("d", 0) + motion.get("after", 0)
        sheet, seq, loop, aff, _ = self.sprites[spec_i]
        if aff:
            return sum(max(1, x[3]) for x in aff) + motion.get("after", 0)
        if not loop:
            return sum(x[1] for x in seq) + motion.get("after", 0)
        return DEFAULT_LIFE + motion.get("after", 0)

    def bg(self, name):
        if name.isdigit():          # a script may name one by number (Precipice Blades' `fadetobg 21`)
            name = next((k for k, v in self.c.raw.items() if k.startswith("BG_") and v.strip() == name), name)
        if name not in self.bg_ix:
            self.bg_ix[name] = len(self.bgs)
            self.bgs.append(name)
        return self.bg_ix[name]

    # ---- tasks: the mons themselves, and the screen
    def task(self, name, g, t):
        W = lambda v: who(v)
        if name in ("AnimTask_ShakeMon", "AnimTask_ShakeMonInPlace"):
            n, d = max(1, g[3]), max(1, g[4])
            return [["k", t, W(g[0]), g[1], g[2], n, d]], n * d * 2
        if name == "AnimTask_ShakeMon2":
            n, d = max(1, g[3]), max(1, g[4])
            return [["k", t, W(g[0]) if g[0] < 4 else T, g[1], g[2], n, d]], n * d * 2
        if name == "AnimTask_HorizontalShake":
            f = max(8, g[2])
            whom = [A, T] if g[0] >= 4 else [W(g[0])]
            return [["k", t, b, (g[1] or 3) + 3, 0, f // 2, 1] for b in whom], f
        if name == "AnimTask_ShakeTargetBasedOnMovePowerOrDmg":
            return [["k", t, T, 3, 0, 10, 1]], 20
        if name in ("AnimTask_BlendBattleAnimPal", "AnimTask_BlendBattleAnimPalExclude"):
            layers = self.layers(g[0]) if name.endswith("Pal") else 1
            f = abs(g[3] - g[2]) * (g[1] + 1) + 1
            return [["c", t, layers, self.rgb(g[4]), g[2], g[3], f]], f
        if name == "AnimTask_BlendMonInAndOut":
            f = max(1, g[2]) * (g[3] + 1) * 2 * max(1, g[4])
            return [["x", t, 2 if W(g[0]) == A else 4, self.rgb(g[1]), g[2], f, max(1, g[4])]], f
        if name == "AnimTask_ScaleMonAndRestore":
            f = max(1, g[2]) * 2
            return [["z", t, W(g[3]), g[0] * g[2] / 256, g[1] * g[2] / 256, f]], f
        if name in ("AnimTask_TranslateMonEllipticalRespectSide", "AnimTask_TranslateMonElliptical", "AnimTask_SwayMon",
                    "AnimTask_RockMonBackAndForth"):
            f = max(8, g[4] if len(g) > 4 and g[4] else 24)
            return [["e", t, W(g[0]), g[1] or 6, g[2] or 3, f]], f
        if name in ("AnimTask_WindUpLunge", "AnimTask_SlideMonForFocusBand"):
            return [["l", t, A, 24, 0, 12]], 24
        if name in ("AnimTask_SquishTarget", "AnimTask_StretchTargetUp", "AnimTask_SquishAndSweatDroplets"):
            return [["z", t, T, 0.25, -0.25, 16]], 16
        if name in ("AnimTask_RotateMonSpriteToSide",):
            return [["o", t, W(g[3]) if len(g) > 3 else A, 20, 24]], 24
        if name == "AnimTask_StartSlidingBg":
            return [["gs", t, g[0], g[1]]], 0
        if name == "AnimTask_ElectricBolt":
            return [["b", t, g[0], g[1]]], 16
        if name in ("AnimTask_InvertScreenColor", "AnimTask_HardwarePaletteFade", "AnimTask_CurseBlendEffect"):
            return [["f", t, "#ffffff", 12]], 12
        if name == "AnimTask_BlendColorCycle":
            f = max(1, g[2]) * max(1, g[1] + 1) * max(2, g[3]) // 2
            return [["x", t, self.layers(g[0]), self.rgb(g[4]), g[3], f, max(1, g[2])]], f
        if name == "AnimTask_MetallicShine":
            return [["x", t, 2, "#ffffff", 12, 24, 2]], 24
        if name in ("AnimTask_ShakeBattlePlatforms", "AnimTask_ShakeTargetInPattern"):
            whom = [A, T] if name.endswith("Platforms") else [T]
            return [["k", t, b, 3, 0, 8, 1] for b in whom], 16
        if name in ("AnimTask_VoltTackleBolt",):
            return [["b", t, 0, -60]], 16
        if name in ("AnimTask_Splash", "AnimTask_RapinSpinMonElevation"):
            return [["l", t, A, 0, -12, 8], ["l", t + 18, A, 0, -12, 8]], 34
        if name in ("AnimTask_AttackerFadeToInvisible", "AnimTask_AttackerStretchAndDisappear", "AnimTask_SetAttackerInvisibleWaitForSignal"):
            return [["h", t, A, 0]], 12
        if name in ("AnimTask_ExtremeSpeedMonReappear",):
            return [["h", t, A, 1]], 8
        if name in ("AnimTask_BlendNonAttackerPalettes", "AnimTask_BlendNonAttackerMonPalettes"):
            f = max(1, abs(g[3] - g[2]) * (g[1] + 1))
            return [["c", t, 5, self.rgb(g[4]), g[2], g[3], f]], f
        if name == "AnimTask_ShakeAndSinkMon":
            return [["k", t, who(g[0]), 2, 0, 12, 1]], 24
        if name == "AnimTask_CreateSurfWave":
            pal = ["", "_muddy", "_sludge", ""][min(max(g[0], 0), 3)]
            return [["w", t, self.bg("SURF_PLAYER" + pal), self.bg("SURF_OPPONENT" + pal)]], 134   # moveAnim.js's WAVE
        return None, 0

    def layers(self, sel):
        """F_PAL_* bits to ours: 1 background, 2 attacker, 4 target."""
        out = 0
        if sel & 1: out |= 1
        if sel & 2: out |= 2
        if sel & 4: out |= 4
        if sel & 0x18: out |= 4 if sel & 8 else 2
        return out or 1

    @staticmethod
    def rgb(c):
        c &= 0x7FFF
        r, g, b = c & 31, (c >> 5) & 31, (c >> 10) & 31
        return "#%02x%02x%02x" % (r * 255 // 31, g * 255 // 31, b * 255 // 31)

    def compile(self, label):
        out = self.compile_cmds(self.script.walk(label))
        if not out[2]:
            out = self.compile_cmds(self.script.walk(label, first=True))
        return out

    def compile_cmds(self, cmds):
        t, busy, ev, n = 0, 0, [], 0
        impact = None
        bg_on = False
        for op, args in cmds:
            if op == "delay":
                t += max(0, self.val(args[0]) if args else 0)
            elif op == "waitforvisualfinish":
                t = max(t, busy)
            elif op in ("createsprite", "createspriteontargets", "createspriteontargets_onpos"):
                tmpl = args[0].strip() if args else ""
                if tmpl not in self.templates:
                    self.stats["unknown_tmpl"] += 1
                    continue
                cb_b = who(self.val(args[1])) if len(args) > 1 else A
                g = [self.val(a) for a in args[3:]] + [0] * 10
                g = [self.s16(x) if isinstance(x, int) and x > 0x7FFF and x < 0x10000 else x for x in g]
                callback = self.templates[tmpl].get("callback", "")
                if callback == "AnimSimplePaletteBlend":
                    f = abs(g[3] - g[2]) * (g[1] + 1) + 1
                    ev.append(["c", t, self.layers(g[0]), self.rgb(g[4]), g[2], g[3], f])
                    busy = max(busy, t + f)
                    continue
                if callback == "AnimComplexPaletteBlend":
                    f = max(1, g[2]) * max(1, g[1] + 1) * 2
                    ev.append(["x", t, self.layers(g[0]), self.rgb(g[3]), g[4], f, max(1, g[2])])
                    busy = max(busy, t + f)
                    continue
                if callback in MON_SPRITES:
                    e, f = self.mon_sprite(callback, g, t)
                    if e:
                        ev += e
                        busy = max(busy, t + f)
                    continue
                port = PORTS.get(callback)
                if port:
                    motion = port(g, cb_b, n)
                    self.stats["ported"] += 1
                else:
                    motion = classified_motion(*classify(callback, self.c_all), g, cb_b)
                    self.stats["classified"] += 1
                spec = self.sprite_spec(tmpl, motion)
                life = self.life(spec, motion)
                ev.append(["s", t, spec, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in motion.items() if v not in (None,) and not (k in ("fx",) and v == 1)}])
                busy = max(busy, t + life)
                if impact is None and (callback in HIT_CALLBACKS) and motion["o"][0] == T:
                    impact = t
                n += 1
            elif op in ("createvisualtask", "createvisualtaskontargets"):
                g = [self.val(a) for a in args[2:]] + [0] * 10
                g = [self.s16(x) if isinstance(x, int) and 0x7FFF < x < 0x10000 else x for x in g]
                e, f = self.task(args[0].strip() if args else "", g, t)
                if e is None:
                    nm = args[0].strip() if args else "?"
                    self.stats["unknown_task"][nm] = self.stats["unknown_task"].get(nm, 0) + 1
                    continue
                self.stats["tasks"] += 1
                ev += e
                busy = max(busy, t + f)
                if impact is None and any((x[0] == "k" and x[2] == T) or x[0] in ("b", "w") or (x[0] == "c" and x[2] & 4) for x in e):
                    impact = t + (12 if any(x[0] == "w" for x in e) else 0)
            elif op == "fadetobg" and args:
                ev.append(["g", t, self.bg(args[0].strip())])
                bg_on = True
            elif op == "fadetobgfromset" and len(args) >= 2:
                ev.append(["g", t, self.bg(args[0].strip()), self.bg(args[1].strip())])
                bg_on = True
            elif op in ("waitbgfadein", "waitbgfadeout"):
                t += FADE_FRAMES
            elif op == "restorebg":
                if bg_on:
                    ev.append(["g", t, -1])
                bg_on = False
            elif op in ("invisible", "visible") and args:
                ev.append(["h", t, who(self.val(args[0])), int(op == "visible")])
        total = max(t, busy, 1)
        if bg_on:
            ev.append(["g", total, -1])
        return [total, impact if impact is not None else -1, ev]

    def mon_sprite(self, cb, g, t):
        if cb == "DoHorizontalLunge":
            f = max(1, g[0])
            return [["l", t, A, g[0] * g[1], 0, f]], f * 2
        if cb == "DoVerticalDip":
            f = max(1, g[0])
            return [["l", t, who(g[2]), 0, g[0] * g[1], f]], f * 2
        if cb in ("SlideMonToOffset", "SlideMonToOffsetPartner"):
            return [["m", t, who(g[0]), g[1], g[2], max(1, g[4])]], max(1, g[4])
        if cb == "SlideMonToOriginalPos":
            return [["r", t, who(g[0]), max(1, g[2])]], max(1, g[2])
        if cb == "SlideMonToOffsetAndBack":
            return [["l", t, who(g[0]), g[1], g[2], max(1, g[4])]], max(1, g[4]) * 2
        if cb == "AnimBowMon":
            return [["l", t, A, -8 if g[0] in (0, 1) else 12, 0, 8]], 16
        if cb == "AnimShakeMonOrBattlePlatforms":
            # velocity, frames between swings, duration, SHAKE_BG_X/Y or SHAKE_MON_X/Y: the whole scene shakes,
            # so both mons do (Rock Slide, Superpower).
            v, per, dur = abs(g[0]), max(1, g[1] + 1), max(1, g[2])
            ax, ay = (v, 0) if g[3] in (0, 2) else (0, v)
            n = max(1, dur // (per * 2))
            return [["k", t, b, ax, ay, n, per] for b in (A, T)], dur
        return None, 0

def main():
    print(f"pokeemerald-expansion @ {COMMIT[:10]}")
    c_text = {n: fetch(f"src/{n}.c") for n in C_FILES}
    data_h = fetch("src/data/battle_anim.h")
    graphics = fetch("src/graphics.c")
    consts = Consts([fetch("include/constants/battle_anim.h"), fetch("include/constants/rgb.h"),
                     fetch("include/config/battle.h"), fetch("include/battle_anim.h")])
    allc = "\n".join(c_text.values()) + data_h
    templates = {k: c_fields(v) for k, v in c_blocks(allc, "SpriteTemplate").items()}
    anims, anim_tables = parse_cmd_tables(allc, "AnimCmd")
    affs, aff_tables = parse_cmd_tables(allc, "AffineAnimCmd")
    print("templates", len(templates), "anim lists", len(anims), "tables", len(anim_tables),
          "affine lists", len(affs), "tables", len(aff_tables))
    script = Script(fetch("data/battle_anim_scripts.s"), fetch("asm/macros/battle_anim_script.inc"), consts)
    print("labels", len(script.labels), "macros", len(script.macros))
    return consts, templates, anims, anim_tables, affs, aff_tables, data_h, graphics, c_text, script


def our_moves():
    """The move slugs, in moves.js order (a generated file; read, not imported),
    and Struggle, which battle.js plays when no move has PP and moves.js omits."""
    text = (ROOT / "src" / "data" / "moves.js").read_text(encoding="utf-8")
    return re.findall(r'\{"n":"([^"]+)"', text) + ["struggle"]

def label_for(slug, labels):
    name = ALIAS.get(slug) or "".join(w[:1].upper() + w[1:] for w in slug.split("-"))
    lab = "gBattleAnimMove_" + name
    if lab in labels:
        return lab
    low = {l.lower(): l for l in labels if l.startswith("gBattleAnimMove_")}
    return low.get(lab.lower())

def compile_all(report=False):
    consts, templates, anims, anim_tables, affs, aff_tables, data_h, graphics, c_text, script = main()
    comp = Compiler(consts, templates, anims, anim_tables, affs, aff_tables, "\n".join(c_text.values()) + data_h, script)
    out, missing = {}, []
    classified = {}
    for slug in our_moves():
        lab = label_for(slug, script.labels)
        if not lab:
            missing.append(slug)
            continue
        before = comp.stats["classified"]
        out[slug] = comp.compile(lab)
    if report:
        durs = sorted(v[0] for v in out.values())
        print(f"moves {len(out)} compiled, missing {missing}")
        print(f"frames: median {durs[len(durs)//2]}, p90 {durs[int(len(durs)*.9)]}, max {durs[-1]}; empty {sum(1 for v in out.values() if not v[2])}")
        print(f"sprites ported {comp.stats['ported']}, classified {comp.stats['classified']}, tasks {comp.stats['tasks']}, unknown templates {comp.stats['unknown_tmpl']}")
        print("unknown tasks:", sorted(comp.stats["unknown_task"].items(), key=lambda kv: -kv[1])[:40])
        print("specs", len(comp.sprites), "sheets", len(comp.sheets), "bgs", len(comp.bgs))
        print("empty:", [k for k, v in out.items() if not v[2]][:60])
    return comp, out, templates, data_h, graphics


# ------------------------------------------------------------------ art
from PIL import Image

def symbol_paths(graphics):
    """`gSymbol` -> the source file graphics.c builds it from."""
    out = {}
    for m in re.finditer(r"(g\w+)\[\]\s*=\s*INC(?:GFX|BIN)_U(?:8|16|32)\(\s*\"([^\"]+)\"", graphics):
        path = m.group(2)
        if path.endswith(".gbapal"):
            base = path[:-len(".gbapal")]
            path = base + ".pal"            # an INCBIN .gbapal is built from a JASC .pal
        out[m.group(1)] = re.sub(r"\.(4bpp|8bpp)(\.lz|\.smol)?$", ".png", path)
    return out

def pic_table(data_h, consts):
    """ANIM_TAG_* -> (graphics symbol, palette symbol), config ternaries resolved."""
    out = {}
    for m in re.finditer(r"BATTLE_ANIMATION\(\s*(\w+)\s*,\s*(.+?)\s*,\s*(0x[0-9A-Fa-f]+|\d+)\s*,\s*(.+?)\s*\)\s*,?\s*$", data_h, re.M):
        def pick(expr):
            t = re.match(r"(.+?)\?\s*(\w+)\s*:\s*(\w+)", expr)
            if t:
                return t.group(2) if consts.eval(t.group(1)) else t.group(3)
            return expr.strip()
        out[m.group(1)] = (pick(m.group(2)), pick(m.group(4)))
    return out

def bg_table(data_h):
    out = {}
    for m in re.finditer(r"\[(BG_\w+)\]\s*=\s*\{\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\}", data_h):
        out[m.group(1)] = (m.group(2), m.group(3), m.group(4))
    return out

def exists_upstream(path):
    try:
        fetch(path, True)
        return True
    except Exception:
        return False

def load_palette(path):
    """RGB triples from a PNG's palette or a JASC .pal (a `.gbapal` is built from either)."""
    if path.endswith(".pal") and not exists_upstream(path):
        path = path[:-4] + ".png"
    if path.endswith(".pal"):
        lines = fetch(path).splitlines()
        return [tuple(int(v) for v in ln.split()[:3]) for ln in lines[3:] if ln.strip()]
    im = Image.open(io_bytes(fetch(first_png(path) if path.endswith(".png") else path, True)))
    pal = im.getpalette() or []
    return [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]

def io_bytes(b):
    import io as _io
    return _io.BytesIO(b)

def tiles_of(path):
    """A sheet as its 8x8 tiles of palette indices, in the order the GBA
    reads them. A sheet the Makefile concatenates from parts (ice_crystals
    is ice_crystals_0.png ... _4.png) is read part by part."""
    try:
        parts = [fetch(path, True)]
    except FileNotFoundError:
        parts, i = [], 0
        base = path[:-4]
        while True:
            try:
                parts.append(fetch(f"{base}_{i}.png", True))
            except FileNotFoundError:
                break
            i += 1
        if not parts:
            raise
    tiles = []
    for data in parts:
        im = Image.open(io_bytes(data))
        if im.mode != "P":
            im = im.convert("P")
        px, tw, th = im.load(), im.width // 8, im.height // 8
        for ty in range(th):
            for tx in range(tw):
                tiles.append([px[tx * 8 + x, ty * 8 + y] & 15 for y in range(8) for x in range(8)])
    return tiles

def first_png(path):
    """The palette carrier for a sheet: itself, or its first part."""
    try:
        fetch(path, True)
        return path
    except FileNotFoundError:
        return path[:-4] + "_0.png"

def build_sheet(gfx_path, pal_path, w, h, offsets, out_file):
    tiles = tiles_of(gfx_path)
    pal = load_palette(pal_path) if pal_path else load_palette(first_png(gfx_path))
    tpf = (w // 8) * (h // 8)
    strip = Image.new("RGBA", (w * max(1, len(offsets)), h), (0, 0, 0, 0))
    out = strip.load()
    for fi, off in enumerate(offsets):
        for j in range(tpf):
            k = off + j
            if k >= len(tiles):
                continue
            dx, dy = fi * w + (j % (w // 8)) * 8, (j // (w // 8)) * 8
            for i, c in enumerate(tiles[k]):
                if c and c < len(pal):
                    r, g, b = pal[c]
                    out[dx + i % 8, dy + i // 8] = (r, g, b, 255)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    strip.save(out_file, optimize=True)

def build_bg(img_path, pal_path, map_path, out_file):
    tiles = tiles_of(img_path)
    pal = load_palette(pal_path)
    raw = fetch(map_path, True)
    n = len(raw) // 2
    cols = 64 if n == 2048 else 32
    rows = n // cols
    entries = [raw[i * 2] | (raw[i * 2 + 1] << 8) for i in range(n)]
    banks = sorted({e >> 12 for e in entries})
    base = banks[0] if banks else 0
    # Colour 0 is TRANSPARENT on the GBA - the battle scene shows through it -
    # and pret keeps a placeholder colour there (Dark's was a green band).
    im = Image.new("RGBA", (cols * 8, rows * 8), (0, 0, 0, 0))
    out = im.load()
    for i, e in enumerate(entries):
        tile, hf, vf, bank = e & 0x3FF, (e >> 10) & 1, (e >> 11) & 1, e >> 12
        if tile >= len(tiles):
            continue
        dx, dy = (i % cols) * 8, (i // cols) * 8
        pb = (bank - base) * 16
        for k, c in enumerate(tiles[tile]):
            if not c:
                continue
            x, y = k % 8, k // 8
            idx = pb + c if pb + c < len(pal) else c
            r, g, b = pal[idx] if idx < len(pal) else (0, 0, 0)
            out[dx + (7 - x if hf else x), dy + (7 - y if vf else y)] = (r, g, b, 255)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_file, optimize=True)

SURF = "graphics/battle_anims/backgrounds/"
SPECIAL_BGS = {
    "SURF_PLAYER": (SURF + "water.png", SURF + "water.png", SURF + "water_player.bin"),
    "SURF_OPPONENT": (SURF + "water.png", SURF + "water.png", SURF + "water_opponent.bin"),
    "SURF_PLAYER_muddy": (SURF + "water.png", SURF + "water_muddy.pal", SURF + "water_player.bin"),
    "SURF_OPPONENT_muddy": (SURF + "water.png", SURF + "water_muddy.pal", SURF + "water_opponent.bin"),
    "SURF_PLAYER_sludge": (SURF + "water.png", SURF + "sludge_wave.pal", SURF + "water_player.bin"),
    "SURF_OPPONENT_sludge": (SURF + "water.png", SURF + "sludge_wave.pal", SURF + "water_opponent.bin"),
}

def slug(name):
    return re.sub(r"^(ANIM_TAG_|BG_)", "", name).lower()

def build():
    comp, out, templates, data_h, graphics = compile_all(report=True)
    syms = symbol_paths(graphics)
    pics = pic_table(data_h, comp.c)
    bgt = bg_table(data_h)
    import shutil
    if OUT_ART.exists():
        shutil.rmtree(OUT_ART)
    sheets = []
    for (tile_tag, pal_tag, w, h), offsets in comp.sheets:
        gfx_sym = pics.get(tile_tag, (None, None))[0]
        pal_sym = pics.get(pal_tag, pics.get(tile_tag, (None, None)))[1]
        gfx, pal = syms.get(gfx_sym), syms.get(pal_sym)
        name = f"{slug(tile_tag)}" + (f"-{slug(pal_tag)}" if pal_tag != tile_tag else "") + f"-{w}x{h}"
        if not gfx:
            if tile_tag not in ("0", "TAG_NONE"):
                print("  no sheet for", tile_tag)
            sheets.append([None, w, h, 0])
            continue
        build_sheet(gfx, pal, w, h, offsets, OUT_ART / "s" / f"{name}.png")
        sheets.append([name, w, h, len(offsets)])
    bgs = []
    for name in comp.bgs:
        if name in SPECIAL_BGS:
            img, pal, mp = SPECIAL_BGS[name]
        elif name in bgt:
            img, pal, mp = (syms.get(x) for x in bgt[name])
        else:
            print("  no background", name)
            bgs.append(None)
            continue
        file = name.lower()
        try:
            build_bg(img, pal or img, mp, OUT_ART / "bg" / f"{file}.png")
            bgs.append(file)
        except Exception as e:
            print("  background failed", name, e)
            bgs.append(None)
    emit(comp, out, sheets, bgs)

def emit(comp, out, sheets, bgs):
    head = (f"// Generated by tools/build_anims.py from {REPO}@{COMMIT[:10]} - do not edit by hand.\n"
            "// docs/battles.md, Art (phase 7). SHEETS [file, w, h, frames] (public/battle/anim/s/);\n"
            "// SPRITES [sheet, [[frame, ticks, hflip, vflip]], loops, [[xscale, yscale, rot, ticks]] | 0, blend];\n"
            "// BGS files (public/battle/anim/bg/); ANIMS slug -> [frames, impact frame | -1, events] (the player reads them).\n")
    js = head + "export const SHEETS = " + json.dumps(sheets, separators=(",", ":")) + ";\n"
    js += "export const SPRITES = " + json.dumps(comp.sprites, separators=(",", ":")) + ";\n"
    js += "export const BGS = " + json.dumps(bgs, separators=(",", ":")) + ";\n"
    js += "export const ANIMS = {\n" + ",\n".join(f"{json.dumps(k)}:{json.dumps(v, separators=(',', ':'))}" for k, v in out.items()) + "\n};\n"
    OUT_DATA.write_text(js, encoding="utf-8", newline="\r\n")
    art = sum(f.stat().st_size for f in OUT_ART.rglob("*.png"))
    print(f"wrote {OUT_DATA.relative_to(ROOT)} {len(js) // 1024}KB, {sum(1 for _ in OUT_ART.rglob('*.png'))} images {art // 1024}KB")

if __name__ == "__main__" and "--report" in sys.argv:
    compile_all(report=True)
    sys.exit(0)
if __name__ == "__main__" and "--build" in sys.argv:
    build()
    sys.exit(0)

if __name__ == "__main__":
    build()
