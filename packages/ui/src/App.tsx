import {
  memo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
} from 'react';
import { CARGO_TYPES } from '@spacerquest/content';
import type { GameState } from '@spacerquest/engine';
import {
  subscribe,
  getSnapshot,
  newGame,
  endDay,
  selectDie,
  signContract,
  haggleContract,
  toggleFx,
  clearBloom,
  type CockpitState,
} from './store';
import {
  systemName,
  cargoName,
  jumpsBetween,
  starNodes,
  wireLines,
  statName,
  checkVerdict,
  signedMargin,
} from './format';

const DIE_MIME = 'application/x-sq-die';

// Bridge a native HTML5 drop back into the store's selection model, then run the
// action. Click-to-select is the primary path (what Playwright drives); drag is
// an accessible-parallel affordance. Selecting the dropped die first keeps the
// store the sole engine caller — the drop never reaches into the engine itself.
function dropDie(e: ReactDragEvent, run: () => void): void {
  e.preventDefault();
  const raw = e.dataTransfer.getData(DIE_MIME);
  const idx = Number.parseInt(raw, 10);
  if (!Number.isFinite(idx)) return;
  if (getSnapshot().selectedDie !== idx) selectDie(idx);
  run();
}

function useCockpit(): CockpitState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The effect layer never takes changing props → React never re-renders it per
// frame (T-302). All scanline / flicker / vignette motion is CSS.
const EffectsLayer = memo(function EffectsLayer() {
  return <div className="fx" aria-hidden="true" />;
});

export function App() {
  const s = useCockpit();

  useEffect(() => {
    document.documentElement.setAttribute('data-fx', s.fx ? 'on' : 'off');
  }, [s.fx]);

  return (
    <div className="tube">
      <EffectsLayer />
      {!prefersReducedMotion() && <div className="sweep" key={s.bootKey} aria-hidden="true" />}

      <div className="ctrls">
        <button onClick={toggleFx}>{s.fx ? 'CRT: ON' : 'CRT: OFF'}</button>
        <NewGameButton />
      </div>

      <div className="screen">
        <Bezel game={s.game} />
        <div className="main">
          <div className="col left">
            <Starmap game={s.game} />
            <ShipStatus game={s.game} />
          </div>
          <div className="col">
            <Manifest state={s} />
          </div>
        </div>
        <Wire game={s.game} />
        <HandDock state={s} />
      </div>
    </div>
  );
}

function NewGameButton() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState('424242');
  if (!open) return <button onClick={() => setOpen(true)}>New game</button>;
  return (
    <span className="seedbar">
      <input
        aria-label="seed"
        value={seed}
        onChange={(e) => setSeed(e.target.value)}
        inputMode="numeric"
      />
      <button
        onClick={() => {
          const n = Number.parseInt(seed, 10);
          newGame(Number.isFinite(n) ? n : 1);
          setOpen(false);
        }}
      >
        Roll
      </button>
    </span>
  );
}

function Bezel({ game }: { game: GameState }) {
  const p = game.player;
  const debtDue = p.debtDueDay - game.day;
  const fuelPct = Math.max(0, Math.min(100, (p.ship.fuel / p.ship.maxFuel) * 100));
  return (
    <header className="bezel">
      <div>
        <div className="brand">
          <h1>Spacer Quest</h1>
          <span className="sub">Rimward</span>
        </div>
        <div className="loc">
          DAY <b data-testid="day">{game.day}</b> · DOCKED AT <b>{systemName(p.currentSystemId)}</b>{' '}
          · {game.era === 'TOUR_ONE' ? 'Frontier Era' : 'Veteran'}
        </div>
      </div>
      <div className="readouts">
        {game.eraEvent && (
          <span className="chip era" data-testid="era-chip">
            ERA · {game.eraEvent.defId}
          </span>
        )}
        <span className="chip">
          CR <b>{p.credits.toLocaleString()}</b>
        </span>
        {p.debt > 0 && (
          <span className="chip rev" data-testid="debt-chip">
            DEBT {p.debt.toLocaleString()} · DUE D{p.debtDueDay}
            {debtDue <= 5 ? ` (${debtDue}d)` : ''}
          </span>
        )}
        <span className="fuel">
          <span>FUEL</span>
          <span className="bar">
            <i style={{ width: `calc(${fuelPct}% - 2px)` }} />
          </span>
          <b>{p.ship.fuel.toLocaleString()}</b>
        </span>
      </div>
    </header>
  );
}

function Starmap({ game }: { game: GameState }) {
  // NOTE: 21 of 28 canon systems share y=0, so a literal coordinate scatter
  // collapses the core into one overlapping line. This scaffold renders a
  // readable nav grid instead; the coordinate-accurate map with fuel-range ring
  // and route preview is T-304's job.
  const nodes = starNodes();
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  return (
    <section className="pane">
      <header>
        <h2>Starmap</h2>
        <span className="tag">{visited.size} CHARTED</span>
      </header>
      <div className="body">
        <div className="navgrid">
          {nodes.map((n) => {
            const cls =
              n.id === here
                ? 'navcell here'
                : visited.has(n.id)
                  ? 'navcell visited'
                  : n.isRim
                    ? 'navcell rim'
                    : 'navcell';
            return (
              <div className={cls} key={n.id} title={n.name}>
                <span className="navdot" />
                <span className="navname">{n.name}</span>
                {n.id === here && <span className="navhere">&#9656;</span>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ShipStatus({ game }: { game: GameState }) {
  const ship = game.player.ship;
  const rows: { nm: string; cond: number }[] = [
    { nm: 'HULL', cond: ship.hull.condition },
    { nm: 'DRIVE', cond: ship.drives.condition },
    { nm: 'SHIELDS', cond: ship.shields.condition },
    { nm: 'GUNS', cond: ship.weapons.condition },
    { nm: 'NAV', cond: ship.navigation.condition },
    { nm: 'CARGO', cond: ship.cabin.condition },
  ];
  // condition is 0-9; show 5 pips
  const pips = (cond: number) => Math.round((cond / 9) * 5);
  return (
    <section className="pane ship">
      <header>
        <h2>Ship · {ship.isAstraxialHull ? 'Astraxial' : 'Junker'}</h2>
        <span className="tag">PODS {ship.cargoPods}</span>
      </header>
      <div className="body">
        {rows.map((r) => {
          const on = pips(r.cond);
          return (
            <div className={on <= 2 ? 'comp hurt' : 'comp'} key={r.nm}>
              <span className="nm">{r.nm}</span>
              <span className="cond">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className={i < on ? 'on' : ''} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Manifest({ state }: { state: CockpitState }) {
  const board = state.game.market.manifestBoard;
  const here = state.game.player.currentSystemId;
  const tradeStat = state.game.player.stats.TRADE ?? 0;
  const armed = state.selectedDie !== null;
  const dieVal =
    state.selectedDie !== null ? state.game.player.dawnHand?.dice[state.selectedDie] : undefined;
  return (
    <section className="pane" style={{ flex: 1 }}>
      <header>
        <h2>Manifest Board</h2>
        <span className="tag">
          {systemName(here)} DEPOT · {board.length} OFFERS
        </span>
      </header>
      <div className="body">
        {board.length === 0 && (
          <p style={{ color: 'var(--amber)' }}>The board is dark. Rest, or move on.</p>
        )}
        {board.map((c, i) => {
          const contraband = CARGO_TYPES[c.cargoType]?.isContraband ?? false;
          return (
            <div
              className={armed ? 'contract pickable' : 'contract'}
              key={i}
              data-testid="contract"
              onClick={() => signContract(i)}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('dropready');
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('dropready')}
              onDrop={(e) => {
                e.currentTarget.classList.remove('dropready');
                dropDie(e, () => signContract(i));
              }}
            >
              <div className="row1">
                <span className="goods">
                  {cargoName(c.cargoType)}
                  {contraband && <span className="flag shady">CONTRABAND</span>}
                  {c.haggled && <span className="flag shady">HAGGLED</span>}
                </span>
                <span className="pay">{c.payment.toLocaleString()}cr</span>
              </div>
              <div className="dest">
                &#9656; {systemName(c.destination)} · {jumpsBetween(here, c.destination)} jump
                {jumpsBetween(here, c.destination) === 1 ? '' : 's'} · {c.pods} pods
              </div>
              <div className="check">
                <span className="lbl">SIGN</span>
                <span className={dieVal !== undefined ? 'slot ready' : 'slot'}>
                  {dieVal ?? '—'}
                </span>
                <span className="mono">
                  + TRADE <b>{tradeStat}</b>
                </span>
                <span className="arrow">&rarr;</span>
                <span className="mono">{armed ? 'commit to sign' : 'assign a die'}</span>
                <button
                  className="haggle"
                  data-testid="haggle"
                  disabled={c.haggled}
                  title={
                    c.haggled
                      ? 'The broker will not renegotiate this contract again.'
                      : armed
                        ? 'Roll TRADE vs DC 12 to bump the payment'
                        : 'Pick a die first, then haggle'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    haggleContract(i);
                  }}
                >
                  HAGGLE
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <CheckBreakdown state={state} />
    </section>
  );
}

// Reusable honest-check readout. Renders ANY resolved StatCheck the store
// captured — die + stat + modifier + total vs DC + margin + verdict, in reading
// order (PRD: "the dice are honest and visible"). Nat 1/20 get distinct juice.
// Every number is read straight off the engine's CheckResult; nothing is
// recomputed in the UI. Travel/combat checks (T-304/T-307) will reuse this.
function CheckBreakdown({ state }: { state: CockpitState }) {
  const lc = state.lastCheck;
  if (!lc) return null;
  const r = lc.result;
  const verdict = checkVerdict(r);
  const pass = r.success;
  return (
    <div
      className={`check-breakdown ${verdict}`}
      data-testid="check-breakdown"
      data-verdict={verdict}
      key={state.lastCheckKey}
    >
      <span className="cb-lbl">CHECK{lc.context ? ` · ${lc.context.toUpperCase()}` : ''}</span>
      <span className="cb-expr">
        d20 <b data-testid="check-die">{r.die}</b>
        {' + '}
        <span data-testid="check-stat">{statName(lc.stat)}</span> <b>{r.modifier}</b>
        {' = '}
        <b data-testid="check-total">{r.total}</b>
        {' vs DC '}
        <b data-testid="check-dc">{r.dc}</b>
        {' → margin '}
        <b data-testid="check-margin">{signedMargin(r.margin)}</b>
      </span>
      <span className={pass ? 'result clear' : 'result fail'} data-testid="check-result">
        {pass ? 'SUCCESS' : 'FAILURE'}
      </span>
      {r.nat20 && (
        <span className="nat-juice crit" data-testid="check-nat20">
          NATURAL 20
        </span>
      )}
      {r.nat1 && (
        <span className="nat-juice fumble" data-testid="check-nat1">
          NATURAL 1
        </span>
      )}
    </div>
  );
}

function Wire({ game }: { game: GameState }) {
  const lines = wireLines(game);
  const items = lines.length > 0 ? lines : ['The wire is quiet. Roll the day and make some news.'];
  const run = (
    <>
      {items.map((t, i) => (
        <span className="it" key={i}>
          {t}
          <span className="sep">&#9702;</span>
        </span>
      ))}
    </>
  );
  return (
    <div className="wire">
      <div className="cap">
        <span className="dot" />
        GALACTIC WIRE
      </div>
      <div className="ticker" data-testid="wire">
        {run}
        {run}
      </div>
    </div>
  );
}

function HandDock({ state }: { state: CockpitState }) {
  const hand = state.game.player.dawnHand;
  const dice = hand?.dice ?? [];
  const spent = hand?.spent ?? [];
  const remaining = spent.filter((x) => !x).length;
  const display = useDiceRoll(dice, state.bootKey);

  useEffect(() => {
    if (state.bloomDie === null) return;
    const t = setTimeout(clearBloom, 750);
    return () => clearTimeout(t);
  }, [state.bloomDie]);

  const handSpent = dice.length > 0 && remaining === 0;
  const hint =
    remaining === 0
      ? 'Hand empty. Close the day — dusk moves the galaxy.'
      : state.notice
        ? state.notice
        : state.selectedDie !== null
          ? 'Die in hand. Click a contract to commit it.'
          : 'Pick a die, then assign it to an action.';

  return (
    <div className="dock" data-hand-spent={handSpent ? '1' : '0'}>
      <div className="dlabel">
        Dawn Hand
        <b>DAY {state.game.day}</b>
      </div>
      <div className="hand" data-testid="hand" data-hand-spent={handSpent ? '1' : '0'}>
        {dice.map((v, i) => {
          const isSpent = spent[i];
          const cls = [
            'die',
            isSpent ? 'spent' : '',
            state.selectedDie === i ? 'sel' : '',
            state.bloomDie === i ? 'bloom' : '',
            v === 20 || v === 1 ? 'nat' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              className={cls}
              key={i}
              data-testid="die"
              data-spent={isSpent ? '1' : '0'}
              role="button"
              tabIndex={isSpent ? -1 : 0}
              aria-pressed={state.selectedDie === i}
              aria-label={isSpent ? `die ${i + 1} spent` : `die ${i + 1}, value ${v}`}
              draggable={!isSpent}
              onDragStart={(e) => {
                e.dataTransfer.setData(DIE_MIME, String(i));
                e.dataTransfer.effectAllowed = 'move';
                if (state.selectedDie !== i) selectDie(i);
              }}
              onClick={() => selectDie(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectDie(i);
                }
              }}
            >
              <span>{isSpent ? v : display[i]}</span>
              <span className="dl">{isSpent ? 'SPENT' : 'd20'}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
        {handSpent && (
          <span className="day-end" data-testid="day-end">
            HAND SPENT · dusk is ready
          </span>
        )}
        <button className="btn" data-testid="end-day" onClick={endDay}>
          {remaining === 0 ? 'Begin next day' : 'End day'}
        </button>
        <span className="hint">
          {hint.split('—').map((part, i) => (i === 0 ? part : <b key={i}>— {part}</b>))}
        </span>
      </div>
    </div>
  );
}

// Dawn roll: numbers scramble briefly, then settle. Reduced motion → settle now.
function useDiceRoll(finalDice: number[], bootKey: number): number[] {
  const [display, setDisplay] = useState<number[]>(finalDice);
  const seedRef = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(finalDice);
      return;
    }
    let ticks = 0;
    // deterministic-enough scramble that doesn't need Math.random seeding rules
    const scramble = () => {
      seedRef.current = (seedRef.current * 1664525 + 1013904223) & 0x7fffffff;
      return 1 + (seedRef.current % 20);
    };
    const id = setInterval(() => {
      ticks++;
      setDisplay(finalDice.map((f, i) => (ticks < 8 + i * 3 ? scramble() : f)));
      if (ticks > 20) {
        clearInterval(id);
        setDisplay(finalDice);
      }
    }, 55);
    return () => clearInterval(id);
    // Intentionally keyed on bootKey only: a new day re-runs the roll; changing
    // dice values mid-day (spent flags) must not restart the scramble.
  }, [bootKey]);
  return display;
}
