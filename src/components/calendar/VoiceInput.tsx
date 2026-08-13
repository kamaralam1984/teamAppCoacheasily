import { useEffect, useRef, useState } from "react";

interface Props {
  /** Called with the final transcript when the person stops speaking. */
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

function getEngine(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r: Recognition = new Ctor();
  r.lang = "en-IN";
  r.continuous = true;
  r.interimResults = true;
  return r;
}

/** Speak it, see it, edit it, then let the parser read it. */
export function VoiceInput({ onTranscript }: Props) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(Boolean(getEngine()));
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  const stop = () => {
    engineRef.current?.stop();
    engineRef.current = null;
    setListening(false);
  };

  const start = () => {
    setError(null);
    const engine = getEngine();
    if (!engine) {
      setSupported(false);
      return;
    }
    let finalText = "";
    engine.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += `${chunk} `;
        else interim += chunk;
      }
      setLive(`${finalText}${interim}`.trim());
    };
    engine.onerror = (e: any) => {
      setError(
        e?.error === "not-allowed"
          ? "Microphone permission was blocked. Allow it in your browser, or just type it below."
          : "The microphone didn't catch that. Try again, or type it below.",
      );
      setListening(false);
    };
    engine.onend = () => {
      setListening(false);
      const text = finalText.trim();
      if (text) {
        onTranscript(text);
        setLive("");
      }
    };
    engineRef.current = engine;
    setLive("");
    setListening(true);
    engine.start();
  };

  if (!supported) {
    return (
      <p className="rounded-lg border border-line bg-cream p-3 text-[12px] text-soft">
        This browser can't listen. Chrome on desktop or Android handles voice — everywhere else,
        typing works exactly the same.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        className={`btn3d w-full sm:w-auto ${listening ? "btn3d-danger" : "btn3d-ghost"}`}
      >
        {listening ? "◼ Stop and use it" : "🎙 Speak it instead"}
      </button>

      {listening ? (
        <p className="rounded-lg border border-gold/40 bg-cream p-3 text-[13px] text-ink">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-red align-middle" />
          {live || "Listening… say something like “MCA Marathi every Tuesday 7pm to 8pm until 30 September”."}
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
