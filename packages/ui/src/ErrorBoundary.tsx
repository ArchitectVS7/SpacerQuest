import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * T-1605 · Save-preserving React error boundary.
 *
 * A render throw anywhere below `<App/>` would otherwise white-screen the whole
 * cockpit. This boundary catches it and shows an honest, in-universe failure panel
 * with a single "Reload cockpit" affordance that REBOOTS from the intact autosave.
 *
 * SAVE-PRESERVATION CONTRACT (the boundary's whole reason to exist): this component
 * MUST NEVER touch the save. It never calls `localStorage.removeItem` / `clear`, never
 * calls `newGame`, and never overwrites `sq.save.v1`. Autosave already persists the
 * career per-action and at dusk, so recovery is simply a reboot — the boundary's job
 * is to recover WITHOUT save loss, and wiping the save would defeat that job. The
 * forced-crash acceptance test proves day/credits/seed are byte-identical after the
 * crash→reload, which only holds because nothing here disturbs the autosave.
 */
interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log for a reproducible bug report (TECH-STACK value). NOT a reset — we never
    // clear the save; the autosave the reboot restores from is left untouched.
    console.error('Cockpit render fault (recovered by the error boundary):', error, info);
  }

  private reload = (): void => {
    // Reboot from the intact autosave. Drop any query string (e.g. the test-only
    // `?crash=1` diagnostic flag below) so the reboot does not re-trigger the very
    // fault we are recovering from. The save lives in localStorage and survives this
    // navigation untouched — no save is cleared, so the career comes back whole.
    window.location.assign(window.location.pathname);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="tube">
        <div className="screen">
          <section className="crash-fallback" data-testid="crash-fallback" role="alert">
            <h2 className="cf-title">The cockpit instruments faulted.</h2>
            <p className="cf-body">
              Something threw a fault the console could not ride out. Your career is safe &mdash; it
              was written to the flight recorder before the fault, and nothing here has touched it.
              Reboot the cockpit to pick up exactly where you left off.
            </p>
            <button type="button" className="btn" data-testid="crash-reload" onClick={this.reload}>
              Reload cockpit
            </button>
            {/* The raw fault, for a reproducible bug report. Collapsed by default so
                it never shouts at the player, but present so a captain can copy it. */}
            <details className="cf-detail">
              <summary>Fault detail</summary>
              <pre data-testid="crash-detail">{error.message}</pre>
            </details>
          </section>
        </div>
      </div>
    );
  }
}

/**
 * T-1605 · Test-only crash injector. A tiny component that throws DURING RENDER when —
 * and only when — the URL carries `?crash=1`. It exists so the forced-crash recovery
 * acceptance test (Playwright) can trigger a deterministic render fault the boundary
 * catches, without wiring any crash trigger into a game rule (the engine stays pure and
 * the store never learns about it). Inert in all normal play: with no `crash` query
 * param it renders nothing and never throws. Mounted as a sibling of `<App/>` INSIDE
 * `<ErrorBoundary>` so a throw here is caught by the boundary exactly as a real cockpit
 * fault would be.
 */
export function CrashInjector(): ReactNode {
  const shouldCrash =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('crash') === '1';
  if (shouldCrash) {
    throw new Error('Forced crash (test-only diagnostic: ?crash=1)');
  }
  return null;
}
