"""Secret League models, round seven: wraiths and ghosts, skeletons and zombies of every kind, tomb constructs, bone
giants and a sea witch. Each one gives a position its own model on a team that used to repeat one or show the mannequin
(see src/data/community/secretLeagueModels.json)."""
from mathutils import Vector
from lib import Biped, Floating, Quadruped, Vehicle, register, core, palette, parts
from lib.core import UP, ball_at, cone, ellipsoid, tband, tube, surf
from teams import chaos_common as cc
from teams.secret_beasts import Elemental  # noqa: F401  registers the "gale" and "water" ramps
from teams.small_folk_goblin import GoblinLineman
from teams.undead_skaven_lizards_lizard import Saurus
from teams.undead_skaven_lizards_tomb import AnointedBlitzer, TombSkeleton
from teams.undead_skaven_lizards_undead import Skeleton, Wraith, Zombie

palette.ramp("shroud_grey", "#3a3e46", "#6a707c", "#a4aab4")
palette.ramp("banshee_white", "#7a8494", "#c4ccd8", "#f4f8fc")
palette.ramp("sea_green", "#1a4a4a", "#2a8a7a", "#7ad0b8")
palette.ramp("scarab_shell", "#1a2a4a", "#2a5a8a", "#6ab0d0")


# ----------------------------------------------------------------------------- spirits
@register
class CairnWraith(Wraith):
    """A grave wraith in a grey shroud with a kit1 hem, a long scythe and green eyes."""
    key = "cairn_wraith"
    layout = dict(Wraith.layout, torso="shroud_grey", arms="shroud_grey", coat_mat="shroud_grey", hood_mat="shroud_grey", shroud=False)
    target_px = 104

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "r", tag, length=1.6, r=0.025, mat="wood", head="blade", head_mat="metal")


@register
class Banshee(Wraith):
    """A wailing spirit: no hood, long white hair streaming back, a pale robe with a kit1 sash."""
    key = "banshee"
    layout = dict(Wraith.layout, torso="banshee_white", arms="banshee_white", coat_mat="banshee_white", helm=None, hood_rim=False, shroud=False,
                  robe_lining="kit1")
    target_px = 96

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for i, sd in enumerate((-1, -0.4, 0.4, 1)):
            root = c + U * s[2] * 0.6 + X * sd * s[0] * 0.7
            cc.tentacle(tag + "hair%d" % i, root, U * 0.3 - F + X * sd * 0.3, -UP * 0.6 - F * 0.4, 0.55, 0.05, "banshee_white", curl=1.5)
        ellipsoid(tag + "wail", c + F * s[1] * 0.85 - U * s[2] * 0.4, (s[0] * 0.25, 0.03, s[2] * 0.3), "socket", J["head_R"])


@register
class Ghost(Wraith):
    """A pale blue ghost in a sheet-like shroud, smaller, with hollow black eyes."""
    key = "ghost"
    knobs = dict(Wraith.knobs, shoulders=0.9, torso=0.9)
    layout = dict(Wraith.layout, torso="gale", arms="gale", coat_mat="gale", hood_mat="gale", robe_lining="kit1", hem="kit1", shroud=False,
                  hood_rim=False)
    target_px = 82


# ----------------------------------------------------------------------------- the dead
@register
class WickerMan(Biped):
    """A towering wicker giant, burning at the head and shoulders, bound with kit1 cloth and kit2 ropes."""
    key = "wicker_man"
    race = "treeman"
    ref_frame = 192
    knobs = dict(legs=1.1, limb=1.2, shoulders=1.3, torso=1.2, hands=1.1)
    layout = dict(skin="wood", eyes="dark", ears=None, hair=None, brow="socket", lip="wood", torso="wood", arms="wood", legs="wood", boots="wood",
                  cuff=None, belt="kit2", buckle=None, loin="kit1", loin_trim="kit2")
    stance = dict(lean=4, legs={"l": (6, 14, 10), "r": (-6, 14, 8)}, arms={"l": (18, 30, 30), "r": (18, 30, 30)}, hands="open")
    stride, arm_swing, jump = 30, 24, 0.1
    target_px = 128

    def extras(self, J, P, L, tag, pose):
        for i, h in enumerate((0.1, 0.25, 0.4)):
            tband(tag + "wicker%d" % i, J, P, [h, h + 0.03], "kit2", k=1.06, add=0.01, solid=0.02)
        c = J["head"]
        for i, x in enumerate((-0.12, 0.0, 0.12)):
            cc.flame(tag + "headfire%d" % i, c + UP * 0.1 + J["X"] * x, UP, 0.35, r=0.08)
        for side in ("l", "r"):
            cc.flame(tag + "shfire" + side, J["arms"][side][0] + UP * 0.08, UP, 0.25, r=0.07)


@register
class DancingSkeleton(Skeleton):
    """A skeleton in a kit1 jester hat with bells and kit2 ribbons on its wrists, no armour."""
    key = "dancing_skeleton"
    layout = dict(Skeleton.layout, helm=None, pot_helm=False, jersey=None, tabard=None)
    target_px = 86

    def idle(self, ph, p, w):       # a jig: kicks one leg then the other, arms up
        k = 1 if w["s1"] > 0 else -1
        p.update(legs={"l": (6 + 30 * max(0, k), 9, 8 + 40 * max(0, k)), "r": (-5 + 30 * max(0, -k), 9, 8 + 40 * max(0, -k))},
                 arms={"l": (120, 30, 40), "r": (120, 30, 40)})

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for i, sd in enumerate((-1, 1)):
            root = c + U * s[2] * 0.7 + X * sd * s[0] * 0.5
            tip = root + X * sd * 0.3 + UP * 0.15 - J["B"] * 0.05
            cone(tag + "jester%d" % i, root, tip, 0.1, ("kit1", "kit2")[i], 8)
            ball_at(tag + "jbell%d" % i, tip, 0.04, "gold")
        for side in ("l", "r"):
            ball_at(tag + "wribbon" + side, J["arms"][side][2], 0.06, "kit2")


@register
class EnchantedZombie(Zombie):
    """A zombie lit from within: grey-blue skin, green glowing eyes, kit2 chains on its wrists."""
    key = "enchanted_zombie"
    layout = dict(Zombie.layout, skin="skin_ghoul", lip="skin_ghoul", eyes="red", pads=None)
    target_px = 74

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        for sd in (-1, 1):
            ball_at(tag + "glow%d" % sd, c + F * s[1] * 0.82 + U * s[2] * 0.15 + X * sd * s[0] * 0.38, s[0] * 0.17, "eye_green")
        for side in ("l", "r"):
            wr = J["arms"][side][2]
            cc.chain(tag + "wchain" + side, wr, wr - UP * 0.25 + J["F"] * 0.05, "kit2", n=4, sag=0.02)


@register
class PatchworkMan(Zombie):
    """A stitched corpse: one arm sewn on from another body, black stitches across the chest, a kit1 apron."""
    key = "patchwork_man"
    knobs = dict(Zombie.knobs, shoulders=1.15, limb=1.1)
    layout = dict(Zombie.layout, pads=None)
    target_px = 76

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.arm_overlay(J, L, tag, "r", "skin_tan", k=1.15, name="sewn")
        for i, h in enumerate((0.18, 0.3)):
            cc.stripe(J, P, tag, "stitch%d" % i, h, -50, h + 0.02, 50, "black", r=0.012)
        tband(tag + "apron", J, P, [-0.12, 0.12], "kit1", k=1.12, add=0.02, arc=(-70, 70))


class CartDriver(Skeleton):
    """A skeleton at the reins in a kit2 hood."""
    layout = dict(Skeleton.layout, helm="hood", hood_mat="kit2", pot_helm=False, tabard=None)
    stance = dict(lean=6, legs={"l": (0, 8, 0), "r": (0, 8, 0)}, arms={"l": (40, 24, 50, -10), "r": (40, 24, 50, -10)}, hands="fist")


@register
class CorpseCart(Vehicle):
    """A black wooden cart with kit1 panels, a bell on a bone post and a skeleton driver."""
    key = "corpse_cart"
    size = (0.9, 1.3, 0.5)
    drum = None
    wheels = 0.38
    hull, trim, roof = "kit1", "kit2", "cloth_black"
    funnel = False
    driver = CartDriver
    driver_at = (0.15, 0.85)
    target_px = 96

    def extras(self, tag, pose, centre):
        base = centre + Vector((0, 0.45, 0.1))
        tube(tag + "bellpost", [base, base + UP * 0.8], [0.03, 0.03], "bone_old", n=6)
        cone(tag + "bell", base + UP * 0.78, base + UP * 0.6, 0.02, "brass", 10, r2=0.1)


# ----------------------------------------------------------------------------- tomb constructs and priests
@register
class GiantHand(Quadruped):
    """A huge severed hand that scuttles on its fingers, a kit1 band round the wrist."""
    key = "giant_hand"
    body = (0.42, 0.24)
    leg_len, leg_r = 0.3, 0.065
    skin = "skin_zombie"
    paw_mat = "bone_old"
    headless = True
    tail = None
    coat, collar = None, None
    target_px = 46

    def extras(self, J, tag, pose, centre):
        wrist = centre + J["B"] * 0.2 + UP * 0.1
        top = wrist + J["B"] * 0.15 + UP * 0.4
        tube(tag + "wrist", [wrist, top], [0.17, 0.15], "skin_zombie", n=10)
        tube(tag + "cuff", [wrist.lerp(top, 0.45), wrist.lerp(top, 0.7)], [0.18, 0.17], "kit1", n=10)
        ball_at(tag + "bone", top, 0.08, "bone_old")
        thumb = centre + J["X"] * 0.25 + J["F"] * 0.05
        tube(tag + "thumb", [thumb, thumb + J["X"] * 0.18 + J["F"] * 0.2 - UP * 0.15], [0.07, 0.05], "skin_zombie", n=8)


@register
class Necrotect(TombSkeleton):
    """A tomb architect-priest: a kit1 robe, a tall gold headdress and a staff topped with a gold disc."""
    key = "necrotect"
    layout = dict(TombSkeleton.layout, headcloth=False)
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        cc.tall_hat(J, tag, 0.34, "gold", bands=((0.3, "kit2", 0.12),), taper=0.7)
        cc.rags(J, P, tag, "kit1", h0=0.08, h1=-0.4, jag=0.2, k=1.1, name="robe")
        parts.rod(J, "l", tag, length=1.4, r=0.022, mat="wood")
        c0, d, n, t = J["grip_l"]
        ellipsoid(tag + "staffdisc", c0 + t * 1.05, (0.1, 0.02, 0.1), "gold")


@register
class TombBomber(TombSkeleton):
    """A skeleton with a kit2 basket of clay fire-pots on its back and one lit pot in its hand."""
    key = "tomb_bomber"
    target_px = 86

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        back = J["pelvis"] + J["u"] * (P["sh_h"] * 0.65) + J["B"] * 0.22
        ellipsoid(tag + "basket", back, (0.16, 0.12, 0.18), "kit2")
        for i, x in enumerate((-0.07, 0.07)):
            ellipsoid(tag + "pot%d" % i, back + UP * 0.17 + J["X"] * x, (0.06, 0.06, 0.07), "rust")
        c0, d, n, t = J["grip_r"]
        cc.flame(tag + "potfuse", c0 + UP * 0.06, UP, 0.12, r=0.03)


@register
class SepulchralStalker(Floating):
    """A tomb construct: a sandstone torso on a snake's tail, a gold headdress, a kit1 sash and a kit2 collar."""
    key = "sepulchral_stalker"
    race = "wight"
    knobs = dict(shoulders=1.2, torso=1.1, limb=1.1)
    hover = 0.05
    target_px = 100

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin="tomb_sand", torso="tomb_sand", arms="tomb_sand", coat_mat="tomb_sand", robe_lining="tomb_sand", head="snout",
                 snout=(1.1, 0.8), ears="none", eye_mat="eye_green", snout_mat="tomb_sand", neckband="kit2", belt="kit1", buckle="gold",
                 hem=None, jag=0.0, tail=dict(len=1.1, r=0.14, mat="tomb_sand", up=0.2, tip="gold"))
        return L

    def extras(self, J, P, L, tag, pose):
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "nemes", c + U * 0.02, (s[0] * 1.2, s[1] * 1.15, s[2] * 1.15), "gold", (U - F * 0.4).normalized(), cut=-0.2,
                 rot=J["head_R"], thick=0.03)


@register
class TombScorpion(Quadruped):
    """A sandstone scorpion construct: gold-tipped sting held high, two pincers, a kit1 saddle-cloth."""
    key = "tomb_scorpion"
    body = (0.9, 0.24)
    leg_len, leg_r = 0.3, 0.05
    skin = "tomb_sand"
    paw_mat = "gold"
    head = dict(snout=(0.6, 1.2), ears="none", eye_mat="eye_green", snout_mat="tomb_sand", nose_mat="gold")
    tail = dict(len=1.1, r=0.08, mat="tomb_sand", up=1.4, tip="gold")
    coat, collar = "kit1", "kit2"
    target_px = 66

    def extras(self, J, tag, pose, centre):
        for sd in (-1, 1):
            root = J["head"] + J["X"] * sd * 0.2 - UP * 0.05
            tip = root + J["F"] * 0.35 + J["X"] * sd * 0.2
            tube(tag + "arm%d" % sd, [root, tip], [0.06, 0.05], "tomb_sand", n=8)
            for j, o in enumerate((-1, 1)):
                cone(tag + "pin%d%d" % (sd, j), tip, tip + J["F"] * 0.2 + J["X"] * o * 0.06, 0.05, "gold", 5)


@register
class GoldenHost(AnointedBlitzer):
    """An honour guard in full gold: gold body armour and arms, a kit1 cape and a long spear."""
    key = "golden_host"
    layout = dict(AnointedBlitzer.layout, torso="gold", arms="gold", cape_mat="kit1", cape_lining="kit2")
    target_px = 88

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        parts.rod(J, "r", tag, length=1.5, r=0.022, mat="wood", head="blade", head_mat="gold")


@register
class JackalRunner(Biped):
    """A jackal-headed tomb runner: black fur head with tall ears, bone body, gold collar, kit1 kilt."""
    key = "jackal_runner"
    race = "wight"
    knobs = dict(legs=1.1, limb=0.85)
    layout = dict(skin="fur_black", head="snout", snout=(1.3, 0.7), ears="wolf", eye_mat="eye_yellow", torso="bone_old", arms="bone_old",
                  legs="bone_old", boots="bone_old", cuff=None, loin="kit1", loin_trim="gold", neckband="gold", bracers="gold", belt="kit2",
                  buckle="gold")
    stance = dict(lean=8, legs={"l": (12, 10, 20), "r": (-8, 10, 16)}, arms={"l": (16, 30, 50), "r": (16, 30, 50)}, hands="open")
    stride, arm_swing, jump = 46, 36, 0.3
    target_px = 88


# ----------------------------------------------------------------------------- pirates and giants
@register
class SkeletonPirate(Skeleton):
    """A pirate skeleton: kit1 bandana, an eye patch, a kit2 sash and a cutlass."""
    key = "skeleton_pirate"
    layout = dict(Skeleton.layout, helm=None, pot_helm=False, tabard=None)
    target_px = 86

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "bandana", c + U * 0.02, (s[0] * 1.06, s[1] * 1.06, s[2] * 1.06), "kit1", U, cut=0.2, rot=J["head_R"], thick=0.02)
        cc.eye_patch(J, tag, sd=1)
        cc.sash(J, P, tag, pose, "kit2", side=1, ln=0.35)
        parts.rod(J, "r", tag, length=0.6, r=0.018, mat="brass", head="blade", head_mat="metal")


class BoneGiantBase(Skeleton):
    """A towering construct of bones with gold bands and a kit1 loincloth."""
    ref_frame = 192
    knobs = dict(limb=1.0, shoulders=1.5, torso=1.4, legs=1.15, hands=1.4)
    layout = dict(Skeleton.layout, helm=None, pot_helm=False, jersey=None, tabard=None, loin="kit1", loin_trim="gold", bracers="gold",
                  neckband="gold")
    stride, arm_swing, jump = 28, 22, 0.1
    lie, lie_shift = 0.3, 1.0


@register
class BoneGiant(BoneGiantBase):
    key = "bone_giant"
    target_px = 132

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "crown", c + U * 0.02, (s[0] * 1.1, s[1] * 1.1, s[2] * 1.1), "gold", U, cut=0.3, rot=J["head_R"], thick=0.03)


@register
class BoneGiantCatcher(BoneGiantBase):
    """Longer and leaner, with very long arms and kit2 bands."""
    key = "bone_giant_catcher"
    knobs = dict(BoneGiantBase.knobs, arms=1.35, shoulders=1.3, torso=1.2, legs=1.25)
    layout = dict(BoneGiantBase.layout, bracers="kit2", neckband="kit2")
    target_px = 124


@register
class Morbid(GoblinLineman):
    """A dust goblin shaman of death: a bone skull mask, a kit1 shroud and a bone staff."""
    key = "morbid"
    layout = dict(GoblinLineman.layout, topknot=False)
    target_px = 62

    def extras(self, J, P, L, tag, pose):
        super().extras(J, P, L, tag, pose)
        c, X, F, U, s = cc.hf(J)
        core.cap(tag + "skullmask", c, (s[0] * 1.05, s[1] * 1.1, s[2] * 1.05), "bone_old", (F + U * 0.3).normalized(), cut=0.1,
                 rot=J["head_R"], thick=0.025)
        for sd in (-1, 1):
            ball_at(tag + "maskeye%d" % sd, c + F * s[1] * 1.05 + U * s[2] * 0.15 + X * sd * s[0] * 0.35, s[0] * 0.15, "socket")
        cc.rags(J, P, tag, "kit1", h0=0.35, h1=-0.2, jag=0.6, k=1.15, name="shroud")
        parts.rod(J, "l", tag, length=1.0, r=0.02, mat="bone_old")


@register
class SaurusSkeleton(Saurus):
    """A saurus raised from the swamp: bare bone, green-lit eyes, rusted kit1 and kit2 wraps."""
    key = "saurus_skeleton"
    layout = dict(Saurus.layout, skin="bone_old", legs="bone_old", eye_mat="eye_green", pad_mat="rust", bracers="rust", belt="rust")
    target_px = 88


@register
class ScarabSwarm(Quadruped):
    """A great blue-black scarab with gold markings, smaller beetles crawling round it, a kit1 band."""
    key = "scarab_swarm"
    body = (0.7, 0.26)
    leg_len, leg_r = 0.18, 0.04
    skin = "scarab_shell"
    paw_mat = "black"
    head = dict(snout=(0.4, 1.0), ears="none", eye_mat="eye_green", snout_mat="scarab_shell", nose_mat="gold")
    head_size = 0.16
    tail = None
    coat, collar = "kit1", "kit2"
    target_px = 40

    def extras(self, J, tag, pose, centre):
        for i, (x, y) in enumerate(((-0.5, 0.3), (0.5, 0.1), (0.4, -0.45), (-0.45, -0.35))):
            p = centre + Vector((x, y, -0.2))
            ellipsoid(tag + "beetle%d" % i, p, (0.1, 0.13, 0.06), "scarab_shell")
            ball_at(tag + "beetlespot%d" % i, p + UP * 0.05, 0.03, "gold")


@register
class Syreen(Floating):
    """A sea witch: a woman above, a sea-green fish tail below, long dark hair, a kit1 top and kit2 shell belt."""
    key = "syreen"
    race = "human"
    sex = "f"
    hover = 0.08
    target_px = 88

    def make_layout(self, pose):
        L = super().make_layout(pose)
        L.update(skin="skin_fair", hair="long", hair_mat="hair", brow="hair", lip="lip_f", torso="kit1", arms="skin_fair", coat_mat="sea_green",
                 robe_lining="sea_green", belt="kit2", buckle="gold", hem=None, jag=0.4,
                 tail=dict(len=0.6, r=0.1, mat="sea_green", up=0.4, tip="kit2"))
        return L
