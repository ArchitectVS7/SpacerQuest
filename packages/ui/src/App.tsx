import {
  memo,
  useEffect,
  useMemo,
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
  buyFuel,
  payDebt,
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
  wireLog,
  npcNameIndex,
  npcDossier,
  statName,
  checkVerdict,
  signedMargin,
  cargoHasStorylet,
  contractIsUrgent,
  type WireLogEntry,
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
            <TradePane state={s} />
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
          // Display-only flags derived from existing engine/content state (see
          // format.ts): URGENT = destination repriced by the active era event;
          // STORYLET = this cargo has a content storylet keyed to it. The UI
          // reads these; it never owns the rule, and CargoContract gains no field.
          const urgent = contractIsUrgent(state.game, c.destination);
          const storylet = cargoHasStorylet(c.cargoType);
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
                  {urgent && (
                    <span className="flag urgent" data-testid="flag-urgent">
                      URGENT
                    </span>
                  )}
                  {storylet && (
                    <span className="flag storylet" data-testid="flag-storylet">
                      STORYLET
                    </span>
                  )}
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
                {/* Kept ENABLED even once haggled: a second haggle is an engine
                    refusal that spends no die, and the store surfaces it as a
                    visible notice. Disabling it here would make that failure a
                    silent dead click — the exact silence the accept criterion
                    (UGT Finding 4's lesson) forbids. */}
                <button
                  className={c.haggled ? 'haggle done' : 'haggle'}
                  data-testid="haggle"
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

// The trade pane (T-305): the port-side controls that sit beside the manifest
// board — a visible failure notice, the active-contract tracker, the fuel depot
// and the debt ledger. Every button routes through a store action; the pane
// never calls the engine directly (the store stays the sole engine caller).
function TradePane({ state }: { state: CockpitState }) {
  const game = state.game;
  const p = game.player;
  const active = p.activeContract;
  const armed = state.selectedDie !== null;

  const [fuelAmount, setFuelAmount] = useState(100);
  const [debtAmount, setDebtAmount] = useState(500);

  const fuelPrice = game.market.localFuelPrice;
  const debtDue = p.debtDueDay - game.day;

  return (
    <section className="pane trade" data-testid="trade-pane">
      <header>
        <h2>Port Ledger</h2>
        <span className="tag">{systemName(p.currentSystemId)} SERVICES</span>
      </header>
      <div className="body">
        {/* The single mechanically-checkable surface for "failure is never
            silent": whenever the store captured an engine refusal, it shows
            here in reverse-video. It clears on the next successful action. */}
        {state.notice && (
          <div className="notice rev" data-testid="notice" role="status">
            {state.notice}
          </div>
        )}

        {/* Active-contract tracker — makes the sign→carrying transition visible
            and explains why a second sign is refused. */}
        <div className="ledger-block active-contract" data-testid="active-contract">
          <div className="lb-head">ACTIVE CONTRACT</div>
          {active ? (
            <>
              <div className="lb-row">
                <span className="goods">{cargoName(active.cargoType)}</span>
                <span className="pay">{active.payment.toLocaleString()}cr</span>
              </div>
              <div className="dest">
                &#9656; {systemName(active.destination)} · {active.pods} pods
              </div>
            </>
          ) : (
            <div className="lb-empty" data-testid="active-contract-empty">
              Hold is empty — sign a manifest offer to take a job.
            </div>
          )}
        </div>

        {/* Fuel depot — buy-fuel consumes a die (PRD §7), so the control mirrors
            the manifest's "assign a die" affordance and is never a dead click. */}
        <div className="ledger-block fuel-depot" data-testid="fuel-depot">
          <div className="lb-head">FUEL DEPOT</div>
          <div className="lb-row">
            <span className="mono">
              PRICE <b data-testid="fuel-price">{fuelPrice}</b>cr/unit
            </span>
            <span className="mono">
              HOLD{' '}
              <b data-testid="fuel-hold">
                {p.ship.fuel.toLocaleString()}/{p.ship.maxFuel.toLocaleString()}
              </b>
            </span>
          </div>
          <div className="lb-controls">
            <input
              aria-label="fuel amount"
              data-testid="fuel-amount"
              inputMode="numeric"
              value={fuelAmount}
              onChange={(e) => setFuelAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            />
            <button
              className="btn"
              data-testid="buy-fuel"
              disabled={!armed || fuelAmount <= 0}
              title={armed ? 'Spend the selected die to refuel' : 'Pick a die first, then buy fuel'}
              onClick={() => buyFuel(fuelAmount)}
            >
              {armed
                ? `Buy · ${(fuelAmount * fuelPrice).toLocaleString()}cr`
                : 'Pick a die to fuel'}
            </button>
          </div>
        </div>

        {/* Debt ledger — pay-down needs NO die (a ledger transfer, PRD §7.3),
            with the Guild marker's due-day countdown. */}
        <div className="ledger-block debt-ledger" data-testid="debt-ledger">
          <div className="lb-head">GUILD DEBT</div>
          {p.debt > 0 ? (
            <>
              <div className="lb-row">
                <span className="mono">
                  OWED <b>{p.debt.toLocaleString()}</b>cr
                </span>
                <span className={debtDue <= 5 ? 'mono due-soon' : 'mono'}>
                  DUE D{p.debtDueDay} · <b data-testid="debt-countdown">{debtDue}d</b>
                </span>
              </div>
              <div className="lb-note">Remote transfer — no die required.</div>
              <div className="lb-controls">
                <input
                  aria-label="debt amount"
                  data-testid="debt-amount"
                  inputMode="numeric"
                  value={debtAmount}
                  onChange={(e) =>
                    setDebtAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                  }
                />
                <button
                  className="btn"
                  data-testid="pay-debt"
                  disabled={debtAmount <= 0}
                  onClick={() => payDebt(debtAmount)}
                >
                  Pay down
                </button>
              </div>
            </>
          ) : (
            <div className="lb-cleared" data-testid="debt-cleared">
              DEBT CLEARED — the marker is closed.
            </div>
          )}
        </div>
      </div>
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

// The Galactic Wire (T-306): a scrolling ticker (unchanged) PLUS a browsable
// day-by-day log opened from the cap. Both are pure reads of the event log via
// format.ts — the ticker shows the freshest headlines, the log the full history.
function Wire({ game }: { game: GameState }) {
  const [logOpen, setLogOpen] = useState(false);
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
        <button
          className="wire-log-btn"
          data-testid="wire-log-toggle"
          aria-expanded={logOpen}
          onClick={() => setLogOpen((v) => !v)}
        >
          {logOpen ? 'CLOSE' : 'LOG'}
        </button>
      </div>
      <div className="ticker" data-testid="wire">
        {run}
        {run}
      </div>
      {logOpen && <WireLog game={game} onClose={() => setLogOpen(false)} />}
    </div>
  );
}

// A hand-rolled virtualized day-by-day log. No windowing library (CSP forbids
// CDNs and the repo avoids deps): a fixed-height scroll viewport over an inner
// spacer sized to the full row count, rendering only the visible slice absolutely
// positioned. This keeps the rendered node count bounded even across 100+ days.
const WIRE_ROW_H = 24; // px per row (day header or entry)
const WIRE_VIEW_H = 360; // px visible viewport
const WIRE_OVERSCAN = 4; // rows rendered beyond the viewport on each edge

type WireRow =
  { type: 'day'; day: number; key: string } | { type: 'entry'; entry: WireLogEntry; key: string };

function firstNpcMatch(
  text: string,
  nameIndex: { name: string; id: string }[],
): { id: string; name: string; index: number } | null {
  let best: { id: string; name: string; index: number } | null = null;
  for (const { name, id } of nameIndex) {
    const index = text.indexOf(name);
    if (index === -1) continue;
    if (best === null || index < best.index) best = { id, name, index };
  }
  return best;
}

// Render a wire line, wrapping the first NPC name it mentions as a dossier link.
function WireText({
  text,
  nameIndex,
  onOpen,
}: {
  text: string;
  nameIndex: { name: string; id: string }[];
  onOpen: (id: string) => void;
}) {
  const match = firstNpcMatch(text, nameIndex);
  if (!match) return <>{text}</>;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match.name.length);
  return (
    <>
      {before}
      <button
        className="npc-link"
        data-testid="npc-link"
        data-npc-id={match.id}
        onClick={() => onOpen(match.id)}
      >
        {match.name}
      </button>
      {after}
    </>
  );
}

function WireLog({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [openNpcId, setOpenNpcId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const nameIndex = useMemo(() => npcNameIndex(game), [game.npcs]);
  // Flatten the grouped log into a single fixed-height row list. Keyed on the
  // event-log length (append-only) + roster so it only rebuilds when news lands.
  const rows = useMemo<WireRow[]>(() => {
    const out: WireRow[] = [];
    for (const d of wireLog(game)) {
      out.push({ type: 'day', day: d.day, key: `day-${d.day}` });
      for (const e of d.entries) out.push({ type: 'entry', entry: e, key: `e-${e.eventIndex}` });
    }
    return out;
    // Keyed on the append-only log length + roster: rebuilds only when news
    // lands, not on unrelated snapshot churn.
  }, [game.eventLog.length, game.npcs]);

  const total = rows.length;
  const start = Math.max(0, Math.floor(scrollTop / WIRE_ROW_H) - WIRE_OVERSCAN);
  const end = Math.min(total, Math.ceil((scrollTop + WIRE_VIEW_H) / WIRE_ROW_H) + WIRE_OVERSCAN);
  const slice = rows.slice(start, end);

  // Escape closes the open dossier first, then the log.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openNpcId) setOpenNpcId(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openNpcId, onClose]);

  return (
    <div className="wire-log" data-testid="wire-log">
      <div className="wire-log-head">
        <span>
          DAY LOG · <b>{total}</b> ENTRIES
        </span>
        <button className="wire-log-close" data-testid="wire-log-close" onClick={onClose}>
          CLOSE
        </button>
      </div>
      {total === 0 ? (
        <div className="wire-log-empty" data-testid="wire-log-empty">
          No news yet. End a day — dusk makes headlines.
        </div>
      ) : (
        <div
          className="wire-log-view"
          style={{ height: WIRE_VIEW_H }}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
          <div className="wire-log-spacer" style={{ height: total * WIRE_ROW_H }}>
            {slice.map((row, i) => {
              const top = (start + i) * WIRE_ROW_H;
              if (row.type === 'day') {
                return (
                  <div
                    className="wire-day"
                    data-testid="wire-day"
                    data-day={row.day}
                    key={row.key}
                    style={{ top, height: WIRE_ROW_H }}
                  >
                    DAY {row.day}
                  </div>
                );
              }
              const { entry } = row;
              const npcId = firstNpcMatch(entry.text, nameIndex)?.id;
              return (
                <div
                  className="wire-entry"
                  data-testid="wire-entry"
                  data-wire-kind={entry.kind}
                  data-npc-id={npcId ?? undefined}
                  key={row.key}
                  style={{ top, height: WIRE_ROW_H }}
                >
                  <WireText text={entry.text} nameIndex={nameIndex} onOpen={setOpenNpcId} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {openNpcId && <NpcDossier game={game} npcId={openNpcId} onClose={() => setOpenNpcId(null)} />}
    </div>
  );
}

// The mini dossier: name, ship, whereabouts and prose HINTS. Deliberately never
// renders the raw stat block, flawDc or tier (PRD: "disposition hints — not raw
// stats"). All fields come from format.npcDossier.
function NpcDossier({
  game,
  npcId,
  onClose,
}: {
  game: GameState;
  npcId: string;
  onClose: () => void;
}) {
  const d = npcDossier(game, npcId);
  if (!d) return null;
  return (
    <div
      className="npc-dossier"
      data-testid="npc-dossier"
      role="dialog"
      aria-label={`Dossier: ${d.name}`}
    >
      <div className="nd-head">
        <b className="nd-name" data-testid="dossier-name">
          {d.name}
        </b>
        <button
          className="nd-close"
          data-testid="dossier-close"
          aria-label="close"
          onClick={onClose}
        >
          &times;
        </button>
      </div>
      <div className="nd-row" data-testid="dossier-ship">
        SHIP · {d.shipName}
      </div>
      <div className="nd-row nd-loc">Last seen · {d.location}</div>
      <div className="nd-row nd-standing" data-testid="dossier-standing">
        {d.standing}
      </div>
      <div className="nd-row nd-temper">{d.temperament}</div>
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
