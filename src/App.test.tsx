import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

// WebGL and pointer geometry are exercised in the real-browser tests.
// Unit tests cover navigation, retry accounting and device storage.
vi.mock('./challenges', () => ({
  GameStage: ({ mode, onReady, onPhase, onImpact }: {
    mode?: string;
    onReady?: () => void;
    onPhase?: (phase: string) => void;
    onImpact?: () => void;
  }) => {
    useEffect(() => { onReady?.(); }, []);
    return mode ? <div aria-label="3D 미리보기" /> : <button type="button" onClick={() => { onImpact?.(); onPhase?.('failed'); }}>조각 끼우기</button>;
  },
}));

describe('App', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(cleanup);

  it('offers a playable preview and a sound control', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /이건 딱맞겠는데/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '직접 해보기' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '소리 끄기' }));
    expect(screen.getByRole('button', { name: '소리 켜기' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('holds the failed scene until the player chooses to continue', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '직접 해보기' }));
    fireEvent.click(screen.getByRole('button', { name: '조각 끼우기' }));
    expect(screen.getByRole('heading', { name: '마지막 한 조각' })).toBeInTheDocument();
    expect(screen.getByText('치수가 방금 바뀌었습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 조각' }));
    expect(screen.getByRole('heading', { name: '가운데 홈' })).toBeInTheDocument();
  });

  it('counts a retry as another attempt and saves the completed run', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '직접 해보기' }));
    fireEvent.click(screen.getByRole('button', { name: '조각 끼우기' }));
    fireEvent.click(screen.getByRole('button', { name: '한 번 더' }));
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: '조각 끼우기' }));
      fireEvent.click(screen.getByRole('button', { name: i < 3 ? '다음 조각' : '결과 보기' }));
    }
    expect(screen.getByText('5번 도전. 완벽한 순간은 0번.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ttak:record:v3')!)).toMatchObject({ completedRuns: 1, failedAttempts: 5 });
  });

  it('shows previous completed runs', async () => {
    localStorage.setItem('ttak:record:v3', JSON.stringify({ completedRuns: 4, failedAttempts: 16, lastCompletedAt: '2026-09-10T00:00:00.000Z' }));
    render(<App />);
    expect(await screen.findByText('지금까지 4번 도전했어요.')).toBeInTheDocument();
  });
});
