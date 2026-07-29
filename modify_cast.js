const fs = require('fs');

const path = './packages/content/src/cast.ts';
let content = fs.readFileSync(path, 'utf8');

// Insert export type NpcArchetype
if (!content.includes('NpcArchetype')) {
  content = content.replace(
    'export interface NpcProfile {',
    "export type NpcArchetype = 'trader' | 'fighter' | 'explorer' | 'smuggler' | 'gambler' | 'veteran';\n\nexport interface NpcProfile {"
  );
  content = content.replace(
    '  tier: PowerTier;',
    "  tier: PowerTier;\n  archetype: NpcArchetype;"
  );
}

const mapArchetype = (stats, ideal, bond, tier) => {
  if (ideal === 'Discovery' || ideal === 'Truth' || bond.includes('stars')) return 'explorer';
  if (ideal === 'Wealth' || ideal === 'Profit' || ideal === 'Industry' || stats.TRADE >= 4) return 'trader';
  if (ideal === 'Dominance' || ideal === 'Power' || ideal === 'Glory' || stats.GUNS >= 3) return 'fighter';
  if (ideal === 'Advantage' || ideal === 'Chaos' || stats.GUILE >= 4) return 'gambler';
  if (bond.includes('shadows') || bond.includes('Dragons')) return 'smuggler';
  if (tier >= 4) return 'veteran';
  return 'trader';
};

// We will use regex to find each profile object in the arrays and insert archetype
let modifiedContent = content;

// A simple state machine to parse and modify profiles
const profileRegex = /id:\s*'([^']+)'[\s\S]*?stats:\s*\{\s*PILOT:\s*(\d+),\s*GUNS:\s*(\d+),\s*TRADE:\s*(\d+),\s*GRIT:\s*(\d+),\s*GUILE:\s*(\d+)\s*\}[\s\S]*?ideal:\s*'([^']+)'[\s\S]*?bond:\s*'([^']+)'[\s\S]*?tier:\s*(\d+),/g;

modifiedContent = modifiedContent.replace(profileRegex, (match, id, pilot, guns, trade, grit, guile, ideal, bond, tier) => {
  if (match.includes('archetype:')) return match; // Already processed
  const stats = { PILOT: +pilot, GUNS: +guns, TRADE: +trade, GRIT: +grit, GUILE: +guile };
  const archetype = mapArchetype(stats, ideal, bond, +tier);
  return match + `\n    archetype: '${archetype}',`;
});

fs.writeFileSync(path, modifiedContent);
console.log('done');
