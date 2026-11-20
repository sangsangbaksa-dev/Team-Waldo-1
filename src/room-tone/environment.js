/* Retained studio finish, mechanical details and practical lights for the four recording wings. */
const WINGS = [
  {
    id: "A",
    paper: "#b5baa5",
    dado: "#536b60",
    trim: "#375348",
    floor: "#636a60",
    ink: "#31433e",
    accent: "#b9dfcc",
    lamp: "#c6ecda",
    stencil: "전원 정비 · 배전",
    english: "POWER MAINTENANCE",
  },
  {
    id: "B",
    paper: "#9d8f78",
    dado: "#625241",
    trim: "#40372d",
    floor: "#665f54",
    ink: "#493e30",
    accent: "#efbf78",
    lamp: "#ffce90",
    stencil: "송신 · 수신 제어",
    english: "TRANSMISSION CONTROL",
  },
  {
    id: "C",
    paper: "#98a0a1",
    dado: "#49565c",
    trim: "#333e44",
    floor: "#52595d",
    ink: "#323e45",
    accent: "#f1947d",
    lamp: "#f7b19a",
    stencil: "자기 테이프 · 보관",
    english: "MAGNETIC TAPE ARCHIVE",
  },
  {
    id: "D",
    paper: "#a8a798",
    dado: "#4c5b50",
    trim: "#343e38",
    floor: "#575b54",
    ink: "#353f37",
    accent: "#d5d391",
    lamp: "#e2eab2",
    stencil: "마스터 · 보존",
    english: "MASTER ARCHIVE",
  },
];
function hash(x, z, salt = 0) {
  let n =
    Math.imul(x + 141, 73856093) ^
    Math.imul(z + 373, 19349663) ^
    Math.imul(salt + 23, 83492791);
  n = Math.imul(n ^ (n >>> 16), 2246822507);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}
function seeded(seed) {
  let n = seed | 0;
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) | 0;
    return (n >>> 0) / 4294967296;
  };
}
function surface(w, h, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  draw(ctx, w, h);
  return canvas;
}
function box2d(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}
function line2d(c, x, y, xx, yy, color, width = 1) {
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(xx, yy);
  c.strokeStyle = color;
  c.lineWidth = width;
  c.stroke();
}
function text2d(
  c,
  str,
  x,
  y,
  size,
  color,
  weight = "600",
  family = "sans-serif",
) {
  c.fillStyle = color;
  c.font = weight + " " + size + "px " + family;
  c.fillText(str, x, y);
}
function screw(c, x, y, r = 3) {
  c.fillStyle = "#171a17";
  c.beginPath();
  c.arc(x, y, r + 1, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#818378";
  c.beginPath();
  c.arc(x + 0.3, y - 0.8, r, 0, Math.PI * 2);
  c.fill();
  line2d(
    c,
    x - r * 0.6,
    y + r * 0.5,
    x + r * 0.65,
    y - r * 0.7,
    "#333932",
    1.25,
  );
}
function grain(c, w, h, rng, scale = 12) {
  const im = c.getImageData(0, 0, w, h),
    a = im.data;
  for (let k = 0; k < a.length; k += 4) {
    const d = (rng() - 0.49) * scale;
    a[k] += d;
    a[k + 1] += d;
    a[k + 2] += d;
  }
  c.putImageData(im, 0, 0);
}
function scratches(c, w, h, rng, n = 200) {
  for (let i = 0; i < n; i++) {
    const x = rng() * w,
      y = rng() * h,
      len = 1 + rng() ** 3 * 22;
    line2d(
      c,
      x,
      y,
      x + len,
      y + (rng() - 0.45) * len * 0.24,
      rng() < 0.58 ? "rgba(22,26,23,.26)" : "rgba(219,215,191,.27)",
      0.4 + rng(),
    );
  }
}
function wallArt(p, chapter, variant) {
  const rand = seeded(803 + chapter * 79 + variant * 171);
  return surface(512, 512, (c, w, h) => {
    box2d(c, 0, 0, w, h, p.paper);
    const split = 314;
    box2d(c, 0, split, w, h - split, p.dado);
    for (let i = 0; i < 58; i++) {
      const x = rand() * w,
        y = rand() * h,
        r = 20 + rand() * 71;
      const shade = c.createRadialGradient(x, y, 0, x, y, r);
      shade.addColorStop(0, "rgba(59,55,42," + (0.018 + rand() * 0.045) + ")");
      shade.addColorStop(1, "rgba(59,55,42,0)");
      c.fillStyle = shade;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Painted masonry stays visible through the lower gloss paint.
    const row = chapter === 1 ? 72 : 40,
      col = chapter === 1 ? 43 : 104;
    for (let y = split; y < h; y += row) {
      box2d(c, 0, y, w, 1.4, "rgba(23,35,30,.45)");
      box2d(c, 0, y + 2, w, 1, "rgba(224,230,204,.18)");
      for (
        let x =
          -col + (chapter === 1 ? 0 : ((((y - split) / row) % 2) * col) / 2);
        x < w;
        x += col
      ) {
        box2d(c, x, y + 2, 1.3, row - 3, "rgba(22,30,25,.30)");
        box2d(c, x + 1.7, y + 4, 1, row - 6, "rgba(210,218,193,.18)");
        if (chapter === 1)
          for (let v = 0; v < 4; v++)
            line2d(
              c,
              x + 7 + v * 9,
              y + 3,
              x + 5 + v * 10,
              y + row - 3,
              "rgba(39,28,21,.25)",
              0.7,
            );
      }
    }
    box2d(c, 0, split - 3, w, 2, "rgba(65,64,49,.5)");
    for (let i = 0; i < 40; i++) {
      const x = rand() * w,
        y = rand() ** 2 * 385,
        len = 3 + rand() ** 2 * 71;
      const fade = c.createLinearGradient(0, y, 0, y + len);
      fade.addColorStop(0, "rgba(83,66,43," + (0.045 + rand() * 0.13) + ")");
      fade.addColorStop(1, "rgba(83,66,43,0)");
      box2d(c, x, y, 1 + rand() * 2.3, len, fade);
    }
    for (let i = 0; i < 8; i++) {
      const x = rand() * w,
        y = 25 + rand() * 190;
      c.beginPath();
      c.moveTo(x, y);
      let xx = x,
        yy = y;
      const steps = 2 + Math.floor(rand() * 5);
      for (let j = 0; j < steps; j++) {
        xx += (rand() - 0.45) * 12;
        yy += 3 + rand() * 9;
        c.lineTo(xx, yy);
      }
      c.strokeStyle = "rgba(55,50,41,.22)";
      c.lineWidth = 0.65;
      c.stroke();
    }
    const base = c.createLinearGradient(0, 444, 0, 512);
    base.addColorStop(0, "rgba(30,33,26,0)");
    base.addColorStop(1, "rgba(19,24,21,.34)");
    box2d(c, 0, 444, w, 68, base);
    const over = c.createLinearGradient(0, 0, 0, 71);
    over.addColorStop(0, "rgba(39,37,29,.22)");
    over.addColorStop(1, "rgba(39,37,29,0)");
    box2d(c, 0, 0, w, 71, over);
    scratches(c, w, h, rand, 245);
    grain(c, w, h, rand, 13);
  });
}
function floorArt(p, chapter) {
  const rand = seeded(821 + chapter * 83);
  return surface(512, 512, (c, w, h) => {
    box2d(c, 0, 0, w, h, p.floor);
    if (chapter === 2) {
      // Archive wing: poured concrete with broad expansion joints and trolley wear.
      for (const edge of [0,256]) {
        box2d(c,edge,0,3,h,"rgba(18,23,24,.65)");
        box2d(c,0,edge,w,3,"rgba(18,23,24,.65)");
      }
      for (let j=0;j<18;j++){
        const x=rand()*w,y=rand()*h,r=18+rand()*75;
        const stain=c.createRadialGradient(x,y,0,x,y,r);
        stain.addColorStop(0,"rgba(27,25,21,.13)");
        stain.addColorStop(1,"rgba(27,25,21,0)");
        box2d(c,x-r,y-r,r*2,r*2,stain);
      }
      for(const x of [116,396])box2d(c,x,0,9,h,"rgba(24,28,27,.12)");
    } else {
      // Power: ceramic squares. Radio: narrow rubber strips. Master: dark acoustic tiles.
      const cols=chapter===1?8:4, rows=chapter===1?2:4;
      const tw=w/cols, th=h/rows;
      for (let z=0;z<rows;z++) for(let x=0;x<cols;x++){
        const xx=x*tw,yy=z*th;
        box2d(c,xx,yy,tw,th,"rgba(13,18,15,"+rand()*.11+")");
        box2d(c,xx,yy,tw,chapter===3?1.4:2.5,"rgba(15,18,16,.68)");
        box2d(c,xx,yy,chapter===3?1.4:2.5,th,"rgba(15,18,16,.68)");
        box2d(c,xx+3,yy+3,tw-6,1,"rgba(218,215,193,.23)");
        box2d(c,xx+3,yy+3,1,th-5,"rgba(218,215,193,.18)");
        if(chapter===1)for(let groove=8;groove<tw-4;groove+=8)
          box2d(c,xx+groove,yy+5,1,th-10,"rgba(18,22,19,.15)");
        if(chapter===3)for(let py=8;py<th-4;py+=8)for(let px=8;px<tw-4;px+=8)
          box2d(c,xx+px,yy+py,1.3,1.3,"rgba(21,24,18,.26)");
      }
    }
    for (let i = 0; i < 11000; i++) {
      const x = rand() * w,
        y = rand() * h,
        r = 0.4 + rand() ** 2 * 1.6;
      box2d(
        c,
        x,
        y,
        r,
        r * 0.58,
        rand() < 0.64 ? "rgba(200,203,183,.22)" : "rgba(28,35,30,.32)",
      );
    }
    scratches(c, w, h, rand, 400);
    grain(c, w, h, rand, 8);
  });
}
function ceilingArt() {
  const rand = seeded(1201);
  return surface(256, 256, (c, w, h) => {
    box2d(c, 0, 0, w, h, "#686a60");
    for (let i = 0; i < 3500; i++)
      box2d(
        c,
        rand() * 256,
        rand() * 256,
        rand() * 3 + 1,
        1,
        "rgba(34,39,32,.25)",
      );
    for (const n of [0, 128]) {
      box2d(c, n, 0, 2, h, "#373b35");
      box2d(c, 0, n, w, 2, "#373b35");
    }
    grain(c, w, h, rand, 10);
  });
}
function equipmentArt(type, p, chapter) {
  const rand = seeded(4999 + chapter * 923 + type.charCodeAt(0));
  return surface(512, 384, (c, w, h) => {
    if (type === "panel") {
      box2d(c, 0, 0, w, h, "#2d302b");
      for (let y = 11; y < 377; y += 15) {
        for (let x = 7; x < 510; x += 17) {
          const off = (Math.floor((y - 11) / 15) % 2) * 8;
          c.fillStyle = "#151b18";
          c.beginPath();
          c.ellipse(x + off, y, 3.4, 4.0, 0, 0, 2 * Math.PI);
          c.fill();
          line2d(c, x + off - 2, y + 3.5, x + off + 2, y + 3.5, "#53554a", 0.8);
        }
      }
      for (const x of [7, w - 7]) for (const y of [7, h - 7]) screw(c, x, y, 2);
    } else if (type === "meter") {
      box2d(c, 0, 0, w, h, "#363d39");
      text2d(c, "LINE MONITOR", 22, 41, 23, "#c5c6ac", "700", "monospace");
      text2d(
        c,
        "STEREO  /  2 CHANNEL",
        24,
        62,
        12,
        "#a7a994",
        "500",
        "monospace",
      );
      for (let i = 0; i < 2; i++) {
        const xx = 26 + i * 234,
          yy = 83;
        box2d(c, xx, yy, 220, 123, "#1e2420");
        box2d(c, xx + 5, yy + 5, 210, 108, "#b7a779");
        c.beginPath();
        c.arc(xx + 110, yy + 115, 84, Math.PI * 1.16, Math.PI * 1.84);
        c.strokeStyle = "#413f30";
        c.lineWidth = 1.8;
        c.stroke();
        for (let j = 0; j < 25; j++) {
          const a = Math.PI * (1.16 + (j * 0.68) / 24),
            r = j % 4 ? 80 : 74;
          line2d(
            c,
            xx + 110 + r * Math.cos(a),
            yy + 115 + r * Math.sin(a),
            xx + 110 + 86 * Math.cos(a),
            yy + 115 + 86 * Math.sin(a),
            j > 17 ? "#934a35" : "#484536",
            j % 4 ? 1 : 2.5,
          );
        }
        const a = (i ? 1.41 : 1.55) * Math.PI;
        line2d(
          c,
          xx + 110,
          yy + 114,
          xx + 110 + 82 * Math.cos(a),
          yy + 115 + 82 * Math.sin(a),
          "#873b29",
          2.6,
        );
        text2d(c, "VU", xx + 99, yy + 87, 16, "#53503f", "700", "serif");
      }
      for (let i = 0; i < 7; i++) {
        const x = 41 + i * 71,
          y = 270;
        c.fillStyle = "#1c211d";
        c.beginPath();
        c.arc(x, y, 19, 0, 2 * Math.PI);
        c.fill();
        c.strokeStyle = "#73766a";
        c.lineWidth = 2;
        c.stroke();
        const a = rand() * 4 - 2;
        line2d(
          c,
          x,
          y,
          x + 14 * Math.sin(a),
          y - 14 * Math.cos(a),
          "#bdbca2",
          2,
        );
        box2d(c, x - 14, y + 30, 28, 3, "#b3ac8e");
      }
      for (let i = 0; i < 45; i++) box2d(c, 15 + i * 11, 343, 6, 13, "#1e2521");
    } else if (type === "cabinet") {
      box2d(c, 0, 0, w, h, "#454d44");
      box2d(c, 12, 12, w - 24, h - 24, "#677064");
      box2d(c, 23, 24, 466, 335, "#464d43");
      box2d(c, 27, 28, 458, 327, "#6d7568");
      box2d(c, 52, 55, 234, 57, "#d0cbb3");
      text2d(c, "분전반", 67, 94, 34, "#353e35", "700");
      text2d(
        c,
        "DISTRIBUTION   /   220 V",
        54,
        141,
        19,
        "#353e35",
        "600",
        "monospace",
      );
      for (let i = 0; i < 7; i++) box2d(c, 59, 203 + i * 12, 124, 4, "#384237");
      box2d(c, 424, 163, 15, 61, "#353d35");
      box2d(c, 429, 174, 5, 43, "#a4a797");
      for (const x of [15, w - 15])
        for (const y of [15, h - 15]) screw(c, x, y, 3);
    } else if (type === "vent") {
      box2d(c, 0, 0, w, h, "#545d55");
      box2d(c, 14, 16, 484, 352, "#1e2622");
      for (let i = 0; i < 16; i++) {
        const y = 21 + i * 21;
        box2d(c, 18, y, 476, 12, "#626b60");
        box2d(c, 20, y, 472, 2, "#909388");
        box2d(c, 19, y + 11, 474, 3, "#343a33");
      }
      for (const x of [8, w - 8]) for (const y of [8, h - 8]) screw(c, x, y, 3);
    } else if (type === "zone") {
      box2d(c, 0, 0, w, h, "#d2d0b6");
      box2d(c, 0, 0, 16, h, p.trim);
      text2d(c, p.id, 33, 273, 253, p.ink, "700", "sans-serif");
      text2d(c, "녹음동", 302, 87, 33, p.ink, "700");
      c.save();
      c.beginPath();
      c.rect(302, 95, 200, 29);
      c.clip();
      c.font = "700 14px monospace";
      c.fillStyle = p.ink;
      c.fillText(p.english, 302, 113, 195);
      c.restore();
      for (let i = 0; i < 5; i++)
        box2d(c, 305, 145 + i * 15, 140 - i * 17, 5, p.ink);
      box2d(c, 38, 299, 433, 3, p.ink);
      text2d(c, p.stencil, 40, 348, 26, p.ink, "600");
      for (const x of [8, w - 8])
        for (const y of [9, h - 9]) screw(c, x, y, 2.5);
    } else if (type === "pass") {
      box2d(c, 0, 0, w, h, "#c7c5ad");
      box2d(c, 0, 0, w, 60, p.trim);
      text2d(c, "기술 설비", 25, 44, 32, "#dad8c0", "700");
      text2d(c, "TECHNICAL SERVICES", 27, 105, 24, p.ink, "700", "monospace");
      line2d(c, 25, 121, 478, 121, p.ink, 3);
      for (let j = 0; j < 5; j++) {
        text2d(
          c,
          [
            "입실 전 전원 확인",
            "기록실 내 정숙",
            "환기 장치 점검",
            "배선 통로 확보",
            "출입 후 문단속",
          ][j],
          57,
          159 + j * 42,
          21,
          p.ink,
          "500",
        );
        c.strokeStyle = p.ink;
        c.lineWidth = 1.7;
        c.strokeRect(30, 144 + j * 42, 13, 13);
      }
    } else if (type === "tape") {
      box2d(c, 0, 0, w, h, "#252d2b");
      box2d(c, 8, 8, 496, 368, "#454b42");
      box2d(c, 18, 15, 476, 31, "#282f2b");
      text2d(
        c,
        "BROADCAST   /   REPRODUCER",
        30,
        38,
        15,
        "#c2c2a9",
        "600",
        "monospace",
      );
      for (const x of [151, 361]) {
        const y = 157;
        c.beginPath();
        c.arc(x, y, 83, 0, 2 * Math.PI);
        c.fillStyle = "#222925";
        c.fill();
        c.beginPath();
        c.arc(x, y, 75, 0, 2 * Math.PI);
        c.fillStyle = "#8f9584";
        c.fill();
        for (let j = 0; j < 3; j++) {
          const a = (j * 2 * Math.PI) / 3;
          c.save();
          c.translate(x + 40 * Math.cos(a), y + 40 * Math.sin(a));
          c.rotate(a + Math.PI / 2);
          c.fillStyle = "#333c33";
          c.beginPath();
          c.ellipse(0, 0, 27, 13, 0, 0, 7);
          c.fill();
          c.restore();
        }
        screw(c, x, y, 6);
      }
      line2d(c, 79, 183, 193, 277, "#1d231d", 4);
      line2d(c, 193, 277, 318, 277, "#1d231d", 4);
      line2d(c, 318, 277, 434, 182, "#1d231d", 4);
      box2d(c, 173, 259, 167, 29, "#858975");
      for (let i = 0; i < 6; i++)
        box2d(c, 36 + i * 54, 317, 43, 30, i === 0 ? "#9a5942" : "#7d8473");
      for (const x of [403, 457]) {
        c.fillStyle = "#1b201c";
        c.beginPath();
        c.arc(x, 333, 14, 0, 7);
        c.fill();
      }
    }
    scratches(c, w, h, rand, 190);
    grain(c, w, h, rand, 8);
  });
}

export function buildEnvironment(THREE, scene, map, tile, chapter) {
  chapter = Math.max(0, Math.min(3, Math.floor(chapter) || 0));
  const p = WINGS[chapter],
    root = new THREE.Group();
  root.name = "Recording facility · " + p.id;
  scene.add(root);
  const resources = new Set(),
    batch = new Map();
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
  };
  resources.add(geometry.box);
  resources.add(geometry.plane);
  const texture = (canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    resources.add(tex);
    return tex;
  };
  function standard(options) {
    const material = new THREE.MeshStandardMaterial(options);
    resources.add(material);
    return material;
  }
  const texMat = (canvas, options = {}) =>
    standard({
      map: texture(canvas),
      roughness: 0.84,
      metalness: 0.06,
      ...options,
    });
  const wallMats = [0, 1, 2].map((i) => texMat(wallArt(p, chapter, i)));
  const floorMat = texMat(floorArt(p, chapter), {
    roughness: [0.57,0.85,0.94,0.87][chapter],
    metalness: [0.12,0.04,0.03,0.02][chapter],
  });
  const ceilingMat = texMat(ceilingArt());
  const paint = standard({ color: p.trim, roughness: 0.79, metalness: 0.22 });
  const metal = standard({ color: 0x6a7167, metalness: 0.47, roughness: 0.61 });
  const seam = standard({ color: 0x27332d, roughness: 0.88 });
  const practical = standard({
    color: p.lamp,
    emissive: p.lamp,
    emissiveIntensity: 1.42,
    roughness: 0.36,
  });
  const alarm = standard({
    color: 0xa3472e,
    emissive: 0xcf582e,
    emissiveIntensity: 0.72,
    roughness: 0.45,
  });
  const inactive = standard({ color: 0x8e9487, roughness: 0.73 });
  const junctionPaint = standard({color:p.accent, roughness:.85, emissive:p.accent, emissiveIntensity:.09});
  const badgeMats = {};
  for (const type of [
    "panel",
    "meter",
    "cabinet",
    "vent",
    "zone",
    "pass",
    "tape",
  ])
    badgeMats[type] = texMat(equipmentArt(type, p, chapter), {
      roughness: type === "meter" || type === "tape" ? 0.57 : 0.83,
    });
  const trans = new THREE.MeshBasicMaterial({
    color: p.lamp,
    transparent: true,
    opacity: 0.17,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    map: texture(
      surface(128, 128, (ctx, w, h) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, "rgba(255,255,255,.9)");
        g.addColorStop(0.3, "rgba(255,255,255,.4)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        box2d(ctx, 0, 0, w, h, g);
      }),
    ),
  });
  resources.add(trans);
  // Soft baked light pools: one shared texture, no additional real-time lights.
  const pool = new THREE.MeshBasicMaterial({
    color:p.lamp, map:trans.map, transparent:true, opacity:.12,
    depthWrite:false, blending:THREE.AdditiveBlending,
    polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1,
  });
  resources.add(pool);
  const dirt = new THREE.MeshBasicMaterial({
    color:0x141b16, map:trans.map, transparent:true, opacity:.26, depthWrite:false,
    polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1,
  });
  resources.add(dirt);
  const dummy = new THREE.Object3D();
  function add(kind, mat, x, y, z, w, h, d = 1, ry = 0, rx = 0) {
    let byKind = batch.get(mat);
    if (!byKind) {
      byKind = {};
      batch.set(mat, byKind);
    }
    if (!byKind[kind]) byKind[kind] = [];
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, 0, "YXZ");
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    byKind[kind].push(dummy.matrix.clone());
  }
  const open = (x, z) =>
    z >= 0 &&
    z < map.length &&
    x >= 0 &&
    x < map[z].length &&
    map[z][x] !== "#";
  const H = 3,
    dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
  let surfaces = 0;
  for (let row = 0; row < map.length; row++)
    for (let col = 0; col < map[row].length; col++) {
      if (!open(col, row)) continue;
      const x = col * tile,
        z = row * tile;
      const north = open(col, row - 1),
        south = open(col, row + 1),
        east = open(col + 1, row),
        west = open(col - 1, row);
      const alongZ = north && south && !(east && west),
        orient = alongZ ? Math.PI / 2 : 0;
      add(
        "plane",
        floorMat,
        x,
        0,
        z,
        tile + 0.003,
        tile + 0.003,
        1,
        0,
        -Math.PI / 2,
      );
      add(
        "plane",
        ceilingMat,
        x,
        H,
        z,
        tile + 0.003,
        tile + 0.003,
        1,
        0,
        Math.PI / 2,
      );
      // Subtle worn floor markings distinguish intersections without revealing puzzle paths.
      if (Number(north) + Number(south) + Number(east) + Number(west) >= 3) {
        for (const side of [-1, 1]) {
          add("box", junctionPaint, x + side * tile * .36, .006, z, .055, .012, tile * .55);
          add("box", junctionPaint, x, .006, z + side * tile * .36, tile * .55, .012, .055);
        }
      }
      // Distinct overhead gantries give each passage a physical rhythm.
      // All added pieces stay above the player's collision envelope.
      if ((col + row * 2) % 5 === 0) {
        const cross = alongZ ? 0 : Math.PI / 2;
        add("box", seam, x, H - .13, z, tile - .035, .25, .15, cross);
        add("box", metal, x, H - .265, z, tile - .08, .032, .19, cross);
        for (const sign of [-1, 1]) {
          const u = sign * (tile * .5 - .21);
          add("box", metal, x + Math.cos(cross) * u, H - .19,
            z - Math.sin(cross) * u, .16, .28, .25, cross);
        }
      }
      // Cable bundles and vent trunks are chapter-specific, not additional dynamic lights.
      if (chapter >= 1 && hash(col, row, 92) > .78) {
        for (let cable = 0; cable < (chapter === 2 ? 3 : 2); cable++) {
          const offset = .65 + cable * .12;
          add("box", cable === 0 ? paint : seam,
            x + Math.sin(orient) * offset, H - .21,
            z + Math.cos(orient) * offset, tile - .06, .065, .07, orient);
        }
      }
      // Only shallow or overhead objects enter navigable cells.
      if ((row * 3 + col) % 4 === 0) {
        add("box", seam, x, H - 0.033, z, 1.5, 0.066, 0.31, orient);
        add("box", metal, x, H - 0.071, z, 1.39, 0.044, 0.24, orient);
        const lit = hash(col, row, 17) > 0.13;
        for (const s of [-1, 1]) {
          const offset = s * 0.06;
          add(
            "box",
            lit ? practical : inactive,
            x + Math.sin(orient) * offset,
            H - 0.107,
            z + Math.cos(orient) * offset,
            1.25,
            0.033,
            0.032,
            orient,
          );
        }
        if(lit){
          add("plane",pool,x,.003,z,tile*.86,tile*.70,1,orient,-Math.PI/2);
        }
        if (lit)
          add(
            "plane",
            trans,
            x,
            H - 0.127,
            z,
            2.18,
            1.25,
            1,
            orient,
            Math.PI / 2,
          );
      } else if ((col * 7 + row * 5) % 17 === 0) {
        add(
          "plane",
          badgeMats.vent,
          x,
          H - 0.012,
          z,
          0.75,
          0.48,
          1,
          orient,
          Math.PI / 2,
        );
      }
      for (let f = 0; f < 4; f++) {
        const [dx, dz] = dirs[f];
        if (open(col + dx, row + dz)) continue;
        surfaces++;
        const nx = -dx,
          nz = -dz,
          bx = x + dx * tile * 0.5,
          bz = z + dz * tile * 0.5,
          ry = Math.atan2(nx, nz);
        const sx = Math.cos(ry),
          sz = -Math.sin(ry);
        const local = (kind, mat, u, y, depth, w, h, d = 1) =>
          add(
            kind,
            mat,
            bx + sx * u + nx * depth,
            y,
            bz + sz * u + nz * depth,
            w,
            h,
            d,
            ry,
          );
        const pick = hash(col, row, (f + 1) * 19 + chapter * 47);
        // Contact darkening visually anchors baseboards without shadow maps.
        if (pick < .62) {
          add("plane",dirt,bx+nx*.27,.002,bz+nz*.27,tile*.95,.52,1,ry,-Math.PI/2);
        }
        local(
          "plane",
          wallMats[Math.floor(hash(col, row, f + 75) * 3)],
          0,
          H / 2,
          0,
          tile + 0.003,
          H + 0.002,
        );
        local("box", paint, 0, 0.108, 0.025, tile + 0.004, 0.216, 0.05);
        local("box", metal, 0, 1.157, 0.025, tile + 0.003, 0.035, 0.048);
        local("box", seam, 0, 1.134, 0.015, tile + 0.003, 0.014, 0.029);
        // Exposed cable tray and pipe straps create continuity between neighboring rooms.
        local("box", metal, 0, 2.694, 0.038, tile + 0.003, 0.041, 0.045);
        local("box", paint, 0, 2.769, 0.045, tile + 0.003, 0.058, 0.062);
        local("box", seam, -tile * 0.33, 2.738, 0.048, 0.044, 0.12, 0.085);
        const every = (row + col + f) % 3;
        if (every === 0)
          local("box", metal, tile * 0.38, 2.736, 0.046, 0.028, 0.12, 0.072);
        function plate(kind, u, y, w, h, depth = 0.043) {
          local("box", seam, u, y, depth * 0.48, w + 0.031, h + 0.035, depth);
          local("plane", badgeMats[kind], u, y, depth + 0.002, w, h);
        }
        if (pick < 0.061) {
          plate("zone", -0.19, 1.97, 0.97, 0.73);
        } else if (pick < 0.126) {
          plate("meter", -0.2, 1.62, 0.93, 0.7, 0.094);
          local("box", metal, 0.37, 2.1, 0.037, 0.025, 1.06, 0.032);
          local("box", alarm, 0.207, 1.86, 0.114, 0.027, 0.025, 0.016);
        } else if (pick < 0.189) {
          plate("tape", 0.02, 1.62, 0.86, 0.65, 0.106);
          local("box", paint, 0.02, 1.255, 0.105, 1.01, 0.073, 0.213);
        } else if (pick < 0.244) {
          plate("cabinet", 0.22, 1.61, 0.67, 0.75, 0.078);
          local("box", metal, -0.013, 2.337, 0.047, 0.041, 0.747, 0.041);
        } else if (pick < 0.326) {
          plate("vent", -0.27, 2.12, 0.81, 0.36);
        } else if (pick < 0.35) {
          plate("pass", 0.3, 1.75, 0.49, 0.565, 0.017);
        } else if (pick < (chapter === 1 ? 0.83 : 0.54)) {
          // Air gaps, timber/metal reveals and perforated acoustic faces.
          for (const u of [-0.55, 0.04, 0.63]) {
            local("box", seam, u, 1.91, 0.041, 0.54, 0.97, 0.082);
            local("plane", badgeMats.panel, u, 1.91, 0.084, 0.503, 0.927);
          }
        } else if (pick < .68 && chapter >= 2) {
          // Storage-wing patch panels and master-room signal buses, kept flush to walls.
          local("box", seam, 0, 1.65, .041, 1.08, .46, .082);
          for (let k = 0; k < 6; k++) {
            const u = -.42 + k * .168;
            local("box", metal, u, 1.66, .086, .105, .30, .036);
            local("box", k === (row + col) % 6 ? alarm : practical, u, 1.74, .108, .043, .025, .013);
            local("box", paint, u, 1.48, .038, .026, .14, .044);
          }
        } else if (pick < .78 && chapter === 0) {
          // Electrical conduit panel with insulated vertical runs and mounting collars.
          local("box", seam, 0, 1.81, .034, .86, .96, .068);
          for(let k=0;k<4;k++){
            const u=(k-1.5)*.16;
            local("box", metal, u, 1.94, .09, .048, 1.04, .053);
            local("box", paint, u, 1.52, .125, .095,.17,.08);
            local("box", seam, u, 2.15, .12, .087,.04,.06);
          }
        } else if (pick >= .83 && pick < .94 && chapter === 1) {
          // Recessed-looking patch bay, stacked ports and connection labels.
          local("box", seam, 0, 1.76, .055, 1.02,.72,.11);
          local("box", metal, 0, 1.76, .122, .95,.64,.018);
          for(let r=0;r<3;r++)for(let k=0;k<6;k++){
            const u=(k-2.5)*.143, y=1.56+r*.175;
            local("box", seam, u, y, .14,.11,.073,.022);
            local("box", k%3===r?practical:paint,u+.035,y+.052,.15,.018,.014,.014);
          }
        } else if (pick >= .68 && pick < .82 && chapter === 2) {
          // Shallow tape catalog drawers: handles, dividers and paper index strips.
          local("box", seam, 0, 1.55, .075, 1.34,1.32,.15);
          for(let k=0;k<5;k++){
            const y=1.04+k*.25;
            local("box", metal, 0,y,.164,1.23,.217,.044);
            local("box", paint,-.38,y,.195,.29,.08,.018);
            local("box", seam,.30,y,.205,.24,.044,.04);
            local("box", metal,.30,y+.029,.22,.18,.024,.025);
          }
        } else if (pick >= .68 && pick < .84 && chapter === 3) {
          // Acoustic diffuser fins, stepped depths produce a recognizable texture.
          local("box", seam,0,1.85,.025,1.46,1.24,.05);
          for(let k=0;k<13;k++){
            const depth=.048+(k%5)*.026;
            local("box", k%3===0?paint:metal,(k-6)*.105,1.85,depth/2+.025,.078,1.12,depth);
          }
        } else if (pick > 0.955) {
          local("box", metal, -0.47, 1.96, 0.052, 0.046, 1.46, 0.046);
          local("box", paint, -0.47, 1.37, 0.075, 0.211, 0.28, 0.13);
          local("box", alarm, -0.47, 1.382, 0.144, 0.096, 0.087, 0.025);
        }
      }
    }
  for (const [mat, kinds] of batch) {
    for (const [kind, matrices] of Object.entries(kinds)) {
      const obj = new THREE.InstancedMesh(geometry[kind], mat, matrices.length);
      for (let i = 0; i < matrices.length; i++) obj.setMatrixAt(i, matrices[i]);
      obj.instanceMatrix.needsUpdate = true;
      obj.computeBoundingSphere();
      root.add(obj);
    }
  }
  root.userData.exposedWallFaces = surfaces;
  root.userData.dispose = () => {
    root.removeFromParent();
    for (const obj of root.children) if (obj.isInstancedMesh) obj.dispose();
    for (const obj of resources) obj.dispose();
    root.clear();
  };
  return root;
}
