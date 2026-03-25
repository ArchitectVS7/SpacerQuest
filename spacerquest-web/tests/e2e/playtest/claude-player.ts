/**
 * SpacerQuest LLM Playtest — Claude Decision Engine
 *
 * Sends game state to Claude and receives a structured action decision.
 * Claude reads the terminal like a player, consults the strategy guide,
 * and explains its reasoning for every move.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STRATEGY_GUIDE_PATH = path.join(__dirname, 'strategy-guide.md');

export type ActionType =
  | 'press_key'      // Single keypress (e.g. 'n', 't', 'b', 'Escape')
  | 'type_and_enter' // Type text then Enter (e.g. destination number, fuel amount)
  | 'wait'           // Wait for animation/loading to finish
  | 'diagnose'       // Agent is confused — invoke diagnosis mode
  | 'end_turn';      // Intentionally end the current turn (D → Y)

export interface PlayerAction {
  type: ActionType;
  /** For press_key: the key string. For type_and_enter: the text to type. */
  value: string;
  reasoning: string;
  expectedOutcome: string;
  /** Optional: what screen or text the agent expects to see after this action */
  expectedScreen?: string;
}

export interface DiagnosisResult {
  problem: string;
  isBug: boolean;          // True = game bug, surface to user. False = recoverable.
  recoveryActions: PlayerAction[];
  shouldRestart: boolean;
}

export interface GameContext {
  terminalText: string;
  currentScreen: string | null;
  stats: {
    credits: number;
    fuel: number;
    system: number;
    cargoPods: number;
    cargoType: number;
    destination: number;
    tripCount: number;
    battlesWon: number;
    rank: string;
    turnsCompleted: number;
    upgradesDone: number;
  };
  goalDescription: string;
  goalProgress: string;
  recentActions: Array<{ action: string; outcome: string }>;
  turnNumber: number;
}

export class ClaudePlayer {
  private client?: Anthropic;
  private model: string;
  private strategyGuide: string;
  private conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];
  private isOllama: boolean;
  private ollamaUrl: string;

  private callCount = 0;

  constructor(model?: string) {
    this.model = model ?? process.env.PLAYTEST_MODEL ?? 'claude-haiku-4-5-20251001';
    this.isOllama = process.env.PLAYTEST_PROVIDER === 'ollama' || !this.model.includes('claude');
    this.ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';

    if (!this.isOllama) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("[claude-player] ANTHROPIC_API_KEY is not set but an Anthropic model was requested.");
      } else {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      }
    }
    this.strategyGuide = fs.readFileSync(STRATEGY_GUIDE_PATH, 'utf-8');
  }

  private async createCompletion(system: string, messages: any[], maxTokens: number): Promise<string> {
    if (this.isOllama) {
      try {
        const res = await fetch(`${this.ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              ...messages
            ],
            stream: false,
            options: { num_predict: maxTokens, num_ctx: 8192 }
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`Ollama Error: ${res.status} ${errText}`);
          return '{}';
        }
        const data = await res.json() as any;
        return data.message?.content || '{}';
      } catch (err) {
        console.error(`[claude-player] Local LLM fetch failed:`, err);
        return '{}';
      }
    } else {
      if (!this.client) throw new Error("Anthropic API Key not configured.");
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system: system,
        messages: messages as any,
      });
      return response.content[0].type === 'text' ? response.content[0].text : '{}';
    }
  }

  /**
   * Decide the next action given the current game context.
   * Uses conversation history so Claude remembers what it has tried.
   */
  async decideNextAction(ctx: GameContext): Promise<PlayerAction> {
    this.callCount++;
    const userMessage = this.buildDecisionPrompt(ctx);

    // First call: include full strategy guide in user message so the model sees it once
    // without it being baked into every subsequent system prompt (saves ~3k tokens/call)
    const firstCallPrefix = this.callCount === 1
      ? `STRATEGY GUIDE (read once, apply throughout):\n${this.strategyGuide}\n\n---\n\n`
      : '';

    this.conversationHistory.push({ role: 'user', content: firstCallPrefix + userMessage });

    const text = await this.createCompletion(this.buildSystemPrompt(), this.conversationHistory, 256);
    this.conversationHistory.push({ role: 'assistant', content: text });

    // Keep history bounded to last 6 exchanges (12 messages) — sufficient context,
    // avoids ballooning token count on long runs with local models
    if (this.conversationHistory.length > 12) {
      this.conversationHistory = this.conversationHistory.slice(-12);
    }

    return this.parseAction(text, ctx);
  }

  /**
   * Diagnose a problem and suggest recovery.
   * Called when an action produced unexpected results.
   */
  async diagnose(
    ctx: GameContext,
    attemptedAction: PlayerAction,
    actualTerminal: string,
  ): Promise<DiagnosisResult> {
    const prompt = `
DIAGNOSIS REQUEST

I attempted this action:
  Type: ${attemptedAction.type}
  Value: "${attemptedAction.value}"
  Expected: "${attemptedAction.expectedOutcome}"
  Expected screen: "${attemptedAction.expectedScreen ?? 'unknown'}"

But the terminal now shows:
---
${actualTerminal.slice(-400)}
---

Current game state:
  Screen: ${ctx.currentScreen ?? 'unknown'}
  Credits: ${ctx.stats.credits}
  System: ${ctx.stats.system}
  Fuel: ${ctx.stats.fuel}

Please diagnose:
1. What went wrong?
2. Is this a game bug (something that should work but doesn't) or did I do something wrong?
3. What recovery steps should I take to get back to a known good state (main menu)?
4. Should I restart the session?

Respond as JSON:
{
  "problem": "description of what went wrong",
  "isBug": true/false,
  "bugDescription": "if isBug, describe the bug for the developer",
  "recoveryActions": [
    {"type": "press_key", "value": "Escape", "reasoning": "...", "expectedOutcome": "...", "expectedScreen": "..."}
  ],
  "shouldRestart": true/false
}`;

    const text = await this.createCompletion(this.buildSystemPrompt(), [{ role: 'user', content: prompt }], 1024);
    return this.parseDiagnosis(text);
  }

  /**
   * Ask Claude to summarize what happened this session.
   * Used at end of test for the report.
   */
  async summarizeSession(ctx: GameContext, stats: object): Promise<string> {
    const systemPrompt = 'You are summarizing a SpacerQuest playtest session. Be concise and analytical.';
    const prompt = `Summarize this playtest session in 3-5 sentences. Focus on: what strategic decisions were made, what worked, what didn't, and whether the goal was achieved.\n\nStats: ${JSON.stringify(stats, null, 2)}\n\nGoal: ${ctx.goalDescription}\nProgress: ${ctx.goalProgress}`;
    
    const text = await this.createCompletion(systemPrompt, [{ role: 'user', content: prompt }], 512);
    return text === '{}' ? 'No summary available.' : text;
  }

  private buildSystemPrompt(): string {
    // Kept short — strategy guide is injected once in the first user message
    return `You are playing SpacerQuest via terminal keypresses. Respond with raw JSON only (no markdown fences):
{"type":"press_key"|"type_and_enter"|"wait"|"end_turn","value":"key or text","reasoning":"why","expectedOutcome":"what happens","expectedScreen":"optional pattern"}

ALWAYS check current screen (shown in STATE as screen=X) before pressing keys:
  screen=main-menu:      B=Bank S=Shipyard P=Pub T=Traders N=Navigate R=Registry I=Alliance end_turn=Done
  screen=shipyard:       U=Upgrade R=Repair S=SpecialEquip M=BackToMainMenu  (NOT T, NOT B)
  screen=shipyard-upgrade: type_and_enter "1"-"8" to upgrade; type_and_enter "0" or "M" to cancel
  screen=traders:        B=BuyFuel S=SellFuel A=AcceptCargo M=BackToMainMenu
  screen=traders-cargo:  type_and_enter "1"-"4" to pick contract; type_and_enter "Q" to cancel
  screen=navigate:       STEP 1: type_and_enter the system number (1-28); STEP 2: fee confirmation appears → type_and_enter "Y" to launch (screen stays as navigate between steps)
  screen=pub:            D=Drink G=Gossip W=Wheel E=Dare M=Back
  screen=bank:           D=Deposit W=Withdraw T=Transfer M=Back
  screen=rim-port:       L=Launch R=Repairs F=Fuel
  screen=combat:         A=Attack R=Retreat S=Surrender
  screen=null/unknown:   press M to get back to a known screen
  Upgrade component#: 1=Hull 2=Drives 3=Cabin 4=LifeSupport 5=Weapons 6=Navigation 7=Robotics 8=Shields
  Special equip: 1=Cloaker 2=AutoRepair 3=StarBuster 4=ArchAngel 5=TitaniumHull 6=TransWarp 7=AstraxialHull 0=Back
  End turn: use action type "end_turn" (NOT press_key:D)

CARGO FLOW (CRITICAL — memorize exactly):
  1. T (press_key) → Traders menu
  2. A (press_key) → Cargo Manifest Board shows 4 contracts numbered 1–4
  3. type_and_enter "1" or "2" or "3" or "4" → selects contract (NOT a system number!)
  4. type_and_enter "Y" → confirms, cargo loaded + mission assigned with destination → screen returns to TRADERS (NOT main-menu)
  5. M (press_key) → MUST go back to main menu FIRST (N is NOT valid on traders screen!)
  6. N (press_key) → navigate screen → type_and_enter DESTINATION SYSTEM NUMBER → fee confirmation shown (screen still navigate) → type_and_enter "Y" → travel starts
  7. WAIT — travel takes ~10-40s. Game loop will detect travel and wait automatically. Do NOT end_turn while traveling.
  8. When you ARRIVE at the destination system, cargo is auto-delivered — you earn credits!
  9. You MUST complete 2 trips total before end_turn works. After 1 delivery, accept another cargo and make a second trip, THEN end_turn.
  If "No servicable cargo pods" → upgrade hull at Shipyard first
  If STATE shows dest=N (a system number) → you have active cargo! Navigate to that system to deliver it.
  If "You have a valid contract" message → cargo is loaded, go navigate to deliver it (don't try to accept new cargo)

NAV MALFUNCTION: If you see "Malfunction!" in terminal after launch, you landed at a RANDOM system (not your destination). Your cargo is STILL active. Navigate to your cargo destination (dest= in STATE) to deliver it.

END TURN RULES (CRITICAL):
  - You MUST complete EXACTLY 2 trips before end_turn works
  - end_turn with only 1 trip will fail silently ("You still have 1 trip remaining")
  - After 2 trips, use end_turn → bots play → tripCount resets to 0 → you can make 2 more trips

RULES:
- Never fight with BF<20; use R to retreat
- Mira-9 (sys 8) fuel = 4cr; standard = 25cr — always refuel there
- Hull upgrades unlock cargo pods (primary income) — upgrade hull FIRST
- type_and_enter for: system numbers, fuel amounts, upgrade selections, bank amounts, cargo contract numbers, buffered screen cancels
- press_key for: single-letter menu commands on NON-buffered screens only
- CRITICAL: On buffered screens (upgrade, navigate, traders-cargo, bank operations), ONLY type_and_enter works. Never use press_key on these screens to navigate away — use type_and_enter "0" or "Q" to cancel instead.
- If screen is unclear, press M or Escape to go back`;
  }

  private buildDecisionPrompt(ctx: GameContext): string {
    const recentStr = ctx.recentActions.length > 0
      ? ctx.recentActions.slice(-5).map(a => `  - ${a.action} → ${a.outcome}`).join('\n')
      : '  (none yet)';

    const validKeys: Record<string, string> = {
      'main-menu':       'B S P T N R I end_turn',
      'shipyard':        'press_key U (to enter upgrade menu) or R or S or M — NEVER type numbers here',
      'shipyard-upgrade':'type_and_enter 1-8 to pick component, then upgrade happens — after success screen returns to shipyard',
      'traders':         'B S A M  (NOT N — must M first then N from main-menu)',
      'traders-cargo':   'type_and_enter 1-4 to select contract, type_and_enter Q to cancel',
      'navigate':        'type_and_enter dest# (step1) then type_and_enter Y (step2)',
      'pub':             'D G W E M',
      'bank':            'D W T M',
      'rim-port':        'L R F',
      'combat':          'A R S',
    };
    const valid = validKeys[ctx.currentScreen ?? ''] ?? 'unknown screen — press M to return to main-menu';

    return `TERMINAL:
${ctx.terminalText.slice(-400)}

STATE: screen=${ctx.currentScreen ?? '?'} cr=${ctx.stats.credits} fuel=${ctx.stats.fuel} sys=${ctx.stats.system} pods=${ctx.stats.cargoPods} dest=${ctx.stats.destination || 'none'} trips=${ctx.stats.tripCount}/2 BW=${ctx.stats.battlesWon} rank=${ctx.stats.rank} turn=${ctx.turnNumber}/${ctx.stats.turnsCompleted}done upg=${ctx.stats.upgradesDone}
VALID NOW: ${valid}
RECENT: ${recentStr}
GOAL: ${ctx.goalDescription} | ${ctx.goalProgress}
Action? (trips=X/2 means X of 2 required trips done; need trips=2/2 before end_turn)`;
  }

  private parseAction(text: string, ctx: GameContext): PlayerAction {
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        type: parsed.type ?? 'wait',
        value: String(parsed.value ?? ''),
        reasoning: parsed.reasoning ?? '',
        expectedOutcome: parsed.expectedOutcome ?? '',
        expectedScreen: parsed.expectedScreen,
      };
    } catch {
      // If parsing fails, log the raw text and return a safe fallback
      console.warn(`[claude-player] Failed to parse action JSON. Raw response:\n${text}`);
      return {
        type: 'diagnose',
        value: '',
        reasoning: `Parse failure — raw response: ${text.slice(0, 200)}`,
        expectedOutcome: 'Recovery',
      };
    }
  }

  private parseDiagnosis(text: string): DiagnosisResult {
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        problem: parsed.problem ?? 'Unknown problem',
        isBug: parsed.isBug ?? false,
        recoveryActions: (parsed.recoveryActions ?? []).map((a: PlayerAction) => ({
          type: a.type ?? 'press_key',
          value: String(a.value ?? 'Escape'),
          reasoning: a.reasoning ?? '',
          expectedOutcome: a.expectedOutcome ?? '',
          expectedScreen: a.expectedScreen,
        })),
        shouldRestart: parsed.shouldRestart ?? false,
      };
    } catch {
      return {
        problem: `Could not parse diagnosis: ${text.slice(0, 200)}`,
        isBug: false,
        recoveryActions: [
          { type: 'press_key', value: 'Escape', reasoning: 'Fallback recovery', expectedOutcome: 'Return to menu', expectedScreen: 'main-menu' },
          { type: 'press_key', value: 'm', reasoning: 'Fallback recovery', expectedOutcome: 'Return to main menu', expectedScreen: 'main-menu' },
        ],
        shouldRestart: false,
      };
    }
  }
}
