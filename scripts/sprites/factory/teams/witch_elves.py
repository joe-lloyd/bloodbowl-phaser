"""Witch Elf team (witch_novice, witch_priestess); its Witch Elves are the Dark Elf team's witch_elf.
Rank reads from the head down: novices go bare with tied hair, Witch Elves wear a wild
white mane, the priestess a horn crown and a cape."""
from lib import Biped, register, core, looks
from lib.core import ball_at, cone, flat_cone, tband, tube
from teams import elves_common as ec
from teams.elves_dark import DE, WitchElf


@register
class Novice(looks.Fine, Biped):
    """A dancer in a two-piece with no armour at all: kit1 top and briefs, kit2 bands, barefoot in ankle wraps. Grown
    and athletic, always on her toes."""
    key = "witch_novice"
    race = "elf"
    sex = "f"
    knobs = dict(legs=1.14, limb=0.8, shoulders=0.88, torso=0.9)
    layout = dict(DE, hair="long", hair_mat="hair", brow="hair", lip="lip_f", torso="skin", arms="skin", legs="skin",
                  boots="skin", cuff=None, belt=None, witch_top="bandeau", witch_bottom="briefs", witch_marks=None)
    stance = dict(lean=10, nod=-8, twist=8, legs={"l": (22, 16, 30), "r": (-16, 16, 24)}, feet={"r": 22},
                  arms={"l": (34, 40, 50, 6), "r": (-22, 44, 40, 0)}, hands="relaxed")
    stride, arm_swing, run_lean, jump = 50, 42, 24, 0.42
    target_px = 92

    def idle(self, ph, p, w):       # bouncing on her toes, weight swapping side to side, arms out like a tumbler
        k = 1 if w["s1"] > 0 else -1
        p.update(twist=8 * k, look=-12 * k, hop=0.05 * w["breath"],
                 arms={"l": (34 - 26 * w["up"], 40, 50, 6), "r": (-22 + 30 * w["up"], 44, 40, 0)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = ec.hf(J)
        hair = L.get("witch_hair")
        if hair:
            ec.mane(J, tag, hair, length=0.1)
        knot = L.get("witch_knot")
        if knot:
            ec.topknot(J, L, tag, knot, length=0.5)
        top = L.get("witch_top")
        if top:
            tband(tag + "top", J, P, [0.33, 0.4, 0.46], "kit1", k=1.06, add=0.012)
        if top == "halter":
            for sd in (-1, 1):
                ec.torso_stripe(J, P, tag, "halter%d" % sd, [(0.46, 26 * sd), (P["sh_h"] + 0.04, 10 * sd)], "kit2", r=0.03)
        if top == "strap":
            ec.torso_stripe(J, P, tag, "strap", [(0.36, -40), (0.46, 0), (P["sh_h"] + 0.02, 40)], "kit2", r=0.05)
        bottom = L.get("witch_bottom")
        if bottom:
            tband(tag + "briefs", J, P, [-0.1, -0.03, 0.04], "kit1", k=1.1, add=0.012)
            tband(tag + "waist", J, P, [0.035, 0.07], "kit2", k=1.12, add=0.014)
        if bottom == "sash":
            ec.sash(J, P, tag, pose, "kit2", sd=1, length=0.55, h=0.05)
        marks = L.get("witch_marks")
        if marks == "paint":
            for side in ("l", "r"):
                ec.arm_band(J, L, tag, side, 0.62, 0.74, "kit1", "upper", grow=1.06, name="paint")
                ec.leg_band(J, L, tag, side, 0.45, 0.53, "kit1", "thigh", grow=1.04, name="paint")
                ec.leg_band(J, L, tag, side, 0.62, 0.7, "kit1", "thigh", grow=1.04, name="paintb")
        if marks == "mask":
            ec.face_mask(J, tag, "kit2")
        if marks == "stockings":
            for side in ("l", "r"):
                ec.leg_band(J, L, tag, side, 0.4, 1.0, "kit1", "thigh", grow=1.05, name="stock")
                ec.leg_band(J, L, tag, side, 0.0, 0.8, "kit1", "shin", grow=1.06, name="stock")
        for side in ("l", "r"):
            ec.arm_band(J, L, tag, side, 0.5, 0.95, "kit2", "fore", name="wrist")
            ec.leg_band(J, L, tag, side, 0.8, 1.0, "kit2", "shin", grow=1.12, name="anklet")


@register
class Priestess(WitchElf):
    """A Witch Elf grown into her rank: a tall steel horn crown over long sleek hair, spiked shoulder plates, a
    kit1 cape down to her heels and steel on the shins."""
    key = "witch_priestess"
    knobs = dict(legs=1.14, limb=0.82, shoulders=0.9)
    layout = dict(WitchElf.layout, elf_tiara=None, elf_mane=None, hair="slick", hair_mat="hair_white", elf_backhair="hair_white",
                  elf_crown="metal", pads="plate", pad_mat="darkmetal", pad_trim="kit2", spikes=2, cape="long", cape_mat="kit1",
                  cape_lining="kit2", clasp=False, greaves="darkmetal", kneecops=True, knee_mat="darkmetal", boots="darkmetal")
    stance = dict(lean=-2, nod=-8, legs={"l": (6, 15, 6), "r": (-4, 15, 6)}, arms={"l": (6, 38, 46, 8), "r": (6, 38, 46, 8)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 44, 34, 18, 0.2
    target_px = 112

    def idle(self, ph, p, w):       # slow and certain: raises one clawed hand as if calling the kill, cape stirring
        p.update(look=18 * w["s1"], nod=-8 - 3 * w["breath"], cape=0.05 + 0.05 * w["s2"],
                 arms={"l": (6, 38 + 3 * w["breath"], 46, 8), "r": (6 + 44 * w["up"], 38, 46 + 52 * w["up"], 8)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.loose_hair(J, L, tag, length=0.4, w=0.14)
        core.panel(J, P, tag + "apron", True, 0.78, 0.15, "kit1", trim="kit2", top=0.05)
        c, X, F, U, s = ec.hf(J)
        crown = L.get("elf_crown")
        if crown:
            for sd in (-1, 1):
                root = c + X * sd * s[0] * 0.8 + U * s[2] * 0.6
                tube(tag + "crown%d" % sd, [root, root + X * sd * 0.24 + U * 0.1, root + X * sd * 0.34 + U * 0.34,
                                            root + X * sd * 0.2 + U * 0.62], [0.075, 0.07, 0.05, 0.01], crown, n=6)
            brow = c + F * s[1] * 0.95 + U * s[2] * 0.5
            flat_cone(tag + "crownblade", brow - U * 0.06, brow + U * 0.3, 0.075, crown, F, 0.35)
            ec.headband(J, tag, crown, lo=0.3, hi=0.52)
        for side, sd in (("l", -1), ("r", 1)):      # elbow blades
            sh, el, wr = J["arms"][side][:3]
            cone(tag + "elb" + side, el, el + (el - wr).normalized() * 0.2 + (el - sh).normalized() * 0.1, 0.05, "metal", 6)

    def details(self, J, P, L, tag, pose):
        super().details(J, P, L, tag, pose)
        c, X, F, U, s = ec.hf(J)
        if L.get("elf_crown"):
            ball_at(tag + "crowngem", c + F * s[1] * 1.06 + U * s[2] * 0.48, 0.035, "kit1")
