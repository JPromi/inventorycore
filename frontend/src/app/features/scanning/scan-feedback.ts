export type FeedbackKind = 'success' | 'warning' | 'error';

let audio: AudioContext | null = null;

/** Beep and vibration, so the result of a scan is noticed without looking at the screen. */
export function scanFeedback(kind: FeedbackKind, sound = true): void {
  navigator.vibrate?.(
    kind === 'success' ? 60 : kind === 'warning' ? [60, 50, 60, 50, 60] : [80, 60, 80],
  );
  if (!sound) {
    return;
  }
  try {
    audio ??= new AudioContext();
    const tones = kind === 'success' ? [1046] : kind === 'warning' ? [880, 660, 880] : [220];
    const length = kind === 'error' ? 0.3 : 0.11;
    tones.forEach((frequency, index) => {
      const start = audio!.currentTime + index * (length + 0.04);
      const oscillator = audio!.createOscillator();
      const gain = audio!.createGain();
      oscillator.type = kind === 'warning' ? 'square' : 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(kind === 'warning' ? 0.06 : 0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + length);
      oscillator.connect(gain).connect(audio!.destination);
      oscillator.start(start);
      oscillator.stop(start + length);
    });
  } catch {
    // no audio available
  }
}
