/**
 * SpacerQuest v4.0 - WebSocket Client
 * 
 * Socket.io client wrapper for real-time game events
 */

import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';

// ============================================================================
// TYPES
// ============================================================================

export interface WsClient {
  connect: () => void;
  disconnect: () => void;
  authenticate: (token: string) => void;
  requestTravelProgress: () => void;
  sendCombatAction: (action: 'FIRE' | 'RETREAT' | 'SURRENDER', round?: number, enemy?: any) => void;
  requestScreen: (screen: string) => void;
  sendScreenInput: (screen: string, input: string) => void;
  on: <T>(event: string, callback: (data: T) => void) => void;
  off: (event: string, callback?: (...args: any[]) => void) => void;
  isConnected: () => boolean;
}

// ============================================================================
// CLIENT IMPLEMENTATION
// ============================================================================

class WebSocketClient implements WsClient {
  private socket: Socket | null = null;
  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  connect() {
    const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3000`;
    
    this.socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('[WS] Connected to server');
      
      // Auto-authenticate if we have a token
      const { token } = useGameStore.getState();
      if (token) {
        this.authenticate(token);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('[WS] Disconnected from server');
    });

    this.socket.on('welcome', (data) => {
      console.log('[WS] Welcome:', data);
      this.emit('welcome', data);
    });

    this.socket.on('authenticated', (data) => {
      console.log('[WS] Authenticated:', data);
      this.emit('authenticated', data);
    });

    this.socket.on('travel:progress', (data) => {
      console.log('[WS] Travel progress:', data);
      const { setTravelState, setTravelProgress, setInTransit } = useGameStore.getState();
      
      if (data.inTransit) {
        setTravelState(data);
        setTravelProgress(data.progress);
        setInTransit(true);
      } else {
        setTravelState(null);
        setTravelProgress(0);
        setInTransit(false);
      }
      
      this.emit('travel:progress', data);
    });

    this.socket.on('combat:round', (data) => {
      console.log('[WS] Combat round:', data);
      this.emit('combat:round', data);
    });

    this.socket.on('combat:error', (data) => {
      console.error('[WS] Combat error:', data);
      this.emit('combat:error', data);
    });

    this.socket.on('screen:render', (data) => {
      console.log('[WS] Screen render:', data);
      this.emit('screen:render', data);
    });

    this.socket.on('travel:complete', (data) => {
      console.log('[WS] Travel complete:', data);
      this.emit('travel:complete', data);
    });

    this.socket.on('encounter', (data) => {
      console.log('[WS] Encounter:', data);
      this.emit('encounter', data);
    });

    this.socket.on('daily:tick', (data) => {
      console.log('[WS] Daily tick:', data);
      this.emit('daily:tick', data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  authenticate(token: string) {
    if (this.socket) {
      this.socket.emit('authenticate', { token });
    }
  }

  requestTravelProgress() {
    if (this.socket) {
      this.socket.emit('request:travel-progress');
    }
  }

  sendCombatAction(action: 'FIRE' | 'RETREAT' | 'SURRENDER', round?: number, enemy?: any) {
    if (this.socket) {
      this.socket.emit('combat:action', { action, round, enemy });
    }
  }

  requestScreen(screen: string) {
    if (this.socket) {
      this.socket.emit('screen:request', { screen });
    }
  }

  sendScreenInput(screen: string, input: string) {
    if (this.socket) {
      this.socket.emit('screen:input', { screen, input });
    }
  }

  on<T>(event: string, callback: (data: T) => void) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    if (callback && this.eventListeners.has(event)) {
      this.eventListeners.get(event)!.delete(callback);
    } else if (!callback) {
      this.eventListeners.delete(event);
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(data));
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const wsClient = new WebSocketClient();

// ============================================================================
// REACT HOOK
// ============================================================================

export { useGameStore } from '../store/gameStore';
