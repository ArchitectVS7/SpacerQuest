/**
 * T-143 · THE COMMAND REGISTRY — the single source of truth for what the panel
 * can run, and with which flags.
 *
 * PURE BY CONSTRUCTION: no `node:fs`, no `node:child_process`, no clock, no
 * network. Everything here is a value or a total function over values, so the
 * flag rules below are unit-testable without spawning anything — and the server
 * hands this same object to the UI (`GET /api/commands`) rather than the page
 * carrying a second, drifting copy of the flag list.
 *
 * ---------------------------------------------------------------------------
 * THE FLAGS ARE COPIED FROM THE PARSERS, NOT FROM THE SPEC TABLE.
 *
 * `docs/DEV-CONTROL-PANEL_SPEC.md` §1's table was audited before `--trace-npc-
 * decisions` landed (T-140) and before `balance:report` existed (T-142), and it
 * presents `balance:diff` as flag-only when `parseDiffArgs` in fact requires
 * exactly two POSITIONAL paths. Where the table and the parser disagree, the
 * PARSER wins — the acceptance criterion is that every panel flag is a real
 * parsed argument of the underlying script, which is a property of the code, not
 * of the prose. The divergences are recorded as F-143-1 in the spec's new §7 so
 * this is a documented correction rather than a silent one.
 *
 * `report` is a SIXTH ROW against §1's five. It is not invented: spec §3 requires
 * every completed sweep to offer a "View Report" action against the Tier 1
 * generator, and that generator (`packages/sim/src/balance/report-cli.ts`,
 * T-142) postdates the §1 table. Without this row the §3 requirement is
 * unimplementable.
 *
 * ---------------------------------------------------------------------------
 * §5'S OPEN QUESTION, SETTLED: `lint:fix` AND `format` ARE EXCLUDED.
 *
 * The spec left "whether `lint:fix`/`format` belong in the panel" open for the
 * implementation task. They are out, and `lint`/`format:check` (already §1 row
 * 5's read-only gate commands) are in. Four reasons, in order of force:
 *
 *  1. THE ACCEPTANCE CRITERION FORBIDS THEM OUTRIGHT. §6 requires that "no source
 *     file outside the panel's own new code is modified by running any panel
 *     action". `format` and `lint:fix` modify source by definition. There is no
 *     reading of that criterion under which they can ship.
 *  2. §5'S OWN MISCLICK ARGUMENT APPLIES UNCHANGED. The stated reason `package:*`
 *     and `release:*` are out is that a misclick "costs nothing on one row and
 *     something real on the next". A button that rewrites every file in the repo
 *     sitting beside a button that runs a read-only sweep is the same hazard with
 *     a smaller blast radius, not a different one.
 *  3. A REPO-SPECIFIC TRAP THE SPEC DOES NOT NAME. TASKS.md's standing
 *     constraints require `npm run format` to run BEFORE a batch capstone, never
 *     after, and `docsFingerprint` is a raw-byte hash over the hashed sources — so
 *     a formatter run reorders the capstone sequence and moves a recorded stamp.
 *     A one-click formatter next to a one-click sweep MANUFACTURES exactly the
 *     ordering mistake that constraint exists to prevent. The panel would create
 *     the hazard rather than mediate it.
 *  4. The counter-argument §5 itself offers ("a routine, git-diff-visible
 *     mechanical change, never a silent balance edit") is accepted as true and is
 *     still insufficient: git-diff-visibility is a RECOVERY property, not a
 *     PREVENTION one, and (3) is invisible in a git diff.
 *
 * `assertNoWritingCommands` below turns that ruling into a runtime check, and
 * `__tests__/commands.test.ts` asserts it. Prose alone would let a later edit
 * quietly add a `format` row.
 *
 * READERS (constraint 7): `./runner.ts` (spawns what `buildArgv` returns),
 * `./server.ts` (`GET /api/commands`), `./panel-html.ts` (renders the forms), and
 * `./__tests__/commands.test.ts` (proves the flags against the real parsers).
 */

/** How a field's value is validated and how it becomes argv tokens. */
export type PanelFlagKind = 'string' | 'int' | 'csv' | 'path' | 'boolean' | 'positional';

export interface PanelFlag {
  /** The token the underlying parser compares against, verbatim. Empty for a positional. */
  readonly flag: string;
  /** Stable field id used by the form and by `buildArgv`'s value map. */
  readonly id: string;
  readonly kind: PanelFlagKind;
  readonly required?: boolean;
  /** The parser accepts this flag more than once (`--traces`, `--playtest-log`). */
  readonly repeatable?: boolean;
  /**
   * Emit the value `resolve()`d to an absolute path.
   *
   * NOT COSMETIC. `npm run <script> -w @spacerquest/sim` executes with
   * cwd = `packages/sim`, and `sweep.ts` resolves `--out`/`--aggregate-out` with
   * a bare `resolve(value)` (no `resolveArtifact` fallback to the repo root). A
   * relative `.scratch/balance/panel-runs/x` typed into the panel would
   * therefore land in `packages/sim/.scratch/…` — a silently wrong, still
   * gitignored directory nobody would think to look in.
   */
  readonly absolutePath?: boolean;
  /** Copied from the script's own `usage()` text so the UI cannot invent semantics. */
  readonly help: string;
}

export type PanelCommandId = 'sweep' | 'diff' | 'extract' | 'smoke' | 'gate' | 'report';

export interface PanelCommand {
  readonly id: PanelCommandId;
  readonly title: string;
  /** The npm script name. `null` for `gate`, which is a sequence, not one script. */
  readonly npmScript: string | null;
  /** `-w <workspace>` target, or `null` for a root-level script. */
  readonly workspace: string | null;
  readonly flags: readonly PanelFlag[];
  /** True only for `sweep` — and the panel defaults both of its out-dirs into the run dir. */
  readonly writesOutsideScratch: boolean;
  readonly blurb: string;
}

export const SIM_WORKSPACE = '@spacerquest/sim';

/**
 * The gate, as the sequence `/orchestrate` already runs. Read-only by
 * construction: `npm test`, `tsc -b`, `eslint .` and `prettier --check .` all
 * report and none of them writes a source file. Spec §5 is explicit that this
 * panel "does not replace the orchestrator's own gate" — this row exists so a
 * human can run the same four checks in one click, not so the task loop can
 * depend on it.
 */
export const GATE_STEPS: readonly { readonly label: string; readonly argv: readonly string[] }[] = [
  { label: 'npm test', argv: ['run', 'test'] },
  { label: 'npx tsc -b', argv: ['run', 'typecheck'] },
  { label: 'npm run lint', argv: ['run', 'lint'] },
  { label: 'npm run format:check', argv: ['run', 'format:check'] },
];

export const PANEL_COMMANDS: readonly PanelCommand[] = [
  {
    id: 'sweep',
    title: 'Run Sweep',
    npmScript: 'balance:sweep',
    workspace: SIM_WORKSPACE,
    writesOutsideScratch: true,
    blurb:
      'The Monte Carlo sweep. With a shard count > 1 the panel spawns every shard concurrently ' +
      'and runs --merge only after all of them exit 0.',
    flags: [
      {
        id: 'label',
        flag: '--label',
        kind: 'string',
        required: true,
        help: 'Arm name; keys the row/aggregate filenames. Default "tour-one".',
      },
      { id: 'seeds', flag: '--seeds', kind: 'int', help: 'Seed count. Default 500.' },
      { id: 'seedStart', flag: '--seed-start', kind: 'int', help: 'First seed. Default 1.' },
      { id: 'days', flag: '--days', kind: 'int', help: 'Horizon per run. Default 35.' },
      {
        id: 'policies',
        flag: '--policies',
        kind: 'csv',
        help: 'Comma-separated. Default trader,fighter,explorer,veteran,smuggler,gambler,greedy.',
      },
      {
        id: 'milestoneDays',
        flag: '--milestone-days',
        kind: 'csv',
        help: 'N7: record a milestone sample at the dawn of each listed day. Off by default.',
      },
      {
        id: 'out',
        flag: '--out',
        kind: 'path',
        absolutePath: true,
        help: 'Raw row directory. Blank = this run directory (gitignored).',
      },
      {
        id: 'aggregateOut',
        flag: '--aggregate-out',
        kind: 'path',
        absolutePath: true,
        help: 'Aggregate directory. Blank = this run directory, NOT docs/balance.',
      },
      {
        id: 'traceNpcDecisions',
        flag: '--trace-npc-decisions',
        kind: 'boolean',
        help:
          'T-140: also write traces-<label>-shard<i>of<N>.jsonl beside the rows. Diagnosis only, ' +
          'never a capstone. Cannot be combined with --merge, so the panel refuses it for a ' +
          'sharded run that will merge.',
      },
    ],
  },
  {
    id: 'diff',
    title: 'Diff Aggregates',
    npmScript: 'balance:diff',
    workspace: SIM_WORKSPACE,
    writesOutsideScratch: false,
    blurb: 'Diffs two aggregates. Reads two files, writes none.',
    flags: [
      {
        id: 'before',
        flag: '',
        kind: 'positional',
        required: true,
        help: 'before.json — a docs/balance/baseline-*.json.',
      },
      {
        id: 'after',
        flag: '',
        kind: 'positional',
        required: true,
        help: 'after.json — a docs/balance/baseline-*.json.',
      },
      {
        id: 'epsilon',
        flag: '--epsilon',
        kind: 'string',
        help: 'Absolute numeric tolerance. Default 0 (exact).',
      },
      { id: 'json', flag: '--json', kind: 'boolean', help: 'Emit the diff as JSON.' },
      {
        id: 'failOnChange',
        flag: '--fail-on-change',
        kind: 'boolean',
        help: 'Exit 1 when anything moved.',
      },
    ],
  },
  {
    id: 'extract',
    title: 'Extract Smoke Fixture',
    npmScript: 'balance:extract',
    workspace: SIM_WORKSPACE,
    writesOutsideScratch: false,
    blurb:
      'Produces the committed smoke fixture from a capstone aggregate. Point --out at a run ' +
      'directory unless you mean to re-cut docs/balance/smoke/tiers.json.',
    flags: [
      {
        id: 'aggregate',
        flag: '--aggregate',
        kind: 'path',
        absolutePath: true,
        help: 'Capstone aggregate to extract from. Default docs/balance/baseline-n1.json.',
      },
      {
        id: 'out',
        flag: '--out',
        kind: 'path',
        absolutePath: true,
        help: 'Fixture path. Default docs/balance/smoke/tiers.json.',
      },
      {
        id: 'date',
        flag: '--date',
        kind: 'string',
        help: 'Extraction date recorded in provenance (YYYY-MM-DD). Default: today.',
      },
    ],
  },
  {
    id: 'smoke',
    title: 'Balance Smoke',
    npmScript: 'balance:smoke',
    workspace: SIM_WORKSPACE,
    writesOutsideScratch: false,
    blurb: 'Fast regression check against the committed smoke fixture. No flags.',
    flags: [],
  },
  {
    id: 'gate',
    title: 'Gate',
    npmScript: null,
    workspace: null,
    writesOutsideScratch: false,
    blurb: 'npm test, tsc -b, lint, format:check — in sequence, stopping at the first failure.',
    flags: [],
  },
  {
    id: 'report',
    title: 'View Report',
    npmScript: 'balance:report',
    workspace: SIM_WORKSPACE,
    writesOutsideScratch: false,
    blurb:
      'T-142 · The Tier 1 telemetry report. Spec §3 requires this action on every completed ' +
      'sweep; it writes exactly one HTML file into the directory given by --out.',
    flags: [
      {
        id: 'aggregate',
        flag: '--aggregate',
        kind: 'path',
        required: true,
        absolutePath: true,
        help: 'REQUIRED. A BaselineAggregate (docs/balance/baseline-*.json).',
      },
      {
        id: 'compareTo',
        flag: '--compare-to',
        kind: 'path',
        absolutePath: true,
        help: 'A second aggregate; adds the before/after view.',
      },
      {
        id: 'traces',
        flag: '--traces',
        kind: 'path',
        repeatable: true,
        absolutePath: true,
        help: 'NPC decision traces (JSONL), or a directory of traces-*.jsonl. Repeatable.',
      },
      {
        id: 'playtestLog',
        flag: '--playtest-log',
        kind: 'path',
        repeatable: true,
        absolutePath: true,
        help: 'A T-141 export (.jsonl / .json / .csv). Repeatable.',
      },
      {
        id: 'provenance',
        flag: '--provenance',
        kind: 'path',
        absolutePath: true,
        help: 'JSON carrying rulesFingerprint/instrumentFingerprint to attribute to --aggregate.',
      },
      {
        id: 'compareProvenance',
        flag: '--compare-provenance',
        kind: 'path',
        absolutePath: true,
        help: 'The same, for --compare-to.',
      },
      {
        id: 'out',
        flag: '--out',
        kind: 'path',
        absolutePath: true,
        help: 'Output directory. Blank = .scratch/balance/reports (gitignored).',
      },
      { id: 'name', flag: '--name', kind: 'string', help: 'Output file name stem.' },
    ],
  },
];

export function findCommand(id: string): PanelCommand | undefined {
  return PANEL_COMMANDS.find((command) => command.id === id);
}

/** A form's raw values: field id -> string, or string[] for a repeatable field. */
export type PanelFormValues = Readonly<Record<string, string | readonly string[] | undefined>>;

/**
 * `--label` keys a filename and a run directory name, so it is the one free-text
 * field with a path consequence. This character class rejects `..`, `/`, `\`,
 * spaces and a leading `-` in one rule.
 */
export const LABEL_PATTERN = /^[A-Za-z0-9._-]+$/;

/** The only filename `assertPromotionTarget` will ever copy into `docs/balance`. */
export const BASELINE_FILE_PATTERN = /^baseline-[A-Za-z0-9._-]+\.json$/;

export class PanelArgError extends Error {}

function requireLabel(value: string): string {
  if (!LABEL_PATTERN.test(value) || value.startsWith('-')) {
    throw new PanelArgError(
      `--label must match ${String(LABEL_PATTERN)} (it names a file and a directory): got "${value}"`,
    );
  }
  return value;
}

function single(raw: string | readonly string[] | undefined): string[] {
  if (raw === undefined) return [];
  const list = typeof raw === 'string' ? [raw] : [...raw];
  return list.map((value) => value.trim()).filter((value) => value !== '');
}

function validateValue(flag: PanelFlag, value: string, resolvePath: (p: string) => string): string {
  if (flag.id === 'label') return requireLabel(value);
  // NOTHING may start with `-` unless the field is itself a boolean switch. Every
  // one of these parsers reads the NEXT argv token as a value without checking
  // its shape (or, in report-cli's case, rejects it) — so a value of `--merge`
  // typed into `--label` would otherwise become a real flag.
  if (value.startsWith('-')) {
    throw new PanelArgError(`${flag.flag || flag.id}: a value may not begin with "-": "${value}"`);
  }
  switch (flag.kind) {
    case 'int':
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new PanelArgError(`${flag.flag}: expected an integer >= 1, got "${value}"`);
      }
      return value;
    case 'csv':
      if (!/^[A-Za-z0-9,_-]+$/.test(value)) {
        throw new PanelArgError(`${flag.flag}: expected a comma-separated list, got "${value}"`);
      }
      return value;
    case 'path':
    case 'positional':
      return flag.absolutePath === true ? resolvePath(value) : value;
    default:
      return value;
  }
}

export interface BuildArgvOptions {
  /**
   * Injected so `buildArgv` stays pure and testable with a fake root. The server
   * passes `(p) => resolve(REPO_ROOT, p)`.
   */
  readonly resolvePath: (path: string) => string;
}

/**
 * Turn a form into argv. TOTAL and PURE: same inputs, same output, no I/O.
 *
 * The rule that makes §6's byte-for-byte criterion achievable: AN OMITTED
 * OPTIONAL FIELD EMITS NOTHING. The panel never injects a flag the user did not
 * ask for, so "the same flags typed by hand" and "the same flags clicked in the
 * panel" are the same argv array, not merely equivalent ones. The single
 * deliberate exception is the sweep run directory (`./runner.ts`), which is
 * applied to the FORM before this function sees it and is rendered in the UI
 * before the run starts — an injection the operator can read, never an invisible one.
 */
export function buildArgv(
  command: PanelCommand,
  values: PanelFormValues,
  options: BuildArgvOptions,
): string[] {
  const argv: string[] = [];
  const positionals: string[] = [];
  for (const flag of command.flags) {
    const provided = single(values[flag.id]);
    if (provided.length === 0) {
      if (flag.required === true) {
        throw new PanelArgError(`${flag.flag || flag.id} is required`);
      }
      continue;
    }
    if (provided.length > 1 && flag.repeatable !== true) {
      throw new PanelArgError(`${flag.flag} is not repeatable`);
    }
    for (const raw of provided) {
      if (flag.kind === 'boolean') {
        // A checkbox is on or absent. Any truthy string means on; the flag takes
        // no value, so nothing but the token itself is ever emitted.
        if (raw !== 'false' && raw !== '0') argv.push(flag.flag);
        continue;
      }
      const value = validateValue(flag, raw, options.resolvePath);
      if (flag.kind === 'positional') positionals.push(value);
      else argv.push(flag.flag, value);
    }
  }
  // `parseDiffArgs` collects positionals wherever they appear, but putting them
  // first matches the form a human types and the form the usage() line shows.
  return [...positionals, ...argv];
}

/**
 * The npm invocation for a command, as an argv array — never a string. Nothing is
 * ever interpolated into a shell (`./runner.ts` spawns with `shell: false`), so
 * quoting is not a hazard this panel has.
 */
export function npmArgvFor(command: PanelCommand, commandArgv: readonly string[]): string[] {
  if (command.npmScript === null) {
    throw new PanelArgError(`${command.id} is a sequence, not one npm script`);
  }
  const argv = ['run', command.npmScript];
  if (command.workspace !== null) argv.push('-w', command.workspace);
  if (commandArgv.length > 0) argv.push('--', ...commandArgv);
  return argv;
}

/** `npm` on POSIX, `npm.cmd` on Windows — `spawn` with `shell: false` does no PATHEXT search. */
export function npmExecutable(platform: string = process.platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** What the UI shows above the Run button, and what `run.json` records. */
export function renderCommandLine(executable: string, argv: readonly string[]): string {
  return [executable, ...argv].join(' ');
}

/**
 * §5'S RULING, ENFORCED IN CODE. Called at module load below so the registry
 * cannot acquire a source-writing row in a later edit without the process
 * refusing to start and `__tests__/commands.test.ts` going red.
 */
export function assertNoWritingCommands(commands: readonly PanelCommand[]): void {
  const banned = /^(package:|release:|format$|lint:fix$)/;
  for (const command of commands) {
    if (command.npmScript !== null && banned.test(command.npmScript)) {
      throw new Error(
        `${command.npmScript} writes to source, a package or a tag and may not be a panel row ` +
          '(docs/DEV-CONTROL-PANEL_SPEC.md §5, settled in §7).',
      );
    }
  }
  for (const step of GATE_STEPS) {
    const script = step.argv[1] ?? '';
    if (banned.test(script)) {
      throw new Error(`${script} may not be a gate step: the gate is read-only.`);
    }
  }
}

assertNoWritingCommands(PANEL_COMMANDS);
