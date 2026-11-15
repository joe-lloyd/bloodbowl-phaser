"""Sideline miniatures using the existing match rig, heads, materials and camera.

Loaded after model_kit.py and team_models.py by batch_render.py. Coaches
and the apothecary sit on their own folding chairs; cheerleaders perform a
pom-pom routine; goblin medics run the stretcher with their arms out to the poles.
"""

SIDELINE_MODELS = {
    "sideline_coach": M("human", ["face:human", "hair:short", "sideline:coach"],
                        gloves="skin", shorts="kit2", colors=dict(hair=(0.2, 0.13, 0.07))),
    "sideline_cheerleader": M("female", ["face:human", "hair:long", "hair:ponytail", "sideline:cheerleader"],
                              bare_arms=True, gloves="skin", shorts="kit2", legs="skin", shins="skin",
                              colors=dict(hair=(0.65, 0.32, 0.08))),
    "sideline_apothecary": M("human", ["face:human", "hair:bald", "sideline:apothecary"],
                             shirt="wrap", sleeves="wrap", gloves="skin", shorts="kit2"),
    "sideline_fan": M("human", ["face:human", "hair:short", "sideline:fan"],
                      gloves="skin", shorts="kit2", colors=dict(skin=SKIN["dark"])),
    # Two goblins run the stretcher on and off, in a red-cross strap.
    "sideline_medic": M("goblin", ["face:goblin", "ears:goblin", "sideline:medic"],
                        bare_arms=True, shorts="kit2", colors=skin("goblin")),
}
MODELS.update(SIDELINE_MODELS)


def sideline_chair(c):
    root = c.j["root"]
    mesh_object("chair_seat", box(0.56, 0.5, 0.06), "wood", root, (0, 0.04, 0.48))
    mesh_object("chair_back", box(0.56, 0.05, 0.48), "kit2", root, (0, 0.28, 0.72))
    for sx in (-1, 1):
        for sy in (-1, 1):
            mesh_object(f"chair_leg_{sx}_{sy}", box(0.04, 0.04, 0.47), "metal", root,
                        (sx * 0.23, 0.04 + sy * 0.2, 0.24))


def sideline_part(c, role):
    STATE["sideline"] = role
    chest = c.j["chest"]
    if role == "cheerleader":
        # A pleated team skirt and two tufts of alternating kit colours.
        mesh_object("skirt", cylinder(0.25, 0.28, 0.7), "kit2", c.j["body"], (0, 0, -0.08))
        for side in ("l", "r"):
            for k in range(12):
                angle = k * math.pi / 6
                mesh_object(f"pompom_{side}_{k}", box(0.055, 0.055, 0.29),
                            "kit1" if k % 2 else "kit2", c.j["hand_" + side],
                            (0.09 * math.cos(angle), 0.09 * math.sin(angle), -0.08),
                            rotation=(0.7 * math.cos(angle), 0.7 * math.sin(angle), angle))
    elif role in ("coach", "apothecary"):
        sideline_chair(c)
        hand = c.j["hand_l"]
        mesh_object("clipboard", box(0.3, 0.04, 0.4), "wood", hand, (0, -0.05, -0.1))
        mesh_object("notes", box(0.25, 0.015, 0.32), "wrap", hand, (0, -0.08, -0.1))
        mesh_object("clip", box(0.09, 0.025, 0.05), "steel", hand, (0, -0.09, 0.07))
    if role in ("apothecary", "medic"):
        mesh_object("medical_strap", box(0.12, c.td + 0.02, c.th), "kit1", chest, (0.15, 0, c.th * 0.6))
        mesh_object("medical_badge_v", box(0.04, 0.025, 0.16), "kit2", chest, (-0.1, -c.td / 2 - 0.02, c.th * 0.6))
        mesh_object("medical_badge_h", box(0.14, 0.025, 0.04), "kit2", chest, (-0.1, -c.td / 2 - 0.025, c.th * 0.6))
    if role == "fan":
        mesh_object("scarf", box(c.tw + 0.06, c.td + 0.04, 0.1), "kit2", chest, (0, 0, c.th))
        mesh_object("scarf_tail", box(0.12, 0.04, 0.4), "kit2", chest, (0.13, -c.td / 2 - 0.03, c.th - 0.15))


PARTS["sideline"] = sideline_part


def sideline_idle(f, n):
    role = STATE.get("sideline")
    if not role:
        return pose_idle_any(f, n)
    s = math.sin(2 * math.pi * f / n)
    seated = role in ("coach", "apothecary")
    return {
        "body": R(dz=-0.44 if seated else 0.01 * s),
        "chest": R(rx=0.06, rz=0.02 * s),
        "head": R(rx=-0.04, rz=0.16 * s),
        "hip_l": R(rx=-1.35 if seated else -0.05, ry=-0.12),
        "hip_r": R(rx=-1.35 if seated else 0.05, ry=0.12),
        "knee_l": R(rx=1.35 if seated else 0.12),
        "knee_r": R(rx=1.35 if seated else 0.12),
        "shoulder_l": R(rx=-0.4 if seated else -0.05, ry=-0.12),
        "shoulder_r": R(rx=-0.5 if seated else 0.05, ry=0.12),
        "elbow_l": R(rx=-1.15 if seated else -0.12),
        "elbow_r": R(rx=-1.2 + 0.08 * s if seated else -0.12),
    }


def sideline_cheer(f, n):
    role = STATE.get("sideline")
    if not role or role in ("cheerleader", "fan"):
        return pose_cheer_any(f, n)
    return sideline_idle(f, n)


def sideline_run(f, n):
    pose = pose_run(f, n)
    if STATE.get("sideline") == "medic":
        pose["chest"] = R(rx=0.02)
        for side, out in OUT.items():
            pose["shoulder_" + side] = R(rx=-0.65, ry=out * 0.18)
            pose["elbow_" + side] = R(rx=-0.65)
    return pose


POSES.update(idle=sideline_idle, cheer=sideline_cheer, run=sideline_run)
