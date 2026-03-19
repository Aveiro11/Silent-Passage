import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { SPEECH_KEY, SPEECH_REGION } from "./azure";
import { getVolumeLevel } from "./audio";

const speechConfigForTTS = SpeechSDK.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
speechConfigForTTS.speechSynthesisVoiceName = "en-US-DavisNeural";
const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfigForTTS);


// speak unchanged (uses singleton synthesizer)
export function speak(text: string, onDone?: () => void) {
  synthesizer.speakTextAsync(
    text,
    result => {
      console.log("TTS done", result);
      if (onDone) onDone();   // ✅ trigger next step
    },
    error => console.error("TTS error", error)
  );
}

export function listen(
  onResult: (text: string, confidence: number) => void,
  onNoInput?: () => void,
  timeoutMs = 5000
) {
  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
  // Make recognizer wait for real speech
  speechConfig.setProperty(
    SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
    "5000"
  );

  speechConfig.setProperty(
    SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
    "1500"
  );

  // Apply your CUSTOM SPEECH model here
  speechConfig.endpointId = "ae03e309-27a8-4ccf-9511-9ead39b54b05";
  speechConfig.speechRecognitionLanguage = "en-US";

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  // Apply phrase list HERE (correct place)
  const phraseList = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
  phraseList.addPhrase("Adib");
  phraseList.addPhrase("Adip");
  phraseList.addPhrase("A deep");
  phraseList.addPhrase("Aadeeb");

  let finished = false;

  const timer = window.setTimeout(() => {
    if (finished) return;
    finished = true;
    try { recognizer.close(); } catch { }
    if (onNoInput) onNoInput();
  }, timeoutMs);

  recognizer.recognizeOnceAsync(
    result => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      const text = (result?.text ?? "")
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .trim();

      const json = JSON.parse(result.properties?.getProperty(
        SpeechSDK.PropertyId.SpeechServiceResponse_JsonResult
      ) ?? "{}");
      console.log("Recognized:", text);
      console.log("Recognition details:", {
        reason: result.reason,
        text: result.text,
        duration: result.duration,
        offset: result.offset,
        confidence: json?.NBest?.[0]?.Confidence,
        NBest: json?.NBest,
      });
      console.log("Volume level:", getVolumeLevel());

      //  Ignore noise / empty input
      if (!text || text.length < 2) {
        console.log("Ignored empty/noise input");
        if (onNoInput) onNoInput();
        return;
      }

      const confidence = json?.NBest?.[0]?.Confidence ?? 0;
      onResult(text, confidence);

      setTimeout(() => {
        try { recognizer.close(); } catch { }
      }, 200);
    },
    err => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      console.error("Recognition error:", err);
      if (onNoInput) onNoInput();

      try { recognizer.close(); } catch { }
    }
  );
}