// ---------------------------------------------------------------------------
// T-1604 · UGT campaign CLI — the I/O shell over the pure harness.
//
// The ONLY place real I/O happens for the campaign. Parses flags, runs
// `runProtocolCampaign` (the pure core), and writes the log + aggregates as JSON
// to stdout so a shell / CI / the sibling UGT run can capture the ≥1,000-action
// evidence committed under docs/playtests/results/.
//
//   npm run campaign -w @spacerquest/sim -- --seed 42 --actions 1200 --picker competent
// ---------------------------------------------------------------------------

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traderPolicy } from './index.js';
import {
  competentPicker,
  makePolicyPicker,
  randomLegalPicker,
  runProtocolCampaign,
  type CampaignPicker,
} from './protocol-campaign.js';

interface CliOptions {
  seed: number;
  actions: number;
  picker: 'veteran' | 'heuristic' | 'random-legal';
  slim: boolean;
}

function usage(): string {
  return [
    'Usage: npm run campaign -w @spacerquest/sim -- --seed <int> --actions <int> --picker <veteran|heuristic|random-legal> [--slim]',
    'Defaults: --seed 42 --actions 1200 --picker veteran',
    'Pickers: veteran (shipped policy → deep states); heuristic (spec-only competent);',
    '         random-legal (legal-actions-obeying fuzzer → parity/invariant probe).',
    '--slim omits the full per-action log (aggregates only).',
  ].join('\n');
}

function parseInteger(name: string, value: string | undefined): number {
  if (value === undefined || value.trim() === '') throw new Error(`Missing value for ${name}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

export function parseCampaignCli(argv: string[]): CliOptions | { help: true } {
  const options: CliOptions = { seed: 42, actions: 1200, picker: 'veteran', slim: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') return { help: true };
    if (arg === '--slim') {
      options.slim = true;
    } else if (arg === '--seed') {
      options.seed = parseInteger(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--actions') {
      options.actions = parseInteger(arg, argv[i + 1]);
      i += 1;
    } else if (arg === '--picker') {
      const value = argv[i + 1];
      if (value !== 'veteran' && value !== 'heuristic' && value !== 'random-legal') {
        throw new Error('--picker must be veteran, heuristic, or random-legal');
      }
      options.picker = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }
  return options;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const parsed = parseCampaignCli(argv);
    if ('help' in parsed) {
      process.stdout.write(`${usage()}\n`);
      process.exitCode = 0;
      return;
    }
    const picker: CampaignPicker =
      parsed.picker === 'veteran'
        ? makePolicyPicker(traderPolicy, parsed.seed)
        : parsed.picker === 'heuristic'
          ? competentPicker
          : randomLegalPicker;
    const report = runProtocolCampaign({
      seed: parsed.seed,
      actionBudget: parsed.actions,
      picker,
      keepLog: !parsed.slim,
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
