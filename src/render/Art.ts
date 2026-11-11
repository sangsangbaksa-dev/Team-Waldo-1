import { mountForest } from "./Forest3D";
import type Phaser from "phaser";

// Original pixel artwork. All textures are local, deterministic, and generated once.
export function createArt(scene: Phaser.Scene): void {
  const texture = (
    key: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) => {
    const t = scene.textures.createCanvas(key, w, h)!;
    draw(t.context);
    t.refresh();
  };
  const palettes: Record<string, string> = {
    o: "#101c24",
    d: "#273c43",
    g: "#42625a",
    l: "#7e9c78",
    t: "#d9c89a",
    w: "#f8ecc5",
    b: "#479caa",
    r: "#ba6857",
    p: "#827193",
    y: "#d9ac5e",
  };
  const pixel = (key: string, rows: string[], colors = palettes) =>
    texture(key, rows[0].length, rows.length, (c) => {
      rows.forEach((row, y) =>
        [...row].forEach((v, x) => {
          if (colors[v]) {
            c.fillStyle = colors[v];
            c.fillRect(x, y, 1, 1);
          }
        }),
      );
    });
  pixel("warden", [
    "................",
    "......oooo......",
    ".....obbbbo.....",
    "....obbggbbo....",
    "....obttttbo....",
    "....obtotobo....",
    ".....otttto.....",
    "....obbbbbbo....",
    "...obbbgbbbbo...",
    "..otobbgbbboto..",
    "..otobgggbboyyo.",
    "....obgggbboywo.",
    "....obbbbbboyyo.",
    "....oddddddo....",
    "....ododdodo....",
    "....oo..oooo....",
  ]);
  pixel("slime", [
    "................",
    "................",
    "................",
    ".....oooooo.....",
    "...oogllllgoo...",
    "..ogllllllllgo..",
    ".ogllwwllllllgo.",
    ".ogllwlllllllgo.",
    ".oglloolloollgo.",
    ".oglloolloollgo.",
    ".ogllllllllllgo.",
    "..oggggggggggo..",
    "...oooooooooo...",
    "................",
    "................",
    "................",
  ]);
  pixel("bat", [
    "................",
    ".oo..........oo.",
    ".opo........opo.",
    ".oppo..oo..oppo.",
    ".oppopoppopoppo.",
    "..oppppppppppo..",
    "...opwpppwppo...",
    "....oppppppo....",
    ".....oppppo.....",
    "......oooo......",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ]);
  pixel(
    "wolf",
    [
      "................",
      "..oo......oo....",
      "..odo....odo....",
      "..oddooooodo....",
      "..oddddddddo....",
      "...odwddwdo.....",
      "....odttdo......",
      "...odddddd oo...",
      "..odddddddodo...",
      "..odddddddddo...",
      "...odddddd do...",
      "...oddoooddo....",
      "...odo...odo....",
      "...oo....oo.....",
      "................",
      "................",
    ].map((x) => x.replaceAll(" ", ".")),
  );
  pixel("golem", [
    ".....oooooo.....",
    "....odggggdo....",
    "...odgglgggdo...",
    "...odgwggwgdo...",
    "....odggggdo....",
    "..oooddddddooo..",
    ".odggdggggdggdo.",
    ".odggdglggdggdo.",
    ".odgddggggddgdo.",
    ".odddoddddo ddo.".replace(" ", "."),
    "..ooooggggoooo..",
    "....oddo ddo....".replace(" ", "."),
    "....oddo ddo....".replace(" ", "."),
    "....ooo..ooo....",
    "................",
    "................",
  ]);
  pixel("lich", [
    "..y..........y..",
    "..oy..y..y..yo..",
    "...oyyyyyyyyo...",
    "....otttttto....",
    "....otottoto....",
    "....otttttto....",
    ".....otttto.....",
    "....oppppppo....",
    "...opppwppppo...",
    "..oppppwpppppo..",
    ".opppppwppppppo.",
    ".oppdppwppdpppo.",
    "..opdpppppdppo..",
    "...odppppppdo...",
    "...oppppppppo...",
    "..oooooooooooo..",
  ]);
  pixel("gem", ["..bb..", ".bwwb.", "bwwwtb", "btwwtb", ".bttb.", "..bb.."]);
  pixel("bolt", [
    "....b...",
    "...bwb..",
    "bbwwwwbb",
    "wwwwwwww",
    "bbwwwwbb",
    "...bwb..",
    "....b...",
    "........",
  ]);
  pixel("knife", [
    ".......w",
    "......ww",
    ".....ww.",
    "....ww..",
    "...ww...",
    "..yy....",
    ".yd.....",
    "dd......",
  ]);
  pixel("orb", [
    "..yyyy..",
    ".ywwwty.",
    "ywwwwtty",
    "ywwwttty",
    "ywttttty",
    "ytttttty",
    ".ytttty.",
    "..yyyy..",
  ]);
  texture("ground", 256, 256, (c) => {
    c.fillStyle = "#152b2c";
    c.fillRect(0, 0, 256, 256);
    let s = 421;
    const rand = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 850; i++) {
      const x = Math.floor(rand() * 256),
        y = Math.floor(rand() * 256);
      c.fillStyle = ["#193132", "#1d3534", "#203a36", "#11282b"][i % 4];
      c.fillRect(x, y, 2 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 2));
    }
    for (let i = 0; i < 35; i++) {
      const x = (rand() * 256) | 0,
        y = (rand() * 256) | 0;
      c.fillStyle = "#2b443c";
      c.fillRect(x, y, 1, 3);
      c.fillRect(x + 2, y - 1, 1, 3);
    }
  });
  texture("tree", 64, 96, (c) => {
    c.fillStyle = "#0c2025";
    c.fillRect(29, 49, 8, 44);
    c.fillStyle = "#28403b";
    c.fillRect(31, 52, 2, 37);
    for (let i = 3; i >= 0; i--) {
      const y = 6 + i * 15,
        w = 13 + i * 7;
      c.fillStyle = i % 2 ? "#123032" : "#183a37";
      c.beginPath();
      c.moveTo(32, y - 5);
      c.lineTo(32 - w, y + 30);
      c.lineTo(32 + w, y + 30);
      c.fill();
      c.fillStyle = "#234a40";
      c.beginPath();
      c.moveTo(32, y - 4);
      c.lineTo(32 - w, y + 28);
      c.lineTo(29, y + 17);
      c.fill();
    }
  });
  texture("stone", 24, 28, (c) => {
    c.fillStyle = "#0e2428";
    c.fillRect(2, 23, 22, 4);
    c.fillStyle = "#3a4a47";
    c.fillRect(5, 7, 14, 18);
    c.fillRect(8, 4, 8, 3);
    c.fillStyle = "#53615a";
    c.fillRect(6, 7, 2, 15);
    c.fillRect(8, 5, 7, 2);
    c.fillStyle = "#253a39";
    c.fillRect(11, 10, 2, 10);
    c.fillRect(8, 13, 8, 2);
    c.fillStyle = "#627958";
    c.fillRect(5, 23, 7, 2);
  });
  texture("shrine", 64, 72, (c) => {
    c.fillStyle = "#263c3f";
    c.fillRect(3, 62, 58, 8);
    c.fillRect(8, 57, 48, 5);
    c.fillStyle = "#435658";
    c.fillRect(14, 12, 10, 45);
    c.fillRect(40, 12, 10, 45);
    c.fillRect(21, 5, 22, 10);
    c.fillStyle = "#67706a";
    c.fillRect(14, 12, 3, 45);
    c.fillRect(23, 5, 16, 3);
    c.fillRect(40, 14, 3, 40);
    c.fillStyle = "#172c32";
    c.fillRect(24, 15, 16, 42);
    c.fillStyle = "#c8ac69";
    c.fillRect(31, 22, 2, 23);
    c.fillRect(26, 31, 12, 2);
    c.fillStyle = "#eadd9f";
    c.fillRect(30, 30, 4, 4);
    c.fillStyle = "#405c47";
    c.fillRect(10, 55, 12, 4);
    c.fillRect(42, 11, 10, 4);
  });
  texture("circle", 32, 32, (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(16, 16, 16, 0, Math.PI * 2);
    c.fill();
  });
  texture("glow", 128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(241,190,91,0.22)");
    g.addColorStop(1, "rgba(241,190,91,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
}

export function titleLandscape(scene: Phaser.Scene): void {
  const forest = mountForest(document.querySelector<HTMLElement>("#shell")!);
  if (forest) {
    const redraw = () => forest.draw();
    redraw();
    window.addEventListener("resize", redraw);
    scene.events.once("shutdown", () => {
      window.removeEventListener("resize", redraw);
      forest.dispose();
    });
    return;
  }
  const g = scene.add.graphics();
  g.fillStyle(0x10292f).fillRect(0, 0, 640, 360);
  g.fillStyle(0x17363b).fillCircle(462, 102, 82);
  g.fillStyle(0xa9b6a0).fillCircle(462, 85, 33);
  g.fillStyle(0xcbd0ad).fillCircle(459, 82, 29);
  g.fillStyle(0x203d40, 0.8)
    .fillRect(388, 99, 160, 5)
    .fillRect(422, 112, 150, 3);
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 14; i++) {
      const x = i * 58 + ((i * 13 + layer * 31) % 40) - 30,
        y = 130 + layer * 48 + ((i * 17) % 40);
      scene.add
        .image(x, y, "tree")
        .setOrigin(0.5, 1)
        .setScale(1.3 + layer * 0.4)
        .setTint([0x547377, 0x77938a, 0xffffff][layer])
        .setAlpha(0.45 + layer * 0.2);
    }
  g.setDepth(-1);
  const floor = scene.add.graphics().setDepth(1);
  floor.fillStyle(0x12282b).fillRect(0, 266, 640, 94);
  for (let i = 0; i < 70; i++) {
    const y = 275 + ((i * 13) % 85),
      x = 310 + ((i * 37) % 270);
    floor
      .fillStyle(i % 2 ? 0x273b37 : 0x1e3432)
      .fillRect(x, y, 8 + (i % 15), 2);
  }
  scene.add.image(467, 250, "shrine").setScale(1.7).setDepth(2);
  scene.add.image(443, 275, "glow").setScale(2).setDepth(3);
  scene.add.image(428, 286, "warden").setScale(2.4).setDepth(4);
  scene.add.image(540, 298, "stone").setScale(1.6).setDepth(3);
  scene.add.image(610, 320, "tree").setScale(2.5).setDepth(5);
  scene.add.image(335, 352, "tree").setScale(2.1).setDepth(5).setTint(0x6d9182);
  for (let i = 0; i < 24; i++) {
    const p = scene.add
      .rectangle(
        290 + ((i * 67) % 340),
        155 + ((i * 47) % 160),
        1,
        1,
        0xe2c47b,
        0.65,
      )
      .setDepth(6);
    scene.tweens.add({
      targets: p,
      y: p.y - 14,
      alpha: 0.1,
      duration: 1800 + (i % 5) * 700,
      yoyo: true,
      repeat: -1,
      delay: i * 113,
    });
  }
}
