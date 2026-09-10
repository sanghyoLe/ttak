export const SCENES = [
  {
    id: 'slot',
    title: '마지막 한 조각',
    instruction: '노란 조각을 빈칸에 끼워 보세요.',
  },
  {
    id: 'circle',
    title: '가운데 홈',
    instruction: '파란 조각을 동그란 홈에 넣어 보세요.',
  },
  {
    id: 'stack',
    title: '마지막 칸',
    instruction: '노란 블록을 줄 끝에 세워 보세요.',
  },
  {
    id: 'seal',
    title: '끝까지 밀기',
    instruction: '손잡이를 잡고 서랍을 밀어 보세요.',
  },
] as const;

export type SceneId = (typeof SCENES)[number]['id'];

export type RunResult = {
  completedAt: string;
  attempts: number;
};

export type RecordData = {
  completedRuns: number;
  failedAttempts: number;
  lastCompletedAt: string;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function distanceBetween(
  point: { x: number; y: number },
  target: { x: number; y: number },
) {
  return Math.hypot(point.x - target.x, point.y - target.y);
}

export function createRun(completedAt = new Date().toISOString(), attempts: number = SCENES.length): RunResult {
  return {
    completedAt,
    attempts,
  };
}

export function updateRecord(previous: RecordData | null, run: RunResult): RecordData {
  return {
    completedRuns: (previous?.completedRuns ?? 0) + 1,
    failedAttempts: (previous?.failedAttempts ?? 0) + run.attempts,
    lastCompletedAt: run.completedAt,
  };
}

export function parseRecord(raw: string | null): RecordData | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RecordData>;
    if (
      typeof value.completedRuns !== 'number' ||
      typeof value.failedAttempts !== 'number' ||
      typeof value.lastCompletedAt !== 'string'
    ) return null;
    return value as RecordData;
  } catch {
    return null;
  }
}

export function resultText(run: RunResult) {
  return `Perfect Fit에 도전했지만 ${run.attempts}번 모두 실패했습니다.`;
}
