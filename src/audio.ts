let audioContext: AudioContext;
let analyser: AnalyserNode;
let dataArray: Uint8Array;

export async function setupAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  source.connect(analyser);
}

export function getVolumeLevel(): number {
  if (!dataArray) return 0; 
  const safeArray = new Uint8Array(dataArray.buffer as ArrayBuffer);
  analyser.getByteFrequencyData(safeArray);

  let sum = 0;
  for (let i = 0; i < safeArray.length; i++) sum += safeArray[i];

  return sum / safeArray.length;
}