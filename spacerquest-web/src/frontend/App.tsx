/**
 * SpacerQuest v4.0 - Main App Component
 */

import { useEffect, useState } from 'react';
import { useGameStore } from './store/gameStore';
import { wsClient } from './sockets/wsClient';
import { TerminalComponent } from './components/Terminal';
import { LoginScreen } from './components/LoginScreen';
import { CharacterCreationScreen } from './components/CharacterCreation';
import './styles/global.css';

export function App() {
  const {
    isAuthenticated,
    currentScreen,
    setAuthenticated,
    setCurrentScreen,
  } = useGameStore();

  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [needsCharacter, setNeedsCharacter] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuth = async () => {
      // Check for token in URL first
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('token');

      if (urlToken) {
        setAuthenticated(urlToken, '');
        wsClient.connect();
        wsClient.authenticate(urlToken);
        window.history.replaceState({}, document.title, '/');
        
        // Check if user has character
        await checkCharacterStatus(urlToken);
        setHasCheckedAuth(true);
        return;
      }

      // Check for stored token
      const storedToken = localStorage.getItem('spacerquest-storage');
      if (storedToken) {
        try {
          const parsed = JSON.parse(storedToken);
          if (parsed.state?.token) {
            setAuthenticated(parsed.state.token, parsed.state.userId || '');
            wsClient.connect();
            wsClient.authenticate(parsed.state.token);
            
            await checkCharacterStatus(parsed.state.token);
          }
        } catch (e) {
          console.error('Failed to parse stored auth:', e);
        }
      }
      
      setHasCheckedAuth(true);
    };

    checkAuth();
  }, []);

  const checkCharacterStatus = async (authToken: string) => {
    try {
      const response = await fetch('/auth/status', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (!data.hasCharacter) {
          setNeedsCharacter(true);
          setCurrentScreen('character-create');
        }
      }
    } catch (error) {
      console.error('Failed to check character status:', error);
    }
  };

  // Handle WebSocket events
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleScreenRender = (data: { output: string; nextScreen?: string }) => {
      const { appendToTerminal, setCurrentScreen, logout } = useGameStore.getState();
      
      if (data.output) {
        appendToTerminal(data.output);
      }
      
      if (data.nextScreen) {
        if (data.nextScreen === 'login') {
          logout();
        } else {
          setCurrentScreen(data.nextScreen);
        }
      }
    };

    const handleTravelComplete = (data: { systemId: number; systemName: string; encounter?: any; hazards?: any[]; screenOverride?: string }) => {
      const { setCurrentSystem, setInTransit, appendToTerminal, setCurrentScreen } = useGameStore.getState();

      setCurrentSystem(data.systemId);
      setInTransit(false);

      // Show hazard events that occurred during transit
      if (data.hazards && data.hazards.length > 0) {
        for (const h of data.hazards) {
          if (h.evaded) {
            appendToTerminal(`\r\n\x1b[36m${h.hazardName} detected! Shields deflect it.\x1b[0m`);
          } else {
            appendToTerminal(`\r\n\x1b[31m${h.hazardName}! ${h.action} ${h.component}!\x1b[0m`);
          }
        }
      }

      appendToTerminal(`\r\n\x1b[32mArrived at ${data.systemName}!\x1b[0m\r\n`);

      // Handle encounter from travel
      if (data.encounter && data.encounter.encounter) {
        if (data.encounter.friendly) {
          appendToTerminal(`\r\n\x1b[36m${data.encounter.message}\x1b[0m\r\n`);
        } else {
          appendToTerminal(`\r\n\x1b[31;1m${data.encounter.message}\x1b[0m\r\n`);
          setCurrentScreen('combat');
          return; // combat takes priority
        }
      }

      // Rim ports and other special screens override the default arrival
      if (data.screenOverride) {
        setCurrentScreen(data.screenOverride);
      }
    };

    const handleEncounter = (data: any) => {
      const { setInCombat, setCombatState, appendToTerminal } = useGameStore.getState();
      
      setInCombat(true);
      setCombatState({
        inCombat: true,
        enemy: data.enemy,
        round: 1,
        playerBattleFactor: data.playerBF,
      });
      
      appendToTerminal(`\r\n\x1b[31m⚠ ENCOUNTER: ${data.enemy.name}!\x1b[0m\r\n`);
    };

    wsClient.on('screen:render', handleScreenRender);
    wsClient.on('travel:complete', handleTravelComplete);
    wsClient.on('encounter', handleEncounter);

    // Initial check
    wsClient.requestTravelProgress();

    // Poll travel progress — always poll so we detect travel that started after login
    // Server returns immediately with {inTransit:false} when not traveling; no wasted work.
    const travelInterval = setInterval(() => {
      wsClient.requestTravelProgress();
    }, 2000);

    return () => {
      clearInterval(travelInterval);
      wsClient.off('screen:render', handleScreenRender);
      wsClient.off('travel:complete', handleTravelComplete);
      wsClient.off('encounter', handleEncounter);
    };
  }, [isAuthenticated]);

  // Loading state
  if (!hasCheckedAuth) {
    return (
      <div className="min-h-screen bg-black text-green-500 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">SpacerQuest v4.0</p>
          <p className="animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  // Render based on authentication and character status
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (needsCharacter || currentScreen === 'character-create') {
    return <CharacterCreationScreen />;
  }

  // Main game terminal
  return <TerminalComponent />;
}

export default App;
