// Golden regenerator for T-1003's deterministic replay fixture. Runs the two
// committed logs through replay() and prints the exact constants to paste into
// replay-golden.ts. Run: npx tsx packages/sim/src/__tests__/fixtures/gen-golden.ts
import {
  handleMessage,
  serializeSession,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolSession,
} from '../../protocol.js';
import { REPLAY_LOG, REPLAY_LOG_COMBAT } from './replay-golden.js';

function replay(log: ProtocolRequest[]): {
  session: ProtocolSession | null;
  responses: ProtocolResponse[];
} {
  let session: ProtocolSession | null = null;
  const responses: ProtocolResponse[] = [];
  for (const request of log) {
    const result = handleMessage(session, request);
    session = result.session;
    responses.push(result.response);
  }
  return { session, responses };
}

function emit(name: string, log: ProtocolRequest[], sessionConst: string, respConst: string): void {
  const { session, responses } = replay(log);
  if (!session) throw new Error(`${name}: replay produced no session`);
  console.log(`export const ${sessionConst} =\n  ${JSON.stringify(serializeSession(session))};`);
  console.log(`export const ${respConst} =\n  ${JSON.stringify(JSON.stringify(responses))};`);
}

emit('primary', REPLAY_LOG, 'REPLAY_GOLDEN_SESSION', 'REPLAY_GOLDEN_RESPONSES');
emit('combat', REPLAY_LOG_COMBAT, 'REPLAY_GOLDEN_COMBAT_SESSION', 'REPLAY_GOLDEN_COMBAT_RESPONSES');
