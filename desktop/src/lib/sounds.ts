let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine", volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {}
}

function playSequence(notes: Array<{ freq: number; duration: number; delay: number }>, volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    notes.forEach(({ freq, duration, delay }) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + delay);

      gainNode.gain.setValueAtTime(volume, ctx.currentTime + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + duration);

      oscillator.start(ctx.currentTime + delay);
      oscillator.stop(ctx.currentTime + delay + duration);
    });
  } catch {}
}

export const sounds = {
  success: () => {
    playSequence([
      { freq: 523.25, duration: 0.15, delay: 0 },
      { freq: 659.25, duration: 0.15, delay: 0.12 },
      { freq: 783.99, duration: 0.2, delay: 0.24 },
    ]);
  },

  error: () => {
    playSequence([
      { freq: 330, duration: 0.2, delay: 0 },
      { freq: 220, duration: 0.3, delay: 0.15 },
    ]);
  },

  notification: () => {
    playSequence([
      { freq: 880, duration: 0.1, delay: 0 },
      { freq: 1108.73, duration: 0.1, delay: 0.1 },
      { freq: 880, duration: 0.15, delay: 0.2 },
    ]);
  },

  click: () => {
    playTone(800, 0.05, "square", 0.1);
  },

  send: () => {
    playSequence([
      { freq: 440, duration: 0.1, delay: 0 },
      { freq: 660, duration: 0.1, delay: 0.08 },
      { freq: 880, duration: 0.15, delay: 0.16 },
    ]);
  },

  broadcastComplete: () => {
    playSequence([
      { freq: 523.25, duration: 0.12, delay: 0 },
      { freq: 659.25, duration: 0.12, delay: 0.1 },
      { freq: 783.99, duration: 0.12, delay: 0.2 },
      { freq: 1046.5, duration: 0.25, delay: 0.3 },
    ]);
  },

  whatsappConnected: () => {
    playSequence([
      { freq: 392, duration: 0.15, delay: 0 },
      { freq: 523.25, duration: 0.15, delay: 0.12 },
      { freq: 659.25, duration: 0.15, delay: 0.24 },
      { freq: 783.99, duration: 0.2, delay: 0.36 },
    ]);
  },

  qrReady: () => {
    playSequence([
      { freq: 660, duration: 0.1, delay: 0 },
      { freq: 880, duration: 0.15, delay: 0.1 },
    ]);
  },

  progress: () => {
    playTone(600, 0.08, "sine", 0.15);
  },
};
