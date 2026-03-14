/**
 * SpacerQuest v4.0 - Login Screen Component
 */

import { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { wsClient } from '../sockets/wsClient';

export function LoginScreen() {
  const { setAuthenticated } = useGameStore();
  const [token, setToken] = useState('');

  const handleLogin = () => {
    // Check for token in URL (from OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');

    if (urlToken) {
      setToken(urlToken);
      setAuthenticated(urlToken, '');
      wsClient.connect();
      wsClient.authenticate(urlToken);
      
      // Clean URL
      window.history.replaceState({}, document.title, '/');
      
      // Fetch character data
      fetchCharacter(urlToken);
    }
  };

  const handleDevLogin = () => {
    window.location.href = '/auth/dev-login';
  };

  const fetchCharacter = async (authToken: string) => {
    try {
      const response = await fetch('/api/character', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const { setCharacter, setShip, setCurrentSystem, setDailyTripsRemaining } = useGameStore.getState();
        
        if (data.character) {
          setCharacter(data.character);
        }
        if (data.ship) {
          setShip(data.ship);
        }
        if (data.character?.currentSystem) {
          setCurrentSystem(data.character.currentSystem);
        }
        if (data.dailyTripsRemaining !== undefined) {
          setDailyTripsRemaining(data.dailyTripsRemaining);
        }
      }
    } catch (error) {
      console.error('Failed to fetch character:', error);
    }
  };

  // Auto-handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('token')) {
      handleLogin();
    }
  }, []);

  return (
    <div className="min-h-screen bg-black text-green-500 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <pre className="text-green-500 text-xs md:text-sm leading-tight mb-8">
{`
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[33;1m     S P A C E R  Q U E S T             \x1b[0m
\x1b[33;1m     ----------------------             \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[37m     Version 4.0 - Web Museum Edition    \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m
`}
        </pre>

        <div className="border border-green-500 p-6 mb-6">
          <h1 className="text-xl mb-4 text-center">SpacerQuest Authentication</h1>
          
          <div className="space-y-4">
            <button
              onClick={handleDevLogin}
              className="w-full bg-green-900 hover:bg-green-800 text-green-100 py-3 px-4 border border-green-500"
            >
              [D] Development Login
            </button>
            
            <div className="text-center text-sm text-green-400 mt-4">
              <p>Press [D] or click above to login</p>
            </div>
          </div>
        </div>

        <div className="text-center text-green-400 text-sm">
          <p className="mb-2">SpacerQuest v4.0 - BBS Museum Edition</p>
          <p>A classic space trading and combat game</p>
          <p>Based on the original by Firefox (1991)</p>
        </div>
      </div>
    </div>
  );
}
