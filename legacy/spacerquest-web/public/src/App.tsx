import { useEffect } from 'react';
import { useGameState } from './store/gameState';
import { Terminal } from './components/Terminal';
import './App.css';

function App() {
  const { connect, isConnected, isReady } = useGameState();

  useEffect(() => {
    // In a real flow, you'd get this from local storage or URL param from OAuth
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      connect(token);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [connect]);

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#111', color: '#fff' }}>
      <header style={{ padding: '1rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>SpacerQuest v4.0 Terminal</h1>
          <div style={{ fontSize: '0.8rem', color: isReady ? '#0f0' : (isConnected ? '#aa0' : '#f00'), marginTop: '4px' }}>
            {isConnected 
              ? (isReady ? 'Authenticated - Link Established' : 'Connecting to Mainframe...') 
              : 'Offline / Disconnected'}
          </div>
        </div>
        {!isConnected && (
          <div>
            <a href="/auth/dev-login" style={{ padding: '8px 16px', background: '#333', color: '#fff', textDecoration: 'none', borderRadius: '4px', border: '1px solid #555', fontSize: '14px' }}>
              Dev Login
            </a>
          </div>
        )}
      </header>
      
      <main style={{ flex: 1, padding: '2rem', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '800px', border: '1px solid #333', borderRadius: '4px', overflow: 'hidden' }}>
          <Terminal />
        </div>
      </main>
    </div>
  );
}

export default App;
