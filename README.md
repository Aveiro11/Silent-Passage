# 🤫 Silent Passage Game

A voice-driven stealth dungeon game built with TypeScript, XState v5, and Azure Cognitive Services. Navigate three rooms using only your voice — but be careful how loud you speak. The dragon is sleeping.

---

## How It Works

You are a traveller trying to pass through three rooms, each with its own challenge. You speak your response out loud and the game reacts to **what you say** and **how loudly you say it**.

| Room | Challenge | How to Pass |
|------|-----------|-------------|
| 🐉 Dragon's Corridor | A dragon sleeps in the corridor | Speak quietly (volume ≤ 30) — any word will do, as long as you whisper |
| 💂 Guard's Gate | A guard blocks the gate | Politely ask or greet the guard, quietly |
| 🏛️ Sacred Temple | A temple door demands a password | Whisper the secret password *"Adib"* |

If you speak too loudly near the dragon, it wakes up and kills you. If you threaten the guard or speak rudely, he sends you back to the dragon. If you shout the temple password, you are reset to the start.

---

## Volume System

Every room has a volume threshold. Your microphone is monitored in real time using the Web Audio API. The volume level is measured as an average frequency amplitude (0–255 scale).

| Room | Max Volume Allowed |
|------|--------------------|
| Dragon's Corridor | 30 |
| Guard's Gate | 20–30 |
| Sacred Temple | 30 |

A live volume meter is shown on screen so you can gauge how loudly you are speaking before and during each room.

---

## Password Detection

The temple room uses a trained **Azure Custom Speech model** to recognise the password *"Adib"*. Rather than hardcoding phonetic variants, the game trusts the model's **confidence score** — if the model is at least 60% confident it heard the password (regardless of accent or pronunciation variation), the door opens.

This means:
- Heavy accents are handled gracefully
- You do not need to say it perfectly
- Shouting it still fails (volume check applies independently)

---

## Guard Room — Intent Detection

The guard room uses **Azure Conversational Language Understanding (CLU)** to classify your intent. The following intents are recognised:

| Intent | Example Utterances |
|--------|--------------------|
| `GamePolite` | "Could you please move?", "Excuse me" |
| `GameCommand` | "Move aside", "Let me through" |
| `GameGreeting` | "Hello there", "Good day" |

Any other intent (including threats) sends you back to room 1.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) |
| Bundler | ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat&logo=vite&logoColor=white) |
| State Machine | ![XState](https://img.shields.io/badge/XState_v5-121212?style=flat&logo=xstate&logoColor=white) |
| Speech Synthesis | ![Azure](https://img.shields.io/badge/Azure_TTS-0078D4?style=flat&logo=microsoftazure&logoColor=white) |
| Speech Recognition | ![Azure](https://img.shields.io/badge/Azure_Custom_Speech-0078D4?style=flat&logo=microsoftazure&logoColor=white) |
| Intent Detection | ![Azure](https://img.shields.io/badge/Azure_CLU-0078D4?style=flat&logo=microsoftazure&logoColor=white) |
| Volume Detection | ![WebAudio](https://img.shields.io/badge/Web_Audio_API-FF6B35?style=flat&logo=webaudio&logoColor=white) |

---

## Project Structure
```
src/
  dm.ts            # Dialogue manager — XState v5 machine, all game logic
  spst-wrapper.ts  # Azure Speech SDK wrapper (speak / listen)
  nlu.ts           # Azure CLU intent detection
  audio.ts         # Microphone volume monitoring (Web Audio API)
  xml-parser.ts    # Loads room definitions from game.xml
  game.xml         # Room content and volume thresholds
  types.ts         # TypeScript interfaces
  main.ts          # Entry point, UI wiring, volume meter
  style.css        # Game UI styles
  azure.ts         # API keys (not committed)
```

---

## Dialogue State Machine

The XState v5 machine drives the entire game flow:
```
loading → room → retrying
               → dragonPass   → room
               → death        (final)
               → awaitGuardIntent → nextRoom
                                  → guardRejected → room
               → templeFailed → room
               → victory      (final)
               → nextRoom     → room / victory
```

Key design decisions:

- **`FEEDBACK_DONE` event pattern** — spoken feedback (e.g. "The guard is offended") sends a `FEEDBACK_DONE` event from its TTS callback before transitioning to the next state. This ensures the machine never transitions mid-speech.
- **`NO_INPUT` event** — silence and noise are routed as a dedicated `NO_INPUT` event rather than an empty `SPEECH_RESULT`, preventing empty strings from reaching guards that don't expect them.
- **Adaptive mic delay** — the microphone opens after a delay calculated from the text length of the room prompt (`wordCount / 150 * 60000 + 1500ms`), preventing TTS audio from bleeding into the recogniser.
- **Fresh actor on restart** — after a `final` state (death or victory), a brand new XState actor is created on `startGame()` since a stopped actor cannot be restarted.
- **`isDefaultPass` guard exclusion** — the dragon, guard, and temple rooms are explicitly excluded from the default volume-range pass so they can only be cleared by their own dedicated guards.

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

---

## Azure Custom Speech Model

The temple room uses a custom speech model trained to recognise the password *"Adib"* across accents and pronunciation variants. The model endpoint ID is set in `spst-wrapper.ts`:
```typescript
speechConfig.endpointId = "your-custom-model-endpoint-id";
speechConfig.speechRecognitionLanguage = "en-US";
```

A confidence threshold of `0.6` is applied — if the model is at least 60% confident it heard the password, and the volume is within range, the temple door opens.

---

## Known Limitations

- The volume meter reads instantaneous amplitude at the moment recognition completes, not the average over the whole utterance. A loud start followed by a quiet finish may still pass.
- TTS bleed (the microphone picking up speaker output) is mitigated by an adaptive delay but may still occur on very loud speaker setups. Using headphones is recommended.
- The game must be reloaded if the Azure Speech session expires mid-game.

---

## Credits

Built as part of a dialogue systems course project using Azure Cognitive Services and XState v5.
