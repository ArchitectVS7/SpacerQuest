// ---------------------------------------------------------------------------
// T-202 · UGT adapter — stdio transport shell.
//
// The ONLY place real I/O happens. It reads line-delimited JSON requests from
// stdin, feeds each through the pure {@link handleMessage} core, and writes one
// line-delimited JSON response per request to stdout. All game logic and
// determinism live in the pure core (protocol.ts) — this shell just moves bytes.
//
// A WebSocket transport is a trivial variant of the same idea: on each inbound
// message call {@link handleMessage} with the retained session and send the
// response. {@link makeSessionHandler} exposes that transport-agnostic reducer so
// a ws server can wrap it without duplicating any core logic. See PROTOCOL.md
// § transports.
// ---------------------------------------------------------------------------

import { createInterface, type Interface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleMessage,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolSession,
} from './protocol.js';

/**
 * A stateful, transport-agnostic reducer over the pure core. Retains the current
 * session between calls; each call returns exactly one response. Any transport
 * (stdio, WebSocket, an in-process test) can drive this without touching I/O
 * internals.
 */
export function makeSessionHandler(): (request: ProtocolRequest) => ProtocolResponse {
  let session: ProtocolSession | null = null;
  return (request: ProtocolRequest): ProtocolResponse => {
    const result = handleMessage(session, request);
    session = result.session;
    return result.response;
  };
}

/** Parse one request line and dispatch it, returning the response line (JSON). */
export function processLine(
  line: string,
  handler: (request: ProtocolRequest) => ProtocolResponse,
): string | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;
  let request: ProtocolRequest;
  try {
    request = JSON.parse(trimmed) as ProtocolRequest;
  } catch {
    const response: ProtocolResponse = {
      type: 'error',
      code: 'unknown-request',
      message: 'Request line was not valid JSON',
    };
    return JSON.stringify(response);
  }
  return JSON.stringify(handler(request));
}

/** Wire the pure core to process stdin/stdout as line-delimited JSON. Returns the
 *  readline interface so a caller/test can await its `close` event. */
export function runStdioAdapter(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Interface {
  const handler = makeSessionHandler();
  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const responseLine = processLine(line, handler);
    if (responseLine !== null) {
      output.write(`${responseLine}\n`);
    }
  });
  return rl;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  runStdioAdapter();
}
