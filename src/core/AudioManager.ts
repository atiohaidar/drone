/**
 * Web Audio API sound synthesizer.
 * Direct port from challenge.html — generates all game sounds procedurally.
 */

let audioCtx: AudioContext | null = null;
let droneHum: OscillatorNode | null = null;
let filterNode: BiquadFilterNode | null = null;
let volumeNode: GainNode | null = null;

/** Initialize the Web Audio context and drone hum oscillator. */
export function initAudio(): void {
  if (audioCtx) return;
  try {
    audioCtx = new AudioContext();

    // Create custom drone hum oscillator
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, audioCtx.currentTime);

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(250, audioCtx.currentTime);

    volumeNode = audioCtx.createGain();
    volumeNode.gain.setValueAtTime(0.0, audioCtx.currentTime);

    osc.connect(filterNode);
    filterNode.connect(volumeNode);
    volumeNode.connect(audioCtx.destination);

    osc.start(0);
    droneHum = osc;
  } catch (e) {
    console.warn('Web Audio API not supported', e);
  }
}

/** Resume audio context if suspended (browser autoplay policy). */
export function resumeAudio(): void {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

/** Map throttle input (-1 to 1) to drone hum frequency and gain. */
export function setDroneThrottle(throttleInput: number): void {
  if (!audioCtx || !filterNode || !volumeNode || !droneHum) return;

  const throttleNormalized = (throttleInput + 1.0) / 2.0;
  const baseFreq = 80 + throttleNormalized * 120;
  const filterFreq = 200 + throttleNormalized * 400;
  const gain = 0.05 + throttleNormalized * 0.12;

  droneHum.frequency.setTargetAtTime(baseFreq, audioCtx.currentTime, 0.1);
  filterNode.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.15);
  volumeNode.gain.setTargetAtTime(gain, audioCtx.currentTime, 0.1);
}

/** Play a gate-cleared chime (sine 600→1200Hz sweep). */
export function playChime(): void {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

/** Play a crash noise burst (white noise + lowpass filter). */
export function playCrash(): void {
  if (!audioCtx) return;
  const bufferSize = audioCtx.sampleRate * 0.4;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(300, audioCtx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.4);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  noise.start();
}

/** Play victory or defeat fanfare (note sequence). */
export function playFanfare(isVictory: boolean): void {
  if (!audioCtx) return;
  const notes = isVictory ? [440, 554, 659, 880] : [220, 196, 185, 147];
  const duration = 0.12;
  const time = audioCtx.currentTime;

  notes.forEach((freq, index) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = isVictory ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(freq, time + index * duration);

    gain.gain.setValueAtTime(0.12, time + index * duration);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (index + 1) * duration);

    osc.connect(gain);
    gain.connect(audioCtx!.destination);
    osc.start(time + index * duration);
    osc.stop(time + (index + 1) * duration);
  });
}
