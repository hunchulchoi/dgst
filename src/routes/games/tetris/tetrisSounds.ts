/** Web Audio API 테트리스 효과음 */

export type TetrisSoundId = 'move' | 'rotate' | 'drop' | 'clear' | 'stage' | 'over' | 'win';

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = 'square',
  volume = 0.04
) {
  const ctx = getContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

/** 효과음 재생 */
export function playTetrisSound(id: TetrisSoundId, enabled: boolean) {
  if (!enabled) return;
  try {
    switch (id) {
      case 'move':
        playTone(180, 30, 'square', 0.025);
        break;
      case 'rotate':
        playTone(260, 40, 'triangle', 0.03);
        break;
      case 'drop':
        playTone(90, 60, 'sawtooth', 0.035);
        break;
      case 'clear':
        playTone(420, 50, 'square', 0.03);
        setTimeout(() => playTone(520, 50, 'square', 0.03), 55);
        setTimeout(() => playTone(640, 70, 'square', 0.03), 110);
        break;
      case 'stage':
        [440, 554, 659, 880].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 90, 'triangle', 0.035), i * 90);
        });
        break;
      case 'over':
        playTone(120, 120, 'sawtooth', 0.04);
        setTimeout(() => playTone(80, 180, 'sawtooth', 0.04), 100);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((freq, i) => {
          setTimeout(() => playTone(freq, 110, 'triangle', 0.04), i * 100);
        });
        break;
    }
  } catch (err) {
    console.error('[tetris sound failed]', err);
  }
}
