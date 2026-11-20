"""Look options for any team, and the build that sets men and women clearly apart.

A team file lists its options in teams/<team>_looks.json:

    {"<model>": [["body", "Body", [["m", "Male"], ["f", "Female"]]],
                 ["<option>", "<Label>", [["<value>", "<Label>"], ...]], ...]}

The first option is always "body", even with one value; the first value of every option is the position's
own look. It then calls define() with each option's layouts:

    SLOTS = {"<model>": {"<option>": (empty layout, {"<value>": layout | fn(body) -> layout | EMPTY})}}
    BODY = {"<model>": fn(body) -> layout}           # optional, per-body layout changes such as lips or hair

The layered renderer draws each body once without any option (the base), then each option value on its own.
So every option has an empty state, and each value's layout sets every key its empty state clears. Whole-
figure variants are also registered as <model>__<value>-<value>-..., for full renders and for previews.

A biped's "m" and "f" bodies get the Physique build below, so men and women read apart; a body with any
other value, such as "x" for a skeleton or a beast, keeps the model's own build. Physique and Fine are also
mixins a team class can inherit directly, as the Vampires do."""
import itertools
import json

from . import core, palette, registry
from .plans import Biped

EMPTY = None
FEMALE = dict(shoulders=0.86, hips=1.12, limb=0.86, arm=0.84, legs=1.04)
MALE = dict(shoulders=1.08, arm=1.12, neck=1.18, hips=0.92)


def bust(P):
    """A female chest shaped into the torso itself: a tight ring under the bust and a deeper ring pushed
    forward at its fullest, so the jersey, coat and breastplate lofted over the torso follow it."""
    rings = list(P["torso"])
    sh = P["sh_h"]
    for h, depth, forward in ((0.54 * sh, -0.012, 0.0), (0.7 * sh, 0.05, 0.045)):
        rx, ry, back = core.tprof(P, h)
        rings.append((h, rx, ry + depth, back - forward))
    return sorted(rings, key=lambda ring: ring[0])


class Physique:
    """Men and women differ clearly in build: broad shoulders and thick arms against narrow shoulders, wide
    hips and a shaped chest."""

    def knob(self, name, default=1.0):
        base = super().knob(name, default)
        factor = (FEMALE if self.sex == "f" else MALE).get(name)
        return base * factor if factor else base

    def proportions(self, L):
        P = super().proportions(L)
        if self.sex == "f":
            P["torso"] = bust(P)
        return P


class Fine:
    """Small parts that only resolve from 2x density up go in details(); game size leaves them out."""

    def extras(self, J, P, L, tag, pose):
        if palette.STYLE.get("density", 1) >= 2:
            self.details(J, P, L, tag, pose)

    def details(self, J, P, L, tag, pose):
        """Small parts drawn only from 2x density up."""


def full_key(model, values):
    return "%s__%s" % (model, "-".join(values))


class Looks:
    def __init__(self, base, options, slots, body):
        if options[0][0] != "body":
            raise ValueError("%s: the first option must be body" % base.key)
        missing = {name for name, _, _ in options[1:]} ^ set(slots)
        if missing:
            raise ValueError("%s: options and slots differ on %s" % (base.key, sorted(missing)))
        self.base, self.options, self.slots, self.body = base, options, slots, body
        self.mixin = Physique if issubclass(base, Biped) and not issubclass(base, Physique) else None

    def part(self, slot, value, body):
        """The layout a value adds, or EMPTY when the value draws nothing."""
        layout = self.slots[slot][1][value]
        return layout(body) if callable(layout) else layout

    def layout(self, choice):
        """The layout for a choice {"body": body, option: value or EMPTY}; a missing option is empty."""
        body = choice["body"]
        layout = dict(self.base.layout)
        layout.update(self.body(body) if self.body else {})
        for slot, (empty, _) in self.slots.items():
            value = choice.get(slot, EMPTY)
            part = EMPTY if value is EMPTY else self.part(slot, value, body)
            layout.update(empty if part is EMPTY else dict(empty, **part))
        return layout

    def variant(self, choice, key=None):
        """A model instance for a choice. Without a key it keeps the position's key, so its scene objects get
        the same names as every other layer of that position."""
        base = self.base
        sexed = choice["body"] in ("m", "f")
        parents = (self.mixin, base) if self.mixin and sexed else (base,)
        attrs = dict(key=key or base.key, layout=self.layout(choice))
        if sexed:
            attrs["sex"] = choice["body"]
        return type(base.__name__ + "Look", parents, attrs)()


def define(path, bases, slots, body=None):
    """Register the looks in a team's options file. bases maps each model key to its class."""
    options = json.load(open(path))
    for model, opts in options.items():
        looks = Looks(bases[model], opts, slots.get(model, {}), (body or {}).get(model))
        registry.register_looks(model, looks)
        names = [name for name, _, _ in opts]
        for values in itertools.product(*([v for v, _ in vals] for _, _, vals in opts)):
            registry.register(type(looks.variant(dict(zip(names, values)), full_key(model, values))))
