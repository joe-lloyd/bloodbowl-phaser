"""Secret League models, round eight: spiders, snakemen, beasts of the far lands, sea folk, forest spirits, giants and
war carts. Each one gives a position its own model on a team that used to repeat one or show the mannequin
(see src/data/community/secretLeagueModels.json)."""
import math
from mathutils import Vector
from lib import Biped, Centaur, Floating, Quadruped, Vehicle, register, core, palette, parts
from lib.core import UP, D, ball_at, cone, ellipsoid, tube, surf
from teams import chaos_common as cc
from teams import elves_common as ec
from teams.elves_wood import LorenTreeman
from teams.greenskins_dwarfs_monsters import OgreBlocker, Troll
from teams.men_human import HumanLineman
from teams.secret_beasts import Elemental  # noqa: F401  registers the "wing_fey" ramp
from teams.secret_daemons import ImpUndivided, Plaguebearer
from teams.secret_dwarfs import goggles
from teams.secret_undead import Syreen  # noqa: F401  registers the "sea_green" ramp
from teams.undead_skaven_lizards_undead import Werewolf

palette.ramp("spider_black", "#14101a", "#2e2636", "#4a4456")
palette.ramp("spider_purple", "#2a1a4a", "#5a3a8a", "#9a6ac8")
palette.ramp("skin_snake", "#2a4a1a", "#5a8a2a", "#a8c85a")
palette.ramp("skin_moss", "#2a3a1a", "#4a6a2a", "#7a9a4a")
palette.ramp("lava_rock", "#2a1a14", "#4a3a34", "#7a6a5e")
palette.ramp("crab_red", "#6a1a14", "#b0402a", "#e87a5a")
palette.ramp("turtle_shell", "#2a3a1a", "#5a6a2a", "#9aa05a")
palette.ramp("fur_koala", "#4a4a52", "#8a8a94", "#c4c4cc")
palette.ramp("fur_roo", "#6a3a1a", "#a86a3a", "#d8a878")
palette.ramp("skin_blue_ind", "#1a3a6a", "#3a6ab0", "#7aa8e0")
palette.ramp("skin_elephant", "#4a4a52", "#7a7a86", "#b0b0bc")
palette.ramp("river_green", "#1a3a2a", "#3a6a4a", "#6aa07a")
palette.ramp("sylph_skin", "#7a9ab0", "#b8d4e8", "#eef8ff")


# ----------------------------------------------------------------------------- spiders
class Spider(Quadruped):
    """Eight legs round a thorax and a big abdomen; kit1 band on the abdomen and kit2 marking on its back."""
    skin = "spider_black"
    mark = "kit2"
    size = 1.0
    leg_len, leg_r = 0.5, 0.04
    body = (0.9, 0.25)
    coat, collar, tail = None, None, None
    lie = 0.25

    def build(self, pose):
        tag, k = self.key + "_", self.size
        X, F, B = Vector((1, 0, 0)), Vector((0, -1, 0)), Vector((0, 1, 0))
        c = Vector((0, 0, 0.32 * k))
        thorax = c + F * 0.12 * k
        abdomen = c + B * 0.38 * k + UP * 0.08 * k
        ellipsoid(tag + "thorax", thorax, (0.2 * k, 0.22 * k, 0.15 * k), self.skin)
        ellipsoid(tag + "abdomen", abdomen, (0.3 * k, 0.38 * k, 0.26 * k), self.skin)
        core.loft(tag + "band", [(abdomen + B * 0.38 * k * t, X, UP, 0.31 * k, 0.27 * k) for t in (-0.15, 0.15)], "kit1", n=12, caps=False,
                  subsurf=1, solidify=0.02)
        ellipsoid(tag + "mark", abdomen + UP * 0.24 * k + B * 0.05 * k, (0.12 * k, 0.16 * k, 0.04 * k), self.mark)
        head = thorax + F * 0.22 * k + UP * 0.02 * k
        ellipsoid(tag + "head", head, (0.12 * k, 0.12 * k, 0.1 * k), self.skin)
        for sd in (-1, 1):
            ball_at(tag + "eye%d" % sd, head + F * 0.09 * k + X * sd * 0.05 * k + UP * 0.04 * k, 0.03 * k, "eye")
            cone(tag + "fang%d" % sd, head + F * 0.1 * k + X * sd * 0.04 * k, head + F * 0.16 * k + X * sd * 0.02 * k - UP * 0.1 * k, 0.025 * k,
                 "bone", 5)
        swings = pose.get("legs4", (0, 0, 0, 0))
        for i in range(8):
            sd = -1 if i < 4 else 1
            j = i % 4
            a = D(swings[j] * (1 if (i + j) % 2 else -1))
            yaw = math.radians(-50 + 33 * j)
            out = Vector((sd * math.cos(yaw), -math.sin(yaw) * math.cos(a) * 0.9 - math.sin(a) * 0.3, 0)).normalized()
            hip = thorax + X * sd * 0.14 * k + B * (j - 1.5) * 0.06 * k
            knee = hip + out * 0.34 * k * self.leg_len / 0.5 + UP * 0.28 * k
            foot = knee + out * 0.3 * k * self.leg_len / 0.5 - UP * (knee.z - 0.02)
            tube(tag + "leg%d" % i, [hip, knee, foot], [self.leg_r * 1.4 * k, self.leg_r * k, self.leg_r * 0.6 * k], self.skin, n=6)
        J = {"pelvis": c, "B": B, "X": X, "F": F, "u": UP, "head": head}
        self.extras(J, tag, pose, c)
        return J


@register
class SkullbackSpider(Spider):
    """A purple spider with a white skull marking on its back."""
    key = "skullback_spider"
    skin = "spider_purple"
    mark = "white"
    target_px = 52


@register
class SpiderHatchling(Spider):
    """A small spiderling, kit1 band and kit2 spots."""
    key = "spider_hatchling"
    size = 0.6
    target_px = 30


@register
class GiantSpider(Spider):
    """A big brown hunting spider."""
    key = "giant_spider"
    skin = "fur_brown"
    size = 1.2
    target_px = 62


@register
class GiganticSpider(Spider):
    """The biggest: long thick legs and a red hourglass."""
    key = "gigantic_spider"
    size = 1.6
    mark = "fur_red"
    leg_len, leg_r = 0.6, 0.05
    ref_frame = 192
    target_px = 92


@register
class SpiderRider(Centaur):
    """A forest goblin riding a giant spider: a kit1 tunic, a feathered kit2 headband and a spear."""
    key = "spider_rider"
    race = "goblin"
    knobs = dict(torso=0.85, head=1.2)
    layout = dict(skin="skin_goblin", torso="kit1", arms="skin_goblin", eyes="red", brow="socket", lip="skin_goblin", fangs=True, ears="big",
                  neckband="kit2")
    stance = dict(lean=6, legs={"l": (0, 6, 0), "r": (0, 6, 0)}, arms={"l": (10, 32, 50, -10), "r": (10, 32, 50, -10)}, hands="fist")
    target_px = 70

    class Body(Spider):
        skin = "spider_black"
        mark = "kit2"
        size = 1.15

    def build(self, pose):
        b = self._body()
        Spider.build(b, pose)
        self.layout = dict(self.layout, no_legs=True)
        self.mount = (-0.05, 0.5 * b.size)
        return Biped.build(self, pose)

    def extras(self, J, P, L, tag, pose):
        cc.headband(J, tag, "kit2", tails=True)
        parts.rod(J, "r", tag, length=1.1, r=0.018, mat="wood", head="blade", head_mat="bone")


# ----------------------------------------------------------------------------- snakemen
class Snakeman(Floating):
    """A snake-headed man on a coiled snake tail; kit1 sash and kit2 belt."""
    race = "skink"
    hover = 0.04
    scale_mat = "skin_snake"
    knobs = dict(torso=0.95, limb=0.95, hunch=6)

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin=self.scale_mat, torso=self.scale_mat, arms=self.scale_mat, coat_mat=self.scale_mat, robe_lining="skin_belly",
                 head="snout", snout=(1.1, 0.7), ears="none", eye_mat="eye_yellow", snout_mat=self.scale_mat, nose_mat="socket", crest=None,
                 hem=None, jag=0.0, belt="kit2", buckle="gold", tail=dict(len=1.0, r=0.12, mat=self.scale_mat, up=0.1, tip=None))
        return L

    def extras(self, J, P, L, tag, pose):
        cc.sash(J, P, tag, pose, "kit1", side=-1, ln=0.3)


@register
class SnakemanLineman(Snakeman):
    key = "snakeman"
    target_px = 86


@register
class SnakeRunner(Snakeman):
    """Lean and quick, with kit2 wrist bands."""
    key = "snake_runner"
    knobs = dict(Snakeman.knobs, torso=0.85, limb=0.8)
    scale_mat = "skin_lizard"
    target_px = 84

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        for side in ("l", "r"):
            ball_at(tag + "wband" + side, J["arms"][side][2], 0.05, "kit2")


@register
class Mesmer(Snakeman):
    """A cobra-hooded mesmer with a gold staff and swaying gaze."""
    key = "mesmer"
    scale_mat = "spider_purple"
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.flat_cone(tag + "hood", c - F * s[1] * 0.2 - U * s[2] * 0.6, c - F * s[1] * 0.3 + U * s[2] * 0.8, s[0] * 2.0, "kit1", F,
                       squash=0.2)
        parts.rod(J, "l", tag, length=1.3, r=0.02, mat="gold")


@register
class Constrictor(Snakeman):
    """A huge thick-bodied snakeman with dark scales and a kit1 armband."""
    key = "constrictor"
    scale_mat = "fur_brown"
    knobs = dict(Snakeman.knobs, shoulders=1.4, torso=1.35, limb=1.4, hands=1.2)
    target_px = 104
    ref_frame = 192


# ----------------------------------------------------------------------------- forests and hunters
@register
class FenBeast(Biped):
    """A shambling heap of fen mud and reeds with two glowing eyes, bound by a kit1 cord and a kit2 rag."""
    key = "fen_beast"
    race = "troll"
    knobs = dict(hunch=16, limb=1.4, shoulders=1.3, torso=1.3)
    layout = dict(skin="skin_moss", lip="skin_moss", eyes="red", brow="socket", ears=None, legs="skin_moss", arms="skin_moss", belt="kit1",
                  buckle=None, loin="kit2", loin_trim="kit1")
    stance = dict(lean=10, legs={"l": (8, 16, 12), "r": (-6, 16, 10)}, arms={"l": (12, 26, 30), "r": (12, 26, 30)}, hands="open")
    stride, arm_swing, jump = 30, 22, 0.08
    target_px = 100

    def extras(self, J, P, L, tag, pose):
        ec.leaf_ring(J, P, tag, P["sh_h"] - 0.05, 9, 0.3, "leaf", width=0.07, droop=0.95)
        ec.leaf_ring(J, P, tag, 0.15, 9, 0.25, "skin_moss", width=0.07, droop=0.9, name="reed")


@register
class HornedHunter(HumanLineman):
    """A wild hunter of Taal: stag antlers on a fur hood, a kit1 cloak and a long spear."""
    key = "horned_hunter"
    layout = dict(HumanLineman.layout, helm="hood", helm_mat="fur_brown", cape="short", cape_mat="kit1", cape_lining="kit2")
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        antlers(J, tag, "bone")
        parts.rod(J, "r", tag, length=1.4, r=0.02, mat="wood", head="blade", head_mat="metal")


def antlers(J, tag, mat, k=1.0):
    c, X, F, U, s = cc.hf(J)
    for sd in (-1, 1):
        root = c + U * s[2] * 0.8 + X * sd * s[0] * 0.5
        a = root + (U * 0.25 + X * sd * 0.18 - F * 0.05) * k
        b = a + (U * 0.2 + X * sd * 0.15 - F * 0.1) * k
        tube(tag + "antler%d" % sd, [root, a, b], [0.035 * k, 0.03 * k, 0.015 * k], mat, n=5)
        cone(tag + "tine%d" % sd, a, a + (U * 0.15 + F * 0.08) * k, 0.025 * k, mat, 5)


@register
class Kurnocervus(Centaur):
    """A stag centaur: an elf's torso with antlers on a red deer's body, a kit1 sash and kit2 bands."""
    key = "kurnocervus"
    race = "elf"
    knobs = dict(shoulders=1.0, torso=0.95)
    layout = dict(skin="skin_elf", torso="skin_elf", arms="skin_elf", hair="long", hair_mat="hair_brown", brow="hair_brown", bracers="kit2",
                  neckband="kit2")
    stance = dict(lean=4, legs={"l": (0, 6, 0), "r": (0, 6, 0)}, arms={"l": (10, 32, 50, -10), "r": (10, 32, 50, -10)}, hands="fist")
    target_px = 108

    class Body(Centaur.Body):
        skin = "fur_red"
        coat = "kit1"
        paw_mat = "fur_black"
        body = (1.0, 0.27)
        leg_len, leg_r = 0.66, 0.06
        tail = dict(len=0.2, r=0.05, mat="fur_white", up=1.0)

    def extras(self, J, P, L, tag, pose):
        antlers(J, tag, "bone", k=1.3)
        cc.sash(J, P, tag, pose, "kit1", side=-1, ln=0.3)


@register
class BoarChanger(Werewolf):
    """A shape changer caught half-way to a boar: bristly brown hide, tusks, a kit1 loincloth."""
    key = "boar_changer"
    layout = dict(Werewolf.layout, skin="fur_brown", legs="fur_brown", snout=(0.9, 1.15), ears="wolf", tusks=True, fangs=False,
                  tail=dict(len=0.25, r=0.03, mat="fur_brown", up=1.2), loin="kit1", loin_trim="kit2")
    target_px = 88


@register
class Dryad(Biped):
    """A wood nymph: birch-pale bark skin, long leafy hair, leaves round her hips in kit1 and a kit2 vine."""
    key = "dryad"
    race = "elf"
    sex = "f"
    knobs = dict(limb=0.85, legs=1.08)
    layout = dict(skin="elf_birch", hair="long", hair_mat="leaf", brow="bark", lip="bark", eyes="red", torso="elf_birch", arms="elf_birch",
                  legs="elf_birch", boots="bark", cuff=None, claws=0.06, neckband="kit2")
    stance = dict(lean=4, legs={"l": (8, 10, 14), "r": (-6, 10, 10)}, arms={"l": (16, 34, 40), "r": (16, 34, 40)}, hands="open")
    stride, arm_swing, jump = 44, 34, 0.3
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        ec.leaf_ring(J, P, tag, 0.04, 10, 0.22, "kit1", width=0.08, droop=0.85, name="skirt", alt="leaf")


@register
class WillowAspect(LorenTreeman):
    """A weeping willow treeman: dark bark and curtains of drooping kit2-tied leaves."""
    key = "willow_aspect"
    ref_frame = 256
    layout = dict(LorenTreeman.layout, skin="bark", torso="bark", arms="bark", legs="bark")
    target_px = 216

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.leaf_ring(J, P, tag, P["sh_h"] + 0.1, 12, 0.7, "leaf", width=0.09, droop=1.0, name="willow")


@register
class GreatSylph(Floating):
    """A towering air spirit: pale sky skin, long white hair, great dragonfly wings, a kit1 gown with kit2 hem."""
    key = "great_sylph"
    race = "elf"
    sex = "f"
    ref_frame = 192
    knobs = dict(limb=1.2, shoulders=1.2, torso=1.15)
    hover = 0.3
    target_px = 118

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin="sylph_skin", arms="sylph_skin", torso="kit1", hair="long", hair_mat="hair_white", brow="hair_white", lip="lip_f",
                 coat_mat="kit1", robe_lining="kit2", hem="kit2", jag=0.5)
        return L

    def extras(self, J, P, L, tag, pose):
        root = J["pelvis"] + J["u"] * (P["sh_h"] - 0.08) + J["B"] * 0.16
        for sd in (-1, 1):
            for j, (up, ln) in enumerate(((0.6, 1.4), (-0.2, 1.1))):
                d = (J["X"] * sd + UP * up + J["B"] * 0.4).normalized()
                core.flat_cone(tag + "wing%d%d" % (sd, j), root, root + d * ln, 0.36 - 0.07 * j, "wing_fey", J["B"], squash=0.12)


@register
class Giant(Biped):
    """A huge bearded giant in a kit1 tunic and kit2 belt, barefoot, with a tree-trunk club."""
    key = "giant"
    race = "ogre"
    ref_frame = 192
    knobs = dict(belly=1.2, shoulders=1.4, limb=1.55, legs=1.1, torso=1.35)
    layout = dict(skin="skin_ogre", hair="long", hair_mat="hair_brown", beard="hair_brown", beard_len=1.0, brow="hair_brown", torso="kit1",
                  legs="skin_ogre", boots="skin_ogre", cuff=None, belt="kit2", buckle="metal", loin="kit1", loin_trim="kit2")
    stance = dict(lean=4, legs={"l": (6, 14, 10), "r": (-6, 14, 8)}, arms={"l": (8, 30, 30), "r": (8, 30, 30)}, hands="fist")
    stride, arm_swing, jump = 26, 20, 0.06
    target_px = 140
    lie, lie_shift = 0.34, 1.0

    def extras(self, J, P, L, tag, pose):
        parts.rod(J, "r", tag, length=1.2, r=0.07, mat="bark", head="club", head_mat="bark")


# ----------------------------------------------------------------------------- far lands
@register
class Kalite(Biped):
    """A blue-skinned temple dancer with a second pair of arms, a kit1 top and kit2 skirt, gold bangles."""
    key = "kalite"
    race = "human"
    sex = "f"
    layout = dict(skin="skin_blue_ind", hair="long", hair_mat="hair", brow="hair", lip="lip_f", torso="kit1", arms="skin_blue_ind",
                  legs="skin_blue_ind", boots="skin_blue_ind", cuff=None, loin="kit2", loin_trim="gold", neckband="gold", bracers="gold")
    stance = dict(lean=2, legs={"l": (8, 10, 10), "r": (-6, 10, 10)}, arms={"l": (30, 40, 50), "r": (30, 40, 50)}, hands="open")
    stride, arm_swing, jump = 42, 34, 0.28
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        for sd, side in ((-1, "l"), (1, "r")):
            sh = J["arms"][side][0] - UP * 0.12
            el = sh + J["X"] * sd * 0.28 + UP * 0.1 + J["F"] * 0.05
            wr = el + UP * 0.25 + J["X"] * sd * 0.05
            tube(tag + "arm2" + side, [sh, el, wr], [0.06, 0.05, 0.04], "skin_blue_ind", n=8)
            ball_at(tag + "hand2" + side, wr + UP * 0.04, 0.05, "skin_blue_ind")
            ball_at(tag + "bangle2" + side, wr, 0.045, "gold")


@register
class TrainedBasilisk(Quadruped):
    """A low six-eyed lizard with a crest of spines and a kit1 harness."""
    key = "basilisk"
    body = (1.0, 0.22)
    leg_len, leg_r = 0.24, 0.06
    skin = "skin_lizard"
    belly_mat = "skin_belly"
    head = dict(snout=(1.3, 0.8), ears="none", fangs=True, eye_mat="eye_yellow", snout_mat="skin_lizard", nose_mat="socket")
    tail = dict(len=1.0, r=0.1, mat="skin_lizard", up=0.05)
    coat, collar = "kit1", "kit2"
    target_px = 50

    def extras(self, J, tag, pose, centre):
        for i, t in enumerate((-0.3, -0.1, 0.1, 0.3)):
            b = centre + J["B"] * self.body[0] * t + UP * self.body[1] * 0.95
            cone(tag + "crest%d" % i, b, b + UP * 0.14, 0.035, "fur_red", 5)
        c = J["head"]
        for i, sd in enumerate((-1, 1)):
            ball_at(tag + "eyeb%d" % i, c + J["F"] * 0.05 + J["X"] * sd * 0.12 + UP * 0.12, 0.03, "eye_yellow")


@register
class Ganasa(Biped):
    """An elephant-headed strongman: grey skin, a trunk and tusks, big ears, a kit1 dhoti and gold collar."""
    key = "ganasa"
    race = "ogre"
    knobs = dict(belly=1.3, shoulders=1.3, limb=1.4)
    layout = dict(skin="skin_elephant", head="snout", snout=(0.5, 1.2), ears="bull", ear_mat="skin_elephant", eye_mat="eye", tusks=True,
                  snout_mat="skin_elephant", nose_mat="skin_elephant", legs="kit1", boots="skin_elephant", cuff=None, belt="kit2", buckle="gold",
                  neckband="gold", bracers="gold")
    stance = dict(lean=2, legs={"l": (6, 14, 10), "r": (-6, 14, 8)}, arms={"l": (8, 34, 40), "r": (8, 34, 40)}, hands="fist")
    stride, arm_swing, jump = 28, 22, 0.08
    target_px = 112

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        root = c + F * s[1] * 0.9 - U * s[2] * 0.2
        cc.tentacle(tag + "trunk", root, F - U * 0.5, -UP * 1.2 + F * 0.3, 0.55, s[0] * 0.28, "skin_elephant", curl=1.5, tip=0.4)
        for sd in (-1, 1):
            ellipsoid(tag + "bigear%d" % sd, c + X * sd * s[0] * 1.1, (s[0] * 0.15, s[1] * 0.6, s[2] * 0.8), "skin_elephant", J["head_R"])


@register
class DropBear(Quadruped):
    """A grey koala gone feral: round ears, big black nose, long claws, a kit1 harness."""
    key = "drop_bear"
    body = (0.6, 0.24)
    leg_len, leg_r = 0.24, 0.07
    skin = "fur_koala"
    paw_mat = "black"
    head = dict(snout=(0.4, 1.2), ears="rat", ear_mat="fur_white", fangs=True, eye_mat="eye", snout_mat="fur_koala", nose_mat="black")
    head_size = 0.24
    tail = None
    coat, collar = "kit1", "kit2"
    target_px = 46


@register
class Kangor(Biped):
    """A kangaroo-man on huge hopping legs: red-brown fur, long ears, a thick tail, kit1 shorts, kit2 boxing wraps."""
    key = "kangor"
    race = "werewolf"
    knobs = dict(digi=True, legs=1.15, limb=1.0, hunch=10, arms=0.85)
    layout = dict(skin="fur_roo", legs="fur_roo", head="snout", snout=(0.9, 0.8), ears="rat", ear_mat="fur_roo", fangs=False, eye_mat="eye",
                  shorts="kit1", wraps="kit2", tail=dict(len=0.9, r=0.13, mat="fur_roo", up=0.0), claws=None)
    stance = dict(lean=12, legs={"l": (20, 18, 40), "r": (20, 18, 40)}, arms={"l": (40, 30, 80), "r": (40, 30, 80)}, hands="fist")
    stride, arm_swing, jump = 40, 20, 0.4
    target_px = 96

    def idle(self, ph, p, w):       # bounces on its tail, fists up
        p.update(hop=0.06 * w["up"])


# ----------------------------------------------------------------------------- the sea
@register
class Crester(Biped):
    """A fish-man with a tall spined head-crest and fins: blue-green scales, a kit1 loincloth, a trident."""
    key = "crester"
    race = "skink"
    knobs = dict(legs=1.0, limb=1.0, torso=1.0, hunch=8)
    layout = dict(skin="sea_green", legs="sea_green", head="snout", snout=(0.9, 0.9), ears="none", eye_mat="eye_yellow", snout_mat="sea_green",
                  crest=None, loin="kit1", loin_trim="kit2", tail=None, arms="sea_green", belt="kit2")
    stance = dict(lean=6, legs={"l": (8, 14, 12), "r": (-6, 14, 10)}, arms={"l": (16, 30, 40), "r": (16, 30, 40)}, hands="open")
    stride, arm_swing, jump = 38, 30, 0.22
    target_px = 90

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        core.crest(tag, c, J["head_R"], s, "kit2", h=0.4, n=6, lo=0.7, back=-1.0, width=0.06)
        parts.rod(J, "r", tag, length=1.3, r=0.02, mat="brass", head="blade", head_mat="brass")


@register
class Ignimbrite(Biped):
    """A man of cooled lava: dark rock skin with glowing seams, a kit1 sash, fire in its eyes."""
    key = "ignimbrite"
    race = "troll"
    knobs = dict(shoulders=1.35, torso=1.3, limb=1.45, hunch=8)
    layout = dict(skin="lava_rock", lip="lava_rock", eyes="red", brow="socket", ears=None, legs="lava_rock", arms="lava_rock", belt="kit2",
                  buckle=None, loin="kit1", loin_trim="kit2")
    stance = dict(lean=4, legs={"l": (6, 14, 10), "r": (-6, 14, 8)}, arms={"l": (10, 30, 30), "r": (10, 30, 30)}, hands="fist")
    stride, arm_swing, jump = 28, 22, 0.08
    target_px = 100

    def extras(self, J, P, L, tag, pose):
        for i, (h, a) in enumerate(((0.32, -30), (0.22, 40), (0.12, -10))):
            cc.stripe(J, P, tag, "seam%d" % i, h, a - 30, h - 0.05, a + 30, "fire", r=0.02)
        for side in ("l", "r"):
            cc.flame(tag + "fist" + side, J["arms"][side][3], UP, 0.12, r=0.05)


@register
class GiantCrab(Quadruped):
    """A great red crab: a wide shell, two big pincers, eyes on stalks, a kit1 band."""
    key = "giant_crab"
    body = (0.7, 0.3)
    leg_len, leg_r = 0.3, 0.05
    skin = "crab_red"
    headless = True
    tail = None
    coat, collar = "kit1", None
    target_px = 56

    def extras(self, J, tag, pose, centre):
        F, X = J["F"], J["X"]
        front = centre + F * 0.35
        for sd in (-1, 1):
            root = front + X * sd * 0.3
            el = root + F * 0.2 + X * sd * 0.2 + UP * 0.1
            tube(tag + "claw%d" % sd, [root, el], [0.07, 0.06], "crab_red", n=8)
            ellipsoid(tag + "pincer%d" % sd, el + F * 0.12, (0.12, 0.15, 0.08), "crab_red")
            cone(tag + "pinch%d" % sd, el + F * 0.2, el + F * 0.35 + X * sd * 0.05, 0.05, "crab_red", 5)
            stalk = front + X * sd * 0.1 + UP * 0.25
            tube(tag + "stalk%d" % sd, [front + X * sd * 0.1 + UP * 0.1, stalk], [0.02, 0.02], "crab_red", n=5)
            ball_at(tag + "ceye%d" % sd, stalk, 0.04, "black")


@register
class SonOfStromfels(HumanLineman):
    """A wrecker of the sea god: a shark-jaw helm, a kit1 sash over a kit2 tunic and a hooked gaff."""
    key = "stromfels"
    layout = dict(HumanLineman.layout, helm="hood", helm_mat="cloth_blue")
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        cone(tag + "fin", c + U * s[2] * 0.7, c + U * s[2] * 1.6 - F * 0.15, s[0] * 0.5, "cloth_blue", 4)
        for i in range(5):
            a = math.radians(-60 + 30 * i)
            p = c + F * s[1] * 0.9 * math.cos(a) * 0.9 + X * s[0] * math.sin(a) + U * s[2] * 0.45
            cone(tag + "jaw%d" % i, p, p - U * 0.06 + F * 0.02, 0.02, "bone", 4)
        cc.sash(J, P, tag, pose, "kit1", side=1, ln=0.35)
        parts.rod(J, "r", tag, length=1.1, r=0.02, mat="wood", head="blade", head_mat="metal")


@register
class Turtleman(Biped):
    """A turtle-folk warrior: a big green shell on its back, a beak face, a kit1 headband and kit2 belt."""
    key = "turtleman"
    race = "skink"
    knobs = dict(legs=0.8, torso=1.2, belly=1.2, limb=1.1, hunch=10, head=1.0)
    layout = dict(skin="skin_skink", legs="skin_skink", arms="skin_skink", head="snout", snout=(0.6, 1.0), ears="none", eye_mat="eye",
                  snout_mat="skin_skink", crest=None, belt="kit2", buckle="gold", tail=None)
    stance = dict(lean=8, legs={"l": (6, 16, 10), "r": (-6, 16, 8)}, arms={"l": (16, 30, 40), "r": (16, 30, 40)}, hands="fist")
    stride, arm_swing, jump = 30, 24, 0.1
    target_px = 82

    def extras(self, J, P, L, tag, pose):
        back = J["pelvis"] + J["u"] * 0.25 + J["B"] * 0.16
        ellipsoid(tag + "shell", back, (0.3, 0.2, 0.34), "turtle_shell")
        ellipsoid(tag + "plastron", surf(J, P, 0.2, 0, 0.02), (0.22, 0.08, 0.24), "skin_belly")
        cc.headband(J, tag, "kit1", tails=True)


@register
class Gave(Biped):
    """A northern oni: red skin, two horns, a wild white mane, a kit1 tiger-stripe loincloth and an iron club."""
    key = "gave"
    race = "ogre"
    knobs = dict(belly=1.2, shoulders=1.3, limb=1.45)
    layout = dict(skin="skin_chaos", hair="long", hair_mat="hair_white", brow="hair_white", eyes="red", horns="small", horn_mat="bone",
                  fangs=True, legs="skin_chaos", boots="skin_chaos", cuff=None, loin="kit1", loin_trim="kit2", belt="kit2", buckle=None,
                  bracers="darkmetal")
    stance = dict(lean=4, legs={"l": (6, 14, 10), "r": (-6, 14, 8)}, arms={"l": (10, 32, 34), "r": (10, 32, 34)}, hands="fist")
    stride, arm_swing, jump = 28, 22, 0.08
    target_px = 112

    def extras(self, J, P, L, tag, pose):
        parts.rod(J, "r", tag, length=1.1, r=0.05, mat="darkmetal", head="club", head_mat="darkmetal")


# ----------------------------------------------------------------------------- ogres, trolls, wolves
@register
class FireBelly(OgreBlocker):
    """An ogre fire priest: a burning brazier gut plate, a kit1 shoulder mantle and soot-black arms."""
    key = "fire_belly"
    layout = dict(OgreBlocker.layout, gd_gut=False, arm_band="kit1")
    target_px = 122

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        p = surf(J, P, 0.12, 0, 0.06)
        ellipsoid(tag + "brazier", p, (0.24, 0.08, 0.2), "darkmetal")
        for i, x in enumerate((-0.1, 0.0, 0.1)):
            cc.flame(tag + "gutfire%d" % i, p + J["X"] * x + UP * 0.12 + J["F"] * 0.05, UP, 0.24, r=0.06)
        cc.flame(tag + "breath", cc.hf(J)[0] + J["F"] * 0.3, J["F"] + UP * 0.3, 0.2, r=0.05)


@register
class RiverTroll(Troll):
    """A slimy green river troll trailing weed, with a kit1 net slung over one shoulder."""
    key = "river_troll"
    layout = dict(Troll.layout, skin="river_green", legs="river_green", boots="river_green", lip="river_green")
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        ec.leaf_ring(J, P, tag, P["sh_h"] - 0.02, 7, 0.22, "skin_moss", width=0.05, droop=1.0, name="weed")
        cc.strap(J, P, tag, "kit1", r=0.05, flip=-1, name="net")


@register
class SkinWolf(Werewolf):
    """A white-furred werewolf of the north wearing a flayed skin cloak in kit1, kit2 bone fetishes."""
    key = "skin_wolf"
    layout = dict(Werewolf.layout, skin="fur_white", legs="fur_white", cape="short", cape_mat="kit1", cape_lining="skin_human")
    target_px = 86

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.collar_spikes(J, P, tag, mat="bone", n=5, ln=0.08)


# ----------------------------------------------------------------------------- carts
class AltarPriest(HumanLineman):
    """A warrior priest at the altar's rail: a kit1 robe and a hammer raised."""
    layout = dict(HumanLineman.layout, helm=None)
    stance = dict(lean=4, legs={"l": (0, 8, 0), "r": (0, 8, 0)}, arms={"l": (40, 24, 50, -10), "r": (120, 24, 50, -10)}, hands="fist")


@register
class SigmarsAnvil(Vehicle):
    """A war altar on wheels: a kit1 hull, a gold anvil on top, a kit2 banner, and a warrior priest."""
    key = "sigmars_anvil"
    size = (0.9, 1.3, 0.55)
    drum = None
    wheels = 0.4
    hull, trim, roof = "kit1", "kit2", "gold"
    funnel = False
    driver = AltarPriest
    driver_at = (0.15, 0.85)
    target_px = 104

    def extras(self, tag, pose, centre):
        top = centre + Vector((0, 0.4, 0.45))
        core.box(tag + "anvil", top, (0.3, 0.18, 0.14), "gold")
        tube(tag + "bpole", [top, top + UP * 0.9], [0.025, 0.025], "wood", n=5)
        core.flat_cone(tag + "banner", top + UP * 0.86, top + UP * 0.5 + Vector((0.3, 0, 0)), 0.18, "kit2", Vector((0, 1, 0)), squash=0.15)


class CartImp(ImpUndivided):
    """An imp riding the cart."""
    stance = dict(lean=4, legs={"l": (0, 8, 0), "r": (0, 8, 0)}, arms={"l": (40, 24, 50, -10), "r": (40, 24, 50, -10)}, hands="fist")


@register
class ChaosSeesaw(Vehicle):
    """A rickety wheeled seesaw: a kit1 plank on a kit2 frame with an imp at one end."""
    key = "chaos_seesaw"
    size = (0.5, 1.2, 0.3)
    drum = None
    wheels = 0.25
    hull, trim, roof = "kit2", "kit1", "wood"
    funnel = False
    driver = CartImp
    driver_at = (0.4, 0.75)
    target_px = 70

    def extras(self, tag, pose, centre):
        tilt = 0.15 * math.sin(math.pi * pose.get("puff", 0) * 2)
        a, b = centre + Vector((0, -0.8, 0.45 + tilt)), centre + Vector((0, 0.8, 0.45 - tilt))
        core.box(tag + "plank", (a + b) / 2, (0.25, 1.6, 0.05), "kit1")
        cone(tag + "pivot", centre + UP * 0.2, centre + UP * 0.42, 0.12, "kit2", 4)


class CartBearer(Plaguebearer):
    """A plaguebearer at the reins."""
    stance = dict(lean=4, legs={"l": (0, 8, 0), "r": (0, 8, 0)}, arms={"l": (40, 24, 50, -10), "r": (40, 24, 50, -10)}, hands="fist")


@register
class PlagueCart(Vehicle):
    """A rotting green cart with a great bronze bell, dripping slime, pulled along by a plaguebearer."""
    key = "plague_cart"
    size = (0.9, 1.3, 0.5)
    drum = None
    wheels = 0.38
    hull, trim, roof = "skin_nurgle", "kit1", "rust"
    funnel = False
    driver = CartBearer
    driver_at = (0.15, 0.85)
    target_px = 96

    def extras(self, tag, pose, centre):
        top = centre + Vector((0, 0.35, 0.5))
        for sd in (-1, 1):
            tube(tag + "frame%d" % sd, [top + Vector((sd * 0.3, 0, 0)), top + Vector((sd * 0.3, 0, 0.6))], [0.03, 0.03], "rust", n=5)
        tube(tag + "beam", [top + Vector((-0.32, 0, 0.6)), top + Vector((0.32, 0, 0.6))], [0.03, 0.03], "rust", n=5)
        cone(tag + "bell", top + UP * 0.56, top + UP * 0.25, 0.03, "brass", 12, r2=0.2)


@register
class PigeonBomber(HumanLineman):
    """A Nuln engineer in goggles with two grey bomb-pigeons on his shoulders and a kit2 dovecote pack."""
    key = "pigeon_bomber"
    layout = dict(HumanLineman.layout, helm=None)
    target_px = 92

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        goggles(J, tag)
        for side in ("l", "r"):
            sh = J["arms"][side][0] + UP * 0.1
            ellipsoid(tag + "pigeon" + side, sh, (0.06, 0.1, 0.07), "stone")
            ball_at(tag + "pigeonhead" + side, sh + J["F"] * 0.08 + UP * 0.06, 0.04, "stone")
            cone(tag + "pigeonbeak" + side, sh + J["F"] * 0.11 + UP * 0.06, sh + J["F"] * 0.16 + UP * 0.05, 0.012, "gold", 4)
        back = J["pelvis"] + J["u"] * (P["sh_h"] * 0.6) + J["B"] * 0.2
        core.box(tag + "dovecote", back, (0.26, 0.16, 0.3), "kit2", core.basis(J["X"], J["F"], J["u"]))
