import { useEffect, useRef, useState } from 'react';
import { APP_TITLE } from './app-config';
import { SCENES, createRun, updateRecord, type RecordData, type RunResult } from './game';
import { GameStage, type StagePhase } from './challenges';
import { closeMiniApp, failureFeedback, interactionFeedback, primeAudio, readRecord, saveRecord, shareResult, subscribeNativeBack } from './platform';
import { getTrap } from './traps';
import type { StageController, StageTelemetry } from './scene3d';

type Screen = 'home' | 'play' | 'result';
type ShareState = 'idle' | 'loading' | 'shared' | 'copied' | 'error';

function SoundIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" />{muted ? <path d="m16 9 6 6m0-6-6 6" /> : <><path d="M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14" /></>}</svg>;
}

function AppHeader({ screen, sound, onSound, onExit }: { screen: Screen; sound: boolean; onSound: () => void; onExit: () => void }) {
  return <header className="app-header">
    <button className="wordmark" type="button" onClick={onExit} aria-label="처음 화면으로 이동">{APP_TITLE}</button>
    <div className="header-controls">
      <button className="icon-button" type="button" aria-label={sound ? '소리 끄기' : '소리 켜기'} aria-pressed={sound} onClick={onSound}><SoundIcon muted={!sound} /></button>
      {screen !== 'home' ? <button className="icon-button" type="button" onClick={onExit} aria-label="게임 나가기"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button> : null}
    </div>
  </header>;
}

function HomeScreen({ record, onStart }: { record: RecordData | null; onStart: () => void }) {
  const [ready, setReady] = useState(false);
  return <main className="home-screen">
    <div className="home-copy">
      <p className="game-name">perfect fit</p>
      <h1>이건 딱<br />맞겠는데.</h1>
      <p className="home-description">마지막 한 조각, 끼워 볼래요?</p>
    </div>
    <GameStage sceneId="slot" mode="demo" onReady={() => setReady(true)} />
    <div className="home-actions">
      <button className="button button--primary" type="button" onClick={onStart} disabled={!ready}>
        {ready ? '직접 해보기' : '준비 중…'}<span aria-hidden="true">↗</span>
      </button>
      <p className="quiet-note">{record ? `지금까지 ${record.completedRuns}번 도전했어요.` : '손끝으로 맞추는 네 가지 장면'}</p>
    </div>
  </main>;
}

function PlayScreen({ index, sound, attemptOffset, onFailed, onNext }: { index: number; sound: boolean; attemptOffset: number; onFailed: () => void; onNext: () => void }) {
  const [phase, setPhase] = useState<StagePhase>('ready');
  const [retry, setRetry] = useState(0);
  const [firstAttempt] = useState(attemptOffset);
  const [ready, setReady] = useState(false);
  const [telemetry, setTelemetry] = useState<StageTelemetry>({ fit: 0, pressure: 0, dodges: 0 });
  const controls = useRef<StageController | null>(null);
  const scene = SCENES[index];
  const attemptNumber = firstAttempt + retry;
  const failure = getTrap(scene.id, attemptNumber);
  const pressing = phase === 'pressing';
  const needsPress = phase === 'jammed' || pressing;
  const instruction = phase === 'seated' ? '맞았습니다. 잠시 확인하겠습니다.'
    : phase === 'breaking' ? '잠시만요.'
    : needsPress ? scene.id === 'stack' ? '흔들려요. 잡고 중심을 맞춰 주세요.' : '마지막이 걸렸어요. 조금만 더 눌러 주세요.'
    : phase === 'near' ? '좋아요. 이제 손을 놓아 보세요.'
    : phase === 'dropping' ? '거의 다 들어갔습니다.'
    : telemetry.dodges > 0 && phase === 'dragging' ? telemetry.dodges === 1 ? '홈 위치가 조금 조정되었습니다.' : '이번에는 가만히 있겠습니다.'
    : phase === 'dragging' ? '홈 바로 위로 옮겨 보세요.'
    : attemptNumber > 0 ? getTrap(scene.id, attemptNumber - 1).retryHint : scene.instruction;

  return <main className="play-screen" data-phase={phase}>
    <div className="play-copy">
      <div className="round-progress" aria-label={`전체 4장면 중 ${index + 1}장면`}>
        <span className="round-count">{String(index + 1).padStart(2, '0')} <span>/ 04</span></span>
        <div className="progress-marks" aria-hidden="true">{SCENES.map((item, i) => <i key={item.id} data-current={i === index} data-done={i < index} />)}</div>
      </div>
      <h1>{scene.title}</h1>
      <p id="play-instruction" aria-live="polite">{phase === 'failed' ? failure.detail : instruction}</p>
    </div>
    <GameStage key={retry} sceneId={scene.id} attemptNumber={attemptNumber} controlsRef={controls}
      onReady={() => setReady(true)} onPhase={setPhase} onTelemetry={setTelemetry}
      onFeedback={(cue) => { if (sound) interactionFeedback(cue); }}
      onImpact={() => { if (sound) failureFeedback(index); onFailed(); }} />
    <div className="play-actions">
      <div className="fit-readout" data-phase={phase}>
        <div className="fit-readout__labels"><span>{retry + 1}번째 시도</span><span>{phase === 'failed' || phase === 'breaking' ? '맞춤 판정 취소' : '맞물림'} <b>{telemetry.fit.toFixed(1)}<small>%</small></b></span></div>
        <div className="fit-readout__track" role="meter" aria-label="맞물림" aria-valuemin={0} aria-valuemax={100} aria-valuenow={telemetry.fit}><i style={{ transform: `scaleX(${telemetry.fit / 100})` }} /></div>
      </div>
      {phase === 'failed' ? (
        <div className="failure-actions">
          <strong className="failure-line" role="status">{failure.title}</strong>
          <div className="action-row">
            <button className="button button--secondary" type="button" onClick={() => {
              setPhase('ready'); setReady(false);
              setTelemetry({ fit: 0, pressure: 0, dodges: 0 });
              setRetry((value) => value + 1);
            }}>한 번 더</button>
            <button className="button button--primary" type="button" onClick={onNext}>{index === 3 ? '결과 보기' : '다음 조각'}<span aria-hidden="true">→</span></button>
          </div>
        </div>
      ) : needsPress ? (
        <div className="press-action">
          <button type="button" className="button button--primary pressure-button" data-testid="press-control" aria-pressed={pressing}
            onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controls.current?.beginPress(); }}
            onPointerUp={() => controls.current?.endPress()} onPointerCancel={() => controls.current?.endPress()} onLostPointerCapture={() => controls.current?.endPress()}
            onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); controls.current?.beginPress(); } }}
            onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); controls.current?.endPress(); } }}
            onBlur={() => controls.current?.endPress()}
            onClick={(event) => { if (event.detail === 0) { if (pressing) controls.current?.endPress(); else controls.current?.beginPress(); } }}>
            <i aria-hidden="true" style={{ transform: `scaleX(${telemetry.pressure / 100})` }} />
            <span>{pressing ? telemetry.pressure > 75 ? '진짜 조금만 더…' : '그대로 누르고 계세요' : failure.holdLabel}</span>
          </button>
          <p className="pressure-note">손을 떼면 힘이 풀려요</p>
        </div>
      ) : <p className="drag-hint">
        {ready ? phase === 'seated' ? '딱 맞았습니다.' : phase === 'dropping' || phase === 'breaking' ? '확인 중…' : '조각을 꾹 잡고 끌어 보세요' : '조각을 꺼내고 있어요'}
      </p>}
    </div>
  </main>;
}

function ResultScreen({ run, record, onReplay }: { run: RunResult; record: RecordData; onReplay: () => void }) {
  const [shareState, setShareState] = useState<ShareState>('idle');
  const handleShare = async () => {
    setShareState('loading');
    try {
      const result = await shareResult(run);
      setShareState(result === 'cancelled' ? 'idle' : result);
    } catch { setShareState('error'); }
  };
  return <main className="result-screen">
    <div className="result-copy">
      <p className="game-name">almost perfect.</p>
      <h1>분명<br />맞았는데.</h1>
      <p>{run.attempts}번 도전. 완벽한 순간은 0번.</p>
    </div>
    <GameStage sceneId="slot" mode="result" />
    <div className="result-actions">
      <p className="result-record">누적 {record.completedRuns}판 · {record.failedAttempts}번의 아까비</p>
      <button className="button button--primary" type="button" onClick={onReplay}>한 번만 더<span aria-hidden="true">↻</span></button>
      <button className="text-button share-button" type="button" disabled={shareState === 'loading'} data-state={shareState} onClick={handleShare}>
        {shareState === 'loading' ? '공유 준비 중…' : shareState === 'copied' ? '복사했어요' : shareState === 'shared' ? '공유했어요' : shareState === 'error' ? '다시 공유하기' : '친구도 해보라고 하기'}
      </button>
      <p className="share-message" role="status">{shareState === 'error' ? '공유하지 못했어요. 다시 눌러 주세요.' : ''}</p>
    </div>
  </main>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [run, setRun] = useState<RunResult | null>(null);
  const [record, setRecord] = useState<RecordData | null>(null);
  const [sound, setSound] = useState(true);
  const screenRef = useRef<Screen>('home');
  const attempts = useRef(0);
  const sceneAttempts = useRef([0, 0, 0, 0]);
  const recordRef = useRef<RecordData | null>(null);
  screenRef.current = screen;

  useEffect(() => {
    let active = true;
    void readRecord().then((stored) => {
      if (active && !recordRef.current) { setRecord(stored); recordRef.current = stored; }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;
    void subscribeNativeBack(() => {
      if (screenRef.current === 'home') void closeMiniApp();
      else setScreen('home');
    }).then((cleanup) => { if (active) unsubscribe = cleanup; else cleanup(); }).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, []);

  const start = () => {
    if (sound) primeAudio();
    attempts.current = 0;
    setRun(null); setSceneIndex(0); setScreen('play');
  };
  const completeScene = () => {
    if (sceneIndex < SCENES.length - 1) { setSceneIndex((current) => current + 1); return; }
    const completed = createRun(undefined, attempts.current);
    const nextRecord = updateRecord(recordRef.current, completed);
    recordRef.current = nextRecord;
    setRun(completed); setRecord(nextRecord); setScreen('result');
    void saveRecord(nextRecord).catch(() => { /* The current session remains playable without device storage. */ });
  };

  return <div className="app-shell" data-screen={screen}>
    <AppHeader screen={screen} sound={sound} onSound={() => { if (!sound) primeAudio(); setSound((value) => !value); }} onExit={() => setScreen('home')} />
    {screen === 'home' ? <HomeScreen record={record} onStart={start} /> : null}
    {screen === 'play' ? <PlayScreen key={sceneIndex} index={sceneIndex} sound={sound} attemptOffset={sceneAttempts.current[sceneIndex]} onFailed={() => { attempts.current += 1; sceneAttempts.current[sceneIndex] += 1; }} onNext={completeScene} /> : null}
    {screen === 'result' && run && record ? <ResultScreen run={run} record={record} onReplay={start} /> : null}
  </div>;
}
