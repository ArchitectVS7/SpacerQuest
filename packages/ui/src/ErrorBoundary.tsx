import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { quarantineAndClearAutosave, recordPlaytestCrash } from './store';

/**
 * T-1605a · CRASH RECOVERY.
 *
 * Before this file an unexpected render-time fault anywhere in the cockpit tore
 * the whole React tree down to a blank tube: the player saw nothing, was told
 * nothing, and had no way back in short of guessing that a manual reload would
 * work. Their career was never actually lost — the store autosaves after EVERY
 * mutating action (`store.ts autosave`) — but nothing on screen said so.
 *
 * This is the ONE class component in a codebase of function components, and it
 * has to be: `getDerivedStateFromError` / `componentDidCatch` are the React error
 * boundary contract and have no hook equivalent.
 *
 * HARD RULE, and it is load-bearing: {@link CrashScreen} formats NO numbers and
 * reads NO game state. A recovery screen that re-enters the code which just
 * failed is not a recovery screen — if the fault were in a formatter, the
 * boundary would fault while rendering its own apology and React would unmount
 * the tree for good. (The e2e spec forces exactly that class of fault by
 * poisoning `Number.prototype.toLocaleString`, which the cockpit's always-mounted
 * bezel calls.) It renders its own `.tube`/`.screen` shell — plain text and
 * buttons — so a crash still looks like the machine, not a browser error page.
 *
 * SCOPE: this is UI-layer only. No engine file is touched, no rule is added, and
 * `console.error` here is a client concern — the no-I/O purity constraint governs
 * the engine, which this never calls.
 *
 * T-141 · THE BOUNDARY ALSO FEEDS THE OPT-IN PLAYTEST LOG.
 * `docs/PLAYTEST-TELEMETRY_SPEC.md` §1 requires that anything caught here be
 * appended as its own entry kind, "so a crash is in the exported log even if the
 * player never thinks to flag it". {@link ErrorBoundary.componentDidCatch}
 * therefore calls the store's `recordPlaytestCrash` alongside its existing
 * `console.error`. Three properties keep that from eroding the HARD RULE above:
 * it is MESSAGE-ONLY and REDACTED (`playtestLog.ts`'s `redactErrorMessage`
 * strips path-shaped text, which is what would otherwise leak the player's OS
 * username); it is a NO-OP unless the player turned logging on in Settings; and
 * it reads NO game state here — the store looks up the day on its own side,
 * inside a `try/catch` that swallows, so nothing on this file's recovery path
 * can fault. `CrashScreen` is untouched and still formats no numbers.
 */

interface BoundaryState {
  error: Error | null;
  /** Bumped on resume so the children get a genuine fresh MOUNT rather than a
   *  re-render of a subtree React has already torn down. */
  mountKey: number;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, mountKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    // A thrown non-Error (a string, a rejected value) is still shown honestly
    // rather than collapsed into a generic line.
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The fault is never swallowed: it reaches the console with its component
    // stack so a player's report is reproducible.
    console.error('[T-1605a] cockpit fault', error, info.componentStack);
    // T-141 · …and into the opt-in playtest log, message-only and redacted (see
    // the header). A no-op when the player never enabled logging; never throws,
    // because the store's own entry point swallows.
    recordPlaytestCrash(error);
  }

  private readonly resume = (): void => {
    this.setState((s) => ({ error: null, mountKey: s.mountKey + 1 }));
  };

  render(): ReactNode {
    const { error, mountKey } = this.state;
    if (!error) return <Fragment key={mountKey}>{this.props.children}</Fragment>;
    return <CrashScreen error={error} onResume={this.resume} />;
  }
}

/**
 * The fault screen. Three exits, in increasing order of destructiveness — and
 * none of them can lose the career:
 *  - RESUME re-mounts the cockpit from the store already in memory;
 *  - RELOAD reboots the page, which re-reads the intact autosave;
 *  - FRESH CAREER is the only exit that removes the live save, and it routes
 *    through `quarantineAndClearAutosave` so the bytes are copied to
 *    `sq.save.v1.corrupt` first. Without it, a save that faults on every render
 *    would brick the player with no way out but devtools.
 */
function CrashScreen({ error, onResume }: { error: Error; onResume: () => void }): ReactNode {
  return (
    <div className="tube">
      {/* No <EffectsLayer/> and no boot sweep: the fault screen renders only
          plain markup, so nothing here can re-enter the code that just threw. */}
      <div className="crash-shell">
        <div className="crash" data-testid="crash-screen" role="alert">
          <h1 className="crash-title">Console fault</h1>
          <p className="crash-body">
            The cockpit hit an unexpected fault. <b>Your career is safe</b> — the autosave was
            written after your last action and has not been touched.
          </p>
          <pre className="crash-detail" data-testid="crash-detail">
            {error.message}
          </pre>
          <div className="crash-acts">
            <button className="btn" data-testid="crash-resume" onClick={onResume}>
              Resume
            </button>
            <button
              className="btn"
              data-testid="crash-reload"
              onClick={() => window.location.reload()}
            >
              Reload the cockpit
            </button>
            <button
              className="btn"
              data-testid="crash-fresh"
              onClick={() => {
                quarantineAndClearAutosave();
                window.location.reload();
              }}
            >
              Start a fresh career (your save is kept)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
