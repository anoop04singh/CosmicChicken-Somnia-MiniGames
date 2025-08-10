let audioCtx: AudioContext | null = null;
let isMuted = true;
let mainGainNode: GainNode | null = null;

// Must be called on first user interaction
export const initAudio = () => {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    mainGainNode = audioCtx.createGain();
    mainGainNode.connect(audioCtx.destination);
    mainGainNode.gain.value = isMuted ? 0 : 1;
  } catch (e) {
    console.error("Web Audio API is not supported in this browser");
  }
};

export const toggleMute = (forceState?: boolean): boolean => {
  if (!mainGainNode || !audioCtx) return isMuted;
  
  isMuted = forceState !== undefined ? forceState : !isMuted;
  mainGainNode.gain.setValueAtTime(isMuted ? 0 : 1, audioCtx.currentTime);
  return isMuted;
};

export const getMuteState = () => isMuted;

// --- Sound Functions ---

const playTone = (freq: number, duration: number, volume: number, type: OscillatorType = 'square') => {
  if (!audioCtx || !mainGainNode) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(mainGainNode);
  
  oscillator.start(audioCtx.currentTime);
  oscillator.stop(audioCtx.currentTime + duration);
};

export const playClickSound = () => {
  initAudio();
  playTone(440, 0.05, 0.1, 'triangle');
  playTone(880, 0.05, 0.1, 'triangle');
};

export const playStartSound = () => {
  initAudio();
  if (!audioCtx) return;
  playTone(261.63, 0.1, 0.2, 'square'); // C4
  setTimeout(() => playTone(329.63, 0.1, 0.2, 'square'), 50); // E4
  setTimeout(() => playTone(392.00, 0.1, 0.2, 'square'), 100); // G4
};

export const playWinSound = () => {
  initAudio();
  if (!audioCtx) return;
  playTone(523.25, 0.1, 0.2, 'square'); // C5
  setTimeout(() => playTone(659.25, 0.1, 0.2, 'square'), 100); // E5
  setTimeout(() => playTone(783.99, 0.1, 0.2, 'square'), 200); // G5
  setTimeout(() => playTone(1046.50, 0.2, 0.2, 'square'), 300); // C6
};

export const playExplosionSound = () => {
  initAudio();
  if (!audioCtx || !mainGainNode) return;
  const now = audioCtx.currentTime;
  const noiseSource = audioCtx.createBufferSource();
  const bufferSize = audioCtx.sampleRate * 0.5; // 0.5 second buffer
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }
  noiseSource.buffer = buffer;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(2000, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.5);

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(mainGainNode);
  noiseSource.start(now);
  noiseSource.stop(now + 0.5);
};

export const playEjectSound = () => {
  initAudio();
  playTone(880, 0.1, 0.2, 'sawtooth');
  setTimeout(() => playTone(1046.50, 0.15, 0.2, 'sawtooth'), 50);
};

let lastMultiplierTick = 0;
export const playMultiplierIncreaseSound = (multiplier: number) => {
  initAudio();
  if (!audioCtx) return;
  
  const currentTick = Math.floor(multiplier * 10);
  if (currentTick > lastMultiplierTick) {
    lastMultiplierTick = currentTick;
    const baseFreq = 200;
    const freq = baseFreq + (multiplier * 50);
    playTone(Math.min(freq, 2000), 0.05, 0.05, 'sine');
  }
};

export const resetMultiplierTick = () => {
  lastMultiplierTick = 0;
};