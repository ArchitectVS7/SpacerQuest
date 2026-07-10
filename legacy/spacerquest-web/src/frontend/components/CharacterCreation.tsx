/**
 * SpacerQuest v4.0 - Character Creation Component
 */

import { useState } from 'react';
import { useGameStore } from '../store/gameStore';

export function CharacterCreationScreen() {
  const { token } = useGameStore();
  const [name, setName] = useState('');
  const [shipName, setShipName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate inputs
    if (name.length < 3 || name.length > 15) {
      setError('Name must be 3-15 characters');
      setLoading(false);
      return;
    }

    if (shipName.length < 3 || shipName.length > 15) {
      setError('Ship name must be 3-15 characters');
      setLoading(false);
      return;
    }

    // Check reserved prefixes
    const reservedPrefixes = ['THE ', 'J%', '*'];
    const upperName = name.toUpperCase();
    for (const prefix of reservedPrefixes) {
      if (upperName.startsWith(prefix)) {
        setError(`Name cannot start with '${prefix}'`);
        setLoading(false);
        return;
      }
    }

    try {
      const response = await fetch('/auth/character', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, shipName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create character');
      }

      // Character created successfully
      // Reload to fetch character data
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-500 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <pre className="text-green-500 text-xs md:text-sm leading-tight mb-8">
{`
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m     CREATE NEW SPACER                    \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m
`}
        </pre>

        <div className="border border-green-500 p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block mb-2">Spacer Name (3-15 characters):</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                className="w-full bg-black border border-green-500 text-green-500 px-4 py-2 focus:outline-none focus:border-green-300 uppercase"
                maxLength={15}
                autoFocus
              />
            </div>

            <div>
              <label className="block mb-2">Ship Name (3-15 characters):</label>
              <input
                type="text"
                value={shipName}
                onChange={(e) => setShipName(e.target.value.toUpperCase())}
                className="w-full bg-black border border-green-500 text-green-500 px-4 py-2 focus:outline-none focus:border-green-300 uppercase"
                maxLength={15}
              />
            </div>

            {error && (
              <div className="text-red-500 border border-red-500 p-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-900 hover:bg-green-800 text-green-100 py-3 px-4 border border-green-500 disabled:opacity-50"
            >
              {loading ? 'Creating...' : '[C] Create Character'}
            </button>
          </form>
        </div>

        <div className="text-center text-green-400 text-sm">
          <p>Starting Credits: 1,000 cr</p>
          <p>Starting Location: Sun-3 (System 1)</p>
        </div>
      </div>
    </div>
  );
}
