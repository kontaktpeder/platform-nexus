import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser speech-to-text (Web Speech API). Best effort on mobile Safari/Chrome.
 * Returns interim + final chunks; caller decides how to merge into a text field.
 */
export function useSpeechToText(opts?: {
  lang?: string;
  onError?: (message: string) => void;
}) {
  const lang = opts?.lang ?? "nb-NO";
  const onErrorRef = useRef(opts?.onError);
  onErrorRef.current = opts?.onError;

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListenRef = useRef(false);

  useEffect(() => {
    setSupported(!!getSpeechRecognitionCtor());
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    try {
      rec?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
    setInterim("");
  }, []);

  const start = useCallback(
    (onFinal: (transcript: string) => void) => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        onErrorRef.current?.("Tale-til-tekst støttes ikke i denne nettleseren.");
        return;
      }

      stop();
      wantListenRef.current = true;

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event) => {
        let interimText = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript ?? "";
          if (event.results[i].isFinal) finalChunk += piece;
          else interimText += piece;
        }
        setInterim(interimText.trim());
        if (finalChunk.trim()) onFinal(finalChunk.trim());
      };

      rec.onerror = (event) => {
        const code = event.error ?? "unknown";
        if (code === "aborted" || code === "no-speech") return;
        if (code === "not-allowed") {
          onErrorRef.current?.("Mikrofon tilgang ble nektet.");
        } else {
          onErrorRef.current?.(`Tale-til-tekst feilet (${code}).`);
        }
        wantListenRef.current = false;
        setListening(false);
        setInterim("");
      };

      rec.onend = () => {
        // Some mobile browsers end sessions early — restart while user still wants listen.
        if (wantListenRef.current) {
          try {
            rec.start();
            return;
          } catch {
            wantListenRef.current = false;
          }
        }
        setListening(false);
        setInterim("");
        recognitionRef.current = null;
      };

      recognitionRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch {
        onErrorRef.current?.("Klarte ikke starte mikrofonen.");
        wantListenRef.current = false;
        setListening(false);
      }
    },
    [lang, stop],
  );

  useEffect(() => () => stop(), [stop]);

  return { supported, listening, interim, start, stop };
}
