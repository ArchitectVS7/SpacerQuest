import { FactionId, REPUTATION_MAX, REPUTATION_MIN } from '@spacerquest/content';
import { GameEvent, GameState } from './types.js';

/**
 * T-1503 · Clamp-and-apply a four-faction reputation change (PRD §8.1), emitting a
 * typed `ReputationChanged` event ONLY when the value actually moves. The shared
 * mover for every organic source — patrol tribute/evasion (combat.ts), smuggling
 * scans (patrol.ts), port deals (port.ts) — and the questline effects
 * (storylets.ts). Mirrors the T-106 `applyDisposition` shape exactly: one clamp,
 * one emitter, a no-op (no event) when the delta is 0 or clamped away.
 *
 * PURITY: takes NO rng and no Date — a pure state mutation + event push, so it can
 * sit behind any existing guard without perturbing a replay's rng stream. The
 * `reason` is a small literal union so a reader can attribute a move to its cause.
 */
export function applyReputation(
  state: GameState,
  faction: FactionId,
  delta: number,
  reason: Extract<GameEvent, { type: 'ReputationChanged' }>['reason'],
  events: GameEvent[],
): void {
  if (delta === 0) return;
  const current = state.player.reputation[faction];
  const next = Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, current + delta));
  if (next === current) return;

  const applied = next - current;
  state.player.reputation[faction] = next;
  events.push({
    type: 'ReputationChanged',
    day: state.day,
    faction,
    delta: applied,
    reputation: next,
    reason,
  });
}
