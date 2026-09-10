import { parseRecord, resultText, type RecordData, type RunResult } from './game';
import { TOSS_APP_NAME } from './app-config';

const RECORD_KEY = 'ttak:record:v3';
export const inToss = import.meta.env.VITE_PLATFORM === 'toss';

let audioContext: AudioContext | null = null;

export async function subscribeNativeBack(onBack: () => void): Promise<() => void> {
  if (!inToss) return () => {};
  const { graniteEvent } = await import('@apps-in-toss/web-framework');
  return graniteEvent.addEventListener('backEvent', { onEvent: onBack });
}

export async function closeMiniApp() {
  if (inToss) {
    await (await import('@apps-in-toss/web-framework')).Screen.close();
  } else if (window.history.length > 1) {
    window.history.back();
  }
}

export async function readRecord() {
  try {
    const raw = inToss
      ? await (await import('@apps-in-toss/web-framework')).Storage.getItem(RECORD_KEY)
      : localStorage.getItem(RECORD_KEY);
    return parseRecord(raw);
  } catch {
    return null;
  }
}

export async function saveRecord(record: RecordData) {
  const raw = JSON.stringify(record);
  if (inToss) {
    await (await import('@apps-in-toss/web-framework')).Storage.setItem(RECORD_KEY, raw);
  } else {
    localStorage.setItem(RECORD_KEY, raw);
  }
}

function playFailureSound(step: number) {
  const BrowserAudioContext = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!BrowserAudioContext) return;

  audioContext ??= new BrowserAudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const pitch = 330 - Math.min(step, 6) * 24;

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(pitch, now);
  oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.45, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.09, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.19);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

export function primeAudio() {
  try {
    const BrowserAudioContext = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!BrowserAudioContext) return;
    audioContext ??= new BrowserAudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  } catch {
    // The game remains playable on devices without audio support.
  }
}

export function failureFeedback(step: number) {
  navigator.vibrate?.([10, 16, 26]);
  try {
    playFailureSound(step);
  } catch {
    // Sound is optional. The visual failure remains the primary feedback.
  }
}

export function interactionFeedback(cue: 'lift' | 'align' | 'seat' | 'slip') {
  try {
    if (!audioContext || audioContext.state !== 'running') return;
    const context = audioContext;
    const pitches = cue === 'seat' ? [660, 880] : [cue === 'lift' ? 210 : cue === 'align' ? 520 : 180];
    pitches.forEach((pitch, index) => {
      const now = context.currentTime + index * 0.075;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(pitch, now);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * (cue === 'slip' ? 0.45 : 0.85), now + 0.1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now); oscillator.stop(now + 0.13);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* Material sounds are optional. */ }
}

export async function shareResult(run: RunResult): Promise<'shared' | 'copied' | 'cancelled'> {
  let text = resultText(run);
  if (inToss) {
    const { Share } = await import('@apps-in-toss/web-framework');
    const link = await Share.createLink({ path: `intoss://${TOSS_APP_NAME}` });
    await Share.sendMessage({ message: `${text}\n${link}` });
    return 'shared';
  }

  if (import.meta.env.VITE_PUBLIC_URL) text += `\n${import.meta.env.VITE_PUBLIC_URL}`;
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return 'shared';
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    throw new Error('공유 기능을 사용할 수 없어요.');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
