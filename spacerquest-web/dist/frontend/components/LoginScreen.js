import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * SpacerQuest v4.0 - Login Screen Component
 */
import { useState } from 'react';
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
    const fetchCharacter = async (authToken) => {
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
        }
        catch (error) {
            console.error('Failed to fetch character:', error);
        }
    };
    // Auto-handle OAuth callback
    useState(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('token')) {
            handleLogin();
        }
    });
    return (_jsx("div", { className: "min-h-screen bg-black text-green-500 flex items-center justify-center p-4", children: _jsxs("div", { className: "max-w-2xl w-full", children: [_jsx("pre", { className: "text-green-500 text-xs md:text-sm leading-tight mb-8", children: `
\x1b[36;1m_________________________________________\x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[33;1m     S P A C E R  Q U E S T             \x1b[0m
\x1b[33;1m     ----------------------             \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[37m     Version 4.0 - Web Museum Edition    \x1b[0m
\x1b[33;1m                                        \x1b[0m
\x1b[36;1m_________________________________________\x1b[0m
` }), _jsxs("div", { className: "border border-green-500 p-6 mb-6", children: [_jsx("h1", { className: "text-xl mb-4 text-center", children: "SpacerQuest Authentication" }), _jsxs("div", { className: "space-y-4", children: [_jsx("button", { onClick: handleDevLogin, className: "w-full bg-green-900 hover:bg-green-800 text-green-100 py-3 px-4 border border-green-500", children: "[D] Development Login" }), _jsx("div", { className: "text-center text-sm text-green-400 mt-4", children: _jsx("p", { children: "Press [D] or click above to login" }) })] })] }), _jsxs("div", { className: "text-center text-green-400 text-sm", children: [_jsx("p", { className: "mb-2", children: "SpacerQuest v4.0 - BBS Museum Edition" }), _jsx("p", { children: "A classic space trading and combat game" }), _jsx("p", { children: "Based on the original by Firefox (1991)" })] })] }) }));
}
//# sourceMappingURL=LoginScreen.js.map