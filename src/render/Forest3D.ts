import * as T from "three";
import type { SimEvent, World } from "../sim";
import type { Pool } from "../sim/pool";
import { PROJ_HOSTILE } from "../sim/pool";

const UNIT = 0.035;
const fogColors = [0x263c49, 0x394454, 0x353c58];
const gold = 0xffbe72;

export class Forest3D {
  private readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(67, 16 / 9, 0.035, 100);
  private readonly cover = new T.PerspectiveCamera(43, 16 / 9, 0.1, 100);
  private readonly fog = new T.FogExp2(fogColors[0], 0.027);
  private readonly materials = new Map<number, T.MeshStandardMaterial>();
  private readonly luminous = new Map<number, T.MeshBasicMaterial>();
  private readonly sphere = new T.SphereGeometry(1, 12, 8);
  private readonly stone = new T.DodecahedronGeometry(1);
  private readonly box = new T.BoxGeometry(1, 1, 1);
  private readonly cloak = new T.CylinderGeometry(0.54, 1, 1, 9);
  private readonly cone = new T.ConeGeometry(1, 1, 9);
  private readonly ring = new T.RingGeometry(0.92, 1, 48).rotateX(-Math.PI / 2);
  private readonly entities = new Map<number, T.Group>();
  private readonly available = new Map<string, T.Group[]>();
  private readonly landscape: T.Group[] = [];
  private readonly player = new T.Group();
  private readonly heldLamp = new T.Group();
  private readonly lantern = new T.PointLight(gold, 48, 12, 2);
  private readonly aura: T.Mesh;
  private readonly ground: T.Mesh;
  private readonly terrain: T.CanvasTexture;
  private readonly particles: T.Points;
  private readonly flashes: { mesh: T.Mesh; end: number }[] = [];

  constructor(parent: HTMLElement) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    const canvas = this.renderer.domElement;
    canvas.className = "forest-3d";
    canvas.setAttribute("aria-hidden", "true");
    this.scene.fog = this.fog;
    this.scene.background = this.fog.color;
    this.scene.add(new T.HemisphereLight(0xbcd7ff, 0x323833, 2.0));
    const moon = new T.DirectionalLight(0xb4d5ff, 2.8);
    moon.position.set(-7, 13, -9);
    this.scene.add(moon, this.player, this.lantern);
    this.terrain = this.groundTexture();
    this.ground = new T.Mesh(
      new T.PlaneGeometry(96, 96),
      new T.MeshStandardMaterial({
        color: 0x7c9183,
        map: this.terrain,
        roughness: 0.96,
      }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.scene.add(this.ground);
    this.makeWarden();
    this.scene.add(this.camera);
    this.camera.add(this.heldLamp);
    this.heldLamp.scale.setScalar(0.76);
    this.part(this.heldLamp, this.box, 0x373039, 0, 0, 0, 0.16, 0.25, 0.15);
    this.part(
      this.heldLamp,
      this.box,
      0xfbc374,
      0,
      0,
      0.005,
      0.13,
      0.16,
      0.157,
      false,
    );
    this.part(
      this.heldLamp,
      this.cone,
      0x554638,
      0,
      0.17,
      0,
      0.116,
      0.13,
      0.116,
    );
    for (const side of [-1, 1])
      this.part(
        this.heldLamp,
        this.box,
        0x4c3c33,
        side * 0.066,
        0,
        0.088,
        0.025,
        0.24,
        0.023,
      );
    this.aura = new T.Mesh(this.ring, this.emissive(0x8adcf0));
    this.aura.visible = false;
    this.scene.add(this.aura);
    this.makeForest();
    const motes = new Float32Array(240);
    for (let i = 0; i < motes.length; i += 3) {
      motes[i] = Math.sin(i * 114.1) * 16;
      motes[i + 1] = 0.4 + Math.abs(Math.cos(i * 18.5)) * 4;
      motes[i + 2] = Math.cos(i * 91.7) * 13;
    }
    this.particles = new T.Points(
      new T.BufferGeometry().setAttribute(
        "position",
        new T.BufferAttribute(motes, 3),
      ),
      new T.PointsMaterial({
        color: 0xe9cd98,
        size: 0.036,
        transparent: true,
        opacity: 0.65,
      }),
    );
    this.scene.add(this.particles);
    parent.append(canvas);
  }

  private groundTexture(): T.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#53645a";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 419;
    const random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 5100; i++) {
      ctx.fillStyle = ["#637261", "#40554e", "#5d6b57", "#73806c", "#364743"][
        i % 5
      ];
      ctx.globalAlpha = 0.16 + random() * 0.23;
      ctx.fillRect(
        random() * 256,
        random() * 256,
        1 + random() * 7,
        1 + random() * 3,
      );
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(24, 24);
    texture.anisotropy = 4;
    return texture;
  }

  private lit(color: number) {
    let material = this.materials.get(color);
    if (!material) {
      material = new T.MeshStandardMaterial({
        color,
        roughness: 0.82,
        flatShading: true,
      });
      this.materials.set(color, material);
    }
    return material;
  }

  private emissive(color: number) {
    let material = this.luminous.get(color);
    if (!material) {
      material = new T.MeshBasicMaterial({
        color,
        toneMapped: false,
        side: T.DoubleSide,
      });
      this.luminous.set(color, material);
    }
    return material;
  }

  private part(
    parent: T.Group,
    geometry: T.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    lit = true,
  ) {
    const mesh = new T.Mesh(
      geometry,
      lit ? this.lit(color) : this.emissive(color),
    );
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  }

  private makeWarden() {
    const p = this.player;
    this.part(p, this.cloak, 0x305766, 0, 0.49, 0.05, 0.34, 0.7, 0.3);
    this.part(p, this.sphere, 0x456c7c, 0, 0.79, 0, 0.27, 0.31, 0.26);
    this.part(p, this.sphere, 0x1d2d37, 0, 0.82, 0.19, 0.17, 0.18, 0.12);
    this.part(p, this.box, 0xd6a96f, 0, 0.8, 0.29, 0.16, 0.035, 0.02);
    this.part(p, this.box, 0x7f674e, 0, 0.37, 0.17, 0.43, 0.075, 0.07);
    this.part(
      p,
      this.stone,
      0x1c2631,
      -0.13,
      0.13,
      0.06,
      0.11,
      0.16,
      0.16,
    ).name = "left";
    this.part(
      p,
      this.stone,
      0x1c2631,
      0.13,
      0.13,
      0.06,
      0.11,
      0.16,
      0.16,
    ).name = "right";
    this.part(p, this.sphere, 0x395a69, 0.31, 0.52, 0.14, 0.15, 0.13, 0.14);
    this.part(p, this.box, 0x6b4d30, 0.4, 0.44, 0.26, 0.15, 0.25, 0.15);
    this.part(p, this.box, gold, 0.4, 0.45, 0.26, 0.105, 0.16, 0.16, false);
  }

  private makeForest() {
    for (let i = 0; i < 112; i++) {
      const g = new T.Group();
      const r = (Math.sin(i * 87.13) + 1) / 2;
      const x = ((i % 14) - 6.5) * 2.9 + Math.sin(i * 11) * 0.92;
      const z = (Math.floor(i / 14) - 3.5) * 4.8 + Math.cos(i * 8) * 1.6;
      g.userData = { x, z };
      if (i % 14 === 0 || i % 14 === 13 || i % 9 === 0) {
        this.part(g, this.cone, 0x494840, 0, 0.9, 0, 0.13, 1.8, 0.15);
        for (let level = 0; level < 4; level++) {
          this.part(
            g,
            this.cone,
            [0x183b3b, 0x204442, 0x28514c, 0x355d53][level],
            0,
            1.25 + level * 0.51,
            0,
            1.05 - level * 0.19,
            1.48 - level * 0.16,
            1.02 - level * 0.18,
          ).rotation.y = r * 6 + level;
        }
        g.scale.setScalar(0.72 + r * 0.65);
      } else if (i % 11 === 0) {
        this.part(g, this.box, 0x626c71, 0, 0.12, 0, 1.48, 0.24, 0.84);
        for (const side of [-1, 1]) {
          this.part(
            g,
            this.box,
            0x7c8585,
            side * 0.49,
            0.72,
            0,
            0.31,
            1.28,
            0.37,
          );
          this.part(
            g,
            this.box,
            0x56696a,
            side * 0.49,
            1.38,
            0,
            0.4,
            0.15,
            0.42,
          );
        }
        this.part(g, this.box, 0x707d81, 0, 1.56, 0, 1.33, 0.24, 0.44);
        this.part(g, this.stone, gold, 0, 1.57, 0.24, 0.1, 0.12, 0.08, false);
      } else {
        const rock = this.part(
          g,
          this.stone,
          0x637271,
          0,
          0.1,
          0,
          0.16 + r * 0.32,
          0.12 + r * 0.12,
          0.24 + r * 0.22,
        );
        rock.rotation.set(r, r * 9, r * 0.65);
        for (let k = 0; k < 3; k++)
          this.part(
            g,
            this.cone,
            0x66815f,
            k * 0.12 - 0.24,
            0.13,
            0.23,
            0.037,
            0.28,
            0.043,
          ).rotation.z = k * 0.23 - 0.21;
      }
      this.scene.add(g);
      this.landscape.push(g);
    }
  }

  private model(kind: string, color: number): T.Group {
    const g = new T.Group();
    if (kind === "shot" || kind === "gem") {
      const gem = kind === "gem";
      this.part(
        g,
        gem ? this.stone : this.sphere,
        color,
        0,
        gem ? 0.2 : 0.28,
        0,
        gem ? 0.17 : 0.12,
        gem ? 0.25 : 0.12,
        gem ? 0.17 : 0.26,
        false,
      );
      return g;
    }
    const shadow = new T.Mesh(this.sphere, this.lit(0x253332));
    shadow.scale.set(0.32, 0.012, 0.25);
    shadow.position.y = 0.015;
    g.add(shadow);
    if (kind.includes("slime")) {
      this.part(g, this.sphere, color, 0, 0.21, 0, 0.36, 0.24, 0.32);
      for (const side of [-1, 1])
        this.part(
          g,
          this.sphere,
          0xf1da9c,
          side * 0.11,
          0.29,
          0.27,
          0.047,
          0.055,
          0.04,
          false,
        );
      if (kind === "slime_king")
        for (let i = -1; i <= 1; i++)
          this.part(g, this.cone, gold, i * 0.12, 0.47, 0, 0.085, 0.22, 0.085);
    } else if (kind === "bat") {
      this.part(g, this.sphere, color, 0, 0.48, 0, 0.16, 0.18, 0.15);
      for (const side of [-1, 1]) {
        const wing = this.part(
          g,
          this.cone,
          color,
          side * 0.29,
          0.46,
          0,
          0.19,
          0.49,
          0.072,
        );
        wing.rotation.z = side * 1.17;
        wing.name = side < 0 ? "left" : "right";
        this.part(
          g,
          this.sphere,
          0xf4b0c4,
          side * 0.07,
          0.53,
          0.13,
          0.036,
          0.035,
          0.04,
          false,
        );
      }
    } else if (kind === "wolf") {
      this.part(g, this.stone, color, 0, 0.3, 0, 0.23, 0.24, 0.42);
      this.part(g, this.stone, color, 0, 0.39, 0.32, 0.19, 0.21, 0.23);
      for (const side of [-1, 1]) {
        this.part(
          g,
          this.cone,
          color,
          side * 0.12,
          0.61,
          0.34,
          0.075,
          0.21,
          0.07,
        );
        this.part(
          g,
          this.sphere,
          0xffa57e,
          side * 0.077,
          0.45,
          0.48,
          0.036,
          0.032,
          0.025,
          false,
        );
        for (const z of [-0.24, 0.24])
          this.part(
            g,
            this.box,
            0x494d63,
            side * 0.14,
            0.14,
            z,
            0.095,
            0.26,
            0.105,
          );
      }
    } else {
      const golem = kind === "golem";
      this.part(
        g,
        golem ? this.stone : this.cloak,
        color,
        0,
        0.37,
        0,
        0.3,
        0.74,
        0.25,
      );
      this.part(
        g,
        this.stone,
        golem ? color : 0xe3d7c4,
        0,
        0.8,
        0.04,
        0.21,
        0.2,
        0.18,
      );
      for (const side of [-1, 1]) {
        this.part(
          g,
          this.stone,
          color,
          side * 0.32,
          0.43,
          0,
          0.125,
          0.23,
          0.14,
        );
        this.part(
          g,
          this.sphere,
          0xff998d,
          side * 0.073,
          0.82,
          0.18,
          0.036,
          0.032,
          0.031,
          false,
        );
        if (!golem)
          this.part(
            g,
            this.cone,
            gold,
            side * 0.15,
            1.01,
            0.02,
            0.06,
            0.23,
            0.06,
          );
      }
    }
    const warn = new T.Mesh(this.ring, this.emissive(0xff8c62));
    warn.name = "warning";
    warn.visible = false;
    warn.position.y = 0.04;
    g.add(warn);
    return g;
  }

  private sync(
    world: World,
    pool: Pool,
    type: "enemy" | "shot" | "gem",
    alpha: number,
    seen: Set<number>,
  ) {
    for (let i = 0; i < pool.count; i++) {
      const id = pool.id[i];
      seen.add(id);
      const def = world.data.enemies[pool.kind[i]];
      const hostile = type === "shot" && pool.hp[i] === PROJ_HOSTILE;
      const kind = type === "enemy" ? def.sprite : type;
      const color =
        type === "enemy"
          ? parseInt(def.placeholderColor.slice(1), 16)
          : type === "gem"
            ? 0x78e7eb
            : hostile
              ? 0xff7957
              : parseInt(
                  world.data.weapons[pool.kind[i]].placeholderColor.slice(1),
                  16,
                );
      const key = kind + ":" + color;
      let model = this.entities.get(id);
      if (!model) {
        model = this.available.get(key)?.pop() ?? this.model(kind, color);
        model.userData.key = key;
        model.visible = true;
        this.entities.set(id, model);
        this.scene.add(model);
      }
      model.position.set(
        T.MathUtils.lerp(pool.px[i], pool.x[i], alpha) * UNIT,
        0,
        T.MathUtils.lerp(pool.py[i], pool.y[i], alpha) * UNIT,
      );
      const motion = world.time * 10 + id;
      if (type === "enemy") {
        const size = Math.max(0.73, pool.r[i] / 7);
        model.scale.set(size, size * (1 + Math.sin(motion) * 0.045), size);
        if (Math.abs(pool.vx[i]) + Math.abs(pool.vy[i]) > 0.01)
          model.rotation.y = Math.atan2(pool.vx[i], pool.vy[i]);
        const warning = model.getObjectByName("warning")!;
        warning.visible =
          (def.behavior === "ranged" && pool.timer[i] > 2.1) ||
          (def.behavior === "dash" && pool.timer[i] > 2.2);
        warning.scale.setScalar(0.53 + Math.sin(motion * 2) * 0.05);
        const wing = model.getObjectByName("left");
        if (wing) {
          wing.rotation.z = -1.17 + Math.sin(motion * 2.6) * 0.43;
          model.getObjectByName("right")!.rotation.z =
            1.17 - Math.sin(motion * 2.6) * 0.43;
        }
      } else {
        model.rotation.y =
          type === "gem" ? motion * 0.18 : Math.atan2(pool.vx[i], pool.vy[i]);
        model.scale.setScalar(
          type === "gem" ? 1 : Math.max(0.62, pool.r[i] / 4),
        );
        if (type === "gem") model.position.y = 0.07 + Math.sin(motion) * 0.045;
      }
    }
  }

  handle(event: SimEvent, time: number) {
    if (event.t !== "beam" && event.t !== "kill") return;
    const mesh = new T.Mesh(
      event.t === "beam" ? this.box : this.ring,
      this.emissive(event.t === "beam" ? 0xb9f9ff : 0xe6bc87),
    );
    mesh.position.set(event.x * UNIT, 0.08, event.y * UNIT);
    if (event.t === "beam") {
      const dx = (event.tx - event.x) * UNIT,
        dz = (event.ty - event.y) * UNIT;
      mesh.position.add(new T.Vector3(dx / 2, 0.22, dz / 2));
      mesh.scale.set(0.09, 0.11, Math.hypot(dx, dz));
      mesh.rotation.y = Math.atan2(dx, dz);
    } else mesh.scale.setScalar(0.38);
    this.scene.add(mesh);
    this.flashes.push({ mesh, end: time + 0.18 });
  }

  draw(world?: World, alpha = 1, auraRadius = 0, yaw = 0, pitch = 0) {
    const p = world?.player;
    const x = p ? T.MathUtils.lerp(p.px, p.x, alpha) * UNIT : 0;
    const z = p ? T.MathUtils.lerp(p.py, p.y, alpha) * UNIT : 0;
    const time = world?.time ?? 0;
    this.fog.color.setHex(fogColors[world?.stage.index ?? 0]);
    this.player.position.set(x, 0, z);
    this.player.rotation.y = p ? Math.atan2(p.faceX, p.faceY) : -0.55;
    const stride = p && (p.moveX || p.moveY) ? Math.sin(time * 19) * 0.095 : 0;
    this.player.getObjectByName("left")!.position.z = 0.06 + stride;
    this.player.getObjectByName("right")!.position.z = 0.06 - stride;
    this.lantern.position.set(x + 0.21, 0.94, z + 0.24);
    this.lantern.intensity =
      44 + Math.sin(time * 11) * 3 + Math.sin(time * 19) * 2;
    this.aura.visible = auraRadius > 0;
    this.aura.position.set(x, 0.045, z);
    this.aura.scale.setScalar(auraRadius * UNIT);
    this.ground.position.set(x, -0.014, z);
    this.terrain.offset.set(x / 4, -z / 4);
    for (const g of this.landscape) {
      const { x: bx, z: bz } = g.userData;
      g.position.set(
        bx + Math.round((x - bx) / 40.6) * 40.6,
        0,
        bz + Math.round((z - bz) / 38.4) * 38.4,
      );
    }
    this.particles.position.set(x, 0.15 * Math.sin(time * 1.1), z);
    this.particles.rotation.y = time * 0.009;
    if (world) {
      const seen = new Set<number>();
      this.sync(world, world.pickups, "gem", alpha, seen);
      this.sync(world, world.enemies, "enemy", alpha, seen);
      this.sync(world, world.projectiles, "shot", alpha, seen);
      for (const [id, g] of this.entities) {
        if (seen.has(id)) continue;
        this.scene.remove(g);
        this.entities.delete(id);
        const key = g.userData.key as string;
        const free = this.available.get(key) ?? [];
        free.push(g);
        this.available.set(key, free);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if (time < this.flashes[i].end) continue;
      this.scene.remove(this.flashes[i].mesh);
      this.flashes.splice(i, 1);
    }
    const canvas = this.renderer.domElement;
    const width = canvas.parentElement!.clientWidth,
      height = canvas.parentElement!.clientHeight;
    if (
      canvas.clientWidth &&
      (canvas.width !== Math.floor(width * this.renderer.getPixelRatio()) ||
        canvas.height !== Math.floor(height * this.renderer.getPixelRatio()))
    )
      this.renderer.setSize(width, height, false);
    this.camera.visible = Boolean(world);
    if (world) {
      this.heldLamp.position.set(0.39, -0.3 + stride * 0.13, -0.69);
      this.heldLamp.rotation.z = -0.12 + stride * 0.23;
      this.player.visible = false;
      const eye = 0.92 + Math.abs(stride) * 0.14;
      this.camera.position.set(x, eye, z);
      this.camera.lookAt(
        x + Math.sin(yaw),
        eye + Math.tan(pitch),
        z - Math.cos(yaw),
      );
      this.lantern.position.set(
        x + Math.sin(yaw) * 0.35,
        0.68,
        z - Math.cos(yaw) * 0.35,
      );
      this.fog.density = 0.064;
    } else {
      this.player.position.set(2.45, 0, 1.25);
      this.player.rotation.y = -0.55;
      this.lantern.position.set(2.7, 0.8, 1.5);
      this.cover.position.set(0, 2.55, 7.4);
      this.cover.lookAt(-0.4, 1.35, -2.5);
      this.fog.density = 0.064;
      this.landscape.forEach((group, i) => {
        const tree = i % 14 === 0 || i % 14 === 13 || i % 9 === 0;
        if (tree) {
          group.position.set(((i % 13) - 6) * 1.35, 0, -3.8 - (i % 5) * 3.0);
        }
        if (i === 11) {
          group.position.set(3.4, 0, -1.4);
          group.scale.setScalar(1.45);
        }
      });
    }
    this.renderer.render(this.scene, world ? this.camera : this.cover);
  }

  dispose() {
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.terrain.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as T.Material).dispose();
    this.particles.geometry.dispose();
    (this.particles.material as T.Material).dispose();
    for (const geometry of [
      this.box,
      this.cone,
      this.sphere,
      this.stone,
      this.ring,
    ])
      geometry.dispose();
    for (const material of [
      ...this.materials.values(),
      ...this.luminous.values(),
    ])
      material.dispose();
  }
}

export function mountForest(parent: HTMLElement): Forest3D | undefined {
  try {
    return new Forest3D(parent);
  } catch {
    return undefined;
  }
}
