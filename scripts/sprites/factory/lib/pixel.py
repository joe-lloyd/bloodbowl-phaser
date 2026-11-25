"""Pixel rendering: the approved look at game size.

No anti-aliasing, every pixel one palette colour, a one-pixel checker dither locked to the screen where
two tones meet, inner lines where two parts of the same colour overlap, and a one-pixel outline that is
near-black on the shadow side and a dark tone of the neighbouring fill on the lit side.

A Stage owns one Blender scene. The figure is built under two root empties in a collection that is not
in the scene; eight instances of it, one per facing, stand in a row across one wide image, spaced along
the camera's horizontal axis (which leaves depth unchanged and keeps their shadows apart). One render
gives every facing: a colour render, then (for layered output) a data render with flat materials whose
emission holds each object's code (for inner lines) and its depth along the view. Both are float EXR,
read with OpenImageIO. Results are 2D int16 arrays of palette indices (-1 = transparent), top row first.
"""
import bpy, os, math, zlib
import numpy as np
import OpenImageIO as oiio
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
        self.cells = len(FACINGS)
        palette.CANVAS[0], palette.CANVAS[1] = canvas * self.cells, canvas
        self.canvas, self.anchor, self.tmp = canvas, anchor, tmpdir
        os.makedirs(tmpdir, exist_ok=True)
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_EEVEE"
        sc.render.film_transparent = True
        sc.render.dither_intensity = 0.0
        sc.view_settings.view_transform = "Standard"
        sc.eevee.shadow_pool_size = "1024"       # eight figures per image need more shadow pages than one
        sc.eevee.taa_render_samples = 1          # shadows need a few samples; the tiny filter keeps it un-anti-aliased
        sc.render.filter_size = 0.01
        sc.render.use_freestyle = False
        width = canvas * self.cells
        sc.render.resolution_x, sc.render.resolution_y = width, canvas
        sc.render.resolution_percentage = 100
        st = sc.render.image_settings
        st.file_format, st.color_depth, st.exr_codec = "OPEN_EXR", "32", "NONE"
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
        cd.ortho_scale = width / PPM
        bpy.context.view_layer.update()
        R = cam.matrix_world.to_3x3()
        cx, cy, view = R.col[0], R.col[1], -R.col[2]
        cam.location = cx * ((width / 2 - anchor[0]) / PPM) + cy * ((anchor[1] - canvas / 2) / PPM) - view * 60
        self.fig = bpy.data.collections.new("figure")          # instanced once per facing, not in the scene
        self.face = bpy.data.objects.new("facing", None)
        self.tilt = bpy.data.objects.new("tilt", None)         # scale, fall, hop
        for ob in (self.face, self.tilt):
            self.fig.objects.link(ob)
        self.tilt.parent = self.face
        for k, f in enumerate(FACINGS):
            cell = bpy.data.objects.new("cell_" + f, None)
            cell.instance_type, cell.instance_collection = "COLLECTION", self.fig
            cell.location = cx * (k * canvas / PPM)
            cell.rotation_euler = (0, 0, math.radians(DIRECTIONS[f]))
            sc.collection.objects.link(cell)
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
            if ob.type == "EMPTY" and ob not in (self.face, self.tilt) and not ob.name.startswith("cell_"):
                bpy.data.objects.remove(ob, do_unlink=True)
        core.ROOT[0] = self.tilt

    def build(self, model, pose, scale):
        """Clear the scene, build the model in this pose and apply the whole-figure pose keys."""
        self.clear()
        self.unlined = [object_code("%s_%s" % (model.key, part)) for part in model.unlined()]
        model.build(pose)
        core.ROOT[0] = None
        scene = bpy.context.scene.collection
        for ob in list(scene.objects):
            if ob.type in ("MESH", "EMPTY") and not ob.name.startswith("cell_"):
                self.fig.objects.link(ob)
                scene.objects.unlink(ob)
        for ob in self.fig.objects:
            if ob.type == "MESH":
                ob["code"] = object_code(ob.name) if max(ob.dimensions) > 0.16 else 0
        pitch, roll = math.radians(pose.get("pitch", 0)), math.radians(pose.get("roll", 0))
        down = max(abs(math.sin(pitch)), abs(math.sin(roll)))
        t = self.tilt
        t.rotation_euler = (-pitch, roll, 0)
        t.scale = (scale, scale, scale * pose.get("squash", 1.0))
        # forward is -Y: "shift" moves the figure forward; a figure falling onto its back slides forward
        # by lie_shift so the lying body stays centred on its square
        t.location = (0, (-pose.get("shift", 0) - model.lie_shift * math.sin(pitch)) * scale,
                      (pose.get("hop", 0) + model.lie * down) * scale)

    def meshes(self):
        return [ob for ob in self.fig.objects if ob.type == "MESH"]

    def _render(self):
        """Render the wide image; float RGBA rows top-down, linear."""
        sc = bpy.context.scene
        path = os.path.join(self.tmp, "shot.exr")
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        image = oiio.ImageInput.open(path)
        spec = image.spec()
        data = image.read_image(0, 0, 0, 4, "float")
        image.close()
        return data.reshape(spec.height, spec.width, 4)

    def _cells(self, wide):
        c = self.canvas
        return {f: wide[:, k * c:(k + 1) * c] for k, f in enumerate(FACINGS)}

    def shoot(self, visible=None):
        """The colour render of every facing: {facing: sRGB RGBA}, canvas-sized, rows top-down.
        visible: the names of the objects the camera sees; the others are hidden but still cast shadows."""
        for ob in self.meshes():
            ob.visible_camera = visible is None or ob.name in visible
        lin = self._render()
        rgb = np.where(lin[..., :3] <= 0.0031308, lin[..., :3] * 12.92,
                       1.055 * np.power(np.maximum(lin[..., :3], 0), 1 / 2.4) - 0.055)
        return self._cells(np.concatenate([rgb, lin[..., 3:]], -1))

    def shoot_data(self):
        """The data render of every facing, after a colour shoot: {facing: (code, depth)}. It replaces the
        figure's materials, so build again before the next colour shoot."""
        for ob in self.meshes():
            ob.data.materials.clear()
            ob.data.materials.append(self.data_material(int(ob.get("code", 0))))
            for md in ob.modifiers:
                if md.type == "SOLIDIFY":
                    md.material_offset = 0
        cells = self._cells(self._render())
        return {f: (np.round(a[..., 0] * 255), a[..., 1]) for f, a in cells.items()}

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
        """The built figure for layered output: {facing: (idx, code, depth)} on the canvas, rows top-down, idx
        -1 where empty and not finished (no speckle removal, inner lines or outline yet). With data, the
        figure's materials are replaced afterwards."""
        shots = self.shoot(visible)
        classified = {f: self.classify(shots[f]) for f in facings}
        if not data:
            return {f: (idx, np.zeros(idx.shape, np.int16), np.where(solid, 0.0, np.inf).astype(np.float32))
                    for f, (idx, solid) in classified.items()}
        extra = self.shoot_data()
        for f, (idx, solid) in classified.items():
            black = solid & (self.darker[idx] == self.out_i)
            extra[f] = (np.where(black & np.isin(extra[f][0], self.unlined), 0, extra[f][0]), extra[f][1])
        return {f: (idx, np.where(solid, extra[f][0], 0).astype(np.int16),
                    np.where(solid, extra[f][1], np.inf).astype(np.float32)) for f, (idx, solid) in classified.items()}

    def render(self, facings):
        """Render the built figure in each facing, finished; returns {facing: index array}, rows top-down."""
        out = {}
        for f, (idx, code, _) in self.render_layer(facings).items():
            out[f] = self.finish(idx[::-1], code[::-1], (idx >= 0)[::-1])[::-1].copy()
        return out

    # -- image clean-up
    def classify(self, a):
        """Rendered sRGB pixels -> (nearest palette index, -1 where empty; solid mask)."""
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
