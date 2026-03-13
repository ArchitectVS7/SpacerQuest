import { jsx as _jsx } from "react/jsx-runtime";
/**
 * SpacerQuest v4.0 - Terminal Component
 *
 * xterm.js terminal emulator configured for 80x24 BBS display
 */
import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useGameStore } from '../store/gameStore';
import { wsClient } from '../sockets/wsClient';
import '../styles/terminal.css';
// ============================================================================
// CONSTANTS
// ============================================================================
const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 24;
// ============================================================================
// COMPONENT
// ============================================================================
export function TerminalComponent() {
    const terminalRef = useRef(null);
    const terminalInstance = useRef(null);
    const fitAddonRef = useRef(null);
    const { currentScreen, inputMode, terminalBuffer, appendToTerminal, clearTerminal, setPendingAction, } = useGameStore();
    // Initialize terminal
    useEffect(() => {
        if (!terminalRef.current)
            return;
        const terminal = new Terminal({
            cols: TERMINAL_COLS,
            rows: TERMINAL_ROWS,
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: 14,
            theme: {
                background: '#000000',
                foreground: '#00ff00',
                cursor: '#00ff00',
                cursorAccent: '#000000',
                black: '#000000',
                red: '#ff0000',
                green: '#00ff00',
                yellow: '#ffff00',
                blue: '#0000ff',
                magenta: '#ff00ff',
                cyan: '#00ffff',
                white: '#ffffff',
                brightBlack: '#666666',
                brightRed: '#ff6666',
                brightGreen: '#66ff66',
                brightYellow: '#ffff66',
                brightBlue: '#6666ff',
                brightMagenta: '#ff66ff',
                brightCyan: '#66ffff',
                brightWhite: '#ffffff',
            },
            convertEol: true,
            scrollback: 1000,
            cursorBlink: true,
            cursorStyle: 'block',
            disableStdin: false,
        });
        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;
        terminal.open(terminalRef.current);
        terminalInstance.current = terminal;
        // Force 80x24 size
        terminal.resize(TERMINAL_COLS, TERMINAL_ROWS);
        // Handle terminal input
        terminal.onData((data) => {
            handleTerminalInput(data);
        });
        // Clear terminal and show welcome message
        terminal.clear();
        terminal.writeln('\x1b[32mWelcome to SpacerQuest v4.0\x1b[0m');
        terminal.writeln('\x1b[32mBBS Museum Edition\x1b[0m');
        terminal.writeln('');
        return () => {
            terminal.dispose();
        };
    }, []);
    // Handle terminal input
    const handleTerminalInput = useCallback((data) => {
        const terminal = terminalInstance.current;
        if (!terminal)
            return;
        const { currentScreen, pendingAction } = useGameStore.getState();
        // Handle special keys
        if (data === '\r') {
            // Enter key - process current input
            terminal.writeln('');
            return;
        }
        if (data === '\x7f' || data === '\b') {
            // Backspace
            return;
        }
        // Convert to uppercase for commands
        const input = data.toUpperCase();
        // Route input based on current screen
        if (currentScreen === 'login') {
            // Login screen handling
            handleLoginInput(input);
        }
        else if (currentScreen === 'character-create') {
            // Character creation handling
            handleCharacterCreateInput(input);
        }
        else {
            // Game screen handling - send to WebSocket
            wsClient.sendScreenInput(currentScreen, input);
        }
        // Echo input to terminal
        terminal.write(input);
    }, []);
    // Login input handler
    const handleLoginInput = useCallback((input) => {
        if (input === 'L') {
            // Login with OAuth
            window.location.href = '/auth/dev-login';
        }
        else if (input === 'N') {
            // New character - would need to handle OAuth first
            appendToTerminal('\r\nPlease login first with [L]\r\n');
        }
    }, [appendToTerminal]);
    // Character creation input handler
    const handleCharacterCreateInput = useCallback((input) => {
        // Would handle character name input here
    }, []);
    // Update terminal when buffer changes
    useEffect(() => {
        const terminal = terminalInstance.current;
        if (!terminal || terminalBuffer.length === 0)
            return;
        terminalBuffer.forEach((line) => {
            terminal.writeln(line);
        });
        clearTerminal();
    }, [terminalBuffer, clearTerminal]);
    // Handle screen changes
    useEffect(() => {
        const terminal = terminalInstance.current;
        if (!terminal)
            return;
        // Request screen render when screen changes
        if (currentScreen !== 'login' && currentScreen !== 'character-create') {
            wsClient.requestScreen(currentScreen);
        }
    }, [currentScreen]);
    return (_jsx("div", { className: "terminal-container", children: _jsx("div", { className: "terminal-wrapper", children: _jsx("div", { ref: terminalRef, className: "crt-flicker" }) }) }));
}
//# sourceMappingURL=Terminal.js.map