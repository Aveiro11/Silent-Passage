import { setup, assign, createActor } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { getVolumeLevel } from "./audio";
import { detectIntent } from "./nlu";
import { loadRooms } from "./xml-parser";
import xmlText from "./game.xml?raw";
import {
  SPEECH_KEY,
  SPEECH_REGION,
  CUSTOM_SPEECH_ENDPOINT_ID,
} from "./azure";

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
  lastConfidence: number;
  volume: number;
  templeAttempts: number;
  templeNoInputCount: number;
  spstRef: any;
}

type GameEvent =
  | { type: "INIT"; rooms: Room[] }
  | { type: "ASRTTS_READY" }
  | { type: "SPEAK_COMPLETE" }
  | { type: "RECOGNISED"; value: { utterance: string; confidence: number }[] }
  | { type: "ASR_NOINPUT" }
  | { type: "GUARD_THREAT" }
  | { type: "GUARD_RESULT"; pass: boolean };

const settings: Settings = {
  azureCredentials: {
    endpoint: `https://${SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`,
    key: SPEECH_KEY,
  },
  azureRegion: SPEECH_REGION,
  speechRecognitionEndpointId: CUSTOM_SPEECH_ENDPOINT_ID,
  asrDefaultNoInputTimeout: 10000,
  asrDefaultCompleteTimeout: 0,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};
const inspector = createBrowserInspector();

let onGameEnd: (() => void) | null = null;

function spk(spstRef: any, utterance: string) {
  spstRef.send({ type: "SPEAK", value: { utterance } });
}

function lst(spstRef: any) {
  spstRef.send({ type: "LISTEN" });
}

const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
  },

  actions: {
    speakRoom: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (!room) return;
      spk(context.spstRef, room.text.replace(/\s+/g, " ").trim());
    },

    listenForInput: ({ context }) => {
      lst(context.spstRef);
    },

    speakRetry: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "I didn't hear you. Please speak.");
      }, 800);
    },

    listenDelayed: ({ context }) => {
      setTimeout(() => {
        lst(context.spstRef);
      }, 800);
    },

    speakWrongPassword: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "Wrong password. Try again.");
      }, 800);
    },

    incrementTempleNoInput: assign({
      templeNoInputCount: ({ context }) => context.templeNoInputCount + 1,
    }),

    resetTempleNoInput: assign({
      templeNoInputCount: () => 0,
    }),

    incrementTempleAttempts: assign({
      templeAttempts: ({ context }) => context.templeAttempts + 1,
    }),

    resetTempleAttempts: assign({
      templeAttempts: () => 0,
    }),

    speakTempleWrongAndLoud: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "Too loud and wrong at the same time. Calm down and do better.");
      }, 800);
    },

    speakDragonPass: ({ context }) => {
      setTimeout(() => {
        const room = context.rooms[context.currentRoom - 1];
        const msg =
          room?.id === "dragon_halfawake"
            ? "You hold your breath and tiptoe past the restless dragon."
            : "You sneak past the dragon quietly.";
        spk(context.spstRef, msg);
      }, 800);
    },

    speakMovingOn: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "Moving on.");
      }, 800);
    },

    speakGuardKill: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "The guard draws his sword and cuts you down. You should not have threatened him.");
      }, 800);
    },

    speakGuardRejected: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "The guard is offended and pushes you back to the dragon.");
      }, 800);
    },

    speakTempleFail: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "You are too loud. The temple resets and sends you back to the dragon.");
      }, 800);
    },

    speakDeath: ({ context }) => {
      setTimeout(() => {
        const room = context.rooms[context.currentRoom];
        const msg = room?.type === "temple"
          ? "The temple door seals forever. You have failed the trial."
          : "The dragon wakes up and kills you. Game over.";
        spk(context.spstRef, msg);
      }, 800);
    },

    speakVictory: ({ context }) => {
      setTimeout(() => {
        spk(context.spstRef, "You have completed the trial. Victory!");
      }, 800);
    },

    saveRecognised: assign({
      lastText: ({ event }) => {
        const text = event.type === "RECOGNISED"
          ? event.value[0].utterance.toLowerCase().replace(/[^\w\s]/g, "").trim()
          : "";
        const vol = getVolumeLevel();
        console.log(`Recognised: "${text}" | Volume: ${vol.toFixed(1)}`);
        return text;
      },
      lastConfidence: ({ event }) =>
        event.type === "RECOGNISED" ? event.value[0].confidence : 0,
      volume: () => getVolumeLevel(),
    }),

    checkGuardIntent: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      const text = context.lastText.trim();
      const maxVol = room?.maxVolume ?? 30;

      if (!text) {
        service.send({ type: "GUARD_RESULT", pass: false });
        return;
      }

      const allowedIntents =
        room?.id === "guard_grumpy"
          ? ["GameGreeting"]
          : ["GamePolite", "GameCommand", "GameGreeting"];

      detectIntent(text)
        .then((intent) => {
          const volume = getVolumeLevel();
          if (intent === "GameThreat") {
            service.send({ type: "GUARD_THREAT" });
            return;
          }
          const pass =
            allowedIntents.includes(intent ?? "") && volume <= maxVol;
          service.send({ type: "GUARD_RESULT", pass });
        })
        .catch(() => service.send({ type: "GUARD_RESULT", pass: false }));
    },
  },

  guards: {

    isTempleOutOfAttempts: ({ context }) =>
      context.rooms[context.currentRoom]?.type === "temple" &&
      context.templeAttempts >= 2,

    isTempleRoom: ({ context }) =>
      context.rooms[context.currentRoom]?.type === "temple",

    isDragonAndLoud: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return room?.type === "dragon" && context.volume > (room.maxVolume ?? 30);
    },

    isDragonAndQuiet: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return (
        room?.type === "dragon" && context.volume <= (room.maxVolume ?? 30)
      );
    },

    isGuardRoom: ({ context }) =>
      context.rooms[context.currentRoom]?.type === "guard" &&
      context.lastText.trim().length > 0,

    isTempleSuccess: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (room?.type !== "temple") return false;
      console.log("Temple confidence:", context.lastConfidence, "Volume:", context.volume);
      return (
        context.lastConfidence >= 0.6 &&
        context.volume <= (room.maxVolume ?? 30)
      );
    },

    isTempleFail: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      return (
        room?.type === "temple" && context.volume > (room.maxVolume ?? 30)
      );
    },

    isTempleWrongAndLoud: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (room?.type !== "temple") return false;
      return (
        context.lastConfidence < 0.6 &&
        context.volume > (room.maxVolume ?? 30)
      );
    },

    isDefaultPass: ({ context }) => {
      const room = context.rooms[context.currentRoom];
      if (["dragon", "guard", "temple"].includes(room?.type ?? "")) return false;
      return (
        context.volume >= (room?.minVolume ?? 0) &&
        context.volume <= (room?.maxVolume ?? 255)
      );
    },

    isTempleNoInputDead: ({ context }) =>
      context.templeNoInputCount >= 2,

    isRoomsExhausted: ({ context }) =>
      context.currentRoom >= context.rooms.length,

    guardPassed: ({ event }) =>
      event.type === "GUARD_RESULT" && event.pass,

    guardFailed: ({ event }) =>
      event.type === "GUARD_RESULT" && !event.pass,
  },

}).createMachine({
  id: "game",
  initial: "loading",
  context: ({ spawn }) => ({
    rooms: [],
    currentRoom: 0,
    lastText: "",
    lastConfidence: 0,
    volume: 0,
    templeAttempts: 0,
    templeNoInputCount: 0,
    spstRef: spawn(speechstate, { input: settings }),
  }),

  states: {
    loading: {
      entry: ({ context }) => {
        context.spstRef.send({ type: "PREPARE" });
      },
      on: {
        ASRTTS_READY: "waitForInit" as const,
      },
    },

    waitForInit: {
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
        SPEAK_COMPLETE: { actions: [{ type: "listenForInput" }] },
        ASR_NOINPUT: [
          { guard: "isTempleRoom", target: "templeNoInput" as const },
          { target: "retrying" as const },
        ],
        RECOGNISED: [
          {
            guard: ({ event }) =>
              event.type === "RECOGNISED" &&
              event.value[0].utterance.trim().length < 2,
            target: "retrying" as const,
          },
          {
            actions: "saveRecognised" as const,
            target: "evaluating" as const,
          },
        ],
      },
    },

    evaluating: {
      always: [
        { guard: "isDragonAndLoud", target: "dying" as const },
        { guard: "isDragonAndQuiet", target: "dragonPass" as const },
        { guard: "isGuardRoom", target: "awaitGuardIntent" as const },
        { guard: "isTempleWrongAndLoud", target: "templeWrongAndLoud" as const },
        { guard: "isTempleSuccess", target: "winning" as const },
        { guard: "isTempleFail", target: "templeFailed" as const },
        { guard: "isDefaultPass", target: "nextRoom" as const },
        { guard: "isTempleOutOfAttempts", target: "dying" as const },
        { target: "templeRetrying" as const },
      ] as const,
    },

    retrying: {
      entry: { type: "speakRetry" },
      on: {
        SPEAK_COMPLETE: { actions: { type: "listenForInput" } },
        ASR_NOINPUT: { target: "retrying" as const },
        RECOGNISED: [
          {
            guard: ({ event }) =>
              event.type === "RECOGNISED" &&
              event.value[0].utterance.trim().length < 2,
            target: "retrying" as const,
          },
          {
            actions: "saveRecognised" as const,
            target: "evaluating" as const,
          },
        ],
      },
    },

    templeRetrying: {
      entry: [
        { type: "incrementTempleAttempts" },
        { type: "speakWrongPassword" },
      ] as const,
      on: {
        SPEAK_COMPLETE: { actions: { type: "listenForInput" } },
        ASR_NOINPUT: { target: "templeNoInput" as const },
        RECOGNISED: [
          {
            guard: ({ event }) =>
              event.type === "RECOGNISED" &&
              event.value[0].utterance.trim().length < 2,
            target: "templeNoInput" as const,
          },
          {
            actions: { type: "saveRecognised" },
            target: "evaluating" as const,
          },
        ],
      },
    },

    templeNoInput: {
      entry: [
        { type: "incrementTempleNoInput" },
        { type: "speakRetry" },
      ] as const,
      on: {
        SPEAK_COMPLETE: [
          { guard: "isTempleNoInputDead", target: "dying" as const },
          { actions: { type: "listenForInput" } },
        ] as const,
        ASR_NOINPUT: { target: "templeNoInput" as const },
        RECOGNISED: [
          {
            guard: ({ event }) =>
              event.type === "RECOGNISED" &&
              event.value[0].utterance.trim().length < 2,
            target: "templeNoInput" as const,
          },
          {
            actions: { type: "saveRecognised" },
            target: "evaluating" as const,
          },
        ],
      },
    },

    nextRoom: {
      entry: [
        assign({ currentRoom: ({ context }) => context.currentRoom + 1 }),
        { type: "speakMovingOn" },
      ] as const,
      on: {
        SPEAK_COMPLETE: [
          { guard: "isRoomsExhausted", target: "winning" as const },
          { target: "room" as const },
        ] as const,
      },
    },

    dragonPass: {
      entry: [
        assign({ currentRoom: ({ context }) => context.currentRoom + 1 }),
        { type: "speakDragonPass" },
      ] as const,
      on: {
        SPEAK_COMPLETE: [
          { guard: "isRoomsExhausted", target: "winning" as const },
          { target: "room" as const },
        ] as const,
      },
    },

    templeFailed: {
      entry: [
        assign({ currentRoom: () => 0 }),
        { type: "resetTempleAttempts" },
        { type: "resetTempleNoInput" },
        { type: "speakTempleFail" },
      ] as const,
      on: { SPEAK_COMPLETE: "room" as const },
    },

    templeWrongAndLoud: {
      entry: [
        { type: "incrementTempleAttempts" },
        { type: "speakTempleWrongAndLoud" },
      ] as const,
      on: {
        SPEAK_COMPLETE: [
          { guard: "isTempleOutOfAttempts", target: "dying" as const },
          { target: "templeNoInput" as const },
        ] as const,
      },
    },

    guardRejected: {
      entry: [
        assign({ currentRoom: () => 0 }),
        { type: "speakGuardRejected" },
      ] as const,
      on: { SPEAK_COMPLETE: "room" as const },
    },

    awaitGuardIntent: {
      entry: { type: "checkGuardIntent" },
      on: {
        GUARD_RESULT: [
          { guard: "guardPassed", target: "nextRoom" as const },
          { guard: "guardFailed", target: "guardRejected" as const },
        ] as const,
        GUARD_THREAT: { target: "guardKill" as const },
      },
    },

    guardKill: {
      entry: { type: "speakGuardKill" },
      on: {
        SPEAK_COMPLETE: "death" as const,
      },
    },

    dying: {
      entry: { type: "speakDeath" },
      on: {
        SPEAK_COMPLETE: "death" as const,
      },
    },

    death: {
      type: "final" as const,
    },

    winning: {
      entry: { type: "speakVictory" },
      on: {
        SPEAK_COMPLETE: "victory" as const,
      },
    },

    victory: {
      type: "final" as const,
    },
  },
});

let service = createActor(gameMachine);

function pickRooms(allRooms: Room[]): Room[] {
  const dragonOptions = allRooms.filter((r) => r.type === "dragon");
  const guardOptions = allRooms.filter((r) => r.type === "guard");
  const templeOptions = allRooms.filter((r) => r.type === "temple");
  const pick = (arr: Room[]) => arr[Math.floor(Math.random() * arr.length)];
  return [pick(dragonOptions), pick(guardOptions), pick(templeOptions)];
}


export async function startGame(onEnd?: () => void) {
  const allRooms: Room[] = await loadRooms(xmlText);
  onGameEnd = onEnd ?? null;

  try { service.stop(); } catch { }
  service = createActor(gameMachine, {
    inspect: inspector.inspect,
  });

  let initSent = false;

  service.subscribe((snapshot) => {
    if (snapshot.status === "done") {
      setTimeout(() => onGameEnd?.(), 4000);
    }
    if (!initSent && snapshot.matches("waitForInit")) {
      initSent = true;
      service.send({ type: "INIT", rooms: pickRooms(allRooms) });
    }
  });

  service.start();
}

export { startGame as startGameXState };