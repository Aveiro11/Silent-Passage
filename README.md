# 🤫 Silent Passage Game

A voice-driven stealth dungeon game built with TypeScript, XState v5, SpeechState, and Azure Cognitive Services. Navigate three rooms using only your voice — but be careful how loud you speak. The dragon is sleeping.

---

## How It Works

You are a traveller trying to pass through three rooms, each with its own challenge. You speak your response out loud and the game reacts to **what you say** and **how loudly you say it**.

| Room | Challenge | How to Pass |
|------|-----------|-------------|
| 🐉 Dragon's Corridor | A dragon sleeps in the corridor | Speak quietly — any word will do, as long as you whisper |
| 💂 Guard's Gate | A guard blocks the gate | Politely ask or greet the guard, quietly |
| 🏛️ Sacred Temple | A temple door demands a password | Whisper the secret password *"Adib"* |

If you speak too loudly near the dragon, it wakes up and kills you. If you threaten the guard, he draws his sword and kills you. If you shout the temple password, you are reset to the start. Fail the temple twice and the door seals forever.

---

## 🎲 Random Events

Every time you start a new game, each room is randomly selected from two possible variants. This means no two runs are the same.

### 🐉 Dragon's Corridor

| Variant | Condition | Max Volume |
|---------|-----------|------------|
| **Sleeping** | The dragon sleeps peacefully | ≤ 30 |
| **Half-Awake** | The dragon stirs restlessly — you must be absolutely silent | ≤ 15 |

### 💂 Guard's Gate

| Variant | Condition | Accepted Intents |
|---------|-----------|-----------------|
| **Normal** | The guard is on duty | Polite request, command, or greeting |
| **Grumpy** | The guard is furious today | Greeting only |

Threatening the guard (`GameThreat`) in either variant results in instant death.

### 🏛️ Sacred Temple

| Variant | Condition | Max Volume |
|---------|-----------|------------|
| **Normal** | Standard temple | ≤ 30 |
| **Strict** | The temple feels more sacred than usual | ≤ 20 |

---

## Volume System

Every room has a volume threshold. Your microphone is monitored in real time using the Web Audio API. The volume level is measured as an average frequency amplitude (0–255 scale).

| Room | Variant | Max Volume Allowed |
|------|---------|-------------------|
| Dragon's Corridor | Normal | 30 |
| Dragon's Corridor | Half-Awake | 15 |
| Guard's Gate | Both | 20–30 |
| Sacred Temple | Normal | 30 |
| Sacred Temple | Strict | 20 |

A live volume meter is shown on screen so you can gauge how loudly you are speaking before and during each room.

---

## Temple Room — Attempt System

The temple room tracks failed attempts. The door will seal forever if you fail too many times.

| Situation | Result |
|-----------|--------|
| Correct password + quiet | Victory |
| Too loud | Reset to room 1 |
| Wrong password | "Wrong password. Try again." — attempt counted |
| Too loud AND wrong | "Too loud and wrong at the same time." — attempt counted |
| No input twice | "I didn't hear you." — death after 2 silences |
| 2 failed attempts | Temple door seals forever — death |

---

## Password Detection

The temple room uses a trained **Azure Custom Speech model** to recognise the password *"Adib"*. Rather than hardcoding phonetic variants, the game trusts the model's **confidence score** — if the model is at least 60% confident it heard the password (regardless of accent or pronunciation variation), the door opens.

This means:
- Heavy accents are handled gracefully
- You do not need to say it perfectly
- Shouting it still fails (volume check applies independently)
- The stricter temple variant requires an even softer whisper

---

## Guard Room — Intent Detection

The guard room uses **Azure Conversational Language Understanding (CLU)** to classify your intent.

### Normal Guard

| Intent | Example Utterances | Result |
|--------|--------------------|--------|
| `GamePolite` | "Could you please move?", "Excuse me" | Pass |
| `GameCommand` | "Move aside", "Let me through" | Pass |
| `GameGreeting` | "Hello there", "Good day" | Pass |
| `GameThreat` | "Move or I'll kill you" | Instant death |

### Grumpy Guard

Only a greeting will work. Commands and polite requests will offend him and send you back to room 1. Threats result in instant death.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) `strict mode, ES2022` |
| Bundler | ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white) |
| State Machine | ![XState](https://img.shields.io/badge/XState_v5-121212?style=flat&logo=xstate&logoColor=white) |
| Speech I/O | ![SpeechState](https://img.shields.io/badge/SpeechState-v2.15-6B46C1?style=flat&logoColor=white)|
| Speech Synthesis | ![Azure](https://img.shields.io/badge/Azure_TTS-0078D4?style=flat&logo=microsoftazure&logoColor=white) `en-US-DavisNeural` |
| Speech Recognition | ![Azure](https://img.shields.io/badge/Azure_Custom_Speech-0078D4?style=flat&logo=microsoftazure&logoColor=white) `Custom Speech Model — Sweden Central` |
| Intent Detection | ![Azure](https://img.shields.io/badge/Azure_CLU-0078D4?style=flat&logo=microsoftazure&logoColor=white)|
| Volume Detection | ![WebAudio](https://img.shields.io/badge/Web_Audio_API-FF6B35?style=flat&logo=webaudio&logoColor=white)|
| Inspector | ![Stately](https://img.shields.io/badge/Stately_Inspector-121212?style=flat&logoColor=white)|

---

## Project Structure
```
src/
  dm.ts            # Dialogue manager — XState v5 machine, all game logic
  nlu.ts           # Azure CLU intent detection
  audio.ts         # Microphone volume monitoring (Web Audio API)
  xml-parser.ts    # Loads room definitions from game.xml
  game.xml         # Room content, variants, and volume thresholds
  types.ts         # TypeScript interfaces
  main.ts          # Entry point, UI wiring, volume meter
  style.css        # Game UI styles
  azure.ts         # API keys (not committed)
```

Note: `spst-wrapper.ts` was removed after migrating to SpeechState, which handles the full TTS/ASR lifecycle internally.

---

## Dialogue State Machine

The XState v5 machine drives the entire game flow:
```
loading → room → retrying
               → dragonPass      → room
               → dying           → death (final)
               → awaitGuardIntent → nextRoom       → room / winning
                                  → guardRejected  → room
                                  → guardKill      → death (final)
               → templeFailed    → room
               → templeRetrying  → evaluating
               → templeNoInput   → dying / evaluating
               → templeWrongAndLoud → templeNoInput / dying
               → winning         → victory (final)
```

Key design decisions:

- **SpeechState integration** — `SPEAK_COMPLETE` fires only when TTS truly ends, eliminating the need for manual TTS callbacks, `FEEDBACK_DONE` events, and adaptive delays that were required in the earlier `spst-wrapper.ts` approach.
- **800ms delay after RECOGNISED** — actions that fire immediately after recognition (dragonPass, guardKill, etc.) use a `setTimeout` of 800ms before calling `spk()` to give SpeechState time to close the ASR session before accepting a new SPEAK command.
- **`evaluating` transient state** — after `RECOGNISED`, speech result is saved to context via `saveRecognised`, then `evaluating` uses `always:` transitions to check all guards synchronously against the stored values.
- **Volume captured at recognition time** — `getVolumeLevel()` is called once in `saveRecognised` and stored in context, so all guards read the same snapshot rather than measuring at different moments.
- **Temple attempt tracking** — `templeAttempts` and `templeNoInputCount` in context track failures across states, allowing death after repeated wrong attempts or silence.
- **Fresh actor on restart** — after a `final` state, a brand new XState actor is created on `startGame()` since a stopped actor cannot be restarted.
- **Random room selection** — `pickRooms()` filters all rooms by type at game start and randomly picks one variant per room type.
- **Grumpy guard and GameThreat** — `checkGuardIntent` checks room id at runtime to restrict intents, and sends `GUARD_THREAT` event when threat intent is detected, routing to `guardKill`.

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Add Azure credentials

Create `src/azure.ts` (not committed):
```typescript
export const SPEECH_KEY = "your-azure-speech-key";
export const SPEECH_REGION = "swedencentral";

export const LANG_KEY = "your-azure-language-key";
export const LANG_ENDPOINT = "https://your-resource.cognitiveservices.azure.com";
export const LANG_PROJECT = "your-project-name";
export const LANG_DEPLOYMENT = "your-deployment-name";

export const CUSTOM_SPEECH_ENDPOINT_ID = "your-custom-speech-endpoint-id";
```

### 3. Run the dev server
```bash
npm run dev
```

### 4. Open in browser, click **Start Game**, and begin speaking.

---

## Azure CLU Setup

Your Azure Language project must recognise the following intents for the guard room:

| Intent | Example Utterances |
|--------|--------------------|
| `GamePolite` | "Please move", "Could you step aside", "Excuse me sir" |
| `GameCommand` | "Move", "Step aside", "Let me pass" |
| `GameGreeting` | "Hello", "Good day", "Hey there" |
| `GameThreat` | "Move or I'll kill you", "Step aside or face me" |

---

## Azure Custom Speech Model

The temple room uses a custom speech model trained to recognise the password *"Adib"* across accents and pronunciation variants. The endpoint is configured in SpeechState settings:
```typescript
const settings: Settings = {
  speechRecognitionEndpointId: "your-custom-speech-endpoint-id",
  locale: "en-US",
  ...
};
```

A confidence threshold of `0.6` is applied — if the model is at least 60% confident it heard the password, and the volume is within range, the temple door opens.

---

## Known Limitations

- Volume is captured at the moment recognition completes, not averaged over the whole utterance. A loud start followed by a quiet finish may still pass.
- The 800ms ASR close delay is fixed — on slower connections SpeechState may need longer to close the session, causing the SPEAK command to be ignored.
- The Stately inspector opens a new tab automatically on every `startGame()` call — disable by removing `inspect: inspector.inspect` from `createActor` in production.
- Random room selection is done once per `startGame()` call — you cannot see which variant you got until you enter the room.

---

## Credits

Built as part of a dialogue systems course project using Azure Cognitive Services, SpeechState, and XState v5.