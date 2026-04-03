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
    hullStr: number;
    score: number;
    maxCargoPods: number;
    actionsThisTurn?: number;
  };
  goalDescription: string;
  goalProgress: string;
  recentActions: Array<{ action: string; outcome: string }>;
  turnNumber: number;
  uncoveredFeatures: string[];  // Feature IDs not yet exercised this session
  coveragePercent: number;      // 0-100
}

export class ClaudePlayer {
  private client?: Anthropic;
  private model: string;
  private strategyGuide: string;
  private conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];
  private isOllama: boolean;
  private ollamaUrl: string;

  private callCount = 0;

  /** Clear conversation history — call after turn completion or session restart to prevent stale context */
  clearHistory(): void {
    this.conversationHistory = [];
    this.callCount = 0;
  }

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

    const text = await this.createCompletion(this.buildSystemPrompt(), this.conversationHistory, 512);
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

    const text = await this.createCompletion(this.buildSystemPrompt(), [{ role: 'user', content: prompt }], 2048);
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
  screen=pub:            B=BuyDrink(50cr) D=DareGame G=Gossip W=WheelOfFortune M=BackToMainMenu — WARNING: D is Dare Game NOT drink! Use B to buy drink!
  screen=bank:           D=Deposit W=Withdraw T=Transfer M=Back
  screen=rim-port:       L=Launch R=Repairs F=Fuel
  screen=combat:         A=Attack R=Retreat S=Surrender
  screen=null/unknown:   press Escape to get back to a known screen (NOT M — M is invalid on main-menu)
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
  If "No servicable cargo pods" error → your pods capacity is 0 (very unusual). You normally start with 200 capacity.
  If STATE shows dest=N (a system number) → you have active cargo! Navigate to that system to deliver it.
  If "You have a valid contract" message → cargo is loaded, go navigate to deliver it (don't try to accept new cargo)

NAV MALFUNCTION: If you see "Malfunction!" in terminal after launch, you landed at a RANDOM system (not your destination). Your cargo is STILL active. Navigate to your cargo destination (dest= in STATE) to deliver it.

END TURN RULES (CRITICAL):
  - You MUST complete EXACTLY 2 trips before end_turn works
  - end_turn with only 1 trip will fail silently ("You still have 1 trip remaining")
  - After 2 trips, use end_turn → bots play → tripCount resets to 0 → you can make 2 more trips
  - CRITICAL: If trips=2/2 AND you have active cargo (dest≠none), you CANNOT navigate — the trip limit is hit. Use end_turn now. The cargo persists to your next turn.
  - NEVER accept new cargo when trips=2/2 — you cannot deliver it this turn. End your turn first.

RULES:
- Never fight with BF<20; use R to retreat
- Mira-9 (sys 8) fuel = 4cr; standard = 25cr — always refuel there
- STATE shows pods=Xloaded/Ycapacity. If capacity>0, you CAN accept cargo. Pods=0loaded means no cargo loaded (not no capacity). Hull upgrades increase capacity but you start with 200 capacity — no need to upgrade hull just for cargo.
- type_and_enter for: system numbers, fuel amounts, upgrade selections, bank amounts, cargo contract numbers, buffered screen cancels
- press_key for: single-letter menu commands on NON-buffered screens only
- CRITICAL: On buffered screens (upgrade, navigate, traders-cargo, bank operations), ONLY type_and_enter works. Never use press_key on these screens to navigate away — use type_and_enter "0" or "Q" to cancel instead.
- If screen is unclear, press M or Escape to go back

EXPLORATION MANDATE (critical for test coverage):
- The goal is NOT just cargo deliveries. Exercise EVERY game feature.
- Each turn, deliberately try at least ONE feature from COVERAGE "Try these next" list.
- BANK: Press B from main-menu → press D to deposit, W to withdraw. Required once. ⚠️ RANK-GATED: Bank requires Commander rank. If B bounces to main-menu, you are still a Lieutenant — stop trying bank, earn score via cargo runs (150 score needed), and check STATE rank field before trying again.
- PUB: Press P from main-menu → press B to buy a drink (50cr). ⚠️ D=Dare Game (not drink!), B=Buy drink. After drinking, press M to exit. Required once.
- REGISTRY: Press R from main-menu → look around. Required once.
- COMBAT ATTACK: When in combat with BF >= 15 (even if enemy is stronger), press A at least ONCE across the session to test the attack flow. The test needs this even if you lose.
- SHIPYARD REPAIR: After any trip where component conditions degraded, press S → R to repair.
- SELL FUEL: At Traders, press S and sell some fuel at least once.
- SAGE (System 18): Navigate to system 18 at least once — the quiz is quick and gives a cabin upgrade.
- WISE ONE (System 17): Navigate to system 17 at least once.
- REGISTRY PATROL: Press R from main-menu → press S for Space Patrol HQ → accept a patrol mission.
- PUB GAMBLE: In pub, press W (Wheel of Fortune) → type 10 → type 100 → Enter to test gambling.
- COMBAT SURRENDER: In combat when outmatched (enemy BF >> yours), press S to surrender at least once.

⚠️ DANGER — SYSTEM 28 (Black Hole): DO NOT navigate to system 28. It's a death trap with BF=600+ enemies. If the Space Commandant appears when accessing cargo (happens when weapons+shields STR >= 50), ALWAYS press N to decline. Pressing Y sends you to System 28 and you will lose your ship.

⚠️ "A space ship is required!" error at Traders means hull strength = 0. Fix: Shipyard → U → type 1 (Hull upgrade). You need hull STR >= 10 to use Traders.

⚠️ Keep weapons+shields STR BELOW 50 combined to avoid Commandant. If you've upgraded both to 20+ each, STOP upgrading them.`;
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
      'pub':             'B=BuyDrink(NOT D!) D=DareGame G=Gossip W=WheelOfFortune M=BackToMenu',
      'bank':            'D W T M',
      'rim-port':        'L R F',
      'combat':          'A R S',
    };
    const valid = validKeys[ctx.currentScreen ?? ''] ?? 'unknown screen — press Escape (NOT M, M is invalid on main-menu)';

    // State-aware imperative hints — override model confusion with explicit instructions
    const hints: string[] = [];
    const s = ctx.stats;
    const scr = ctx.currentScreen;
    const termLast = ctx.terminalText.slice(-300);
    const needFuel = s.fuel < 20;

    // Fuel critical — must buy fuel before navigating
    if (s.fuel === 0 && (scr === 'main-menu' || scr === 'traders')) {
      hints.push(`⚡ FUEL IS ZERO! You CANNOT navigate! Buy fuel NOW: press T → press B → type_and_enter 200 → press M to return. Do NOT press N to navigate until fuel > 0!`);
    } else if (needFuel && (scr === 'main-menu' || scr === 'traders')) {
      hints.push(`⚡ FUEL LOW (${s.fuel} units)! Buy fuel before long trips: press T → B → type_and_enter 200 → M`);
    }

    if (scr === 'traders' && s.cargoPods === 0 && s.destination === 0 && !needFuel) {
      hints.push('⚡ NO CARGO LOADED: press A now to see cargo manifest (do NOT press M without accepting cargo first!)');
    }
    if (scr === 'traders' && s.cargoPods === 0 && s.destination === 0 && needFuel) {
      hints.push(`⚡ BUY FUEL FIRST: press B then type_and_enter 200 (fuel=${s.fuel} is too low to travel!)`);
    }
    if (scr === 'traders' && s.cargoPods > 0 && s.destination > 0) {
      hints.push(`⚡ CARGO LOADED (dest=${s.destination}): press M → then from main-menu press N → type_and_enter ${s.destination} → type_and_enter Y`);
    }
    if (scr === 'main-menu' && s.cargoPods > 0 && s.destination > 0 && !needFuel) {
      hints.push(`⚡ DELIVER CARGO: press N → type_and_enter ${s.destination} → type_and_enter Y to travel`);
    }
    if (scr === 'main-menu' && s.cargoPods > 0 && s.destination > 0 && s.fuel === 0) {
      hints.push(`⚡ FUEL=0, CANNOT NAVIGATE! Buy fuel first: press T → press B → type_and_enter 200 → press M. THEN press N → type_and_enter ${s.destination} → type_and_enter Y`);
    } else if (scr === 'main-menu' && s.cargoPods > 0 && s.destination > 0 && needFuel) {
      hints.push(`⚡ LOW FUEL (${s.fuel}): press T → B → type_and_enter 200. Then navigate to dest=${s.destination}`);
    }
    const actionsTaken = s.actionsThisTurn ?? 99;
    if (scr === 'main-menu' && s.cargoPods === 0 && s.destination === 0 && s.tripCount === 0 && ctx.coveragePercent < 70 && !needFuel && actionsTaken <= 8) {
      // Start of turn with 0 trips and <8 actions done — allow ONE exploration before first cargo run
      const uncovered = ctx.uncoveredFeatures;
      if (uncovered.includes('shipyard.view') || uncovered.includes('shipyard.upgrade') || uncovered.includes('shipyard.repair')) {
        hints.push('⚡ EXPLORE NOW (1 feature): press S → R (repair) → U → type_and_enter 2 (upgrade drives). THEN immediately accept cargo (T→A→1→Y→M→N→dest→Y)');
      } else if (uncovered.includes('pub.visit') || uncovered.includes('pub.drink')) {
        hints.push('⚡ EXPLORE NOW (1 feature): press P → B (buy drink) → M (exit). THEN immediately accept cargo (T→A→1→Y→M→N→dest→Y)');
      } else if (uncovered.includes('pub.gamble')) {
        hints.push('⚡ EXPLORE NOW (1 feature): press P → W (Wheel) → type_and_enter 1 → type_and_enter 100 → M. THEN cargo.');
      } else if (uncovered.includes('traders.buy_fuel') || uncovered.includes('traders.sell_fuel')) {
        hints.push('⚡ EXPLORE NOW (1 feature): press T → B (buy fuel) → type_and_enter 200. Then S (sell) → type_and_enter 50. Then A to accept cargo.');
      } else if (uncovered.includes('bank.visit') && s.rank !== 'Lieutenant') {
        hints.push('⚡ EXPLORE NOW (1 feature): press B (Bank) → D → type_and_enter 1000 → W → type_and_enter 1000 → M. THEN cargo.');
      } else if (uncovered.includes('registry.visit') || uncovered.includes('registry.patrol')) {
        hints.push('⚡ EXPLORE NOW (1 feature): press R (Registry) → S (Patrol) → accept patrol. Then M. THEN cargo (T→A→1→Y→M→N→dest→Y).');
      } else {
        hints.push('⚡ ACCEPT CARGO NOW: press T → A → type_and_enter 1 → type_and_enter Y');
      }
    } else if (scr === 'main-menu' && s.cargoPods === 0 && s.destination === 0 && s.tripCount < 2 && !needFuel) {
      hints.push('⚡ NEED CARGO: press T → press A → type_and_enter 1 → type_and_enter Y to accept cargo contract');
    }
    if (scr === 'main-menu' && s.tripCount >= 2 && s.cargoPods === 0) {
      hints.push('⚡ 2 TRIPS DONE: use end_turn to end your turn NOW');
    }
    if (scr === 'traders-cargo') {
      hints.push('⚡ CARGO BOARD: type_and_enter 1 or 2 or 3 or 4 to pick contract. To exit: type_and_enter Q (NOT M!)');
    }
    // Navigate screen: if fee confirmation is showing, type Y; else type destination number
    if (scr === 'navigate' && /Care to Launch|Port Lift-Off|Cleared for|Lift-Off fee|\[Y\].*\(N\)/i.test(termLast)) {
      hints.push('⚡ LAUNCH FEE SHOWN — type_and_enter Y to confirm launch and depart');
    } else if (scr === 'navigate') {
      hints.push(`⚡ NAVIGATE STEP 1 — type_and_enter the destination SYSTEM NUMBER (${s.destination || '2'}). Do NOT type Y yet — first type the number, wait for fee prompt, THEN type Y`);
    }

    const hintStr = hints.length > 0 ? `\nHINT: ${hints.join(' | ')}` : '';

    return `TERMINAL:
${ctx.terminalText.slice(-400)}

STATE: screen=${scr ?? '?'} cr=${s.credits} fuel=${s.fuel} sys=${s.system} pods=${s.cargoPods}loaded/${s.maxCargoPods}capacity dest=${s.destination || 'none'} trips=${s.tripCount}/2 BW=${s.battlesWon} rank=${s.rank} score=${s.score}/150(need150forCommander) turn=${ctx.turnNumber}/${s.turnsCompleted}done hullStr=${s.hullStr} upgsThisTurn=${s.upgradesDone}
COVERAGE: ${ctx.coveragePercent}% — Try these next: ${ctx.uncoveredFeatures.slice(0, 6).join(', ') || 'all features covered!'}
VALID NOW: ${valid}${hintStr}
RECENT: ${recentStr}
GOAL: ${ctx.goalDescription} | ${ctx.goalProgress}
Action? (trips=X/2 means X of 2 required trips done; need trips=2/2 before end_turn)`;
  }

  private parseAction(text: string, ctx: GameContext): PlayerAction {
    try {
      // Strip markdown fences if present
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      // Normalize common model mistake: {"type":"action","value":"end_turn"} → end_turn
      if (parsed.type === 'action' && String(parsed.value).toLowerCase().includes('end_turn')) {
        parsed.type = 'end_turn';
        parsed.value = 'done';
      }
      return {
        type: parsed.type ?? 'wait',
        value: String(parsed.value ?? ''),
        reasoning: parsed.reasoning ?? '',
        expectedOutcome: parsed.expectedOutcome ?? '',
        expectedScreen: parsed.expectedScreen,
      };
    } catch {
      // If parsing fails, try to extract JSON from within the prose
      const jsonMatch = text.match(/\{[^{}]*"type"[^{}]*\}/s);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            type: parsed.type ?? 'wait',
            value: String(parsed.value ?? ''),
            reasoning: parsed.reasoning ?? '',
            expectedOutcome: parsed.expectedOutcome ?? '',
            expectedScreen: parsed.expectedScreen,
          };
        } catch { /* fall through */ }
      }
      // Safe fallback — press Escape to get to a known state
      console.warn(`[claude-player] Failed to parse action JSON. Raw response:\n${text.slice(0, 300)}`);
      return {
        type: 'press_key',
        value: 'Escape',
        reasoning: `Parse failure recovery`,
        expectedOutcome: 'Return to known screen',
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
