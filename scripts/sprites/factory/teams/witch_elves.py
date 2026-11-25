"""Witch Elf team (witch_novice, witch_priestess); its Witch Elves are the Dark Elf team's witch_elf.
Rank reads from the head down: novices tie back dark hair, Witch Elves wear a wild
white mane, the priestess a horn crown and a cape."""
from lib import Biped, register, core, looks
from lib.core import ball_at, cone, flat_cone, tube
from teams import elves_common as ec
from teams.elves_dark import DE, WitchElf


@register
class Novice(looks.Fine, Biped):
    """High ponytail of dark hair, plain kit1 dress with a kit2 shawl and bandaged wrists: no metal, no blades yet."""
    key = "witch_novice"
    race = "elf"
    sex = "f"
    knobs = dict(legs=1.04, limb=0.8, shoulders=0.86, torso=0.9)
    layout = dict(DE, hair="long", hair_mat="hair", brow="hair", lip="lip_f",
                  torso="kit1", arms="kit1", legs="skin",
                  wraps="bandage", boots="boot", cuff=None, coat="robe", coat_mat="kit1", robe_len=0.62,
                  robe_lining="cloth_black", hem="kit2", jag=0.5, belt="kit2", buckle=None, neckband="kit2")
    stance = dict(lean=6, nod=4, legs={"l": (4, 9, 8), "r": (-4, 9, 8)}, arms={"l": (34, 12, 92, -34), "r": (34, 12, 92, -34)},
                  hands="open")
    stride, arm_swing, run_lean, jump = 38, 34, 16, 0.22
    target_px = 90

    def idle(self, ph, p, w):       # nervous: wrings her hands at her chest and glances left and right
        p.update(look=24 * w["s1"], nod=4 - 4 * w["breath"],
                 arms={"l": (34 + 10 * w["up"], 12, 92 + 14 * w["dn"], -34), "r": (34 + 10 * w["dn"], 12, 92 + 14 * w["up"], -34)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.drape(J, P, tag, "cowl", 0.24, -180, 180, ("kit2", "kit2"), stream=0, jag=0.09, depth=0.04, nu=22, grow=-0.03, fold=0.4, flare=0.15)
        ec.sash(J, P, tag, pose, "kit2", sd=1, length=0.5)

    def details(self, J, P, L, tag, pose):
        ec.studs(J, P, tag, "brooch", [(P["sh_h"] + 0.02, 0)], "kit2", r=0.035, off=0.11)


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
        ball_at(tag + "crowngem", c + F * s[1] * 1.06 + U * s[2] * 0.48, 0.035, "kit1")
