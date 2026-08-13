import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Catches a render crash so one broken card never blanks the whole screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught", error, info);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-3xl" aria-hidden>
          🪔
        </p>
        <h1 className="mt-3 font-display text-2xl text-ink">This part didn't load</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-soft">
          Something went wrong on our side — nothing you did. Your data is safe. Try again, and if
          it keeps happening tell People &amp; Culture.
        </p>
        <button
          type="button"
          className="btn3d mt-6"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
