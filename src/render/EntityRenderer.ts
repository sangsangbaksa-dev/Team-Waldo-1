import Phaser from 'phaser';
import type { Pool } from '../sim/pool';

/**
 * sim 풀 하나를 화면의 스프라이트들과 맞춘다. 엔티티 id로 스프라이트를 추적하고,
 * 사라진 엔티티의 스프라이트는 풀에 돌려놓았다가 재사용한다.
 * 지금은 색칠한 원(플레이스홀더)이며, 아트가 준비되면 texture/frame만 바꾸면 된다.
 */
export class EntityRenderer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();
  private readonly free: Phaser.GameObjects.Image[] = [];
  private readonly alive = new Set<number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
    private readonly tintOf: (kind: number) => number,
  ) {}

  /** alpha: 이전 틱(0)과 현재 틱(1) 사이 보간 비율 */
  draw(pool: Readonly<Pool>, alpha: number): void {
    const { sprites, alive } = this;
    alive.clear();
    for (let i = 0; i < pool.count; i++) {
      const id = pool.id[i];
      alive.add(id);
      let s = sprites.get(id);
      if (!s) {
        s = this.free.pop() ?? this.scene.add.image(0, 0, 'circle').setDepth(this.depth);
        s.setVisible(true).setTint(this.tintOf(pool.kind[i])).setDisplaySize(pool.r[i] * 2, pool.r[i] * 2);
        sprites.set(id, s);
      }
      s.setPosition(
        pool.px[i] + (pool.x[i] - pool.px[i]) * alpha,
        pool.py[i] + (pool.y[i] - pool.py[i]) * alpha,
      );
    }
    for (const [id, s] of sprites) {
      if (alive.has(id)) continue;
      s.setVisible(false);
      this.free.push(s);
      sprites.delete(id);
    }
  }
}
