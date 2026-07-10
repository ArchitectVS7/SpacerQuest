import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface GameState {
  socket: Socket | null;
  isConnected: boolean;
  isReady: boolean;
  token: string | null;
  
  // Actions
  connect: (token: string) => void;
  disconnect: () => void;
  
  // Terminal actions
  sendTerminalInput: (screen: string, input: string) => void;
  requestScreen: (screen: string) => void;
}

export const useGameState = create<GameState>((set, get) => ({
  socket: null,
  isConnected: false,
  isReady: false,
  token: null,

  connect: (token: string) => {
    const { socket } = get();
    if (socket) return;

    // Connect to same host, but explicitly ensuring websocket config
    const newSocket = io({
      transports: ['websocket'],
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      set({ isConnected: true });
      // Authenticate socket using the JWT token
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('authenticated', (data: any) => {
      if (data.success) {
        set({ isReady: true });
        // Request the main-menu upon authenticating
        newSocket.emit('screen:request', { screen: 'main-menu' });
      } else {
        console.error('WebSocket Authentication Failed', data.error);
      }
    });

    newSocket.on('disconnect', () => {
      set({ isConnected: false, isReady: false });
    });

    set({ socket: newSocket, token });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false, isReady: false, token: null });
    }
  },

  sendTerminalInput: (screen: string, input: string) => {
    const { socket, isReady } = get();
    if (socket && isReady) {
      socket.emit('screen:input', { screen, input });
    }
  },

  requestScreen: (screen: string) => {
    const { socket, isReady } = get();
    if (socket && isReady) {
      socket.emit('screen:request', { screen });
    }
  }
}));
