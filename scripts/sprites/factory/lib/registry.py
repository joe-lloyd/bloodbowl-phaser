"""Model registry: team files call register(cls); the driver looks models up by the game's model key."""
import importlib, os, sys

MODELS = {}
OWNER = {}

def register(cls):
    """Register a Model subclass (usable as a decorator). cls.key must be the game's model key."""
    inst = cls()
    if not inst.key:
        raise ValueError("%s has no key" % cls.__name__)
    mod = cls.__module__
    if inst.key in MODELS and OWNER[inst.key] != mod:
        raise ValueError("model %r is registered by both %s and %s" % (inst.key, OWNER[inst.key], mod))
    MODELS[inst.key] = inst
    OWNER[inst.key] = mod
    return cls

def load_all(factory_dir, private=False):
    """Import every teams/*.py file (files starting with "_" only when private=True); a broken team file
    is reported and skipped."""
    tdir = os.path.join(factory_dir, "teams")
    if factory_dir not in sys.path:
        sys.path.insert(0, factory_dir)
    errors = {}
    for fn in sorted(os.listdir(tdir)):
        if fn.endswith(".py") and fn != "__init__.py" and (private or not fn.startswith("_")):
            try:
                importlib.import_module("teams." + fn[:-3])
            except Exception as exc:      # one team's bug must not stop the others
                errors[fn] = repr(exc)
                print("TEAM FILE ERROR", fn, repr(exc))
    return errors

def get(key):
    if key not in MODELS:
        raise KeyError("no spec registered for model %r" % key)
    return MODELS[key]

def keys():
    return sorted(MODELS)

LOOKS = {}

def register_looks(model, spec):
    """Look options for a model, for the layered renderer. spec has: options (list of (name, label, [(value,
    label), ...]) with the body first), part(slot, value, body) -> layout or None for a value that draws
    nothing, and variant(choice) -> a model instance whose scene objects share the model's names."""
    LOOKS[model] = spec
