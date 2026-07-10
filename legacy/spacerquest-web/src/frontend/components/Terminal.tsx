/**
 * SpacerQuest v4.0 - Terminal Component
 * 
 * xterm.js terminal emulator configured for 80x24 BBS display
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useGameStore } from '../store/gameStore';
import { wsClient } from '../sockets/wsClient';
import '../styles/terminal.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 24;

const BUFFERED_SCREENS = [
  'traders-buy-fuel', 'traders-sell-fuel', 'traders-cargo',
  'navigate', 'bank-deposit', 'bank-withdraw', 'bank-transfer',
  'shipyard-upgrade', 'registry-search', 'alliance-invest'
];

// Screens that draw their own live display in response to each keystroke (e.g. the
// cloaker toggle uses relative cursor moves). Local echo would offset that redraw,
// so we let the server output be the sole source of truth for these.
const NO_ECHO_SCREENS = ['cloaker-toggle'];

// ============================================================================
// COMPONENT
// ============================================================================

export function TerminalComponent() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputBufferRef = useRef<string>('');

  // Monotonic counter bumped once per applied server render. Exposed on the DOM
  // (data-render-seq) so E2E tests can wait on "a new screen was drawn" instead of
  // polling xterm scrollback text with fixed sleeps. Purely a test signal.
  const [renderSeq, setRenderSeq] = useState(0);
  
  const {
    currentScreen,
    terminalBuffer,
    appendToTerminal,
    clearTerminal,
  } = useGameStore();

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

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

    // Grab keyboard focus on mount so the player can type immediately — xterm
    // otherwise swallows keystrokes until the user clicks into the terminal,
    // which reads as "the prompt is frozen".
    terminal.focus();

    return () => {
      terminal.dispose();
    };
  }, []);

  // Login input handler
  const handleLoginInput = useCallback((input: string) => {
    if (input === 'L') {
      // Login with OAuth
      window.location.href = '/auth/dev-login';
    } else if (input === 'N') {
      // New character - would need to handle OAuth first
      appendToTerminal('\r\nPlease login first with [L]\r\n');
    }
  }, [appendToTerminal]);

  // Character creation input handler
  const handleCharacterCreateInput = useCallback((_input: string) => {
    // Would handle character name input here
  }, []);

  // Handle terminal input
  const handleTerminalInput = useCallback((data: string) => {
    const terminal = terminalInstance.current;
    if (!terminal) return;

    const { currentScreen } = useGameStore.getState();
    const isBuffered = BUFFERED_SCREENS.includes(currentScreen);

    if (isBuffered) {
      if (data === '\r') {
        const input = inputBufferRef.current;
        wsClient.sendScreenInput(currentScreen, input);
        inputBufferRef.current = '';
        terminal.writeln('');
      } else if (data === '\x7f' || data === '\b') {
        if (inputBufferRef.current.length > 0) {
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
          terminal.write('\b \b');
        }
      } else {
        inputBufferRef.current += data.toUpperCase();
        terminal.write(data.toUpperCase());
      }
      return;
    }

    // Default unbuffered handling (single key commands)
    if (data === '\r' || data === '\n' || data === '\x7f' || data === '\b') {
      return;
    }

    // Convert to uppercase for commands
    const input = data.toUpperCase();
    
    // Route input based on current screen
    if (currentScreen === 'login') {
      // Login screen handling
      handleLoginInput(input);
    } else if (currentScreen === 'character-create') {
      // Character creation handling
      handleCharacterCreateInput(input);
    } else {
      // Game screen handling - send to WebSocket
      wsClient.sendScreenInput(currentScreen, input);
    }

    // Echo input to terminal (unless this screen redraws itself per keystroke)
    if (!NO_ECHO_SCREENS.includes(currentScreen)) {
      terminal.write(input);
    }
  }, [handleLoginInput, handleCharacterCreateInput]);

  // Update terminal when buffer changes
  useEffect(() => {
    const terminal = terminalInstance.current;
    if (!terminal || terminalBuffer.length === 0) return;

    terminalBuffer.forEach((line) => {
      terminal.writeln(line);
    });

    clearTerminal();
    // Signal to tests that a render was applied. clearTerminal() empties the buffer,
    // so this effect re-runs and early-returns above without a second bump.
    setRenderSeq((s) => s + 1);
  }, [terminalBuffer, clearTerminal]);

  // Handle screen changes — also re-request when WebSocket reconnects
  useEffect(() => {
    const terminal = terminalInstance.current;
    if (!terminal) return;
    if (currentScreen === 'login' || currentScreen === 'character-create') return;

    // Request immediately (works if WS is already connected)
    wsClient.requestScreen(currentScreen);
    // Re-focus after navigating into a game screen (e.g. login → main-menu) so
    // the terminal is ready for input without a click.
    terminal.focus();

    // Also request after authentication completes (handles race condition
    // where terminal mounts before the WebSocket is connected)
    const onAuth = (data: { success: boolean }) => {
      if (data.success) {
        // Always enforce requesting the current screen on auth to avoid race conditions.
        // It's fine if the server sends it twice.
        wsClient.requestScreen(currentScreen);
        terminal.focus();
      }
    };
    wsClient.on('authenticated', onAuth);
    return () => { wsClient.off('authenticated', onAuth); };
  }, [currentScreen]);

  return (
    <div
      className="terminal-container"
      data-screen={currentScreen}
      data-render-seq={renderSeq}
      data-ready={renderSeq > 0 && currentScreen === 'main-menu' ? 'true' : 'false'}
      onMouseDown={() => terminalInstance.current?.focus()}
    >
      <div className="terminal-wrapper">
        <div ref={terminalRef} className="crt-flicker" />
      </div>
    </div>
  );
}
