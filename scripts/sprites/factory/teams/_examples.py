"""Demo models, one per body plan and a few race presets. They are not game models (keys start with
demo_) and are only loaded with --examples. Copy from here when starting a team file."""
from lib import Biped, Quadruped, Centaur, Vehicle, Floating, register, parts, core
from lib.core import ball_at, UP
from mathutils import Vector

@register
class DemoOrc(Biped):
    key = "demo_orc"; target_px = 46
    race = "orc"
    layout = dict(jersey="kit1", legs="kit2", pads="football", pad_mat="kit1", pad_trim="kit2", helm="skull", belt="leather",
                  boots="boot", bracers="leather")
    stride, jump = 32, 0.12
    def idle(self, ph, p, w):          # pounds one fist into the other palm
        p["arms"] = {"l": (30 + 30 * w["up"], 20, 80, -20), "r": (30 + 30 * w["up"], 20, 80, -20)}
        p["hands"] = "fist"

@register
class DemoDwarf(Biped):
    key = "demo_dwarf"; target_px = 34
    race = "dwarf"
    layout = dict(torso="kit1", arms="kit1", legs="kit2", breast="metal", helm="skull", belt="leather", boots="boot")

@register
class DemoSkaven(Biped):
    key = "demo_skaven"; target_px = 42
    race = "skaven"
    layout = dict(jersey="kit1", loin="kit2", bracers="leather")
    def idle(self, ph, p, w):          # sniffs the air, tail flicking
        p.update(nod=-10 * w["up"], tail=w["s2"])

@register
class DemoSaurus(Biped):
    key = "demo_saurus"; target_px = 46
    race = "saurus"
    layout = dict(loin="kit1", pads="plate", pad_mat="gold", pad_trim="kit2", bracers="kit2")

@register
class DemoSkeleton(Biped):
    key = "demo_skeleton"; target_px = 42
    race = "skeleton"
    layout = dict(legs="bone_old", loin="kit1", pads="leather", helm="skull", helm_mat="rust", neckband="kit2")

@register
class DemoMinotaur(Biped):
    key = "demo_minotaur"; target_px = 62
    race = "minotaur"
    layout = dict(loin="kit1", bracers="kit2", pads="plate", pad_sides=("l",), pad_mat="darkmetal", pad_trim="kit2")
    stride, jump = 30, 0.1
    lie, lie_shift = 0.3, 1.0

@register
class DemoTreeman(Biped):
    key = "demo_treeman"; target_px = 100
    race = "treeman"
    layout = dict(legs="bark", boots="bark", cuff=None, neckband="kit2", arm_band="kit1", loin="kit1")
    stride, jump = 24, 0.05
    lie, lie_shift = 0.35, 1.0
    def extras(self, J, P, L, tag, pose):
        for i, sd in enumerate((-1, 1)):
            parts.foliage(tag, J["arms"]["l" if sd < 0 else "r"][0] + UP * 0.25, 0.3, seed=i)
        parts.foliage(tag, J["head"] + UP * 0.3, 0.35, n=7, seed=5)

@register
class DemoFox(Quadruped):
    key = "demo_fox"; target_px = 23
    skin = "fur_red"
    head = dict(snout=(1.2, 0.7), ears="wolf", nose_mat="socket")
    tail = dict(len=0.7, r=0.11, mat="fur_red", up=0.35, tip="white")
    def idle(self, ph, p, w):          # ears-up alert look, tail swishing
        p.update(nod=-8 * w["breath"], tail=w["s1"])

@register
class DemoCentaur(Centaur):
    key = "demo_centaur"; target_px = 52
    race = "dwarf"
    layout = dict(torso="kit1", arms="kit1", breast="darkmetal", helm="skull", helm_mat="darkmetal", beard="hair")
    class Body(Centaur.Body):
        skin = "fur_black"
        coat = "kit2"
        tail = dict(len=0.5, r=0.06, mat="hair")

class RollerDriver(Biped):
    race = "dwarf"
    layout = dict(torso="kit2", arms="kit2", helm="skull", beard="hair_red")

@register
class DemoRoller(Vehicle):
    key = "demo_roller"; target_px = 57
    driver = RollerDriver

@register
class DemoWraith(Floating):
    key = "demo_wraith"; target_px = 52
    race = "skeleton"
    layout = dict(torso="cloth_black", arms="cloth_black", coat_mat="cloth_black", robe_lining="kit1", helm="hood", hood_mat="cloth_black",
                  neckband="kit1", belt="kit2", buckle=None, sleeve_cuff="kit2")
