/**
 * SpacerQuest v4.0 - WebSocket Client
 *
 * Socket.io client wrapper for real-time game events
 */
import { io } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
// ============================================================================
// CLIENT IMPLEMENTATION
// ============================================================================
class WebSocketClient {
    socket = null;
    eventListeners = new Map();
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
            }
            else {
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
    authenticate(token) {
        if (this.socket) {
            this.socket.emit('authenticate', { token });
        }
    }
    requestTravelProgress() {
        if (this.socket) {
            this.socket.emit('request:travel-progress');
        }
    }
    sendCombatAction(action, round, enemy) {
        if (this.socket) {
            this.socket.emit('combat:action', { action, round, enemy });
        }
    }
    requestScreen(screen) {
        if (this.socket) {
            this.socket.emit('screen:request', { screen });
        }
    }
    sendScreenInput(screen, input) {
        if (this.socket) {
            this.socket.emit('screen:input', { screen, input });
        }
    }
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event).add(callback);
    }
    off(event, callback) {
        if (callback && this.eventListeners.has(event)) {
            this.eventListeners.get(event).delete(callback);
        }
        else if (!callback) {
            this.eventListeners.delete(event);
        }
    }
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(listener => listener(data));
        }
    }
    isConnected() {
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
//# sourceMappingURL=wsClient.js.map