"""Imperial Nobility (imperial_lineman, imperial_thrower, noble_blitzer, bodyguard): foppish nobles in
puffed, slashed doublets and feathered hats, guarded by dour armoured retainers. Nobody carries a weapon
or a ball."""
import math
from mathutils import Vector, Matrix
from lib import Biped, register, core, parts
from lib.core import tube, tband, ball_at, box, lerp, UP, basis, D, ellipsoid, cap, cone, flat_cone, surf
from teams import men_common as mc


@register
class ImperialLineman(Biped):
    """Liveried retainer: floppy beret with a short feather, puffed slashed sleeves, two-coloured hose; palm out."""
    key = "imperial_lineman"
    race = "human"
    knobs = dict(limb=0.95)
    layout = dict(skin="skin_fair", hair="short", hair_mat="hair_brown", torso="kit1", arms="kit1", legs="kit1", boots="boot",
                  cuff=None, belt="leather", neckband="shirt", sleeve_cuff="kit2", coat="gambeson", hem="kit2")
    stance = dict(lean=-2, legs={"l": (8, 8, 4), "r": (-6, 8, 4)}, arms={"l": (-16, 36, 62, -50), "r": (40, 14, 70, 0)},
                  hands="open")
    height = 1.08

    def idle(self, ph, p, w):       # fends: one hand on hip, the other pushes a haughty palm out, nose in the air
        up = w["up"]
        p.update(arms={"l": (-16, 36, 62, -50), "r": (40 + 34 * up, 14, 70 - 50 * up, 0)}, nod=10 + 6 * up, look=-14 * w["s1"],
                 hand_modes={"l": "fist", "r": "open"})

    def extras(self, J, P, L, tag, pose):
        mc.beret(tag, J, "kit2", band="kit1", tilt=18, size=1.45)
        c, X, F, U, s, R = mc.head(J)
        a = c - X * s[0] * 0.9 + U * s[2] * 0.75
        flat_cone(tag + "pin", a, a - X * 0.12 + U * 0.36 - F * 0.14, 0.07, "kit1", F, 0.3)
        for side in ("l", "r"):
            mc.puff_sleeve(tag, J, side, "kit1", "kit2", r=0.16)
        mc.legging(tag, J, L, "r", "kit2", 0.0, 0.66, grow=1.03)        # mi-parti hose: one leg in each colour
        mc.legging(tag, J, L, "l", "kit2", 0.22, 0.3, grow=1.08, name="garter")
        for i, a in enumerate((-30, 0, 30)):                            # slashes down the doublet front
            tube(tag + "dslash%d" % i, [surf(J, P, 0.3, a, 0.03), surf(J, P, 0.45, a * 1.1, 0.035)], [0.028] * 2, "kit2", n=5)


@register
class ImperialThrower(Biped):
    """Cavalier dandy: huge-brimmed hat with a sweeping plume, half-cape off one shoulder, lace collar, goatee."""
    key = "imperial_thrower"
    race = "human"
    knobs = dict(limb=0.94, torso=0.96)
    layout = dict(skin="skin_fair", hair="slick", hair_mat="hair_blond", brow="hair_blond", torso="kit1", arms="kit1", legs="trouser",
                  boots="boot", cuff="kit2", coat="tails", lapels=True, lapel="kit2", belt="kit2", sleeve_cuff="shirt",
                  beard="hair_blond", beard_len=0.3, hem="kit2", pant_stripe="kit2")
    stance = dict(lean=-3, twist=10, legs={"l": (10, 7, 4), "r": (-10, 9, 4)}, arms={"l": (-10, 30, 40, -20), "r": (36, 22, 104, -30)},
                  hands="relaxed")
    height = 1.06

    def idle(self, ph, p, w):       # twirls his moustache, then flicks the hand away with a flourish
        up, dn = w["up"], w["dn"]
        p.update(arms={"l": (-10, 30, 40, -20), "r": (36 + 30 * up + 20 * dn, 22 + 30 * dn, 104 + 34 * up - 70 * dn, -30 - 20 * up + 30 * dn)},
                 hand_modes={"r": "open" if dn > 0.3 else "relaxed"}, nod=6 * up, look=12 * w["s1"], cape=0.05 + 0.05 * w["s1"])

    def extras(self, J, P, L, tag, pose):
        mc.brim_hat(tag, J, "kit1", brim=1.95, crown=0.6, band="kit2", tilt=-14, sit=0.46)
        mc.side_feather(tag, J, "kit2", sd=-1, length=0.78, r=0.13)
        # half-cape hung from the left shoulder
        X, u = J["X"], J["u"]
        Bh = Vector((J["B"].x, J["B"].y, 0)).normalized()
        st = pose.get("cape", 0.05) + (0.5 if mc.act(pose) else 0.0)
        sh = J["arms"]["l"][0]
        rows = []
        for i in range(5):
            v = i / 4
            row = []
            for j in range(6):
                a = D(-150 + 130 * j / 5)
                r = 0.2 + 0.1 * v
                cpt = sh + u * 0.08 + X * 0.1 - UP * (0.68 * v * (1 - 0.4 * st)) + Bh * (0.68 * v * st)
                row.append(cpt + X * (r * 1.25 * math.sin(a)) + Bh * (r * math.cos(a) + 0.08) * (1 + 0.08 * math.sin(j * 2.3)))
            rows.append(row)
        core.sheet(tag + "halfcape", rows, ["kit2", "lining"], thick=0.025)
        tube(tag + "capecord", [sh + u * 0.1 + X * 0.05, surf(J, P, P["sh_h"] - 0.04, 0, 0.05), J["arms"]["r"][0] + u * 0.06 - X * 0.08],
             [0.02] * 3, "gold", n=5)
        tband(tag + "lace", J, P, [P["sh_h"] + 0.1, P["sh_h"] + 0.04, P["sh_h"] - 0.03], "shirt", k=1.0, add=0.07, solid=0.03, jag=0.3)


@register
class NobleBlitzer(Biped):
    """Gilded half-armour over puffed sleeves and striped trunk hose; combed morion with twin plumes; preening."""
    key = "noble_blitzer"
    race = "human"
    knobs = dict(shoulders=1.1, limb=1.05)
    layout = dict(skin="skin_fair", torso="kit1", arms="kit1", legs="shirt", boots="boot", cuff="kit2", breast="metal", gorget=True,
                  gauntlets=True, belt="kit2", emblem_mat="kit2", kneecops=True, knee_mat="metal", beard="hair_brown", beard_len=0.3,
                  hair=None, loin="kit2", loin_trim="gold")
    stance = dict(lean=-2, legs={"l": (10, 12, 4), "r": (-8, 12, 4)}, arms={"l": (-18, 38, 62, -52), "r": (-18, 38, 62, -52)},
                  hands="fist")
    stride, arm_swing, jump = 36, 30, 0.18
    height = 1.06

    def idle(self, ph, p, w):       # poses with fists on hips, chin up, then buffs his breastplate with one hand
        up = w["up"]
        p.update(arms={"l": (-18, 38, 62, -52), "r": (-18 + 58 * up, 38 - 16 * up, 62 + 48 * up, -52 - 8 * up)},
                 nod=12, look=20 * w["c1"], hand_modes={"r": "relaxed"})

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s, R = mc.head(J)
        big = (s[0] * 1.15, s[1] * 1.15, s[2] * 1.13)
        # morion: skull, tall comb, boat-shaped brim rising to points front and back
        cap(tag + "morion", c + U * 0.02, big, "metal", U, cut=0.18, rot=R, thick=0.025)
        for i, y in enumerate((-0.85, -0.45, 0.0, 0.45, 0.85)):
            z = math.sqrt(max(0.0, 1 - y * y))
            b = c + F * y * big[1] + U * (z * big[2] + 0.0)
            flat_cone(tag + "comb%d" % i, b - U * 0.04, b + U * (0.1 + 0.12 * z), 0.12, "gold", X, 0.25)
        for sgn in (-1, 1):
            b = c + U * s[2] * 0.3 + F * sgn * s[1] * 0.6
            flat_cone(tag + "brim%d" % sgn, b, b + F * sgn * s[1] * 1.25 + U * 0.12, s[0] * 1.3, "metal", U, 0.2)
        mc.side_feather(tag, J, "kit2", sd=1, length=0.6, r=0.11, name="plumeR")
        mc.side_feather(tag, J, "kit1", sd=-1, length=0.6, r=0.11, name="plumeL")
        for side in ("l", "r"):
            mc.puff_sleeve(tag, J, side, "kit1", "kit2", r=0.2)
            mc.pumpkin_hose(tag, J, side, "kit1", "kit2", r=0.2)


@register
class Bodyguard(Biped):
    """Dour heavy retainer: closed sallet, thick plate shoulders, long livery coat, arms folded across his chest."""
    key = "bodyguard"
    race = "human"
    knobs = dict(shoulders=1.28, torso=1.22, limb=1.25, legs=0.96, neck=1.2)
    layout = dict(skin="skin_fair", torso="kit1", arms="mail", legs="trouser", boots="boot", cuff="leather", coat="frock",
                  coat_mat="kit1", hem="kit2", breast="darkmetal", gorget=True, pads="big", pad_mat="kit2", pad_trim="darkmetal",
                  gauntlets=True, greaves=True, belt="kit2", visor=True, trim="kit2", emblem_mat="kit2", hair=None,
                  tabard="kit2", tabard_trim="kit1")
    stance = dict(lean=1, legs={"l": (4, 17, 4), "r": (-3, 17, 4)}, arms={"l": (38, 6, 108, -78), "r": (46, 6, 112, -78)},
                  hands="fist")
    stride, arm_swing, jump = 30, 24, 0.1
    height = 1.02

    def idle(self, ph, p, w):       # arms folded, unmoving; only the helmet turns to scan, with one slow heave of the chest
        p.update(look=34 * w["s1"], lean=1 - 2 * w["breath"])

    def extras(self, J, P, L, tag, pose):
        mc.closed_helm(tag, J, "darkmetal", trim="kit2", tail=0.42)
        c, X, F, U, s, R = mc.head(J)
        core.crest(tag, c, R, s, "kit2", h=0.1, n=4, lo=0.5, width=0.05)      # low livery-coloured comb
