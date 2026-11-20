"""Pixel rendering: the approved look at game size.

No anti-aliasing, every pixel one palette colour, a one-pixel checker dither locked to the screen where
two tones meet, inner lines where two parts of the same colour overlap, and a one-pixel outline that is
near-black on the shadow side and a dark tone of the neighbouring fill on the lit side.

A Stage owns one Blender scene (camera, light, two root empties) and renders a built figure in any
number of facings. Results are 2D int16 arrays of palette indices (-1 = transparent), top row first.
"""
import bpy, os, math
import numpy as np
from mathutils import Vector
from . import palette, core

DIRECTIONS = {"s": 0, "se": 45, "e": 90, "ne": 135, "n": 180, "nw": -135, "w": -90, "sw": -45}
FACINGS = list(DIRECTIONS)
PPM = 21.5               # render pixels per metre; models are scaled to today's pixel height anyway

class Stage:
    def __init__(self, canvas, anchor, tmpdir):
        """canvas: square render size in px; anchor: (x, y from top) where the ground origin lands."""
        bpy.ops.wm.read_factory_settings(use_empty=True)
        palette.MATS.clear()
        palette.CANVAS[0] = palette.CANVAS[1] = canvas
        self.canvas, self.anchor, self.tmp = canvas, anchor, tmpdir
        os.makedirs(tmpdir, exist_ok=True)
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.film_transparent = True
        sc.render.dither_intensity = 0.0
        sc.view_settings.view_transform = "Standard"
        sc.eevee.taa_render_samples = 1          # shadows need a few samples; the tiny filter keeps it un-anti-aliased
        sc.render.filter_size = 0.01
        sc.render.use_freestyle = False
        sc.render.resolution_x = sc.render.resolution_y = canvas
        sc.render.resolution_percentage = 100
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.compression = 0
        world = bpy.data.worlds.new("w")
        world.use_nodes = True
        world.node_tree.nodes.get("Background").inputs[0].default_value = (0, 0, 0, 1)
        sc.world = world
        ld = bpy.data.lights.new("key", "SUN")
        ld.energy, ld.angle = math.pi, 0.0       # hard shadows: soft ones blend tones into off-ramp colours
        sun = bpy.data.objects.new("key", ld)
        sc.collection.objects.link(sun)
        sun.rotation_euler = core.KEY_DIR.to_track_quat("-Z", "Y").to_euler()
        cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.clip_end = 200
        cam = bpy.data.objects.new("cam", cd)
        sc.collection.objects.link(cam)
        cam.rotation_euler = (math.pi / 2 - core.CAM_EL, 0, core.CAM_AZ)
        sc.camera = cam
        cd.ortho_scale = canvas / PPM
        bpy.context.view_layer.update()
        R = cam.matrix_world.to_3x3()
        cx, cy, view = R.col[0], R.col[1], -R.col[2]
        cam.location = cx * ((canvas / 2 - anchor[0]) / PPM) + cy * ((anchor[1] - canvas / 2) / PPM) - view * 60
        self.face = bpy.data.objects.new("facing", None)       # rotates about Z for the 8 facings
        self.tilt = bpy.data.objects.new("tilt", None)         # scale, fall, hop
        for ob in (self.face, self.tilt):
            sc.collection.objects.link(ob)
        self.tilt.parent = self.face
        self.idmats = []
        self.pal = palette.all_colours()
        self._tables()

    def _tables(self):
        pal = self.pal
        self.cols = np.array([[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in pal], dtype=np.float32)
        out_i = pal.index(palette.OUTLINE)
        darker, ramp_dark = {}, {}
        for d, m, l in palette.RAMPS.values():
            di, mi, li = pal.index(d), pal.index(m), pal.index(l)
            darker.setdefault(li, mi); darker.setdefault(mi, di); darker.setdefault(di, out_i)
            for t in (mi, li):
                ramp_dark.setdefault(t, di)
        n = len(pal)
        self.out_i = out_i
        self.darker = np.array([darker.get(i, out_i) for i in range(n)])
        self.ramp_dark = np.array([ramp_dark.get(i, out_i) for i in range(n)])
        self.keep = [pal.index(h) for h in set(palette.FLAT.values()) if h != palette.OUTLINE]

    # -- scene content
    def clear(self):
        for me in list(bpy.data.meshes):
            bpy.data.meshes.remove(me, do_unlink=True)
        for ob in list(bpy.data.objects):
            if ob.type == "EMPTY" and ob not in (self.face, self.tilt):
                bpy.data.objects.remove(ob, do_unlink=True)
        core.ROOT[0] = self.tilt

    def build(self, model, pose, scale):
        """Clear the scene, build the model in this pose and apply the whole-figure pose keys."""
        self.clear()
        model.build(pose)
        core.ROOT[0] = None
        pitch, roll = math.radians(pose.get("pitch", 0)), math.radians(pose.get("roll", 0))
        down = max(abs(math.sin(pitch)), abs(math.sin(roll)))
        t = self.tilt
        t.rotation_euler = (-pitch, roll, 0)
        t.scale = (scale, scale, scale * pose.get("squash", 1.0))
        # forward is -Y: "shift" moves the figure forward; a figure falling onto its back slides forward
        # by lie_shift so the lying body stays centred on its square
        t.location = (0, (-pose.get("shift", 0) - model.lie_shift * math.sin(pitch)) * scale,
                      (pose.get("hop", 0) + model.lie * down) * scale)

    def _shoot(self, name):
        sc = bpy.context.scene
        path = os.path.join(self.tmp, name + ".png")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(path)
        a = np.empty(self.canvas * self.canvas * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        bpy.data.images.remove(im)
        return a.reshape(self.canvas, self.canvas, 4)

    def render(self, facings):
        """Render the built figure in each facing; returns {facing: index array}."""
        shots = {}
        for f in facings:
            self.face.rotation_euler = (0, 0, math.radians(DIRECTIONS[f]))
            shots[f] = self._shoot("c")
        # second pass: every large object in its own flat colour, to find overlaps of same-coloured parts
        n = 0
        for ob in bpy.context.scene.objects:
            if ob.type != "MESH":
                continue
            if max(ob.dimensions) > 0.16:
                n += 1
                while len(self.idmats) < n:
                    k = len(self.idmats) + 1
                    c = ((k * 53) % 251 / 255.0, (k * 97) % 241 / 255.0, ((k * 29) % 239 + 8) / 255.0)
                    self.idmats.append(palette.flat_material("id%d" % k, tuple(x ** 2.2 for x in c)))
                m = self.idmats[n - 1]
            else:
                if not hasattr(self, "idzero") or self.idzero.name not in bpy.data.materials:
                    self.idzero = palette.flat_material("id0", (0, 0, 0))
                m = self.idzero
            ob.data.materials.clear()
            ob.data.materials.append(m)
            for md in ob.modifiers:
                if md.type == "SOLIDIFY":
                    md.material_offset = 0
        out = {}
        for f in facings:
            self.face.rotation_euler = (0, 0, math.radians(DIRECTIONS[f]))
            out[f] = self.post(shots[f], self._shoot("i"))
        return out

    # -- image clean-up
    def post(self, a, ids):
        h, w = a.shape[:2]
        solid = a[..., 3] > 0.5
        full = np.full((h, w), -1, dtype=np.int16)
        if not solid.any():
            return full
        ys, xs = np.nonzero(solid)
        y0, y1, x0, x1 = max(ys.min() - 2, 0), min(ys.max() + 3, h), max(xs.min() - 2, 0), min(xs.max() + 3, w)
        a, ids, solid = a[y0:y1, x0:x1], ids[y0:y1, x0:x1], solid[y0:y1, x0:x1]
        d = ((a[:, :, None, :3] * 255.0 - self.cols[None, None]) ** 2).sum(-1)
        idx = d.argmin(-1)
        # single stray pixels in a flat field are removed; accents (eyes, glints) are kept
        keep = np.isin(idx, self.keep)
        lf, rt = np.roll(idx, 1, axis=1), np.roll(idx, -1, axis=1)
        up, dn = np.roll(idx, 1, axis=0), np.roll(idx, -1, axis=0)
        speck = solid & ~keep & (lf == rt) & (up == dn) & (lf == up) & (lf != idx)
        idx = np.where(speck, lf, idx)
        # inner lines: two large parts of the same colour meet -> darken one pixel by one tone
        idc = (np.round(ids[..., :3] * 255).astype(np.int32) * np.array([65536, 256, 1])).sum(-1)
        big = idc != 0
        line = np.zeros(idx.shape, bool)
        line[:, :-1] |= ((idc[:, :-1] != idc[:, 1:]) & (idx[:, :-1] == idx[:, 1:]) & solid[:, :-1] & solid[:, 1:]
                         & big[:, :-1] & big[:, 1:])
        line[:-1] |= (idc[:-1] != idc[1:]) & (idx[:-1] == idx[1:]) & solid[:-1] & solid[1:] & big[:-1] & big[1:]
        idx = np.where(line, self.darker[idx], idx)
        # outline (rows run bottom-up here; the key light comes from the upper right)
        grow = solid.copy()
        grow[1:] |= solid[:-1]; grow[:-1] |= solid[1:]; grow[:, 1:] |= solid[:, :-1]; grow[:, :-1] |= solid[:, 1:]
        edge = grow & ~solid
        oi = np.full(idx.shape, self.out_i)
        left, left_ok = np.roll(idx, 1, axis=1), np.roll(solid, 1, axis=1)
        below, below_ok = np.roll(idx, 1, axis=0), np.roll(solid, 1, axis=0)
        oi = np.where(edge & below_ok, self.ramp_dark[below], oi)
        oi = np.where(edge & left_ok, self.ramp_dark[left], oi)
        res = np.where(solid, idx, np.where(edge, oi, -1)).astype(np.int16)
        full[y0:y1, x0:x1] = res
        return full[::-1].copy()

def bbox(idx):
    ys, xs = np.nonzero(idx >= 0)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
