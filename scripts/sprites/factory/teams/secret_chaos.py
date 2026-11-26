"""Secret League models, round four: men of the north and the east, Chaos mutants and beasts, Fimir and Zoats. Each one
gives a position its own model on a team that used to repeat one (see src/data/community/secretLeagueModels.json)."""
from mathutils import Vector
from lib import Biped, Centaur, Quadruped, register, core, palette, parts
from lib.core import UP, cone, surf
from teams import chaos_common as cc
from teams.chaos_chosen import Beastman, ChaosChosen, Minotaur
from teams.chaos_khorne import Marauder
from teams.elves_dark import Blitzer as DarkElfBlitzer
from teams.men_norse import Raider, Valkyrie
from teams.secret_daemons import pincer

palette.ramp("armour_lilac", "#3a2a5a", "#7a5aa8", "#c8a8ec")
palette.ramp("skin_fimir", "#3a4a3a", "#6a806a", "#a8b8a0")
palette.ramp("skin_zoat", "#1e3a5a", "#3a6a8a", "#7aa8c0")
palette.ramp("skin_tzeentch", "#4a5a9a", "#8a9ad0", "#c8d4f4")


# ----------------------------------------------------------------------------- Hung and Kurgan
@register
class HungMarauder(Marauder):
    """A steppe rider: shaved head under a tall kit1 fur cap, long drooping moustache, kit2 sash, no warpaint crest."""
    key = "hung_marauder"
    layout = dict(Marauder.layout, mohawk=False, beard=None, coat="gambeson", coat_mat="kit1", hem="kit2")
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.tall_hat(J, tag, 0.26, "fur_black", bands=((0.05, "kit1", 0.3),), taper=0.9)
        c, X, F, U, s = cc.hf(J)
        for sd in (-1, 1):
            b = c + F * s[1] * 0.9 - U * s[2] * 0.3 + X * sd * s[0] * 0.2
            cone(tag + "tache%d" % sd, b, b - U * s[2] * 0.9 + X * sd * s[0] * 0.3, s[0] * 0.12, "hair", 6)


@register
class Darksoul(Marauder):
    """A raving warrior gone grey: ashen skin, an iron helm, chains crossed over his bare chest."""
    key = "hung_darksoul"
    layout = dict(Marauder.layout, mohawk=False, beard=None, skin="skin_ghoul", brow="socket", helm="open", helm_mat="darkmetal", coat=None,
                  wrap=None)
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.chain(tag + "chestchain", surf(J, P, P["sh_h"] - 0.02, -60, 0.05), surf(J, P, 0.1, 60, 0.05), "darkmetal", n=6, sag=0.04)
        cc.chain(tag + "chestchainb", surf(J, P, P["sh_h"] - 0.02, 60, 0.05), surf(J, P, 0.1, -60, 0.05), "darkmetal", n=6, sag=0.04)


@register
class Tong(Marauder):
    """A heavy steppe champion: kettle helm with a kit2 plume, mail coat in kit1, big iron shoulder."""
    key = "hung_tong"
    knobs = dict(shoulders=1.25, limb=1.2, torso=1.15)
    layout = dict(Marauder.layout, mohawk=False, helm="kettle", helm_mat="darkmetal", plume="kit2", coat="gambeson", coat_mat="kit1",
                  hem="darkmetal", pads="big", pad_sides=("r",), pad_mat="darkmetal", pad_trim="kit2", spikes=1)
    target_px = 96


@register
class ChaosHound(Quadruped):
    """A hairless red hound with a ridge of bone spines and a kit1 spiked collar."""
    key = "chaos_hound"
    body = (0.85, 0.24)
    leg_len, leg_r = 0.45, 0.06
    skin = "skin_chaos"
    paw_mat = "fur_black"
    head = dict(snout=(1.3, 0.85), ears="wolf", fangs=True, eye_mat="eye_yellow", snout_mat="skin_chaos", nose_mat="socket")
    tail = dict(len=0.55, r=0.04, mat="skin_chaos", up=0.5, tip="bone")
    coat, collar = None, "kit1"
    target_px = 56

    def extras(self, J, tag, pose, centre):
        for i, t in enumerate((-0.25, 0.0, 0.25)):
            b = centre + J["B"] * self.body[0] * t + UP * self.body[1] * 0.9
            cone(tag + "spine%d" % i, b, b + UP * 0.14 + J["B"] * 0.05, 0.04, "bone", 5)
        tband_q(tag, centre, self, "kit2")


def tband_q(tag, centre, beast, mat):
    """A kit band round a four-legged body's middle."""
    ln, r = beast.body
    core.loft(tag + "girth", [(centre + Vector((0, 1, 0)) * (ln * t), Vector((1, 0, 0)), UP, r * 1.06, r * 1.06) for t in (-0.05, 0.05)],
              mat, n=12, caps=False, subsurf=1, solidify=0.03)


# ----------------------------------------------------------------------------- men
@register
class UlricPriest(Raider):
    """A warrior priest of Ulric: a white wolf pelt worn as a hood, a big hammer, kit1 tunic."""
    key = "ulric_priest"
    layout = dict(Raider.layout, helm="hood", helm_mat="fur_white", mantle=True, horncap=False, beard="hair_white", brow="hair_white")
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "r", tag, length=0.9, r=0.03, mat="wood", head="hammer", head_mat="metal")
        c, X, F, U, s = cc.hf(J)
        for sd in (-1, 1):
            b = c + U * s[2] * 0.9 + X * sd * s[0] * 0.55
            cone(tag + "wolfear%d" % sd, b, b + U * 0.12 - F * 0.02, 0.05, "fur_white", 5)


@register
class WarriorMonk(Biped):
    """A bald warrior monk in a kit1 robe with a kit2 sash, a long staff and bare feet."""
    key = "warrior_monk"
    race = "human"
    knobs = dict(limb=1.0, shoulders=1.05)
    layout = dict(skin="skin_tan", hair=None, brow="hair", torso="kit1", arms="skin_tan", legs="kit1", coat="robe", coat_mat="kit1", hem="kit2",
                  belt="kit2", buckle=None, boots="skin_tan", cuff=None, bracers="kit2")
    stance = dict(lean=4, legs={"l": (8, 14, 10), "r": (-6, 14, 8)}, arms={"l": (10, 34, 60), "r": (10, 34, 60)}, hands="fist")
    stride, arm_swing, jump = 40, 30, 0.24
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        parts.rod(J, "r", tag, length=1.4, r=0.025, mat="wood")


@register
class ValkyrieThrower(Valkyrie):
    """A shield-maiden without the winged helm: a long blond braid, a kit2 headband and a spear."""
    key = "valkyrie_thrower"
    layout = dict(Valkyrie.layout, helm=None, helmwings=False, hair="long", cape=None)
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.headband(J, tag, "kit2", tails=False)
        parts.rod(J, "r", tag, length=1.2, r=0.022, mat="wood", head="blade", head_mat="metal")


@register
class ValkyrieCatcher(Valkyrie):
    """The quick one: no breastplate or greaves, short hair, kit1 top and kit2 shorts."""
    key = "valkyrie_catcher"
    knobs = dict(Valkyrie.knobs, legs=1.1, limb=0.9)
    layout = dict(Valkyrie.layout, helm=None, helmwings=False, hair="short", breast=None, greaves=False, cape=None, loin=None,
                  shorts="kit2", bracers="kit2")
    target_px = 88


# ----------------------------------------------------------------------------- Chaos
@register
class ForsakenTzeentch(Biped):
    """A man changed by Tzeentch: pale blue skin, a third eye, one swollen tentacle arm, kit1 rags and a kit2 belt."""
    key = "forsaken_tzeentch"
    race = "human"
    knobs = dict(hunch=12, limb=1.05)
    layout = dict(skin="skin_tzeentch", hair=None, brow="socket", lip="skin_tzeentch", eyes="red", torso="skin_tzeentch", arms="skin_tzeentch",
                  legs="rags", boots="skin_tzeentch", cuff=None, belt="kit2", buckle="brass")
    stance = dict(lean=10, legs={"l": (8, 14, 10), "r": (-6, 14, 8)}, arms={"l": (20, 30, 40), "r": (20, 30, 40)}, hands="open")
    stride, arm_swing, jump = 40, 34, 0.2
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        cc.third_eye(J, tag, up=0.6, r=0.05)
        cc.shoulder_tentacle(J, tag, "r", mat="skin_pink", ring="kit2")
        cc.claw_arm(J, L, tag, "l", mat="skin_pink", claw="bone")
        cc.rags(J, P, tag, "kit1", h0=0.08, h1=-0.22, jag=0.5)


@register
class BeastOfNurgle(Quadruped):
    """A huge green slug with stubby legs, a fan of head tentacles, flies, and a kit1 saddle-cloth."""
    key = "beast_of_nurgle"
    body = (1.05, 0.32)
    leg_len, leg_r = 0.24, 0.09
    skin = "skin_nurgle"
    belly_mat = "skin_belly"
    head = dict(snout=(0.6, 1.3), ears="none", fangs=True, eye_mat="eye_yellow", snout_mat="skin_nurgle", nose_mat="socket")
    head_size = 0.24
    tail = dict(len=0.5, r=0.12, mat="skin_nurgle", up=-0.1)
    coat, collar = "kit1", "kit2"
    target_px = 60
    lie = 0.3

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["_t"] = i / float(n)
        return p

    def extras(self, J, tag, pose, centre):
        c, X, F, U = J["head"], J["X"], J["F"], UP
        for i, sd in enumerate((-1, -0.4, 0.4, 1)):
            cc.tentacle(tag + "headtent%d" % i, c + U * 0.15 + X * sd * 0.12, U + X * sd * 0.5 - F * 0.3, -U * 0.6 + F * 0.4, 0.4, 0.04,
                        "skin_nurgle", curl=2.0)
        cc.flies(J, tag, pose.get("_t", 0.0), n=4, rad=0.35)


@register
class Fiend(Quadruped):
    """A Slaanesh fiend: a lilac long-legged beast with a whip tail ending in a sting and a frill of white spines."""
    key = "fiend"
    body = (0.9, 0.22)
    leg_len, leg_r = 0.62, 0.055
    skin = "skin_slaanesh"
    paw_mat = "white"
    head = dict(snout=(1.0, 0.8), ears="none", fangs=True, eye_mat="eye_yellow", snout_mat="skin_slaanesh", nose_mat="socket", horns="small",
                horn_mat="white")
    tail = dict(len=1.0, r=0.05, mat="skin_slaanesh", up=0.9, tip="white")
    coat, collar = "kit1", "kit2"
    target_px = 70

    def extras(self, J, tag, pose, centre):
        for i, t in enumerate((-0.3, -0.1, 0.1, 0.3)):
            b = centre + J["B"] * self.body[0] * t + UP * self.body[1] * 0.9
            cone(tag + "frill%d" % i, b, b + UP * 0.18 + J["B"] * 0.08, 0.035, "white", 5)


@register
class FireWyrm(Quadruped):
    """A long low fire drake: flame-coloured scales, a long tail, smoke-black horns, kit1 harness."""
    key = "fire_wyrm"
    body = (1.25, 0.24)
    leg_len, leg_r = 0.28, 0.07
    skin = "flame"
    belly_mat = "fire_belly"
    paw_mat = "fur_black"
    head = dict(snout=(1.4, 0.85), ears="none", fangs=True, eye_mat="eye_yellow", snout_mat="flame", nose_mat="socket", horns="goat",
                horn_mat="fur_black")
    tail = dict(len=1.2, r=0.12, mat="flame", up=0.1)
    coat, collar = "kit1", "kit2"
    target_px = 58

    def extras(self, J, tag, pose, centre):
        cc.flame(tag + "breath", J["head"] + J["F"] * 0.35, J["F"] + UP * 0.2, 0.3, r=0.06)


palette.ramp("fire_belly", "#a85a1a", "#f0a83a", "#ffe08a")


@register
class SlaaneshWarrior(ChaosChosen):
    """A Chaos warrior of Slaanesh: lilac plate with kit1 enamel, one arm ending in a crab claw."""
    key = "slaanesh_warrior"
    target_px = 104

    def make_layout(self, pose):
        L = super().make_layout(pose)
        for k, v in list(L.items()):
            if v == "darkmetal":
                L[k] = "armour_lilac"
        return L

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        pincer(J, tag, "l", "white", 1.2)


@register
class KrakenHelm(DarkElfBlitzer):
    """A corsair champion whose helm is a kraken: kit1 tentacles curl down from the crown."""
    key = "kraken_helm"
    target_px = 96

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for i, sd in enumerate((-1, -0.35, 0.35, 1)):
            b = c + U * s[2] * 0.7 + X * sd * s[0] * 0.7 - F * s[1] * 0.2
            cc.tentacle(tag + "kraken%d" % i, b, U * 0.4 + X * sd * 0.8 - F * 0.3, -U * 1.2 + X * sd * 0.2, 0.32, 0.04, "kit1", curl=2.5)


@register
class Ungor(Beastman):
    """The small beastman: short stub horns, no shoulder plate, more hunched."""
    key = "ungor"
    knobs = dict(Beastman.knobs, hunch=18, limb=0.85, head=1.05)
    layout = dict(Beastman.layout, horns="small", pads=None, skin="fur_grey", legs="fur_grey")
    target_px = 70


@register
class Doombull(Minotaur):
    """The minotaur lord: bigger, brass on both shoulders, a gold ring in its nose."""
    key = "doombull"
    ref_frame = 192
    knobs = dict(Minotaur.knobs, shoulders=1.65, torso=1.5, limb=1.65)
    layout = dict(Minotaur.layout, pads="big", pad_sides=("l", "r"), pad_mat="brass", pad_trim="kit2")
    target_px = 122

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        b = c + F * s[1] * 1.6 - U * s[2] * 0.25
        core.tube(tag + "nosering", [b - X * 0.04, b - U * 0.05, b + X * 0.04], [0.012] * 3, "gold", n=6)


# ----------------------------------------------------------------------------- centaurs
@register
class Centigor(Centaur):
    """A goat-headed beastman torso on a brown horse body, kit1 barding, kit2 harness."""
    key = "centigor"
    race = "beastman"
    knobs = dict(shoulders=1.1, torso=1.05)
    layout = dict(skin="fur_brown", horns="goat", horn_mat="bone", jersey="kit1", bracers="kit2", neckband="kit2", dark="fur_black")
    stance = dict(lean=4, legs={"l": (0, 6, 0), "r": (0, 6, 0)}, arms={"l": (10, 32, 50, -10), "r": (10, 32, 50, -10)}, hands="fist")
    arm_swing = 24
    target_px = 104

    class Body(Centaur.Body):
        skin = "fur_brown"
        coat = "kit1"
        paw_mat = "fur_black"
        tail = dict(len=0.6, r=0.06, mat="fur_black", up=0.3)


class Zoat(Centaur):
    """A blue lizard-centaur with a heavy horned head; kit1 barding and a kit2 harness."""
    race = "saurus"
    layout = dict(skin="skin_zoat", snout=(1.0, 1.1), horns="bull", horn_mat="bone", eye_mat="eye_yellow", fangs=True, neckband="kit2",
                  bracers="kit1", tail=None)
    stance = dict(lean=4, legs={"l": (0, 6, 0), "r": (0, 6, 0)}, arms={"l": (12, 32, 50, -10), "r": (12, 32, 50, -10)}, hands="fist")
    arm_swing = 22

    class Body(Centaur.Body):
        skin = "skin_zoat"
        coat = "kit1"
        body = (1.1, 0.34)
        leg_len, leg_r = 0.55, 0.11
        tail = dict(len=0.8, r=0.12, mat="skin_zoat", up=0.05)


@register
class ZoatAdult(Zoat):
    key = "zoat"
    knobs = dict(shoulders=1.35, torso=1.3, limb=1.4)
    ref_frame = 192
    target_px = 120

    def extras(self, J, P, L, tag, pose):
        parts.rod(J, "r", tag, length=1.0, r=0.04, mat="wood", head="club", head_mat="stone")


@register
class ZoatJuven(Zoat):
    """A young zoat: smaller, short horns, no club."""
    key = "zoat_juven"
    knobs = dict(shoulders=1.1, torso=1.05, limb=1.1)
    layout = dict(Zoat.layout, horns="small")
    target_px = 96


# ----------------------------------------------------------------------------- Fimir
class Fimir(Biped):
    """A hulking one-eyed swamp creature with a long tail ending in a bone club; kit1 kilt and kit2 belt."""
    race = "troll"
    knobs = dict(hunch=14, shoulders=1.25, torso=1.2, limb=1.3, head=1.0, hands=1.2)
    layout = dict(skin="skin_fimir", lip="skin_fimir", eyes="none", brow="socket", ears=None, legs="skin_fimir", arms="skin_fimir",
                  loin="kit1", loin_trim="kit2", belt="kit2", buckle="bone", fangs=True,
                  tail=dict(len=1.0, r=0.1, mat="skin_fimir", up=0.2, tip="bone"))
    stance = dict(lean=10, legs={"l": (8, 16, 12), "r": (-6, 16, 10)}, arms={"l": (16, 30, 40), "r": (16, 30, 40)}, hands="fist")
    stride, arm_swing, jump = 34, 26, 0.12

    def extras(self, J, P, L, tag, pose):
        cc.third_eye(J, tag, up=0.25, r=0.09, mat="eye_yellow")


@register
class FimmWarrior(Fimir):
    key = "fimm_warrior"
    target_px = 98


@register
class FiannaFimm(Fimir):
    """The noble: bigger, a bone-crested kit2 helm, iron shoulders."""
    key = "fianna_fimm"
    ref_frame = 192
    knobs = dict(Fimir.knobs, shoulders=1.4, torso=1.35, limb=1.45)
    layout = dict(Fimir.layout, pads="big", pad_mat="darkmetal", pad_trim="kit2", spikes=1)
    target_px = 112

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "helm", c + U * 0.02, (s[0] * 1.1, s[1] * 1.1, s[2] * 1.1), "kit2", (U * 0.9 - F * 0.3).normalized(), cut=0.3,
                 rot=J["head_R"], thick=0.03)
        core.crest(tag, c + U * s[2] * 1.0, J["head_R"], s, "bone", h=0.18)
