import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element missing');

// T-1605a · The boundary sits INSIDE StrictMode and OUTSIDE App, so it covers
// every cockpit component — the ending screen, every overlay and every pane —
// with nothing rendered beneath the root that could fault outside its reach.
createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
