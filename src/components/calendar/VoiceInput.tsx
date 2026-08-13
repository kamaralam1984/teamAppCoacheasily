import { useEffect, useRef, useState } from "react";

interface Props {
  /** Called with the final transcript once listening stops — always editable after. */
  onTranscript: (text: string) => void;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

/** Web Speech is Chrome/Edge only, and only ever under webkitSpeechRecognition. */
function engineCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) ?? null;
}

const SILENCE_MS = 4000;

export function VoiceInput({ onTranscript }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Recognition | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSupported(Boolean(engineCtor()));
    return () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      engineRef.current?.stop();
    };
  }, []);

  const stop = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
    engineRef.current?.stop();
    setListening(false);
  };

  const armSilence = () => {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    // people think mid-sentence — only give up after a real pause
    silenceRef.current = setTimeout(stop, SILENCE_MS);
  };

  const start = async () => {
    setError(null);
    const Ctor = engineCtor();
    if (!Ctor) {
      setSupported(false);
      return;
    }

    // ask for the microphone explicitly so denial is reported honestly
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone blocked. Click the padlock in the address bar → Microphone → Allow, then try again."
          : name === "NotFoundError"
            ? "No microphone found on this device. Typing works exactly the same."
            : "Couldn't open the microphone. Please try again, or type it below.",
      );
      return;
    }

    const engine = new Ctor();
    engine.lang = "en-IN";
    engine.continuous = true;
    engine.interimResults = true;

    let finalText = "";
    let heardSomething = false;

    engine.onresult = (e: any) => {
      heardSomething = true;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += `${chunk} `;
        else interim += chunk;
      }
      setLive(`${finalText}${interim}`.trim());
      armSilence();
    };

    engine.onerror = (e: any) => {
      const kind = e?.error as string | undefined;
      if (kind === "no-speech") {
        setError(heardSomething ? null : "I didn't hear anything. Try speaking a little closer.");
      } else if (kind === "not-allowed" || kind === "service-not-allowed") {
        setError(
          "Microphone blocked. Click the padlock in the address bar → Microphone → Allow, then try again.",
        );
      } else if (kind === "network") {
        setError("Speech recognition needs the internet and it couldn't connect. Try again.");
      } else if (kind === "aborted") {
        setError(null);
      } else {
        setError(`Voice input failed (${kind ?? "unknown"}). Please type it below.`);
      }
      setListening(false);
    };

    engine.onend = () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      setListening(false);
      const text = finalText.trim();
      if (text) {
        onTranscript(text);
        setLive("");
      }
      engineRef.current = null;
    };

    engineRef.current = engine;
    setLive("");
    setListening(true);
    engine.start();
    armSilence();
  };

  if (supported === false) {
    return (
      <p className="rounded-lg border border-line bg-cream p-3 text-[12px] text-soft">
        Voice input works in Chrome and Edge. Everywhere else, typing works exactly the same.
      </p>
    );
  }
  if (supported === null) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => (listening ? stop() : void start())}
        aria-pressed={listening}
        className={`btn3d w-full sm:w-auto ${listening ? "btn3d-danger" : "btn3d-ghost"}`}
      >
        {listening ? "◼ Stop and use it" : "🎙 Speak it instead"}
      </button>

      {listening ? (
        <p className="rounded-lg border border-gold/40 bg-cream p-3 text-[13px] text-ink">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red align-middle" />
          <span className="font-bold">Listening…</span>{" "}
          {live || "say something like “MCA Marathi every Tuesday 7pm to 8pm until 30 September”."}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red/30 bg-red/10 p-3 text-[12px] font-semibold text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
