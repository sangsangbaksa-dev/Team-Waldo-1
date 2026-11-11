import type { SimEvent } from '../sim';

/**
 * SimEvent를 효과음으로 바꾸는 자리. 아직 오디오 에셋이 없어서 비어 있다.
 * fire, hit처럼 잦은 이벤트는 틱당 재생 수를 제한할 것.
 */
export class AudioBridge {
  handle(_e: SimEvent): void {
    // TODO(화면 담당): public/assets/audio가 준비되면 연결
  }
}
