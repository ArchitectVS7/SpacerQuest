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

// Handshake/one-shot events whose FIRST delivery must not be lost if it arrives
// before a listener has registered (the auth → main-menu race). Buffered when no
// listener is present and replayed to the first subscriber. Deliberately curated:
// high-frequency events like `travel:progress` are handled internally every 1s and
// must NOT buffer (they would grow unbounded and replay stale frames).
const REPLAY_EVENTS = new Set(['screen:render', 'authenticated', 'travel:complete', 'encounter']);
const MAX_BUFFERED_PER_EVENT = 20;

class WebSocketClient implements WsClient {
  private socket: Socket | null = null;
  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  // Payloads that arrived for a REPLAY_EVENTS event while it had zero listeners.
  private bufferedEvents: Map<string, any[]> = new Map();

  connect() {
    // Idempotent: React StrictMode double-mounts the app, calling connect() twice.
    // socket.io handles drops via its own reconnection, so reuse the live socket
    // rather than orphaning it (which left window.__socketIO pointing at a dead one).
    if (this.socket) return;

    // Fresh connection — drop any stale buffered payloads from a prior session.
    this.bufferedEvents.clear();

    const wsUrl = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:3000`;

    this.socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    // Expose for E2E test access
    (window as any).__socketIO = this.socket;

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
      const { setTravelState, setTravelProgress, setInTransit, token } = useGameStore.getState();
      
      if (data.inTransit) {
        setTravelState(data);
        setTravelProgress(data.progress);
        setInTransit(true);
        
        // Trigger arrival if complete
        if (data.progress >= 100 && token) {
          fetch('/api/navigation/arrive', {
             method: 'POST',
             headers: { 'Authorization': `Bearer ${token}` }
          }).then(res => {
            if (!res.ok) console.error('Failed to arrive:', res.statusText);
          }).catch(console.error);
        }
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
    // Prevent a stale main-menu (or other) render from replaying after logout.
    this.bufferedEvents.clear();
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

    // Replay any payloads that arrived before this event had a listener. The
    // buffer only fills while listener-count is zero, so this is the first
    // subscriber — flushing to it == flushing to all, no double dispatch.
    const buffered = this.bufferedEvents.get(event);
    if (buffered && buffered.length > 0) {
      this.bufferedEvents.delete(event);
      for (const data of buffered) {
        (callback as (data: any) => void)(data);
      }
    }
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
    if (listeners && listeners.size > 0) {
      listeners.forEach(listener => listener(data));
      return;
    }
    // No listener yet — buffer curated handshake events so the first subscriber
    // still receives them (fixes the auth → main-menu render race).
    if (REPLAY_EVENTS.has(event)) {
      const buf = this.bufferedEvents.get(event) ?? [];
      buf.push(data);
      if (buf.length > MAX_BUFFERED_PER_EVENT) buf.shift();
      this.bufferedEvents.set(event, buf);
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
