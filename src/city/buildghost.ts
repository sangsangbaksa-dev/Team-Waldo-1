// LAST CITY — 건설 미리보기(고스트): 바닥에 깔리는 반투명 발자국 + 테두리 + 건물 높이의 선 윤곽.
// 속이 찬 상자를 눈앞에 띄우지 않으므로 가까이 지어도 시야를 가리지 않고, 건물 크기·놓일 자리가 한눈에 보입니다.
import * as THREE from 'three';

export const GHOST_OK = 0x5dffa0, GHOST_BAD = 0xff5a5a;
const PAD_Y = 1.4, EDGE_W = 3;

export class BuildGhost {
  readonly group = new THREE.Group();
  private pad: THREE.Mesh; private strips: THREE.Mesh[] = []; private edges: THREE.LineSegments; private xray: THREE.LineSegments; private vol: THREE.Mesh;
  private mats: (THREE.MeshBasicMaterial | THREE.LineBasicMaterial)[] = [];

  constructor() {
    const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const basic = (opacity: number, depthTest = true): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity, depthWrite: false, depthTest, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.mats.push(m); return m;
    };
    this.pad = new THREE.Mesh(flat, basic(0.3)); this.pad.position.y = PAD_Y; this.pad.renderOrder = 6;
    const edgeMat = basic(0.95);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(flat, edgeMat); m.position.y = PAD_Y + 0.2; m.renderOrder = 7; this.strips.push(m); }
    const lm = new THREE.LineBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.85, depthWrite: false }); this.mats.push(lm);
    this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), lm); this.edges.renderOrder = 7;
    // 건물·벽 뒤에 가려져도 윤곽선만은 희미하게 비쳐 보이게 합니다.
    const xm = new THREE.LineBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false }); this.mats.push(xm);
    this.xray = new THREE.LineSegments(this.edges.geometry, xm); this.xray.renderOrder = 8;
    this.vol = new THREE.Mesh(box, basic(0.06)); this.vol.renderOrder = 6;
    this.group.add(this.pad, ...this.strips, this.edges, this.xray, this.vol); this.group.visible = false;
    for (const o of [this.pad, ...this.strips, this.edges, this.xray, this.vol]) o.frustumCulled = false;
  }

  /** 위치(x,z 월드)·발자국(w×d)·높이·유효 여부를 반영합니다. t 는 깜박임용 시간(초). */
  update(g: { x: number; y: number; w: number; d: number; height: number; ok: boolean } | null, t: number): void {
    this.group.visible = !!g; if (!g) return;
    const color = g.ok ? GHOST_OK : GHOST_BAD, pulse = g.ok ? 0.3 + 0.07 * Math.sin(t * 5) : 0.38;
    for (const m of this.mats) m.color.setHex(color);
    (this.pad.material as THREE.MeshBasicMaterial).opacity = pulse;
    this.group.position.set(g.x, 0, g.y);
    this.pad.scale.set(g.w, 1, g.d);
    const hw = g.w / 2, hd = g.d / 2;
    const s = this.strips; // 앞·뒤·왼·오 테두리
    s[0].position.set(0, PAD_Y + 0.2, -hd + EDGE_W / 2); s[0].scale.set(g.w, 1, EDGE_W);
    s[1].position.set(0, PAD_Y + 0.2, hd - EDGE_W / 2); s[1].scale.set(g.w, 1, EDGE_W);
    s[2].position.set(-hw + EDGE_W / 2, PAD_Y + 0.2, 0); s[2].scale.set(EDGE_W, 1, g.d - EDGE_W * 2);
    s[3].position.set(hw - EDGE_W / 2, PAD_Y + 0.2, 0); s[3].scale.set(EDGE_W, 1, g.d - EDGE_W * 2);
    this.edges.scale.set(g.w, g.height, g.d); this.xray.scale.copy(this.edges.scale); this.vol.scale.set(g.w, g.height, g.d);
  }
}
