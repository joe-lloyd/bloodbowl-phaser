"""Secret League models, round two: the lesser and greater daemons of the four gods and Malal, the Chaos imps and the
Daemon Prince. No two positions on one team share a model (see src/data/community/secretLeagueModels.json)."""
from lib import Biped, Floating, register, core, palette, parts
from lib.core import UP, ball_at, cone, ellipsoid, tband, tube, surf
from teams import chaos_common as cc

palette.ramp("skin_slaanesh", "#6a4a7a", "#b48ac4", "#ecd0f0")
palette.ramp("skin_pink", "#8a2a5a", "#d85a9a", "#f8a8d0")
palette.ramp("skin_blue", "#1a2a6a", "#3a5ac0", "#7aa0f0")
palette.ramp("skin_malal", "#141018", "#2a2430", "#4a4456")
palette.ramp("feather_blue", "#1a3a7a", "#2a7ac0", "#6ad0f0")
palette.ramp("hair_lilac", "#4a2a6a", "#8a5ab0", "#c8a0e8")
palette.ramp("tz_flame", "#3a2a9a", "#c85ad8", "#f0d0ff")


def pincer(J, tag, side, mat="bone", size=1.0):
    """A crab claw over the hand: two curved blades that open towards the front."""
    sh, el, wr, tip = J["arms"][side]
    d = (tip - wr).normalized()
    sx = d.cross(UP)
    if sx.length < 0.2:
        sx = J["X"]
    sx.normalize()
    ellipsoid(tag + "claw" + side, wr + d * 0.08 * size, (0.1 * size, 0.09 * size, 0.12 * size), mat)
    for j, sd in enumerate((-1, 1)):
        b = wr + d * 0.12 * size + sx * sd * 0.05 * size
        pts = [b, b + (d * 0.16 + sx * sd * 0.09) * size, b + (d * 0.32 + sx * sd * 0.02) * size]
        tube(tag + "blade%s%d" % (side, j), pts, [0.06 * size, 0.045 * size, 0.01], mat, n=6)


def face_eyes(J, P, tag, h, mat="eye_yellow", gap=0.09, r=0.04):
    """Two eyes set in the chest for a headless daemon."""
    for sd in (-1, 1):
        p = surf(J, P, h, sd * 18, 0.0)
        ellipsoid(tag + "chesteyelid%d" % sd, p, (r * 1.5, r * 0.8, r * 1.2), "socket")
        ball_at(tag + "chesteye%d" % sd, p + J["F"] * r * 0.5, r, mat)


# ----------------------------------------------------------------------------- Khorne
@register
class Bloodletter(Biped):
    """Lean red daemon on hooked legs: long black horns, a drawn snout full of teeth, a kit1 loincloth and kit2 bracers."""
    key = "bloodletter"
    race = "beastman"
    knobs = dict(limb=1.0, shoulders=1.05, hunch=16, head=0.95, head_fwd=0.06, arms=1.12)
    layout = dict(skin="skin_chaos", legs="skin_chaos", head="snout", snout=(1.15, 0.7), ears="none", horns="goat", horn_mat="fur_black",
                  fangs=True, eye_mat="eye_yellow", loin="kit1", loin_trim="kit2", bracers="kit2", claws=0.12, belt="kit2", buckle="brass",
                  tail=dict(len=0.8, r=0.05, mat="skin_chaos", up=0.25, tip="fur_black"))
    stance = dict(lean=14, legs={"l": (10, 14, 14), "r": (-8, 14, 10)}, arms={"l": (24, 30, 40), "r": (24, 30, 40)}, hands="open")
    stride, arm_swing, jump = 42, 34, 0.26
    target_px = 84

    def idle(self, ph, p, w):       # sways low, snapping its jaws
        p.update(jaw=10 + 26 * max(0.0, w["s2"]), lean=14 + 6 * w["breath"], tail=w["s1"])

    def extras(self, J, P, L, tag, pose):
        cc.spines(J, P, tag, (0.22, 0.38, 0.52), mat="fur_black", ln=0.12, r=0.05)
        cc.collar_spikes(J, P, tag, mat="brass", n=5, ln=0.08, r=0.03)


@register
class Bloodthirster(Biped):
    """The greater daemon of Khorne: a winged red giant with bull horns, a brass kit1 breastplate and kit2 loincloth."""
    key = "bloodthirster"
    race = "minotaur"
    ref_frame = 192
    knobs = dict(shoulders=1.55, torso=1.4, limb=1.6, hunch=12, arms=1.15, hands=1.3)
    layout = dict(skin="skin_chaos", legs="skin_chaos", snout=(1.0, 1.1), ears="none", horns="bull", horn_mat="fur_black", fangs=True,
                  eye_mat="eye_yellow", breast="kit1", trim="brass", loin="kit2", loin_trim="brass", bracers="brass", belt="brass",
                  buckle="brass", wings=True, wing_mat="fur_black", wing_scale=1.15, claws=0.12)
    stance = dict(lean=8, legs={"l": (8, 15, 10), "r": (-6, 15, 8)}, arms={"l": (18, 34, 40), "r": (18, 34, 40)}, hands="fist")
    stride, arm_swing, jump = 30, 26, 0.14
    target_px = 132
    lie, lie_shift = 0.3, 1.0

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["wings"] = name in ("run", "jump")
        return p

    def extras(self, J, P, L, tag, pose):
        cc.collar_spikes(J, P, tag, mat="brass", n=7, ln=0.14, r=0.045, h=P["sh_h"] + 0.06)


# ----------------------------------------------------------------------------- Slaanesh
@register
class Daemonette(Biped):
    """A lilac she-daemon: long hair, small swept horns, crab-claw hands, a kit1 top and kit2 loincloth on hooked legs."""
    key = "daemonette"
    race = "human"
    sex = "f"
    knobs = dict(digi=True, limb=0.85, legs=1.08)
    layout = dict(skin="skin_slaanesh", hair="long", hair_mat="hair_lilac", brow="hair_lilac", lip="lip_f", eyes="dark", horns="small",
                  horn_mat="white", torso="kit1", arms="skin_slaanesh", legs="skin_slaanesh", boots="skin_slaanesh", cuff=None, loin="kit2",
                  loin_trim="kit1", tail=dict(len=0.85, r=0.035, mat="skin_slaanesh", up=0.4, tip="kit1"))
    stance = dict(lean=6, legs={"l": (8, 8, 20), "r": (-6, 8, 14)}, arms={"l": (16, 30, 50), "r": (16, 30, 50)}, hands="open")
    stride, arm_swing, jump = 44, 34, 0.32
    target_px = 80

    def idle(self, ph, p, w):       # clacks both claws, hips swaying
        p.update(roll=4 * w["s1"], tail=w["s2"], arms={"l": (16 + 20 * w["up"], 30, 50), "r": (16 + 20 * w["dn"], 30, 50)})

    def extras(self, J, P, L, tag, pose):
        for side in ("l", "r"):
            pincer(J, tag, side, "white", 0.9)


@register
class KeeperOfSecrets(Biped):
    """The greater daemon of Slaanesh: a tall lilac giant with a bull head, long white horns, claws and a kit1 sash over kit2 silks."""
    key = "keeper_of_secrets"
    race = "minotaur"
    ref_frame = 192
    knobs = dict(shoulders=1.3, torso=1.05, belly=0.9, limb=1.15, hunch=6, legs=1.15, arms=1.15)
    layout = dict(skin="skin_slaanesh", legs="skin_slaanesh", snout=(0.85, 0.95), ears="none", horns="bull", horn_mat="fur_black", fangs=True,
                  eye_mat="eye_yellow", loin="kit2", loin_trim="kit1", bracers="kit1", neckband="gold", hair=None)
    stance = dict(lean=4, legs={"l": (8, 12, 10), "r": (-6, 12, 8)}, arms={"l": (16, 34, 50), "r": (16, 34, 50)}, hands="open")
    stride, arm_swing, jump = 32, 26, 0.16
    target_px = 128
    lie, lie_shift = 0.3, 1.0

    def extras(self, J, P, L, tag, pose):
        cc.sash(J, P, tag, pose, "kit1", side=-1, ln=0.5)
        for side in ("l", "r"):
            pincer(J, tag, side, "white", 1.4)


# ----------------------------------------------------------------------------- Nurgle
@register
class Plaguebearer(Biped):
    """A gaunt green daemon with one horn and one eye, a split belly and flies; kit1 rags and a kit2 belt."""
    key = "plaguebearer"
    race = "zombie"
    knobs = dict(hunch=20, limb=0.85, belly=1.15, head=1.0)
    layout = dict(skin="skin_nurgle", eyes="red", brow="socket", lip="skin_nurgle", legs="skin_nurgle", arms="skin_nurgle", boots="skin_nurgle",
                  cuff=None, belt="kit2", buckle="rust", claws=0.06)
    stance = dict(lean=8, legs={"l": (6, 12, 12), "r": (-4, 12, 8)}, arms={"l": (8, 24, 30), "r": (8, 24, 30)}, hands="open")
    stride, arm_swing, jump = 30, 20, 0.12
    target_px = 82

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["_t"] = i / float(n)
        return p

    def extras(self, J, P, L, tag, pose):
        cc.one_horn(J, tag, sd=1, mat="bone_old", ln=0.45, stub=False)
        cc.third_eye(J, tag, up=0.25, r=0.07, mat="eye_yellow")
        cc.belly_maw(J, P, tag, h=0.12, w=0.16, gape=0.05)
        cc.rags(J, P, tag, "kit1", h0=0.04, h1=-0.24, jag=0.6, k=1.12)
        cc.flies(J, tag, pose.get("_t", 0.0), n=4)
        cc.boils(J, P, tag, [(0.3, 40), (0.22, -60), (0.4, 150)])


@register
class Nurgling(Biped):
    """A tiny round green mite with stubby horns and a wide grin, wearing a kit1 bib and kit2 belt."""
    key = "nurgling"
    race = "snotling"
    knobs = dict(belly=1.5, torso=1.15, head=1.35)
    layout = dict(skin="skin_nurgle", lip="skin_nurgle", eyes="red", horns="small", horn_mat="bone_old", fangs=True, legs="skin_nurgle",
                  arms="skin_nurgle", boots="skin_nurgle", cuff=None, belt="kit2", buckle="rust", tail=dict(len=0.4, r=0.04, mat="skin_nurgle"))
    stance = dict(lean=2, legs={"l": (6, 18, 10), "r": (-4, 18, 10)}, arms={"l": (20, 40, 40), "r": (20, 40, 40)}, hands="open")
    stride, arm_swing, jump = 40, 40, 0.3
    target_px = 40

    def idle(self, ph, p, w):       # bounces and giggles
        p.update(hop=0.05 * w["up"], jaw=20 * w["up"])

    def extras(self, J, P, L, tag, pose):
        tband(tag + "bib", J, P, [0.2, 0.32], "kit1", k=1.08, add=0.02, arc=(-80, 80))
        cc.boils(J, P, tag, [(0.15, 30), (0.25, -40)])


# ----------------------------------------------------------------------------- Tzeentch
class Horror(Biped):
    """A headless daemon whose face is its body: eyes and a wide mouth in the chest, long arms, short legs."""
    race = "human"
    skin = "skin_pink"
    knobs = dict(legs=0.6, arms=1.35, limb=1.0, torso=1.25, belly=1.2, torso_len=1.1)
    stance = dict(lean=4, legs={"l": (10, 22, 16), "r": (-8, 22, 16)}, arms={"l": (40, 40, 60), "r": (40, 40, 60)}, hands="open")
    stride, arm_swing, jump = 44, 60, 0.3

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(head="blank", hair=None, beard=None, skin=self.skin, torso=self.skin, arms=self.skin, legs=self.skin, boots=self.skin,
                 cuff=None, belt="kit2", buckle="gold", wraps="kit1")
        return L

    def idle(self, ph, p, w):       # waves its arms over its head
        p.update(arms={"l": (40 + 80 * w["up"], 40, 60), "r": (40 + 80 * w["dn"], 40, 60)})

    def extras(self, J, P, L, tag, pose):
        face_eyes(J, P, tag, P["sh_h"] - 0.08)
        cc.belly_maw(J, P, tag, h=0.26, w=0.2, gape=0.06, teeth=7)
        cc.collar_spikes(J, P, tag, mat="kit1", n=5, ln=0.12, r=0.04, h=P["sh_h"] + 0.02)


@register
class PinkHorror(Horror):
    """Bright pink and grinning, with a crest of kit1 spines."""
    key = "horror_pink"
    target_px = 70


@register
class BlueHorror(Horror):
    """Smaller and blue with a sullen down-turned mouth."""
    key = "horror_blue"
    skin = "skin_blue"
    knobs = dict(Horror.knobs, torso=1.1, arms=1.2)
    target_px = 54

    def idle(self, ph, p, w):       # sulks, stamping one foot
        p.update(legs={"l": (10 + 14 * w["up"], 22, 16), "r": (-8, 22, 16)})


@register
class Flamer(Floating):
    """A hovering trunk of pink and blue flame with arms that end in fire; kit bands round its rim."""
    key = "flamer"
    race = "human"
    knobs = dict(shoulders=1.1, torso=1.3, limb=1.0, arms=1.2)
    target_px = 76

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin="skin_pink", torso="skin_pink", arms="skin_blue", coat_mat="skin_pink", robe_lining="skin_blue", head="blank",
                 hair=None, neckband="kit1", sleeve_cuff="kit2", belt="kit2", buckle=None, jag=0.6, hem=None)
        return L

    def extras(self, J, P, L, tag, pose):
        top = J["pelvis"] + J["u"] * (P["sh_h"] + 0.04)
        ellipsoid(tag + "cap", top, (0.3, 0.3, 0.12), "skin_blue")
        cc.belly_maw(J, P, tag, h=P["sh_h"] - 0.1, w=0.18, gape=0.06)
        for side in ("l", "r"):
            sh, el, wr, tip = J["arms"][side]
            cc.flame(tag + "armfire" + side, tip, (tip - wr).normalized(), 0.3, r=0.08)


@register
class LordOfChange(Biped):
    """The greater daemon of Tzeentch: a blue bird-headed giant with a gold beak, wide feathered wings and a kit1 robe with kit2 trim."""
    key = "lord_of_change"
    race = "beastman"
    ref_frame = 192
    knobs = dict(shoulders=1.35, torso=1.2, limb=1.3, legs=1.1, hunch=10, head=1.1)
    layout = dict(skin="feather_blue", legs="feather_blue", head="snout", snout=(1.0, 0.55), snout_mat="gold", nose_mat="gold", ears="none",
                  horns="goat", horn_mat="tz_flame", eye_mat="eye_yellow", coat="robe", coat_mat="kit1", hem="kit2", belt="kit2", buckle="gold",
                  wings=True, wing_mat="feather_blue", wing_scale=1.2, claws=0.1)
    stance = dict(lean=6, legs={"l": (8, 12, 10), "r": (-6, 12, 8)}, arms={"l": (14, 34, 50), "r": (14, 34, 50)}, hands="open")
    stride, arm_swing, jump = 30, 24, 0.2
    target_px = 128
    lie, lie_shift = 0.3, 1.0

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["wings"] = name in ("run", "jump")
        return p


# ----------------------------------------------------------------------------- Malal
class Malal(Biped):
    overlay = "white"
    """Malal's daemons: black hide with one white half, a bone half-mask, kit bands to mark the team."""
    race = "beastman"
    layout = dict(skin="skin_malal", legs="skin_malal", head="snout", snout=(0.8, 0.8), ears="none", horns="goat", horn_mat="white",
                  fangs=True, eye_mat="eye_green", claws=0.1, belt="kit2", buckle="metal", bracers="kit1")
    stance = dict(lean=10, legs={"l": (8, 14, 12), "r": (-6, 14, 10)}, arms={"l": (20, 30, 40), "r": (20, 30, 40)}, hands="open")
    stride, arm_swing, jump = 40, 30, 0.24

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "halfmask", c, (s[0] * 1.05, s[1] * 1.08, s[2] * 1.05), self.overlay, (X + F * 0.6).normalized(), cut=0.1,
                 rot=J["head_R"], thick=0.025)
        cc.arm_overlay(J, L, tag, "r", self.overlay, k=1.06, name="white")
        tband(tag + "sash", J, P, [0.06, 0.12], "kit1", k=1.1, add=0.03)


@register
class MalalDrone(Malal):
    """The small one: hunched and quick, white where the others are black."""
    key = "malal_drone"
    layout = dict(Malal.layout, skin="fur_white", legs="fur_white", horn_mat="black")
    overlay = "skin_malal"
    knobs = dict(limb=0.85, hunch=16, head=1.1, legs=0.9)
    target_px = 70


@register
class SoulReaver(Malal):
    """Lean and tall, a long blade grown from one forearm."""
    key = "malal_reaver"
    knobs = dict(limb=1.0, legs=1.12, shoulders=1.05)
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        sh, el, wr, tip = J["arms"]["l"]
        d = (wr - el).normalized()
        cone(tag + "armblade", wr, wr + d * 0.55 + UP * 0.05, 0.06, "white", 4)


@register
class HarvesterOfSouls(Malal):
    """The greater daemon of Malal: a winged giant with a white scythe."""
    key = "malal_harvester"
    ref_frame = 192
    knobs = dict(limb=1.55, shoulders=1.45, torso=1.35, hunch=12, hands=1.2)
    layout = dict(Malal.layout, wings=True, wing_mat="skin_malal", wing_scale=1.1, horns="ram")
    target_px = 126
    lie, lie_shift = 0.3, 1.0

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "l", tag, length=1.5, r=0.035, mat="skin_malal", head="blade", head_mat="white")


# ----------------------------------------------------------------------------- imps
class Imp(Biped):
    """A small winged imp with a forked tail; each god's imp has its own colour and one mark."""
    race = "snotling"
    skin = "skin_chaos"
    knobs = dict(limb=0.75, head=1.25, legs=0.6)
    stance = dict(lean=8, legs={"l": (14, 20, 30), "r": (-6, 20, 30)}, arms={"l": (24, 36, 40), "r": (24, 36, 40)}, hands="open")
    stride, arm_swing, jump = 40, 40, 0.4
    target_px = 46

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin=self.skin, lip=self.skin, legs=self.skin, arms=self.skin, boots=self.skin, cuff=None, horns="small", horn_mat="black",
                 fangs=True, wings=True, wing_mat="membrane", wing_scale=0.45, belt="kit1", buckle="kit2",
                 tail=dict(len=0.6, r=0.03, mat=self.skin, up=0.4, tip="kit2"))
        return L

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["wings"] = i % 2 == 0
        p["_t"] = i / float(n)
        if name != "fall":
            p["hop"] = p.get("hop", 0) + 0.12
        return p

    def extras(self, J, P, L, tag, pose):
        tband(tag + "scarf", J, P, [P["sh_h"] - 0.02, P["sh_h"] + 0.04], "kit2", k=1.05, add=0.03)


@register
class ImpUndivided(Imp):
    """The plain Chaos imp: slate grey with bone horns."""
    key = "imp_undivided"
    skin = "fur_grey"


@register
class Bubo(Imp):
    """Nurgle's imp: green and pot-bellied with flies."""
    key = "imp_bubo"
    skin = "skin_nurgle"
    knobs = dict(Imp.knobs, belly=1.5)

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.flies(J, tag, pose.get("_t", 0.0), n=3, rad=0.22)


@register
class Muse(Imp):
    """Slaanesh's imp: lilac with long hair and white horns."""
    key = "imp_muse"
    skin = "skin_slaanesh"

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(hair="long", hair_mat="hair_lilac", horn_mat="white", fangs=False)
        return L


@register
class Fearling(Imp):
    """Tzeentch's imp: blue with a third eye and pink wings."""
    key = "imp_fearling"
    skin = "skin_blue"

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(wing_mat="skin_pink")
        return L

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.third_eye(J, tag, up=0.55, r=0.05)


@register
class Malice(Imp):
    """Khorne's imp: blood red with a spiked brass collar."""
    key = "imp_malice"

    def extras(self, J, P, L, tag, pose):
        cc.collar_spikes(J, P, tag, mat="brass", n=5, ln=0.08, r=0.03)


# ----------------------------------------------------------------------------- Daemon Prince
@register
class DaemonPrince(Biped):
    """A champion made daemon: purple hide, ram horns, bat wings, black kit1-enamelled plate and a kit2 loincloth."""
    key = "daemon_prince"
    race = "minotaur"
    ref_frame = 192
    knobs = dict(shoulders=1.45, torso=1.3, limb=1.45, hunch=8, arms=1.1, hands=1.2)
    layout = dict(skin="varg_skin", legs="varg_skin", snout=(0.7, 0.95), ears="none", horns="ram", horn_mat="bone", fangs=True,
                  eye_mat="eye_yellow", breast="kit1", trim="darkmetal", pads="big", pad_mat="darkmetal", pad_trim="kit1", spikes=2,
                  loin="kit2", loin_trim="darkmetal", belt="darkmetal", buckle="gold", wings=True, wing_mat="membrane", claws=0.1)
    stance = dict(lean=6, legs={"l": (8, 14, 10), "r": (-6, 14, 8)}, arms={"l": (16, 34, 44), "r": (16, 34, 44)}, hands="fist")
    stride, arm_swing, jump = 32, 26, 0.16
    target_px = 124
    lie, lie_shift = 0.3, 1.0

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["wings"] = name in ("run", "jump")
        return p
