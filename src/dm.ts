import { setup, assign, createActor } from "xstate";
import { getVolumeLevel } from "./audio";
import { speak, listen } from "./spst-wrapper";
import { detectIntent } from "./nlu";
import { loadRooms } from "./xml-parser";
import xmlText from "./game.xml?raw";


interface Room {
  id: string;
  type: string;
  text: string;
  minVolume?: number;
  maxVolume?: number;
}

interface GameContext {
  rooms: Room[];
  currentRoom: number;
  lastText: string;
  volume: number;
}

type GameEvent =
  | { type: "INIT"; rooms: Room[] }
  | { type: "SPEECH_RESULT"; text: string; confidence: number }
  | { type: "NO_INPUT" }
  | { type: "GUARD_RESULT"; pass: boolean }
  | { type: "FEEDBACK_DONE" };



let onGameEnd: (() => void) | null = null;

function startListening(delayMs = 2500) {
  setTimeout(() => {
    listen(
      (result, confidence) => service.send({ type: "SPEECH_RESULT", text: result, confidence }),
      () => service.send({ type: "NO_INPUT" }),
      10_000
    );
  }, delayMs);
}


const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },

  actions: {
    // Once TTS is done.
    speakRoom: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (!room) return;
      setTimeout(() => {
        speak(room.text.replace(/\s+/g, " ").trim(), () => {
          const wordCount = room.text.trim().split(/\s+/).length;
          const estimatedMs = Math.ceil((wordCount / 150) * 60_000) + 1500;
          startListening(Math.max(2500, estimatedMs));
        });
      }, 1500);
    },

    // Retry
    speakRetry: () => {
      speak("I didn't hear you. Please speak.", () => startListening(2000));
    },

    speakGuardRejected: () => {
      speak("The guard is offended and pushes you back to the dragon.", () => {
        service.send({ type: "FEEDBACK_DONE" });
      });
    },

    speakTempleFail: () => {
      speak("You are too loud. The temple resets and sends you back to the dragon.", () => {
        service.send({ type: "FEEDBACK_DONE" });
      });
    },

    speakDeath: () => {
      speak("The dragon wakes up and kills you. Game over.", () => {
        onGameEnd?.();
      });
    },

    speakVictory: () => {
      speak("You have completed the trial. Victory!", () => {
        onGameEnd?.();
      });
    },

    checkGuardIntent: ({ context, event }) => {
      const room = context.rooms[context.currentRoom];
      const text = event.type === "SPEECH_RESULT" ? event.text.trim() : "";
      const maxVol = room?.maxVolume ?? 30;

      if (!text) {
        service.send({ type: "GUARD_RESULT", pass: false });
        return;
      }

      const allowedIntents = room?.id === "guard_grumpy"
        ? ["GameGreeting"]
        : ["GamePolite", "GameCommand", "GameGreeting"];

      detectIntent(text)
        .then((intent) => {
          const volume = getVolumeLevel();
          const pass = allowedIntents.includes(intent ?? "") && volume <= maxVol;
          service.send({ type: "GUARD_RESULT", pass });
        })
        .catch(() => service.send({ type: "GUARD_RESULT", pass: false }));
    },
  },

  guards: {
    isDragonAndLoud: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return room?.type === "dragon" && getVolumeLevel() > (room.maxVolume ?? 30);
    },

    isDragonAndQuiet: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return room?.type === "dragon" && getVolumeLevel() <= (room.maxVolume ?? 30);
    },

    isGuardRoom: ({ context, event }) =>
      context.rooms[context.currentRoom]?.type === "guard" &&
      event.type === "SPEECH_RESULT" &&
      event.text.trim().length > 0,

    isTempleSuccess: ({ context, event }) => {
      const room = context.rooms[context.currentRoom];
      if (room?.type !== "temple") return false;
      if (event.type !== "SPEECH_RESULT") return false;
      const confidence = event.confidence ?? 0;
      // If confidence is unavailable
      if (confidence === 0) {
        const text = event.text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, "");
        return ["adib", "adip", "adeep", "aadeeb"].some(p => text.includes(p)) &&
          getVolumeLevel() <= (room.maxVolume ?? 30);
      }
      return confidence >= 0.6 && getVolumeLevel() <= (room.maxVolume ?? 30);
    },

    isTempleFail: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return room?.type === "temple" && getVolumeLevel() > (room.maxVolume ?? 30);
    },

    isDefaultPass: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (["dragon", "guard", "temple"].includes(room?.type ?? "")) return false;
      const vol = getVolumeLevel();
      return vol >= (room?.minVolume ?? 0) && vol <= (room?.maxVolume ?? 255);
    },

    isRoomsExhausted: ({ context }) =>
      context.currentRoom >= context.rooms.length,

    guardPassed: ({ event }) => event.type === "GUARD_RESULT" && event.pass,
    guardFailed: ({ event }) => event.type === "GUARD_RESULT" && !event.pass,
  },

}).createMachine({
  id: "game",
  initial: "loading",
  context: {
    rooms: [],
    currentRoom: 0,
    lastText: "",
    volume: 0,
  },

  states: {
    loading: {
      on: {
        INIT: {
          target: "room" as const,
          actions: assign({ rooms: ({ event }) => event.rooms }),
        },
      },
    },

    room: {
      entry: { type: "speakRoom" },
      on: {
        NO_INPUT: { target: "retrying" as const },
        SPEECH_RESULT: [
          { guard: "isDragonAndLoud", target: "death" as const },
          { guard: "isDragonAndQuiet", target: "dragonPass" as const },
          { guard: "isGuardRoom", target: "awaitGuardIntent" as const },
          { guard: "isTempleSuccess", target: "victory" as const },
          { guard: "isTempleFail", target: "templeFailed" as const },
          { guard: "isDefaultPass", target: "nextRoom" as const },
          { target: "retrying" as const },
        ] as const,
      },
    },

    retrying: {
      entry: { type: "speakRetry" },
      on: {
        NO_INPUT: { target: "retrying" as const },
        SPEECH_RESULT: [
          { guard: "isDragonAndLoud", target: "death" as const },
          { guard: "isDragonAndQuiet", target: "dragonPass" as const },
          { guard: "isGuardRoom", target: "awaitGuardIntent" as const },
          { guard: "isTempleSuccess", target: "victory" as const },
          { guard: "isTempleFail", target: "templeFailed" as const },
          { guard: "isDefaultPass", target: "nextRoom" as const },
          { target: "retrying" as const },
        ] as const,
      },
    },

    nextRoom: {
      entry: [
        assign({ currentRoom: ({ context }) => context.currentRoom + 1 }),
        () => speak("Moving on.", () => service.send({ type: "FEEDBACK_DONE" })),
      ] as const,
      on: {
        FEEDBACK_DONE: [
          { guard: "isRoomsExhausted", target: "victory" as const },
          { target: "room" as const },
        ] as const,
      },
    },

    templeFailed: {
      entry: [
        assign({ currentRoom: () => 0 }),
        { type: "speakTempleFail" as const },
      ] as const,
      on: { FEEDBACK_DONE: "room" as const },
    },

    guardRejected: {
      entry: [
        assign({ currentRoom: () => 0 }),
        { type: "speakGuardRejected" as const },
      ] as const,
      on: { FEEDBACK_DONE: "room" as const },
    },

    dragonPass: {
      entry: [
        assign({ currentRoom: ({ context }) => context.currentRoom + 1 }),
        ({ context }: { context: GameContext }) => {
          const room = context.rooms[context.currentRoom - 1];
          const msg = room?.id === "dragon_halfawake"
            ? "You hold your breath and tiptoe past the restless dragon."
            : "You sneak past the dragon quietly.";
          speak(msg, () => {
            setTimeout(() => service.send({ type: "FEEDBACK_DONE" }), 2000);
          });
        },
      ] as const,
      on: {
        FEEDBACK_DONE: [
          { guard: "isRoomsExhausted", target: "victory" as const },
          { target: "room" as const },
        ] as const,
      },
    },

    awaitGuardIntent: {
      entry: { type: "checkGuardIntent" },
      on: {
        GUARD_RESULT: [
          { guard: "guardPassed", target: "nextRoom" as const },
          { guard: "guardFailed", target: "guardRejected" as const },
        ] as const,
      },
    },

    death: {
      entry: { type: "speakDeath" },
      type: "final" as const,
    },

    victory: {
      entry: { type: "speakVictory" },
      type: "final" as const,
    },
  },
});

let service = createActor(gameMachine);

function pickRooms(allRooms: Room[]): Room[] {
  const dragonOptions = allRooms.filter(r => r.type === "dragon");
  const guardOptions = allRooms.filter(r => r.type === "guard");
  const templeOptions = allRooms.filter(r => r.type === "temple");
  const pick = (arr: Room[]) => arr[Math.floor(Math.random() * arr.length)];
  return [pick(dragonOptions), pick(guardOptions), pick(templeOptions)];
}

export async function startGame(onEnd?: () => void) {
  const allRooms: Room[] = await loadRooms(xmlText);
  onGameEnd = onEnd ?? null;

  try { service.stop(); } catch { }
  service = createActor(gameMachine);
  service.start();
  service.send({ type: "INIT", rooms: pickRooms(allRooms) });
}

export { startGame as startGameXState };