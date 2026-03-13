import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useGameState } from '../store/gameState';

export const Terminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { socket, isReady, sendTerminalInput } = useGameState();
  const [currentScreen, setCurrentScreen] = useState('main-menu');

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm
    xtermRef.current = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#00ff00',
        cursor: '#00ff00',
      },
      fontFamily: 'monospace',
      fontSize: 14,
    });
    
    fitAddonRef.current = new FitAddon();
    xtermRef.current.loadAddon(fitAddonRef.current);
    xtermRef.current.open(terminalRef.current);
    fitAddonRef.current.fit();

    // Handle keystrokes
    const inputDisposable = xtermRef.current.onData((data) => {
      xtermRef.current?.write(data);
      if (data.trim() && data.length === 1) {
        sendTerminalInput(currentScreen, data);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      xtermRef.current?.dispose();
    };
  }, []);

  // Update terminal when server sends screen render
  useEffect(() => {
    if (!socket || !isReady) return;

    const handleRender = (res: any) => {
      if (res.output) {
        if (res.output === '\x1b[2J\x1b[H') {
          xtermRef.current?.clear();
        } else {
          xtermRef.current?.write(res.output);
        }
      }
      if (res.screenChangedTo) {
        setCurrentScreen(res.screenChangedTo);
      }
    };

    socket.on('screen:render', handleRender);

    return () => {
      socket.off('screen:render', handleRender);
    };
  }, [socket, isReady]);

  return (
    <div 
      ref={terminalRef} 
      style={{ width: '100%', height: '100%', minHeight: '400px', backgroundColor: 'black', padding: '10px' }} 
    />
  );
};
