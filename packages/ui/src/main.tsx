import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';
import { ErrorBoundary, CrashInjector } from './ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

// T-1605 · The whole app is wrapped in a save-preserving ErrorBoundary so a render
// fault recovers to a reboot-from-autosave panel instead of a white screen. The
// CrashInjector is a test-only sibling that throws on `?crash=1` (inert otherwise),
// letting the forced-crash recovery test drive a deterministic fault the boundary
// catches — with no crash trigger anywhere in a game rule.
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <CrashInjector />
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
