import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import { SCENES, type SceneId } from './game';
import type { FeedbackCue, StageController, StageMode, StagePhase, StageTelemetry } from './scene3d';

export type { StagePhase } from './scene3d';

type Props = {
  sceneId: SceneId;
  mode?: StageMode;
  attemptNumber?: number;
  controlsRef?: RefObject<StageController | null>;
  onPhase?: (phase: StagePhase) => void;
  onTelemetry?: (telemetry: StageTelemetry) => void;
  onFeedback?: (cue: FeedbackCue) => void;
  onImpact?: () => void;
  onReady?: () => void;
};

export function GameStage({ sceneId, mode = 'play', attemptNumber = 0, controlsRef, onPhase, onImpact, onReady, onTelemetry, onFeedback }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const piece = useRef<HTMLButtonElement>(null);
  const target = useRef<HTMLSpanElement>(null);
  const controller = useRef<StageController | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [generation, setGeneration] = useState(0);
  const [phase, setPhase] = useState<StagePhase>('ready');
  const [paused, setPaused] = useState(false);
  const phaseEvent = useEffectEvent((next: StagePhase) => { setPhase(next); onPhase?.(next); });
  const impactEvent = useEffectEvent(() => onImpact?.());
  const readyEvent = useEffectEvent(() => onReady?.());
  const telemetryEvent = useEffectEvent((values: StageTelemetry) => onTelemetry?.(values));
  const feedbackEvent = useEffectEvent((cue: FeedbackCue) => onFeedback?.(cue));

  useEffect(() => {
    let active = true;
    const element = host.current;
    setState('loading');
    setPhase('ready');
    setPaused(false);
    void import('./scene3d').then(({ createStage }) => {
      if (!active || !host.current || !piece.current || !target.current) return;
      try {
        controller.current = createStage({
          host: host.current,
          pieceButton: piece.current,
          targetMarker: target.current,
          sceneId,
          mode,
          attemptNumber,
          onTelemetry: (values) => { if (active) telemetryEvent(values); },
          onFeedback: (cue) => { if (active) feedbackEvent(cue); },
          onPhase: (next) => { if (active) phaseEvent(next); },
          onImpact: () => { if (active) impactEvent(); },
          onUnavailable: () => { if (active) setState('error'); },
        });
        if (controlsRef) controlsRef.current = controller.current;
        setState('ready');
        readyEvent();
      } catch {
        setState('error');
      }
    }).catch(() => { if (active) setState('error'); });

    return () => {
      active = false;
      controller.current?.dispose();
      controller.current = null;
      if (controlsRef) controlsRef.current = null;
      // A failed WebGL initialization may have appended a canvas before throwing.
      element?.querySelectorAll('canvas').forEach((canvas) => canvas.remove());
    };
  }, [sceneId, mode, generation, attemptNumber, controlsRef]);

  const scene = SCENES.find((item) => item.id === sceneId)!;

  return (
    <div className="stage-wrap" data-mode={mode}>
      <div ref={host} className="scene-stage" data-testid="game-stage" aria-label={`${scene.title} 3D 장면`}>
        <button
          ref={piece}
          type="button"
          className="piece-handle"
          data-testid="active-piece"
          aria-label={`${scene.title} 조각. 방향키로 이동, Enter로 끼우기`}
          aria-describedby={mode === 'play' ? 'play-instruction' : undefined}
          tabIndex={mode === 'play' && state === 'ready' ? 0 : -1}
          hidden={mode !== 'play' || state !== 'ready'}
        />
        <span ref={target} className="drop-marker" data-testid="drop-target" aria-hidden="true" />
      </div>
      {mode === 'play' && (phase === 'seated' || phase === 'breaking' || phase === 'failed') ? (
        <div className="fit-stamp" data-retracted={phase !== 'seated'} aria-hidden="true"><span>맞음</span>{phase !== 'seated' ? <b>취소</b> : null}</div>
      ) : null}
      {state === 'loading' ? <div className="stage-message" role="status">조각을 꺼내는 중…</div> : null}
      {state === 'error' ? (
        <div className="stage-message stage-message--error" role="alert">
          <p>3D 화면을 불러오지 못했어요.</p>
          <button type="button" className="text-button" onClick={() => setGeneration((value) => value + 1)}>다시 불러오기</button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <div className="stage-tools">
          <button type="button" className="stage-tool" onClick={() => controller.current?.rotate()} disabled={phase !== 'ready' && phase !== 'failed'}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 7 4v8l-7 4-7-4V7l7-4Z M5 7l7 4 7-4 M12 11v8 M3 18c1.7 2 5 3 9 3 4.4 0 8-1.5 9-4m-3 0h3v3" /></svg>
            다른 각도
          </button>
          {mode === 'play' && phase !== 'failed' ? (
            <button type="button" className="stage-tool" onClick={() => controller.current?.reset()} disabled={phase === 'dropping' || phase === 'seated' || phase === 'breaking'}>
              처음 위치
            </button>
          ) : null}
          {mode === 'demo' ? <button type="button" className="stage-tool" aria-label={paused ? '미리보기 재생' : '미리보기 멈추기'} onClick={() => {
            controller.current?.setPaused(!paused);
            setPaused((value) => !value);
          }}><span className="demo-caption">이렇게, 딱.</span><svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{paused ? <path d="m9 6 9 6-9 6V6Z" /> : <path d="M9 6v12M15 6v12" />}</svg></button> : null}
        </div>
      ) : null}
    </div>
  );
}
