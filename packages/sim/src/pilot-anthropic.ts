// ---------------------------------------------------------------------------
// T-154 · The pilot's LIVE brain — the only file in the repo that talks to the
// Anthropic API. Everything about WHAT a run does lives in `./pilot.ts`; this
// file only answers one question per step: "which of these candidate ids?".
//
// THE NO-FABRICATION GUARANTEE IS ENFORCED TWICE HERE, on purpose:
//   1. at the API, by a `json_schema` output format whose `actionId` is an ENUM of
//      exactly the ids offered this step — the model is structurally unable to
//      return anything else; and
//   2. in `pilot.ts`, by `resolveDecision` + `assertCandidateIsLegal`, which are
//      what actually decide whether a request is dispatched.
// A refusal, a parse failure or an HTTP error all become a REJECTION that
// `runPilot` logs and falls back from. A run never dies on one bad round trip and
// never invents an action out of prose.
//
// COST: `effort: 'low'` is the primary lever on a paid run, and the system block
// (the stable rules brief + the JSON contract) is cached with
// `cache_control: { type: 'ephemeral' }` — Claude Opus 5's cache minimum is 512
// tokens, so this genuinely caches. Watch `cache_read_input_tokens` go non-zero
// from about step 2; every call's `usage` is recorded on the step entry so T-155
// can build the cost ledger.
//
// NOT COVERED BY THIS FILE OR ANY OTHER: the UI. See PILOT.md §2.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk';

import type {
  PilotBrain,
  PilotDecision,
  PilotDecisionContext,
  PilotUnmappedAnswer,
} from './pilot.js';

/** The model this pilot is specified against. Do not substitute. */
export const PILOT_MODEL = 'claude-opus-5';

/**
 * Non-streaming is fine below ~16k. Thinking is ON BY DEFAULT on Claude Opus 5 and
 * shares this budget, so leave headroom above the tiny JSON answer.
 */
const MAX_TOKENS = 8192;

const SYSTEM_BRIEF = [
  'You are flying a merchant starship in SpacerQuest: Rimward — a seeded, dice-driven',
  'trading and exploration career. Each day you roll a hand of dice; most verbs spend',
  'one. Your job is to keep the ship solvent and the career progressing: earn credits,',
  'keep fuel in the tank, service the Merchant Guild debt before it is called, sign and',
  'deliver contracts, and take the deeds and renown that open the later game.',
  '',
  'HOW YOU ACT. Every turn you are given the current state and a NUMBERED LIST OF LEGAL',
  'MOVES, each with an id. You choose exactly one id. You cannot invent a move, edit a',
  "move's parameters, or describe an action in prose — the list is the whole space of",
  'what the engine will accept right now, and anything else is discarded unplayed.',
  '',
  "HOW TO CHOOSE. Prefer moves that change the ship's position: earn, refuel, deliver,",
  'explore, upgrade. End the day when the dice are gone or nothing on the list is worth',
  "a die. Read each move's note — it carries the caveat the engine attaches to that verb.",
  '',
  'ANSWER FORMAT. Reply with JSON only: {"actionId": "<one id from the list>",',
  '"reason": "<one short sentence>"}. The reason is for the human reading the run log;',
  'keep it to a sentence.',
].join('\n');

interface PilotAnthropicOptions {
  client?: Anthropic;
  model?: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

function renderState(context: PilotDecisionContext): string {
  const lines = [
    `Day ${context.day} (${String(context.summary.phase)}), step ${context.step}.`,
    '',
    "STATE (the engine's own summary, verbatim — nothing pruned):",
    JSON.stringify(context.summary),
    '',
  ];
  if (context.truncated) {
    lines.push(
      'NOTE: the move list below was truncated by a candidate cap. It is a representative',
      'sample of the legal space, not all of it.',
      '',
    );
  }
  lines.push('LEGAL MOVES:');
  for (const candidate of context.candidates) {
    const note = candidate.note === undefined ? '' : `  [note: ${candidate.note}]`;
    lines.push(`  ${candidate.id}: ${candidate.label}${note}`);
  }
  lines.push('', 'Choose exactly one id.');
  return lines.join('\n');
}

function parseAnswer(text: string): PilotDecision | PilotUnmappedAnswer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { raw: text, reason: 'unparseable' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { raw: text, reason: 'unparseable' };
  const record = parsed as Record<string, unknown>;
  const actionId = record['actionId'];
  if (typeof actionId !== 'string') return { raw: text, reason: 'unparseable' };
  const reason = record['reason'];
  return { candidateId: actionId, reason: typeof reason === 'string' ? reason : undefined };
}

/**
 * The live brain. The client is constructed zero-arg on purpose: the SDK resolves
 * `ANTHROPIC_API_KEY`, then `ANTHROPIC_AUTH_TOKEN`, then an `ant auth login`
 * profile. Never hardcode a key and never prompt for one.
 */
export function anthropicBrain(options: PilotAnthropicOptions = {}): PilotBrain {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? PILOT_MODEL;
  const maxTokens = options.maxTokens ?? MAX_TOKENS;
  const effort = options.effort ?? 'low';

  return {
    kind: 'anthropic',
    model,
    async decide(context): Promise<PilotDecision | PilotUnmappedAnswer> {
      // The schema is the API-level half of the no-fabrication guarantee: the id
      // is an enum of exactly what is legal this step. (`enum` is supported;
      // numeric `minimum`/`maximum` are not — hence ids rather than an index.)
      const schema = {
        type: 'object',
        properties: {
          actionId: { type: 'string', enum: context.candidates.map((entry) => entry.id) },
          reason: { type: 'string' },
        },
        required: ['actionId', 'reason'],
        additionalProperties: false,
      };

      let message: Anthropic.Message;
      try {
        message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          // `effort` and `format` are SIBLINGS inside output_config. No
          // temperature/top_p/top_k and no `thinking.budget_tokens` — all four are
          // 400s on Claude Opus 5. Adaptive thinking is the default; leave it unset.
          output_config: { effort, format: { type: 'json_schema', schema } },
          system: [
            {
              type: 'text',
              text: SYSTEM_BRIEF,
              // Stable for the whole run, so it sits before the cache breakpoint;
              // the volatile per-step state goes in the user turn after it.
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: renderState(context) }],
        });
      } catch (error) {
        // Most specific first, and never string-match a message.
        if (error instanceof Anthropic.RateLimitError) {
          return { raw: `rate-limited: ${error.message}`, reason: 'brain-error' };
        }
        if (error instanceof Anthropic.APIConnectionError) {
          return { raw: `connection: ${error.message}`, reason: 'brain-error' };
        }
        if (error instanceof Anthropic.APIError) {
          return { raw: `api-error: ${error.message}`, reason: 'brain-error' };
        }
        throw error;
      }

      // Check the refusal BEFORE reading content — a refused turn may carry none.
      if (message.stop_reason === 'refusal') {
        return { raw: '<refusal>', reason: 'refusal' };
      }
      const usage = message.usage as unknown as Record<string, unknown>;
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      if (text.trim() === '') {
        return {
          raw: `<no text; stop_reason=${String(message.stop_reason)}>`,
          reason: 'unparseable',
        };
      }

      const answer = parseAnswer(text);
      const meta: Record<string, unknown> = { usage, stopReason: message.stop_reason };
      return 'candidateId' in answer ? { ...answer, meta } : { ...answer, meta };
    },
  };
}
