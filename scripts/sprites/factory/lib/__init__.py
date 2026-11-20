"""Sprite factory library. Team files import from here:

    from lib import Biped, Quadruped, Centaur, Vehicle, Floating, register, palette, parts, core, anim
"""
from . import palette, core, anim, parts
from .plans import Model, Biped, Quadruped, Centaur, Vehicle, Floating, RACES
from .registry import register, get, load_all, keys
