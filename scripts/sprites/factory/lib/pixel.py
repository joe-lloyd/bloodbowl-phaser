"""Pixel rendering: the approved look at game size.

No anti-aliasing, every pixel one palette colour, a one-pixel checker dither locked to the screen where
two tones meet, inner lines where two parts of the same colour overlap, and a one-pixel outline that is
near-black on the shadow side and a dark tone of the neighbouring fill on the lit side.

A Stage owns one Blender scene (camera, light, two root empties) and renders a built figure in any
number of facings. Results are 2D int16 arrays of palette indices (-1 = transparent), top row first.
"""
import bpy, os, math, zlib
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
        self.void_i = int((self.cols ** 2).sum(-1).argmin())     # what an empty pixel classifies as

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

    def _shoot_data(self, name):
        """A float render: exact emission values, for object codes and depth."""
        sc = bpy.context.scene
        st = sc.render.image_settings
        old = (st.file_format, st.color_depth)
        st.file_format, st.color_depth = "OPEN_EXR", "32"
        path = os.path.join(self.tmp, name + ".exr")
        sc.render.filepath = path
        try:
            bpy.ops.render.render(write_still=True)
        finally:
            st.file_format, st.color_depth = old
        im = bpy.data.images.load(path)
        a = np.empty(self.canvas * self.canvas * 4, dtype=np.float32)
        im.pixels.foreach_get(a)
        bpy.data.images.remove(im)
        return a.reshape(self.canvas, self.canvas, 4)

    def data_material(self, code):
        """Emission: red = the object's code / 255, green = depth along the view (larger is farther)."""
        name = "data%d" % code
        if name in bpy.data.materials:
            return bpy.data.materials[name]
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        N, LK = nt.nodes.new, nt.links.new
        out, em = N("ShaderNodeOutputMaterial"), N("ShaderNodeEmission")
        geo, dot = N("ShaderNodeNewGeometry"), N("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        dot.inputs[1].default_value = tuple(core.VIEW)
        add = N("ShaderNodeMath"); add.operation = "ADD"; add.inputs[1].default_value = 10.0
        rgb = N("ShaderNodeCombineColor")
        rgb.inputs[0].default_value = code / 255.0
        LK(geo.outputs["Position"], dot.inputs[0]); LK(dot.outputs["Value"], add.inputs[0])
        LK(add.outputs[0], rgb.inputs[1]); LK(rgb.outputs[0], em.inputs["Color"]); LK(em.outputs[0], out.inputs["Surface"])
        return m

    def render_layer(self, facings, visible=None, data=True):
        """Render the built figure for layered output: {facing: (idx, code, depth)} on the full canvas, rows
        top-down, idx -1 where empty and not finished (no speckle removal, inner lines or outline yet).
        visible: the names of the objects the camera sees; the others are hidden but still cast shadows."""
        meshes = [ob for ob in bpy.context.scene.objects if ob.type == "MESH"]
        if visible is not None:
            for ob in meshes:
                ob.visible_camera = ob.name in visible
        shots = {}
        for f in facings:
            self.face.rotation_euler = (0, 0, math.radians(DIRECTIONS[f]))
            shots[f] = self._shoot("c")
        if not data:
            out = {}
            for f in facings:
                idx, solid = self.classify(shots[f])
                out[f] = (idx[::-1].copy(), np.zeros(idx.shape, np.int16), np.where(solid, 0.0, np.inf)[::-1].astype(np.float32))
            return out
        for ob in meshes:
            m = self.data_material(object_code(ob.name) if max(ob.dimensions) > 0.16 else 0)
            ob.data.materials.clear()
            ob.data.materials.append(m)
            for md in ob.modifiers:
                if md.type == "SOLIDIFY":
                    md.material_offset = 0
        out = {}
        for f in facings:
            self.face.rotation_euler = (0, 0, math.radians(DIRECTIONS[f]))
            d = self._shoot_data("d")
            idx, solid = self.classify(shots[f])
            code = np.where(solid, np.round(d[..., 0] * 255), 0).astype(np.int16)
            depth = np.where(solid, d[..., 1], np.inf).astype(np.float32)
            out[f] = (idx[::-1].copy(), code[::-1].copy(), depth[::-1].copy())
        return out

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
        idx, solid = self.classify(a)
        idc = (np.round(ids[..., :3] * 255).astype(np.int32) * np.array([65536, 256, 1])).sum(-1)
        return self.finish(idx, idc, solid)[::-1].copy()

    def classify(self, a):
        """Rendered pixels -> (nearest palette index, -1 where empty; solid mask). Rows bottom-up."""
        h, w = a.shape[:2]
        solid = a[..., 3] > 0.5
        full = np.full((h, w), -1, dtype=np.int16)
        if solid.any():
            ys, xs = np.nonzero(solid)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            d = ((a[y0:y1, x0:x1, None, :3] * 255.0 - self.cols[None, None]) ** 2).sum(-1)
            full[y0:y1, x0:x1] = np.where(solid[y0:y1, x0:x1], d.argmin(-1), -1)
        return full, solid

    def finish(self, idx, idc, solid):
        """Speckle removal, inner lines and the outline on a whole figure; rows bottom-up.
        idx: palette indices (-1 empty), idc: object codes (0 = small part), solid: mask."""
        h, w = idx.shape
        if not solid.any():
            return np.full((h, w), -1, dtype=np.int16)
        idx = np.where(solid, idx, self.void_i)
        # single stray pixels in a flat field are removed; accents (eyes, glints) are kept
        keep = np.isin(idx, self.keep)
        lf, rt = np.roll(idx, 1, axis=1), np.roll(idx, -1, axis=1)
        up, dn = np.roll(idx, 1, axis=0), np.roll(idx, -1, axis=0)
        speck = solid & ~keep & (lf == rt) & (up == dn) & (lf == up) & (lf != idx)
        idx = np.where(speck, lf, idx)
        # inner lines: two large parts of the same colour meet -> darken one pixel by one tone
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
        return np.where(solid, idx, np.where(edge, oi, -1)).astype(np.int16)

def object_code(name):
    """A stable 1..254 code per object name, so one part has the same code in every layer it appears in."""
    return zlib.crc32(name.encode()) % 254 + 1

def bbox(idx):
    ys, xs = np.nonzero(idx >= 0)
    if len(ys) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
