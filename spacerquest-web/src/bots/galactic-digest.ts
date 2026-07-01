/**
 * SpacerQuest v4.0 - Galactic News Wire ("while you were away" digest)
 *
 * The 20 simulated spacers each take a full turn after the player ends theirs.
 * Rather than dump their entire action log, this curates the *highlights* — the
 * biggest hauls, the bloodiest runs, arena grudges, jailbreaks, conquests — into
 * a short, punchy news wire so the galaxy feels alive between turns.
 *
 * Pure + rng-injectable (flavour lines vary but stay deterministic under a seed).
 */

import { BotTurnResult, RngFunction } from './types.js';

export interface DigestPromotion { name: string; rank: string; }
export interface DigestLeader { name: string; score: number; rank: string; }
export interface DigestInputs {
  results: BotTurnResult[];
  promotions?: DigestPromotion[];
  leader?: DigestLeader | null;
}

// ── small helpers ───────────────────────────────────────────────────────────
const net = (r: BotTurnResult) => (r.creditsEarned || 0) - (r.creditsSpent || 0);
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const rankTitle = (r: string) => r.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function pick<T>(arr: T[], rng: RngFunction): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

// ── event classification (drama weight drives what makes the wire) ───────────
interface Classified { emoji: string; weight: number; text: string; }
function classifyEvent(text: string): Classified | null {
  const t = text.toLowerCase();
  if (/\bwon\b|\block\b|arena|duel|challenge/.test(t)) {
    // Arena grudges — the juiciest intrigue
    if (/\bwon\b/.test(t)) return { emoji: '🏟', weight: 9, text };
    if (/lost|draw/.test(t)) return { emoji: '🏟', weight: 7, text };
    return { emoji: '🏟', weight: 5, text };           // posted a challenge
  }
  if (/take-?over|raid|conquer/.test(t)) return { emoji: '🚩', weight: 9, text };
  if (/bail/.test(t)) return { emoji: '🔓', weight: 6, text };
  if (/rescued/.test(t)) return { emoji: '🚀', weight: 6, text };
  if (/defeated|destroyed|blasted/.test(t)) return { emoji: '💥', weight: 5, text };
  if (/joined/.test(t)) return { emoji: '🤝', weight: 3, text };
  if (/delivered/.test(t)) return { emoji: '📦', weight: 2, text };
  if (/hailed/.test(t)) return { emoji: '🛰', weight: 1, text };
  return { emoji: '•', weight: 1, text };
}

// ── flavour banks ────────────────────────────────────────────────────────────
const OPENERS = [
  (n: number) => `While you were away, ${n} spacers worked the space lanes.`,
  (n: number) => `The sector churned on without you — ${n} spacers logged runs.`,
  (n: number) => `${n} spacers roamed the void while your engines cooled.`,
  (n: number) => `Reports filtering in from ${n} spacers across the sector...`,
];
const COMBAT = [
  (n: string, k: number) => `${n} left a trail of wreckage — ${k} kill${k === 1 ? '' : 's'} this cycle.`,
  (n: string, k: number) => `Blood in the void: ${n} claimed ${k} victor${k === 1 ? 'y' : 'ies'}.`,
  (n: string, k: number) => `${n} was the tip of the spear, downing ${k} hostile${k === 1 ? '' : 's'}.`,
];
const FORTUNE = [
  (n: string, c: number) => `${n}'s holds runneth over — banked ${fmt(c)} cr.`,
  (n: string, c: number) => `${n} made a killing on the trade lanes: +${fmt(c)} cr.`,
  (n: string, c: number) => `Fortune favoured ${n} this cycle: ${fmt(c)} cr richer.`,
];
const RUIN = [
  (n: string, c: number) => `${n} bled ${fmt(c)} cr into the dark — a rough run.`,
  (n: string, c: number) => `Not everyone prospered: ${n} was down ${fmt(c)} cr.`,
];
const SIGNOFFS = [
  `The lanes never sleep. Fly safe, Spacer.`,
  `That's the wire. Watch your six out there.`,
  `More as it breaks across the sector.`,
  `The galaxy turns without you — for now.`,
  `Stay sharp. The void keeps no secrets for long.`,
];

/**
 * Curate the bot turns into a short galactic news wire (plain-text lines; the
 * screen adds the banner + colour). Returns [] if literally nothing happened.
 */
export function buildGalacticDigest(input: DigestInputs, rng: RngFunction = Math.random): string[] {
  const results = input.results ?? [];
  const lines: string[] = [];
  if (results.length === 0) return lines;

  const totalBattles = results.reduce((s, r) => s + (r.battlesWon || 0) + (r.battlesLost || 0), 0);

  // ── Opener ────────────────────────────────────────────────────────────────
  let opener = pick(OPENERS, rng)(results.length);
  if (totalBattles > 0) opener += ` ${totalBattles} shot${totalBattles === 1 ? '' : 's'} were traded in anger.`;
  lines.push(opener);

  // ── Combat superlative ──────────────────────────────────────────────────────
  const topFighter = results
    .filter(r => (r.battlesWon || 0) > 0)
    .sort((a, b) => (b.battlesWon || 0) - (a.battlesWon || 0))[0];
  if (topFighter) lines.push(`⚔  ${pick(COMBAT, rng)(topFighter.botName, topFighter.battlesWon)}`);

  // ── Fortune superlatives (best + notable bust) ──────────────────────────────
  const byNet = [...results].sort((a, b) => net(b) - net(a));
  const richest = byNet[0];
  if (richest && net(richest) > 0) lines.push(`💰 ${pick(FORTUNE, rng)(richest.botName, net(richest))}`);
  const poorest = byNet[byNet.length - 1];
  if (poorest && net(poorest) < -5000 && poorest.botName !== richest?.botName) {
    lines.push(`📉 ${pick(RUIN, rng)(poorest.botName, Math.abs(net(poorest)))}`);
  }

  // ── Intrigue: top 2 highest-drama events across all spacers ─────────────────
  const events = results
    .flatMap(r => (r.notableEvents ?? []).map(classifyEvent).filter((c): c is Classified => !!c))
    .filter(c => c.weight >= 5)                    // only genuinely newsworthy
    .sort((a, b) => b.weight - a.weight);
  const seen = new Set<string>();
  let intrigue = 0;
  for (const e of events) {
    if (intrigue >= 2) break;
    if (seen.has(e.text)) continue;
    seen.add(e.text);
    lines.push(`${e.emoji}  ${e.text}`);
    intrigue++;
  }

  // ── Promotions ──────────────────────────────────────────────────────────────
  const promo = (input.promotions ?? [])[0];
  if (promo) lines.push(`📈 ${promo.name} earned a promotion to ${rankTitle(promo.rank)}!`);

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  if (input.leader) {
    lines.push(`🏆 ${input.leader.name} holds the top spot — ${fmt(input.leader.score)} pts, ${rankTitle(input.leader.rank)}.`);
  }

  // ── Sign-off ────────────────────────────────────────────────────────────────
  lines.push(pick(SIGNOFFS, rng));
  return lines;
}
