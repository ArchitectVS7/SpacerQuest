import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    const handleSubmit = async (e) => {
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
        }
        catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-black text-green-500 flex items-center justify-center p-4", children: _jsxs("div", { className: "max-w-2xl w-full", children: [_jsx("pre", { className: "text-green-500 text-xs md:text-sm leading-tight mb-8", children: `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m     CREATE NEW SPACER                    \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m
` }), _jsx("div", { className: "border border-green-500 p-6 mb-6", children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-2", children: "Spacer Name (3-15 characters):" }), _jsx("input", { type: "text", value: name, onChange: (e) => setName(e.target.value.toUpperCase()), className: "w-full bg-black border border-green-500 text-green-500 px-4 py-2 focus:outline-none focus:border-green-300 uppercase", maxLength: 15, autoFocus: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-2", children: "Ship Name (3-15 characters):" }), _jsx("input", { type: "text", value: shipName, onChange: (e) => setShipName(e.target.value.toUpperCase()), className: "w-full bg-black border border-green-500 text-green-500 px-4 py-2 focus:outline-none focus:border-green-300 uppercase", maxLength: 15 })] }), error && (_jsx("div", { className: "text-red-500 border border-red-500 p-2", children: error })), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-green-900 hover:bg-green-800 text-green-100 py-3 px-4 border border-green-500 disabled:opacity-50", children: loading ? 'Creating...' : '[C] Create Character' })] }) }), _jsxs("div", { className: "text-center text-green-400 text-sm", children: [_jsx("p", { children: "Starting Credits: 1,000 cr" }), _jsx("p", { children: "Starting Location: Sun-3 (System 1)" })] })] }) }));
}
//# sourceMappingURL=CharacterCreation.js.map