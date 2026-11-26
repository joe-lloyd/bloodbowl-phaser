"""Secret League models, round five: dwarfs of every kind, gnome tinkers and gnoblars. Each one gives a position its own
model on a team that used to repeat one or show the mannequin (see src/data/community/secretLeagueModels.json)."""
from lib import Biped, Quadruped, register, core, palette, parts
from lib.core import UP, ball_at, box, cone, ellipsoid, tband, tube, surf, lerp
from teams import chaos_common as cc
from teams.chaos_dwarf import ChaosDwarf
from teams.greenskins_dwarfs_dwarf import DwarfBlitzer, DwarfLineman, DwarfRunner, TrollSlayer
from teams.greenskins_dwarfs_monsters import Gnoblar
from teams.small_folk_gnome import GnomeLineman

palette.ramp("harridan_skin", "#5a5a6a", "#9a9aac", "#d4d4e0")


def goggles(J, tag, mat="brass", lens="eye_yellow"):
    c, X, F, U, s = cc.hf(J)
    for sd in (-1, 1):
        p = c + F * s[1] * 0.85 + U * s[2] * 0.25 + X * sd * s[0] * 0.38
        ball_at(tag + "goggle%d" % sd, p, s[0] * 0.26, mat)
        ball_at(tag + "lens%d" % sd, p + F * s[0] * 0.12, s[0] * 0.17, lens)


def drum_hat(J, tag, h=0.3):
    cc.tall_hat(J, tag, h, "darkmetal", bands=((0.14, "kit2", 0.1),), taper=0.92, rim="brass", k=0.98, lift=0.5)


# ----------------------------------------------------------------------------- Chaos dwarfs
@register
class InfernalThrower(ChaosDwarf):
    """Lighter armour: no shoulder plates or coat, a short horned hat, kit1 sleeves."""
    key = "infernal_thrower"
    layout = dict(ChaosDwarf.layout, pads=None, coat=None, hat="horned")
    target_px = 84


@register
class InfernalKicker(ChaosDwarf):
    """Bare-headed with a kit2 topknot and kit1 bracers, a heavy iron boot on the kicking foot."""
    key = "infernal_kicker"
    layout = dict(ChaosDwarf.layout, pads=None, coat=None, hat=None, breast=None, torso="kit1", bracers="kit2")
    target_px = 82

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.topknot(J, tag, "hair", tie="kit2")


@register
class Ironsworn(ChaosDwarf):
    """The heavy: an iron helm with great black bull horns instead of a hat, both shoulders in big spiked kit2 plate."""
    key = "ironsworn"
    knobs = dict(ChaosDwarf.knobs, shoulders=1.4, torso=1.36)
    layout = dict(ChaosDwarf.layout, pads="big", pad_sides=("l", "r"), spikes=2, hat=None, helm="open", helm_mat="darkmetal", horns="bull",
                  horn_mat="fur_black")
    target_px = 90


@register
class ChaosDwarfMutant(ChaosDwarf):
    """A dwarf twisted by the forge: red mutant claw arm, a shoulder tentacle and a third eye; no hat."""
    key = "cd_mutant"
    layout = dict(ChaosDwarf.layout, hat=None, pads=None, coat=None)
    target_px = 84

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.claw_arm(J, L, tag, "r")
        cc.shoulder_tentacle(J, tag, "l", ln=0.6, r=0.06)
        cc.third_eye(J, tag, up=0.55, r=0.045)


@register
class Blunderbuss(ChaosDwarf):
    """A gunner in a short drum hat carrying a flared brass blunderbuss."""
    key = "cd_blunderbuss"
    layout = dict(ChaosDwarf.layout, hat=None, pads=None)
    target_px = 84

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        drum_hat(J, tag, h=0.16)
        c0, d, n, t = J["grip_r"]
        a, b = c0 - t * 0.25, c0 + t * 0.7
        tube(tag + "gunstock", [a - t * 0.15, a], [0.05, 0.04], "wood", n=6)
        tube(tag + "barrel", [a, b], [0.035, 0.04], "brass", n=8)
        cone(tag + "muzzle", b, b + t * 0.12, 0.05, "brass", 10, r2=0.09)


@register
class Harridan(Biped):
    """A winged harpy: ash-grey skin, black hair, taloned bird legs, a kit1 top and kit2 loincloth."""
    key = "harridan"
    race = "human"
    sex = "f"
    knobs = dict(digi=True, limb=0.85)
    layout = dict(skin="harridan_skin", hair="long", hair_mat="hair", brow="hair", lip="lip_f", eyes="red", torso="kit1", arms="harridan_skin",
                  legs="harridan_skin", boots="fur_black", cuff=None, loin="kit2", loin_trim="kit1", claws=0.1, wings=True, wing_mat="membrane",
                  wing_scale=0.85)
    stance = dict(lean=10, legs={"l": (14, 16, 30), "r": (-6, 16, 24)}, arms={"l": (24, 30, 40), "r": (24, 30, 40)}, hands="open")
    stride, arm_swing, jump = 40, 30, 0.36
    target_px = 82

    def pose(self, name, i, n):
        p = super().pose(name, i, n)
        p["wings"] = name in ("run", "jump", "cheer")
        return p


@register
class IronbackBoar(Quadruped):
    """A black war boar in dark iron plates with kit1 barding, kit2 collar and big tusks."""
    key = "ironback_boar"
    body = (0.95, 0.3)
    leg_len, leg_r = 0.32, 0.08
    skin = "fur_black"
    paw_mat = "darkmetal"
    head = dict(snout=(1.2, 1.0), ears="wolf", nose_mat="skin_rat", snout_mat="fur_black", eye_mat="eye", tusks=True)
    head_size = 0.22
    tail = dict(len=0.22, r=0.03, mat="fur_black", up=1.2)
    coat, collar = "kit1", "kit2"
    target_px = 60
    lie = 0.25

    def extras(self, J, tag, pose, centre):
        ln, r = self.body
        for i, t in enumerate((-0.3, 0.0, 0.3)):
            b = centre + J["B"] * ln * t + UP * r * 1.0
            ellipsoid(tag + "plate%d" % i, b, (r * 0.85, ln * 0.14, r * 0.25), "darkmetal")
            cone(tag + "plspike%d" % i, b + UP * r * 0.2, b + UP * r * 0.55, 0.04, "brass", 5)


# ----------------------------------------------------------------------------- dwarf engineers and holds
@register
class Ballzooka(DwarfLineman):
    """An engineer with a long kit1-banded launcher tube over his shoulder and brass goggles."""
    key = "ballzooka"
    layout = dict(DwarfLineman.layout, helm=None, hair=None)
    target_px = 74

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        goggles(J, tag)
        sh = J["arms"]["r"][0]
        a, b = sh + UP * 0.1 + J["B"] * 0.45, sh + UP * 0.12 - J["B"] * 0.45
        tube(tag + "zooka", [a, b], [0.09, 0.09], "brass", n=10)
        for i, t in enumerate((0.2, 0.8)):
            p = lerp(a, b, t)
            tube(tag + "zband%d" % i, [p - (b - a).normalized() * 0.04, p + (b - a).normalized() * 0.04], [0.1, 0.1], "kit1", n=10)


@register
class Bombardier(DwarfLineman):
    """A miner-engineer with goggles on a leather cap, a kit2 satchel of charges and a lit fuse cord."""
    key = "bombardier"
    layout = dict(DwarfLineman.layout, helm=None, pads=None, breast=None)
    target_px = 74

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "cap", c + U * 0.02, (s[0] * 1.06, s[1] * 1.06, s[2] * 1.06), "leather", U, cut=0.25, rot=J["head_R"], thick=0.02)
        goggles(J, tag)
        p = surf(J, P, 0.02, 70, 0.08)
        box(tag + "satchel", p, (0.16, 0.08, 0.14), "kit2", core.basis(J["X"], J["F"], J["u"]))
        for i in range(3):
            q = p + UP * 0.08 + J["X"] * (i - 1) * 0.05
            tube(tag + "charge%d" % i, [q, q + UP * 0.08], [0.025, 0.025], "darkmetal", n=6)
        cc.flame(tag + "fuse", p + UP * 0.18, UP, 0.06, r=0.02)


@register
class EngineerRunner(DwarfRunner):
    """A quick engineer: goggles pushed up on his brow and a kit2 tool belt hung with spanners."""
    key = "engineer_runner"
    layout = dict(DwarfRunner.layout, hair_mat="hair_brown", brow="hair_brown")
    target_px = 72

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "cap", c + U * 0.02, (s[0] * 1.06, s[1] * 1.06, s[2] * 1.06), "kit2", U, cut=0.25, rot=J["head_R"], thick=0.02)
        for sd in (-1, 1):
            p = c + F * s[1] * 0.6 + U * s[2] * 0.7 + X * sd * s[0] * 0.38
            ball_at(tag + "goggle%d" % sd, p, s[0] * 0.24, "brass")
        tband(tag + "toolbelt", J, P, [0.0, 0.06], "kit2", k=1.12, add=0.03, solid=0.03)
        for i, a in enumerate((50, 80, -60)):
            p = surf(J, P, -0.02, a, 0.06)
            tube(tag + "spanner%d" % i, [p, p - UP * 0.12], [0.018, 0.014], "metal", n=5)


@register
class DwarfLord(DwarfBlitzer):
    """A hold's lord: gold armour, a gold crown-helm with kit1 plume, a long kit2 cape and a white beard."""
    key = "dwarf_lord"
    layout = dict(DwarfBlitzer.layout, helm_mat="gold", pad_mat="gold", breast="gold", cape="long", cape_mat="kit2", cape_lining="kit1",
                  gd_beard="long")
    target_px = 78


@register
class IronbreakerBlocker(DwarfLineman):
    """A tunnel fighter sealed in dark gromril: full plate, closed helm, a kit1 tabard and kit2 trim."""
    key = "ironbreaker"
    knobs = dict(DwarfLineman.knobs, shoulders=1.3, torso=1.3)
    layout = dict(DwarfLineman.layout, torso="darkmetal", arms="darkmetal", legs="darkmetal", helm="open", helm_mat="darkmetal",
                  pad_mat="darkmetal", breast="darkmetal", pads="big", spikes=0, gauntlets=True, greaves=True)
    target_px = 76

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "visor", c, (s[0] * 1.08, s[1] * 1.1, s[2] * 1.05), "darkmetal", (F + U * 0.1).normalized(), cut=0.15,
                 rot=J["head_R"], thick=0.025)


# ----------------------------------------------------------------------------- slayers
@register
class NorseSlayer(TrollSlayer):
    """A slayer of the north: blond crest and beard, a horned iron cap, kit1 fur kilt."""
    key = "norse_slayer"
    layout = dict(TrollSlayer.layout, brow="hair_blond", gd_beard="long", gd_crest=None, horns="small", horn_mat="bone")
    target_px = 78

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "ironcap", c + U * 0.02, (s[0] * 1.06, s[1] * 1.06, s[2] * 1.06), "metal", U, cut=0.35, rot=J["head_R"], thick=0.02)


@register
class Slayer(TrollSlayer):
    """A slayer with a topknot instead of a crest, a long forked beard and an axe in each hand."""
    key = "slayer"
    layout = dict(TrollSlayer.layout, gd_beard="fork", gd_crest=None, gd_topknot=True)
    target_px = 78

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        for side in ("l", "r"):
            parts.rod(J, side, tag, length=0.5, r=0.02, mat="wood", head="blade", head_mat="metal")


@register
class GiantSlayer(TrollSlayer):
    """A huge veteran slayer with war tattoos and a great two-handed axe."""
    key = "giant_slayer"
    knobs = dict(TrollSlayer.knobs, shoulders=1.35, torso=1.28, limb=1.45)
    layout = dict(TrollSlayer.layout, gd_beard="spade")
    target_px = 84

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.warpaint(J, P, tag, "kit1", hs=(0.42, 0.3, 0.18))
        parts.rod(J, "r", tag, length=1.1, r=0.03, mat="wood", head="blade", head_mat="metal")


@register
class DoomSeeker(TrollSlayer):
    """A doom seeker: shaved bald, kit2 war tattoos, chains from both wrists ending in iron blades."""
    key = "doom_seeker"
    layout = dict(TrollSlayer.layout, gd_beard="long", gd_crest=None)
    target_px = 78

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        for side, sd in (("l", -1), ("r", 1)):
            wr = J["arms"][side][2]
            end = wr + J["X"] * sd * 0.4 - UP * 0.1
            cc.chain(tag + "dschain" + side, wr, end, "darkmetal", n=5, sag=0.12)
            cone(tag + "dsblade" + side, end, end + J["X"] * sd * 0.14 + UP * 0.08, 0.05, "metal", 4)
        cc.warpaint(J, P, tag, "kit2", hs=(0.4, 0.26))


# ----------------------------------------------------------------------------- gnomes
@register
class GnomeRunner(GnomeLineman):
    """A quick gnome in a floppy nightcap with brass goggles."""
    key = "gnome_runner"
    layout = dict(GnomeLineman.layout, hat="nightcap", beard_len=0.6)
    knobs = dict(GnomeLineman.knobs, legs=0.55)
    target_px = 74

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        goggles(J, tag)


@register
class GnomeBlitzer(GnomeLineman):
    """A gnome in a pot helm and tin shoulder plates."""
    key = "gnome_blitzer"
    layout = dict(GnomeLineman.layout, hat=None, helm="kettle", helm_mat="metal", pads="plate", pad_mat="metal", pad_trim="kit1")
    target_px = 76


@register
class GnomishContraption(Quadruped):
    """A clockwork walker: a brass boiler body on four iron legs, a kit1 panel, a smoking funnel."""
    key = "gnome_contraption"
    body = (0.8, 0.28)
    leg_len, leg_r = 0.45, 0.05
    skin = "brass"
    paw_mat = "darkmetal"
    head = dict(snout=(0.5, 1.0), ears="none", eye_mat="eye_yellow", snout_mat="brass", nose_mat="darkmetal")
    tail = None
    coat, collar = "kit1", "kit2"
    target_px = 62

    def extras(self, J, tag, pose, centre):
        top = centre + UP * self.body[1] * 0.9 - J["B"] * 0.15
        tube(tag + "funnel", [top, top + UP * 0.3], [0.06, 0.08], "darkmetal", n=8)
        ellipsoid(tag + "smoke", top + UP * 0.4, (0.08, 0.08, 0.06), "stone")
        for i, t in enumerate((-0.3, 0.3)):
            ball_at(tag + "rivet%d" % i, centre + J["B"] * self.body[0] * t + J["X"] * self.body[1] * 1.0, 0.04, "darkmetal")


# ----------------------------------------------------------------------------- gnoblars
@register
class GnoblarTrapper(Gnoblar):
    """A gnoblar with a long spear and a coil of rope on his shoulder."""
    key = "gnoblar_trapper"
    target_px = 58

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "r", tag, length=0.9, r=0.018, mat="wood", head="blade", head_mat="bone")
        c = surf(J, P, P["sh_h"] - 0.1, -50, 0.08)
        core.tube(tag + "coil", [c + J["X"] * 0.08, c + UP * 0.08, c - J["X"] * 0.08, c - UP * 0.08, c + J["X"] * 0.08], [0.025] * 5, "rope", n=6)


@register
class PiggybackRider(Gnoblar):
    """A gnoblar who rides an ogre's back: kit2 riding harness and a little saddle seat strapped on."""
    key = "gnoblar_piggyback"
    target_px = 58

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.strap(J, P, tag, "kit2", r=0.03, flip=1)
        cc.strap(J, P, tag, "kit2", r=0.03, flip=-1, name="strapb")
        box(tag + "seat", J["pelvis"] + J["B"] * 0.16 + UP * 0.05, (0.16, 0.08, 0.1), "leather", core.basis(J["X"], J["F"], J["u"]))
        base = J["pelvis"] + J["B"] * 0.2 + UP * 0.1
        top = base + UP * 0.75
        tube(tag + "pole", [base, top], [0.025, 0.025], "wood", n=5)
        core.flat_cone(tag + "pennant", top - UP * 0.04, top - UP * 0.14 + J["X"] * 0.45, 0.16, "kit2", J["F"], squash=0.15)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "hood", c + U * 0.02, (s[0] * 1.08, s[1] * 1.08, s[2] * 1.08), "kit2", (U - F * 0.2).normalized(), cut=0.1,
                 rot=J["head_R"], thick=0.02)


@register
class Manbiter(Quadruped):
    """A small warty biting beast: an oversized jaw full of teeth, kit1 collar band and a stubby tail."""
    key = "manbiter"
    body = (0.6, 0.2)
    leg_len, leg_r = 0.22, 0.06
    skin = "skin_nurgle"
    paw_mat = "skin_nurgle"
    head = dict(snout=(0.8, 1.6), ears="none", fangs=True, eye_mat="eye_yellow", snout_mat="skin_nurgle", nose_mat="socket")
    head_size = 0.24
    tail = dict(len=0.25, r=0.05, mat="skin_nurgle", up=0.3)
    coat, collar = None, "kit1"
    target_px = 38
