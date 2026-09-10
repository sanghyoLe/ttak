import { clamp, type SceneId } from './game';

export type Trap = {
  id: string;
  title: string;
  detail: string;
  retryHint: string;
  holdLabel: string;
  holdSeconds: number;
  suspense: number;
};

export const TRAPS: Record<SceneId, readonly Trap[]> = {
  slot: [
    { id: 'grow', title: '치수가 방금 바뀌었습니다.', detail: '조각이 3% 자랐습니다. 사용에는 지장이 있습니다.', retryHint: '이번에는 치수를 맞춰 두었습니다.', holdLabel: '꾹 눌러 끼우기', holdSeconds: 0.85, suspense: 0.65 },
    { id: 'turn', title: '방향이 마음에 안 드셨답니다.', detail: '다 들어가 놓고 혼자 돌아갔습니다.', retryHint: '회전 기능을 꺼 두었습니다.', holdLabel: '꾹 눌러 끼우기', holdSeconds: 1.05, suspense: 1.05 },
    { id: 'exchange', title: '하나 넣으면 하나 나옵니다.', detail: '총 조각 수는 정확합니다.', retryHint: '이번 조각은 평범해 보입니다.', holdLabel: '꾹 눌러 끼우기', holdSeconds: 0.75, suspense: 0.85 },
  ],
  circle: [
    { id: 'escape', title: '홈이 자리를 비웠습니다.', detail: '조금 전까지는 여기 있었습니다.', retryHint: '이번엔 도망가지 못하게 했습니다.', holdLabel: '꾹 눌러 고정하기', holdSeconds: 0.8, suspense: 0.6 },
    { id: 'lid', title: '영업이 종료되었습니다.', detail: '도착하자마자 홈이 닫혔습니다.', retryHint: '다시 문을 열었습니다.', holdLabel: '꾹 눌러 고정하기', holdSeconds: 0.9, suspense: 0.85 },
    { id: 'through', title: '통과는 잘 됐습니다.', detail: '바닥이 있다는 말씀은 안 드렸습니다.', retryHint: '바닥을 확인해 두겠습니다.', holdLabel: '꾹 눌러 고정하기', holdSeconds: 0.7, suspense: 1.15 },
  ],
  stack: [
    { id: 'domino', title: '옆분들까지 퇴근하셨습니다.', detail: '하나만 넣었는데 다 같이 누웠습니다.', retryHint: '옆 조각들에게 주의를 주었습니다.', holdLabel: '잡고 중심 맞추기', holdSeconds: 1.05, suspense: 0.7 },
    { id: 'elevator', title: '한 분이 승진하셨습니다.', detail: '가운데 조각만 한 층 올라갔습니다.', retryHint: '높이를 통일해 두었습니다.', holdLabel: '잡고 중심 맞추기', holdSeconds: 0.85, suspense: 1.1 },
    { id: 'bow', title: '인사는 하셔야죠.', detail: '가지런히 서더니 전원이 고개를 숙였습니다.', retryHint: '이번에는 인사를 생략합니다.', holdLabel: '잡고 중심 맞추기', holdSeconds: 1.2, suspense: 0.8 },
  ],
  seal: [
    { id: 'rebound', title: '닫힘을 거절하셨습니다.', detail: '서랍의 의사를 존중해 주세요.', retryHint: '서랍과 이야기를 나눴습니다.', holdLabel: '끝까지 꾹 밀기', holdSeconds: 0.95, suspense: 0.7 },
    { id: 'roof', title: '위쪽도 열리는 제품입니다.', detail: '앞은 닫혔습니다. 앞은요.', retryHint: '뚜껑을 단단히 닫았습니다.', holdLabel: '끝까지 꾹 밀기', holdSeconds: 0.8, suspense: 1.15 },
    { id: 'back', title: '반대편으로 배송되었습니다.', detail: '밀어주신 힘, 끝까지 전달했습니다.', retryHint: '이번엔 뒤쪽도 확인했습니다.', holdLabel: '끝까지 꾹 밀기', holdSeconds: 1.15, suspense: 0.8 },
  ],
};

export function getTrap(sceneId: SceneId, attempt: number): Trap {
  const variants = TRAPS[sceneId];
  return variants[Math.max(0, Math.floor(attempt)) % variants.length];
}

// A displayed approach gauge, not a score: full insertion is a separate action.
export function approachFit(distance: number): number {
  return Math.round(clamp(1 - distance / 3.5, 0, 0.985) * 1000) / 10;
}

export function advancePressure(current: number, held: boolean, delta: number, duration: number): number {
  return clamp(current + (held ? delta / duration : -delta * 0.65), 0, 1);
}
