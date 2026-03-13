/**
 * SpacerQuest v4.0 - WebSocket Client
 *
 * Socket.io client wrapper for real-time game events
 */
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
declare class WebSocketClient implements WsClient {
    private socket;
    private eventListeners;
    connect(): void;
    disconnect(): void;
    authenticate(token: string): void;
    requestTravelProgress(): void;
    sendCombatAction(action: 'FIRE' | 'RETREAT' | 'SURRENDER', round?: number, enemy?: any): void;
    requestScreen(screen: string): void;
    sendScreenInput(screen: string, input: string): void;
    on<T>(event: string, callback: (data: T) => void): void;
    off(event: string, callback?: (...args: any[]) => void): void;
    private emit;
    isConnected(): boolean;
}
export declare const wsClient: WebSocketClient;
export { useGameStore } from '../store/gameStore';
//# sourceMappingURL=wsClient.d.ts.map