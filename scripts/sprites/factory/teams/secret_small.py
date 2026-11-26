"""Secret League models, round six: Skaven clans, hobgoblins, goblins, halflings, squigs and skinks. Each one gives a
position its own model on a team that used to repeat one or show the mannequin
(see src/data/community/secretLeagueModels.json)."""
from mathutils import Matrix, Vector
from lib import Biped, register, core, palette, parts
from lib.core import UP, ball_at, cone, ellipsoid, tband, tube, surf, lerp
from teams import chaos_common as cc
from teams.chaos_dwarf import Hobgoblin
from teams.small_folk_goblin import GoblinLineman
from teams.small_folk_halfling import HalflingCatcher, HalflingHopeful
from teams.small_folk_squig import CaveMaw, maw
from teams.undead_skaven_lizards_lizard import Kroxigor, Skink
from teams.undead_skaven_lizards_skaven import GutterRunner, SkavenBlitzer, SkavenLineman, SkavenThrower, rat
from teams.secret_dwarfs import goggles

palette.ramp("warpstone", "#1e5a1e", "#4ac83a", "#b0ff8a")
palette.ramp("skin_trog", "#5a5a66", "#9494a4", "#d0d0dc")
palette.ramp("skin_krox_old", "#4a5048", "#7a8a78", "#b4c0aa")
palette.ramp("fur_pink", "#8a4a5a", "#c88a98", "#f0c4cc")


def robe_hood(J, P, L, tag, mat, trim):
    c, X, F, U, s = cc.hf(J)
    core.cap(tag + "hood", c + U * 0.02 - F * 0.04, (s[0] * 1.18, s[1] * 1.2, s[2] * 1.15), mat, (U - F * 0.35).normalized(), cut=-0.1,
             rot=J["head_R"], thick=0.03)
    cc.rags(J, P, tag, mat, h0=0.25, h1=-0.34, jag=0.5, k=1.16, name="robe")
    tband(tag + "robetrim", J, P, [0.03, 0.08], trim, k=1.18, add=0.03, solid=0.03)


# ----------------------------------------------------------------------------- Skaven
@register
class NightRunner(GutterRunner):
    """A young gutter runner: no hood, a kit2 headband over grey fur and a single dagger."""
    key = "night_runner"
    layout = dict(GutterRunner.layout, helm=None, snout_mat="fur_grey", ears="rat", scarf_mat="kit2")
    target_px = 62

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.headband(J, tag, "kit2", tails=True)


@register
class EshinAssassin(GutterRunner):
    """A black-masked assassin with a kit1 sash and a blade in each paw."""
    key = "eshin_assassin"
    knobs = dict(GutterRunner.knobs, limb=0.75, legs=1.08)
    layout = dict(GutterRunner.layout, hood_mat="kit1", snout_mat="kit1", scarf_mat="kit2", torso="kit1")
    target_px = 66

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.sash(J, P, tag, pose, "kit1", side=-1, ln=0.4)
        for side in ("l", "r"):
            parts.rod(J, side, tag, length=0.4, r=0.015, mat="black", head="blade", head_mat="warpstone")


@register
class RedGuard(SkavenBlitzer):
    """Clan Mors' elite: brass plate, a tall kit1 crest and a halberd."""
    key = "red_guard"
    layout = dict(SkavenBlitzer.layout, helm_mat="brass", pad_mat="brass", breast="brass", plume=None)
    target_px = 80

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.crest(tag, c + U * s[2] * 0.9, J["head_R"], s, "kit1", h=0.22)
        parts.rod(J, "r", tag, length=1.3, r=0.022, mat="wood", head="blade", head_mat="metal")


@register
class PlagueCarrier(SkavenLineman):
    """A ragged plague rat in a kit1 hooded robe with kit2 trim, ringing a rusty bell."""
    key = "plague_carrier"
    layout = rat("skin_nurgle", eye_mat="eye_yellow", belt="rope", buckle=None)
    target_px = 70

    def extras(self, J, P, L, tag, pose):
        robe_hood(J, P, L, tag, "kit1", "kit2")
        c0, d, n, t = J["grip_r"]
        tube(tag + "bellrod", [c0, c0 + t * 0.25], [0.015, 0.015], "wood", n=5)
        cone(tag + "bell", c0 + t * 0.25, c0 + t * 0.4, 0.08, "rust", 10, r2=0.02)
        cc.boils(J, P, tag, [(0.3, 30), (0.2, -50)])


@register
class CenserBearer(SkavenLineman):
    """A frenzied monk in kit1 rags swinging a censer of green warpstone smoke on a chain."""
    key = "censer_bearer"
    layout = rat("fur_black", eye_mat="eye_green", loin="kit1", loin_trim="kit2", bracers="rust", belt="rope", buckle=None)
    target_px = 72

    def extras(self, J, P, L, tag, pose):
        robe_hood(J, P, L, tag, "kit2", "kit1")
        wr = J["arms"]["r"][3]
        end = wr + J["X"] * 0.3 - UP * 0.25 + J["F"] * 0.1
        cc.chain(tag + "censerchain", wr, end, "darkmetal", n=5, sag=0.05)
        ellipsoid(tag + "censer", end, (0.08, 0.08, 0.1), "rust", seg=10)
        ellipsoid(tag + "censersmoke", end + UP * 0.14, (0.1, 0.1, 0.07), "warpstone")


@register
class Globadier(SkavenThrower):
    """A gas-masked rat with a bandolier of green glass globes and a kit2 tank on his back."""
    key = "globadier"
    target_px = 76

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        cone(tag + "mask", c + F * s[1] * 0.6 - U * s[2] * 0.3, c + F * s[1] * 1.3 - U * s[2] * 0.4, s[0] * 0.4, "darkmetal", 8, r2=s[0] * 0.2)
        cc.strap(J, P, tag, "leather", r=0.035, flip=1, name="bandolier")
        for i, h in enumerate((0.12, 0.22, 0.32)):
            ball_at(tag + "globe%d" % i, surf(J, P, h, 20 - 25 * i, 0.07), 0.04, "warpstone")
        cc.tank(J, P, tag, body="kit2", band="darkmetal", r=0.1)


@register
class WarpGrinder(SkavenLineman):
    """A tunnelling rat behind a great iron drill, a brass boiler on his back and goggles."""
    key = "warp_grinder"
    layout = rat("fur_brown", torso="kit1", loin="kit2", loin_trim="rust", bracers="rust", neckband="kit2", belt="leather", buckle="rust")
    target_px = 72

    def extras(self, J, P, L, tag, pose):
        goggles(J, tag, lens="warpstone")
        a = lerp(J["arms"]["l"][3], J["arms"]["r"][3], 0.5)
        cone(tag + "drill", a, a + J["F"] * 0.45, 0.13, "darkmetal", 8)
        ball_at(tag + "drillglow", a, 0.08, "warpstone")
        cc.tank(J, P, tag, body="brass", band="kit1", r=0.13)


@register
class MechaVermin(SkavenBlitzer):
    """A clockwork rat: brass body, iron limbs, a glowing warpstone eye and a kit1 crest plate."""
    key = "mecha_vermin"
    ref_frame = 192
    knobs = dict(SkavenBlitzer.knobs, shoulders=1.5, torso=1.4, limb=1.45, hands=1.3)
    layout = dict(SkavenBlitzer.layout, skin="brass", legs="darkmetal", torso="brass", arms="darkmetal", eye_mat="eye_green", helm=None,
                  breast="brass", pad_mat="darkmetal", tabard=None, dark="darkmetal", ear_mat="brass")
    target_px = 98

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        ball_at(tag + "warpeye", c + F * s[1] * 0.8 + U * s[2] * 0.3 + X * s[0] * 0.3, s[0] * 0.25, "warpstone")
        cc.tank(J, P, tag, body="darkmetal", band="kit1", r=0.14)
        for i, a in enumerate((-50, 0, 50)):
            ball_at(tag + "bolt%d" % i, surf(J, P, 0.25, a, 0.03), 0.035, "darkmetal")


@register
class Throtling(Biped):
    """A Moulder flesh-thing: a pink hairless rat with a third arm on its shoulder, a kit1 collar and kit2 loincloth."""
    key = "throtling"
    race = "skaven"
    knobs = dict(hunch=18, limb=0.9, head=1.05)
    layout = rat("fur_pink", eye_mat="eye_yellow", fangs=True, loin="kit2", loin_trim="kit1", neckband="kit1", belt="leather", buckle="rust",
                 claws=0.1)
    stance = dict(lean=10, legs={"l": (8, 12, 12), "r": (-6, 12, 10)}, arms={"l": (20, 26, 40), "r": (20, 26, 40)}, hands="open")
    stride, arm_swing, jump = 40, 32, 0.24
    target_px = 70

    def extras(self, J, P, L, tag, pose):
        cc.shoulder_tentacle(J, tag, "l", ln=0.55, r=0.06, mat="fur_pink", ring="kit1")
        cc.boils(J, P, tag, [(0.3, 40), (0.2, -60), (0.36, 160)], mat="skin_rat")


# ----------------------------------------------------------------------------- hobgoblins
@register
class DirtyGit(Hobgoblin):
    """A sneak in a kit1 hood with a dagger behind his back."""
    key = "dirty_git"
    layout = dict(Hobgoblin.layout, cap=None, helm="hood", helm_mat="kit1")
    target_px = 70

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "l", tag, length=0.35, r=0.015, mat="leather", head="blade", head_mat="metal")


@register
class HobRunner(Hobgoblin):
    """A lean runner with a kit2 topknot and wraps, no cap."""
    key = "hob_runner"
    knobs = dict(Hobgoblin.knobs, legs=1.05, limb=0.68)
    layout = dict(Hobgoblin.layout, cap=None, topknot="hair", jersey=None, torso="skin_goblin")
    target_px = 70


@register
class HobBlitzer(Hobgoblin):
    """A hobgoblin in a spiked iron cap and one big kit1 shoulder plate."""
    key = "hob_blitzer"
    knobs = dict(Hobgoblin.knobs, shoulders=1.1, torso=0.9)
    layout = dict(Hobgoblin.layout, cap=None, helm="skull", helm_mat="darkmetal", pads="big", pad_sides=("r",), pad_mat="kit1",
                  pad_trim="darkmetal", spikes=1, xstrap="leather")
    target_px = 72


# ----------------------------------------------------------------------------- goblins
@register
class Troglagob(GoblinLineman):
    """A pale cave goblin: grey skin, huge yellow eyes, hunched, a kit1 loincloth."""
    key = "troglagob"
    knobs = dict(hunch=18, head=1.3)
    layout = dict(GoblinLineman.layout, skin="skin_trog", arms="skin_trog", lip="skin_trog", eyes="red", topknot=False, torso="skin_trog",
                  loin="kit1", loin_trim="kit2")
    target_px = 60

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for sd in (-1, 1):
            ball_at(tag + "trogeye%d" % sd, c + F * s[1] * 0.75 + U * s[2] * 0.2 + X * sd * s[0] * 0.38, s[0] * 0.24, "eye_yellow")


@register
class FireKobold(GoblinLineman):
    """A small red fire-imp of the hills: hair of flame, kit2 wraps, a kit1 loincloth."""
    key = "fire_kobold"
    layout = dict(GoblinLineman.layout, skin="skin_chaos", arms="skin_chaos", lip="skin_chaos", topknot=False, torso="skin_chaos", loin="kit1",
                  loin_trim="kit2")
    target_px = 58

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for i, sd in enumerate((-0.6, 0, 0.6)):
            cc.flame(tag + "hairfire%d" % i, c + U * s[2] * 0.8 + X * sd * s[0] * 0.6, UP - J["F"] * 0.3, 0.22, r=0.06)


@register
class SquigGobba(GoblinLineman):
    """A goblin with a little squig in a kit1 sack on his back, its jaws snapping over his shoulder."""
    key = "squig_gobba"
    target_px = 62

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        back = J["pelvis"] + J["u"] * (P["sh_h"] - 0.05) + J["B"] * 0.25
        ellipsoid(tag + "sack", back, (0.18, 0.14, 0.2), "kit1")
        place = Matrix.Translation(back + UP * 0.12) @ Matrix.Scale(0.28, 4)
        maw(tag + "sq_", {"jaw": 24}, place)


# ----------------------------------------------------------------------------- halflings
@register
class ForestThrower(HalflingHopeful):
    """A forest halfling with a kit1 feathered cap instead of a pot, and a kit2 cloak."""
    key = "forest_thrower"
    layout = dict(HalflingHopeful.layout, pot=False, apron=None, cape="short", cape_mat="kit2", cape_lining="kit1")
    target_px = 64

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "cap", c + U * 0.02, (s[0] * 1.08, s[1] * 1.08, s[2] * 1.08), "kit1", U, cut=0.3, rot=J["head_R"], thick=0.02)
        cone(tag + "feather", c + U * s[2] * 0.8 + X * s[0] * 0.5, c + U * s[2] * 1.6 + X * s[0] * 0.7 - F * 0.1, 0.03, "white", 5)


@register
class KamikazeHalfling(HalflingCatcher):
    """A halfling with a rising-sun kit1 headband and a smoking rocket strapped to his back."""
    key = "kamikaze_halfling"
    target_px = 64

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        back = J["pelvis"] + J["u"] * (P["sh_h"] * 0.6) + J["B"] * 0.2
        tube(tag + "rocket", [back - UP * 0.15, back + UP * 0.35], [0.07, 0.07], "kit1", n=8)
        cone(tag + "rockettip", back + UP * 0.35, back + UP * 0.5, 0.07, "metal", 8)
        cc.flame(tag + "rocketfire", back - UP * 0.15, -UP, 0.18, r=0.05)


# ----------------------------------------------------------------------------- squigs
@register
class CaveSquig(CaveMaw):
    """A small cave squig with a kit1 spiked collar."""
    key = "cave_squig"
    target_px = 46

    def build(self, pose):
        maw(self.key + "_", pose)
        top = Vector((0.0, 0.1, 1.05 + pose.get("hop", 0.0)))
        ellipsoid(self.key + "_bandana", top, (0.42, 0.42, 0.14), "kit1")
        for sd in (-1, 1):
            cone(self.key + "_horn%d" % sd, top + Vector((sd * 0.3, 0, 0.05)), top + Vector((sd * 0.5, 0, 0.4)), 0.07, "kit2", 6)


@register
class ManglerSquig(CaveMaw):
    """Two cave squigs chained together, bounding as one."""
    key = "mangler_squig"
    target_px = 70

    def build(self, pose):
        a = Matrix.Translation((-0.55, 0, 0)) @ Matrix.Scale(0.7, 4)
        b = Matrix.Translation((0.55, 0, 0.12)) @ Matrix.Scale(0.7, 4)
        maw(self.key + "_a_", pose, a)
        maw(self.key + "_b_", dict(pose, jaw=pose.get("jaw", 0) * 0.5 + 10), b)
        pts = [(-0.3, 0, 0.45), (0, 0, 0.3), (0.3, 0, 0.5)]
        tube(self.key + "_chain", [Vector(p) for p in pts], [0.04] * 3, "darkmetal", n=6)
        ball_at(self.key + "_lock", Vector((0, 0, 0.3)), 0.08, "kit1")


# ----------------------------------------------------------------------------- lizards
@register
class RedCrestedSkink(Skink):
    """A skink with a tall red frill instead of the kit sail, and red stripes."""
    key = "red_crested_skink"
    layout = dict(Skink.layout, skink_crest=None)
    target_px = 70

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.crest(tag, c, J["head_R"], s, "fur_red", h=0.5, n=7, lo=0.7, back=-1.0, width=0.08)


@register
class KroxigorAncient(Kroxigor):
    """An old kroxigor: grey-green weathered scales, bigger, a stone club and gold bands."""
    key = "kroxigor_ancient"
    ref_frame = 192
    knobs = dict(Kroxigor.knobs, shoulders=1.65, torso=1.6, limb=1.8)
    layout = dict(Kroxigor.layout, skin="skin_krox_old", legs="skin_krox_old")
    target_px = 118

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "r", tag, length=1.1, r=0.05, mat="wood", head="club", head_mat="stone")

