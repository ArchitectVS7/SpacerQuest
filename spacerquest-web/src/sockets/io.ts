/**
 * SpacerQuest v4.0 - Shared Socket.IO Instance
 *
 * Singleton reference so routes and jobs can emit events
 * without circular imports.
 */

import { Server as SocketIOServer } from 'socket.io';

let _io: SocketIOServer | null = null;

export function setIO(io: SocketIOServer): void {
  _io = io;
}

export function getIO(): SocketIOServer | null {
  return _io;
}
