"""Render the idle of many models in one Blender session.

Run inside Blender on Jellybingus after blender_players.py, model_kit.py and
team_models.py have been exec'd into the same globals:

    render_models(["human_lineman", "ogre"], "C:/.../models")

Each model gets OUT/<id>/<size>/idle/<dir>_<frame>_<pass>.png and a
meta.json. The frame is the smallest of FRAME_STEPS that holds the model in
every facing, so big guys get room without shrinking everyone else.
"""

import time

FRAME_STEPS = (96, 128, 160, 192, 224, 256, 288, 320)  # at "lo"; "hi" frames are twice these
MARGIN = 0.03  # keep this fraction of the frame clear on every edge


def fits(px, animations=("idle",)):
    """True if every mesh stays inside a lo frame of px in all facings and sampled frames of every animation."""
    from bpy_extras.object_utils import world_to_camera_view

    scene = bpy.context.scene
    scene.render.resolution_x = scene.render.resolution_y = px  # the projection depends on the aspect ratio
    scene.camera.data.ortho_scale = px / PX_PER_UNIT["lo"]
    root = bpy.data.objects["root"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for deg in DIRECTIONS.values():
        root.rotation_euler = (0, 0, math.radians(deg))
        for anim in animations:
            n = ANIMATIONS[anim]
            for f in sorted({*range(0, n, 2), n - 1}):
                set_pose(POSES[anim](f, n))
                bpy.context.view_layer.update()
                for ob in meshes:
                    for corner in ob.bound_box:
                        co = world_to_camera_view(scene, scene.camera, ob.matrix_world @ Vector(corner))
                        if not (MARGIN < co.x < 1 - MARGIN and MARGIN < co.y < 1 - MARGIN):
                            return False
    return True


def render_models(ids, out_root, sizes=("lo", "hi"), style="neon", animations=("idle",)):
    done = []
    for model_id in ids:
        t = time.time()
        build_model(MODELS[model_id], style)
        lo = next((px for px in FRAME_STEPS if fits(px, animations)), FRAME_STEPS[-1])
        for size in sizes:
            px = lo if size == "lo" else lo * 2
            render_all(f"{out_root}/{model_id}", size, animations=list(animations), frame=px)
        done.append({"id": model_id, "frame": lo, "seconds": round(time.time() - t, 1)})
    return done
