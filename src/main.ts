// src/main.ts
import "./style.css";
import { setupAudio, getVolumeLevel } from "./audio";
import { startGame } from "./dm";

const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const meter = document.getElementById("volumeMeter") as HTMLProgressElement;

let volumeInterval: number | undefined;

startBtn.onclick = async () => {
  // disable start to prevent double starts
  startBtn.disabled = true;

  await setupAudio();

  // start the game and pass a callback to run when the game ends
  startGame(() => {
    // stop the meter interval
    if (volumeInterval) {
      clearInterval(volumeInterval);
      volumeInterval = undefined;
    }
    // re-enable start button so user can restart
    startBtn.disabled = false;
  });

  // Start volume meter AFTER audio is ready
  if (!volumeInterval) {
    volumeInterval = window.setInterval(() => {
      meter.value = getVolumeLevel(); // now safe
    }, 100);
  }
};