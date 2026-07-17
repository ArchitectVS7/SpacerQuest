import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react';
import { CARGO_TYPES, RENOWN_RANKS, Stat } from '@spacerquest/content';
import type { GameState, CheckResult, StoryletOffer } from '@spacerquest/engine';
import {
  subscribe,
  getSnapshot,
  newGame,
  endDay,
  selectDie,
  signContract,
  abandonContract,
  haggleContract,
  buyFuel,
  payDebt,
  travelTo,
  explore,
  visitDare,
  borrowLoan,
  repayLoan,
  hireCrew,
  dismissCrew,
  reroll,
  buyPort,
  combat,
  shipyard,
  resolveStorylet,
  dismissAftermath,
  dismissOnboarding,
  dismissBootNotice,
  standDown,
  toggleFx,
  clearBloom,
  saveToSlot,
  loadSlot,
  deleteSlot,
  setReducedMotion,
  setTextSize,
  returnToMenu,
  type CockpitState,
  type SlotSummary,
  type TextSize,
} from './store';
import * as sound from './sound';
// T-1703 · Demo gate — a build-layer concern the cockpit consumes as a thin CLIENT
// (the engine is unaware of demo-vs-full; see demo.ts). These drive the three
// teased-but-gated veteran surfaces and the end-of-demo wall ceremony. Every branch is
// dead code in the full/web build (`DEMO_BUILD === false`), so that build is unaffected.
import { demoFeatureLocked, DEMO_LOCK_COPY, DEMO_WALL_COPY, type DemoGatedFeature } from './demo';
import {
  systemName,
  cargoName,
  starmapProjection,
  routePreview,
  explorationPreview,
  hangoutOpen,
  hangoutNpcs,
  hangoutRumorLines,
  dareWagerBounds,
  lendingTerms,
  fuelPurchaseQuote,
  dawnHandModifiers,
  crewRoster,
  crewBenefitLabel,
  portLedger,
  portFailureExplanation,
  contrabandHold,
  knownNpcCounts,
  wireLines,
  wireLog,
  npcNameIndex,
  npcDossier,
  statName,
  checkVerdict,
  signedMargin,
  cargoHasStorylet,
  contractIsUrgent,
  encounterReadout,
  combatFuelStatus,
  tributeThisRound,
  shipComponents,
  specialEquipmentRows,
  shipyardQuote,
  shipyardFailureExplanation,
  storyletChoiceCostLabel,
  storyletChoiceNeedsDie,
  storyletChoiceLock,
  deedRegistry,
  factionStanding,
  nemesisFile,
  activeOnboardingPrompt,
  onboardingMount,
  isGuildLetter,
  availableStorylets,
  offersForSurface,
  resolutionCeremony,
  crossingEnding,
  type OnboardingAnchor,
  type OnboardingMount,
  type ResolutionCeremonyView,
  type CrossingEndingView,
  type ShipComponentRow,
  type WireLogEntry,
  type StoryletChoice,
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

// The OS-level preference only. The user setting is layered on top of this in
// App() (`reduced = setting || media`); either one suppresses motion.
const systemPrefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The effect layer never takes changing props → React never re-renders it per
// frame (T-302). All scanline / flicker / vignette motion is CSS.
const EffectsLayer = memo(function EffectsLayer() {
  return <div className="fx" aria-hidden="true" />;
});

// The audio mixer (T-310, folded into Settings by T-1406). Three master/SFX/
// ambient sliders + a mute toggle, reflecting the persisted mixer state through
// the sound module's own external store. It is a pure client of `sound.ts`: it
// never touches the AudioContext — the context unlocks on the first gesture
// inside the manager (a global capture-phase listener, not this component's
// mount), so hosting it inside Settings changes only the door, not the autoplay
// policy. T-1406 · This lives INSIDE the Settings popover now: reaching a volume
// slider is one popover, not two (the "menu ceremony" PRD §2 forbids).
function AudioMixer() {
  const mixer = useSyncExternalStore(sound.subscribe, sound.getMixer, sound.getMixer);

  const slider = (bus: sound.MixerBus, label: string, testid: string) => (
    <label className="audio-row">
      <span className="audio-row-label">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={mixer[bus]}
        data-testid={testid}
        aria-label={`${label} volume`}
        onChange={(e) => sound.setVolume(bus, Number.parseFloat(e.target.value))}
      />
    </label>
  );

  return (
    <div className="audio-mixer" data-testid="audio-mixer">
      {slider('master', 'Master', 'vol-master')}
      {slider('sfx', 'SFX', 'vol-sfx')}
      {slider('ambient', 'Ambient', 'vol-ambient')}
      <button
        className={mixer.muted ? 'audio-mute on' : 'audio-mute'}
        data-testid="audio-mute"
        aria-pressed={mixer.muted}
        onClick={() => sound.setMuted(!mixer.muted)}
      >
        {mixer.muted ? 'Muted' : 'Mute'}
      </button>
    </div>
  );
}

// The settings + saves popover (T-312). A popover anchored in the control bar
// (Escape closes) that owns the display/accessibility settings, the audio mixer
// and the three save slots. It is a pure CLIENT of the store: every toggle drives
// a store action, and the slot list reads `state.saves`. T-1406 · The audio
// mixer is now hosted HERE (was a second popover) so every setting — including a
// volume slider — is reachable from one popover, not two.
const TEXT_SIZES: { size: TextSize; label: string }[] = [
  { size: 'small', label: 'Small' },
  { size: 'normal', label: 'Normal' },
  { size: 'large', label: 'Large' },
];

function SettingsPanel({ state, onClose }: { state: CockpitState; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="settings-panel"
      data-testid="settings-panel"
      role="dialog"
      aria-label="Settings"
    >
      <div className="set-section">
        <span className="set-head">Display</span>
        <div className="set-row">
          <span className="set-label">CRT effects</span>
          <button
            className={state.fx ? 'set-toggle on' : 'set-toggle'}
            data-testid="set-crt"
            aria-pressed={state.fx}
            onClick={toggleFx}
          >
            {state.fx ? 'On' : 'Off'}
          </button>
        </div>
        <div className="set-row">
          <span className="set-label">Reduced motion</span>
          <button
            className={state.reducedMotion ? 'set-toggle on' : 'set-toggle'}
            data-testid="set-reduced-motion"
            aria-pressed={state.reducedMotion}
            onClick={() => setReducedMotion(!state.reducedMotion)}
          >
            {state.reducedMotion ? 'On' : 'Off'}
          </button>
        </div>
        <div className="set-row">
          <span className="set-label">Text size</span>
          <div className="set-seg" data-testid="set-text-size">
            {TEXT_SIZES.map((t) => (
              <button
                key={t.size}
                className={state.textSize === t.size ? 'set-seg-btn on' : 'set-seg-btn'}
                data-testid={`set-text-size-${t.size}`}
                aria-pressed={state.textSize === t.size}
                onClick={() => setTextSize(t.size)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="set-section">
        <span className="set-head">Audio</span>
        <AudioMixer />
      </div>

      <SavesPanel state={state} />
    </div>
  );
}

// The three save slots (T-312). Each row shows a non-empty slot's summary read
// from `state.saves`, with Save (overwrite), Load and a TWO-STEP Delete that
// asks first — the "deleting asks first" acceptance criterion. The confirm is
// component-local: the store performs the deletion only when the confirm button
// is pressed, so the slot data survives until then.
function SavesPanel({ state }: { state: CockpitState }) {
  const [confirming, setConfirming] = useState<number | null>(null);

  const fmtWhen = (savedAt?: number): string => {
    if (!savedAt) return '';
    try {
      return new Date(savedAt).toLocaleString();
    } catch {
      return '';
    }
  };

  return (
    <div className="saves-panel" data-testid="saves-panel">
      <span className="set-head">Save slots</span>
      {state.saves.map((slot: SlotSummary) => (
        <div
          className={slot.empty ? 'save-slot empty' : 'save-slot'}
          key={slot.index}
          data-testid="save-slot"
          data-slot={slot.index}
          data-empty={slot.empty ? '1' : '0'}
        >
          <div className="ss-main">
            <span className="ss-index">SLOT {slot.index}</span>
            {slot.empty ? (
              <span className="ss-empty" data-testid="slot-empty">
                Empty
              </span>
            ) : (
              <span className="ss-summary" data-testid="slot-summary">
                DAY {slot.day} · {systemName(slot.systemId ?? 0)} ·{' '}
                {(slot.credits ?? 0).toLocaleString()}cr · SEED {slot.seed}
                {slot.savedAt ? ` · ${fmtWhen(slot.savedAt)}` : ''}
              </span>
            )}
          </div>
          <div className="ss-controls">
            <button
              className="btn small"
              data-testid="slot-save"
              onClick={() => {
                setConfirming(null);
                saveToSlot(slot.index);
              }}
            >
              Save
            </button>
            <button
              className="btn small"
              data-testid="slot-load"
              disabled={slot.empty}
              onClick={() => loadSlot(slot.index)}
            >
              Load
            </button>
            <button
              className="btn small ghost"
              data-testid="slot-delete"
              disabled={slot.empty}
              onClick={() => setConfirming(slot.index)}
            >
              Delete
            </button>
          </div>
          {confirming === slot.index && (
            <div className="ss-confirm" data-testid="delete-confirm" role="alertdialog">
              <span className="ss-confirm-q">Delete slot {slot.index}? This cannot be undone.</span>
              <div className="ss-confirm-btns">
                <button
                  className="btn small danger"
                  data-testid="slot-delete-confirm"
                  onClick={() => {
                    deleteSlot(slot.index);
                    setConfirming(null);
                  }}
                >
                  Delete
                </button>
                <button
                  className="btn small ghost"
                  data-testid="slot-delete-cancel"
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const s = useCockpit();
  const [recordsOpen, setRecordsOpen] = useState(false);
  // T-1406 · The storylet panel opens FOCUSED on one id, from a diegetic surface
  // (a hold/manifest line, a wire bulletin, a port dispatch) — there is no badge
  // launcher any more. Null when no storylet is open.
  const [openStoryletId, setOpenStoryletId] = useState<string | null>(null);
  const [hangoutPanelOpen, setHangoutPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-fx', s.fx ? 'on' : 'off');
  }, [s.fx]);

  // Reduced motion is the user setting OR the OS preference — either suppresses
  // motion. The attribute drives the CSS kill-switch; the JS scramble/sweep are
  // gated on `reduced` directly (below / in useDiceRoll).
  const reduced = s.reducedMotion || systemPrefersReducedMotion();
  useEffect(() => {
    document.documentElement.setAttribute('data-motion', reduced ? 'reduced' : 'full');
  }, [reduced]);
  useEffect(() => {
    document.documentElement.setAttribute('data-text-size', s.textSize);
  }, [s.textSize]);

  // The day-30 Tour One resolution ceremony (T-311): a full-screen certificate
  // that intercepts the forced `resolution.tour-one.*` storylet, so the decisive
  // beat is unmissable. Null until a resolution is on offer (dawn of day 31);
  // unmounts when it is acknowledged.
  const ceremony = resolutionCeremony(s.game);

  // T-1505 · The Nemesis crossing ending — the career's terminal ceremony. Non-null
  // once the ship has crossed into NEMESIS with the crossing committed (derived, no
  // stored flag). When up it covers the cockpit and offers only "Return to menu" →
  // a fresh career, so the crossing is genuinely one-way and cannot be played past.
  const ending = crossingEnding(s.game);

  // T-1406 · When the focused offer resolves or otherwise drains from the live
  // set, clear the open id so a stale id can never re-mount the panel. The panel
  // returns null on a missing offer too, but this keeps the state honest.
  const storyletStillLive =
    openStoryletId !== null &&
    s.game.storylets.available.some((o) => o.storyletId === openStoryletId);
  useEffect(() => {
    if (openStoryletId !== null && !storyletStillLive) setOpenStoryletId(null);
  }, [openStoryletId, storyletStillLive]);

  // T-1404 · The Hangout is a visitable place, offered ONLY where the engine says
  // a Hangout exists (`hangoutOpen` reads the SAME `hasHangout` flag day.ts gates
  // on) and never over a live encounter / aftermath / day-30 ceremony.
  const hangoutAvailable =
    hangoutOpen(s.game) && !s.game.encounter && !s.combatAftermath && !ceremony;

  return (
    <div className="tube">
      <EffectsLayer />
      {!reduced && <div className="sweep" key={s.bootKey} aria-hidden="true" />}

      <div className="screen">
        {/* T-1406 · The control cluster is DIEGETIC now — a row of console
            switches on the terminal bezel, in-fiction, rather than a floating
            top-right toolbar. Same buttons, same testids; the audio popover is
            gone (folded into Settings) and the storylet launcher is gone
            (storylets open from their diegetic surfaces below). */}
        <Bezel game={s.game} seed={s.seed}>
          <div className="ctrls">
            <button onClick={toggleFx}>{s.fx ? 'CRT: ON' : 'CRT: OFF'}</button>
            {hangoutAvailable && (
              <button
                className="hangout-launch"
                data-testid="hangout-toggle"
                aria-expanded={hangoutPanelOpen}
                onClick={() => setHangoutPanelOpen((v) => !v)}
              >
                Hangout
              </button>
            )}
            <button data-testid="records-toggle" onClick={() => setRecordsOpen((v) => !v)}>
              Records
            </button>
            <button
              data-testid="settings-toggle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              Settings
            </button>
            <NewGameButton />
            {settingsOpen && <SettingsPanel state={s} onClose={() => setSettingsOpen(false)} />}
          </div>
        </Bezel>
        {/* T-1605 · Corrupt-save boot banner. Set by the store when a PRESENT autosave
            could not be loaded and the app fell back to a fresh career — so that reset
            is VISIBLE, never silent. `role="alert"` (louder than the transient
            `role="status"` notice) and persistent: it survives the first action (it is
            a separate field from `notice`) until the player dismisses it. */}
        {s.bootNotice && (
          <div className="notice warn rev" data-testid="boot-notice" role="alert">
            <span>{s.bootNotice}</span>
            <button
              type="button"
              data-testid="boot-notice-dismiss"
              aria-label="Dismiss"
              onClick={dismissBootNotice}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="main">
          <div className="col left">
            <Starmap state={s} />
            <ShipPane state={s} />
          </div>
          <div className="col">
            <Manifest state={s} />
            <TradePane state={s} onOpenStorylet={setOpenStoryletId} />
          </div>
        </div>
        <Wire game={s.game} onOpenStorylet={setOpenStoryletId} />
        {/* T-1406 · Reachability audit node — a visually-hidden reflection of the
            engine's own live non-resolution offer set. NOT a metric stub: it is
            the same list the old launcher counted, rendered off-screen so the
            storylet-delivery sweep spec can prove the diegetic openers cover
            every live offer with no gaps. READER: storylet-delivery.spec.ts. */}
        <ul data-testid="storylet-offer-audit" aria-hidden="true" className="sr-only">
          {availableStorylets(s.game).map((o) => (
            <li key={o.storyletId} data-offer-id={o.storyletId} />
          ))}
        </ul>
        {openStoryletId &&
          storyletStillLive &&
          !s.game.encounter &&
          !s.combatAftermath &&
          !ceremony &&
          !ending && (
            <StoryletPanel
              state={s}
              storyletId={openStoryletId}
              onClose={() => setOpenStoryletId(null)}
            />
          )}
        {hangoutPanelOpen && hangoutAvailable && !ending && (
          <HangoutPanel state={s} onClose={() => setHangoutPanelOpen(false)} />
        )}
        <HandDock state={s} />
        {/* Contextual first-time coach prompt for the cockpit affordances. The
            combat coach lives inside the combat overlay (below); this instance
            handles hand / manifest / starmap anchors. Only one prompt shows at a
            time (the selector guarantees it), so the two mounts never collide. */}
        <OnboardingCallout state={s} where="screen" />
        <CombatOverlay state={s} />
        {ceremony && <ResolutionCeremony state={s} view={ceremony} />}
        {recordsOpen && <RecordsOverlay game={s.game} onClose={() => setRecordsOpen(false)} />}
        {/* T-1505 · The crossing ending renders LAST so it stacks above every other
            overlay — the terminal act is unmissable and un-dismissable except by
            returning to a fresh career. */}
        {ending && <CrossingEnding view={ending} />}
        {/* T-1703 · The end-of-demo wall renders ABSOLUTELY LAST so it stacks above
            every other overlay — the demo terminus is unmissable and un-dismissable
            (it offers only external wishlist/buy CTAs, never a path to veteran content).
            Raised only in the demo build, by ending the final playable day. */}
        {s.demoWall && <DemoWall />}
      </div>
    </div>
  );
}

// T-1703 · A shared teaser rendered IN PLACE OF a gated veteran control in the demo
// build (never merely disabling it — the control is ABSENT so a reachability spec can
// assert zero matching elements). Pure presentation: the copy is DATA from demo.ts.
// READERS of `demoFeatureLocked`: the three call sites (Port Authority, crew hiring +
// borrowing, the Registry's Conqueror rung) each mount this with their feature key.
function DemoLock({ feature, testid }: { feature: DemoGatedFeature; testid: string }) {
  const copy = DEMO_LOCK_COPY[feature];
  return (
    <div className="demo-lock" data-testid={testid} data-demo-feature={feature}>
      <span className="demo-lock-badge">{copy.badge}</span>
      <span className="demo-lock-body">{copy.body}</span>
    </div>
  );
}

// T-1703 · The end-of-demo ceremony. A full-screen, un-dismissable certificate raised
// when the player ends the final demo day (store `demoWall`), modeled on CrossingEnding.
// It names the gated veteran arcs and offers ONLY an external wishlist CTA — there is no
// control here that reaches veteran content or advances the day, so the demo terminates
// cleanly. The saved career remains a clean day-33 GameState that carries into the full
// game (proven by the demo-save-carry spec on the full build).
function DemoWall() {
  return (
    <div
      className="demo-wall"
      data-testid="demo-wall"
      role="dialog"
      aria-label="Demo complete"
      aria-modal="true"
    >
      <div className="dw-frame">
        <header className="dw-head">
          <span className="dw-kicker">{DEMO_WALL_COPY.kicker}</span>
          <h2 className="dw-title" data-testid="demo-wall-title">
            {DEMO_WALL_COPY.title}
          </h2>
        </header>
        <p className="dw-lede">{DEMO_WALL_COPY.lede}</p>
        <div className="dw-unlocks">
          <div className="dw-unlocks-head">{DEMO_WALL_COPY.unlocksHead}</div>
          <ul className="dw-unlocks-list" data-testid="demo-wall-unlocks">
            {DEMO_WALL_COPY.unlocks.map((line) => (
              <li className="dw-unlock" key={line}>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="dw-carry">{DEMO_WALL_COPY.carry}</p>
        <div className="dw-actions">
          {/* The ONLY affordance: an external wishlist link. No in-app control that
              could reach veteran content or advance past the demo budget. */}
          <a
            className="btn"
            data-testid="demo-wall-cta"
            href="https://store.steampowered.com/"
            target="_blank"
            rel="noreferrer"
          >
            {DEMO_WALL_COPY.cta}
          </a>
        </div>
      </div>
    </div>
  );
}

// The contextual onboarding coach (T-311). A NON-MODAL callout anchored to the
// real affordance it teaches — no backdrop, no focus trap, nothing disabled, so
// the player can act on the affordance while it is up (which auto-dismisses it).
// This is the "no modal tutorial walls" guarantee. It renders at most one prompt
// (the store's selector picks the highest-priority active, unseen one). `where`
// selects which of THREE mount points this instance is: the combat coach renders
// INSIDE the combat overlay, the loan coach INSIDE the open Hangout panel (both
// overlays cover the cockpit), and everything else at screen level. The single
// global selector still guarantees at most one prompt anywhere; `onboardingMount`
// (T-1407) just routes the winner to its correct mount.
function OnboardingCallout({ state, where }: { state: CockpitState; where: OnboardingMount }) {
  // The screen mount is suppressed while the combat overlay covers the cockpit,
  // so a lower-priority screen prompt can never render behind the overlay.
  if (where === 'screen' && state.game.encounter != null) return null;
  const prompt = activeOnboardingPrompt(state.game, state.onboardingSeen);
  if (!prompt) return null;
  if (onboardingMount(prompt.anchor) !== where) return null;
  return (
    <aside
      className="onboarding"
      data-testid="onboarding"
      data-onboarding-id={prompt.id}
      data-onboarding-anchor={prompt.anchor satisfies OnboardingAnchor}
      role="status"
    >
      <b className="ob-title">{prompt.title}</b>
      <p className="ob-body">{prompt.body}</p>
      <button
        className="ob-dismiss"
        data-testid="onboarding-dismiss"
        aria-label="dismiss hint"
        onClick={() => dismissOnboarding(prompt.id)}
      >
        Got it
      </button>
    </aside>
  );
}

// The day-30 Tour One resolution ceremony (T-311). A full-screen certificate,
// modelled on the combat overlay, that presents the engine's already-forced
// resolution (T-113b) — cleared vs unpaid — as a screen the player cannot miss.
// It is a pure CLIENT: it reads the forced `resolution.tour-one.*` offer and the
// `veteran.unlocked` flag via format.ts, and every choice resolves through the
// SAME `resolveStorylet` store action the generic panel uses. Acknowledging a
// choice removes the offer → `resolutionCeremony` returns null → this unmounts
// back to a fully playable cockpit (no soft-lock; both branches reachable).
function ResolutionCeremony({
  state,
  view,
}: {
  state: CockpitState;
  view: ResolutionCeremonyView;
}) {
  const offer = view.offer;
  return (
    <div
      className="resolution-ceremony"
      data-testid="resolution-ceremony"
      data-outcome={view.outcome}
      role="dialog"
      aria-label="Tour One resolution"
    >
      <div className="rc-frame">
        <header className="rc-head">
          <span className="rc-kicker">TOUR ONE · DAY 30</span>
          <h2 className="rc-title" data-testid="resolution-title">
            {offer.title}
          </h2>
          <span className="rc-rank" data-testid="resolution-rank">
            {view.rankLabel}
          </span>
        </header>

        <p className="rc-prose" data-testid="resolution-prose">
          {offer.prose}
        </p>

        {view.outcome === 'cleared' ? (
          <div className="rc-honors">
            {view.deedTitle && (
              <div className="rc-deed" data-testid="resolution-deed">
                <span className="rc-seal rev">DEED</span>
                <b>{view.deedTitle}</b>
              </div>
            )}
            {view.veteranUnlocked && (
              <div className="rc-veteran rev" data-testid="veteran-unlocked">
                VETERAN LANES OPEN
              </div>
            )}
          </div>
        ) : (
          <div className="rc-consequence" data-testid="resolution-consequence">
            The marker stands — you fly on, indebted but flying.
          </div>
        )}

        <div className="rc-choices">
          {offer.choices.map((choice: StoryletChoice) => {
            const lock = storyletChoiceLock(
              state.game,
              offer.storyletId,
              choice,
              state.selectedDie ?? undefined,
            );
            const needsDie = storyletChoiceNeedsDie(state.game, offer.storyletId, choice);
            return (
              <div
                className={lock ? 'rc-choice locked' : 'rc-choice'}
                key={choice.id}
                data-testid="resolution-choice"
                data-choice-id={choice.id}
              >
                <button
                  className="btn"
                  data-testid="resolution-choice-btn"
                  disabled={lock !== null}
                  title={lock ?? `Choose: ${choice.label}`}
                  onClick={() => resolveStorylet(offer.storyletId, choice.id, needsDie)}
                >
                  {choice.label}
                </button>
                <p className="rc-choice-prose">{choice.prose}</p>
                {lock && (
                  <span className="rc-lock" data-testid="resolution-choice-lock">
                    {lock}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// T-1505 · The Nemesis crossing ending — the career's terminal ceremony. A
// full-screen certificate modelled on ResolutionCeremony, rendered when the ship
// has crossed into NEMESIS (format.ts `crossingEnding` non-null). It presents the
// decoded epilogue — the culmination the whole twelve-fragment arc built to — and
// offers ONLY "Return to menu", which resets to a fresh day-1 career (store
// `returnToMenu` → `newGame`). Andromeda beyond stays sealed for the expansion; in
// v1 the crossing itself is the ending. A pure CLIENT: it reads the derived view
// and owns no rule.
function CrossingEnding({ view }: { view: CrossingEndingView }) {
  return (
    <div
      className="crossing-ending"
      data-testid="crossing-ending"
      role="dialog"
      aria-label="The Nemesis crossing"
    >
      <div className="ce-frame">
        <header className="ce-head">
          <span className="ce-kicker">THE CROSSING · DAY {view.day}</span>
          <h2 className="ce-title" data-testid="crossing-title">
            Beyond the Black Hole
          </h2>
          <span className="ce-signal" data-testid="crossing-signal-count">
            {view.fragmentsDecoded} of 12 · SIGNAL ASSEMBLED
          </span>
        </header>

        <p className="ce-lede">
          The hull crosses the event horizon and does not come apart. The far side is listening.
          Whatever answers, the captain you were does not fly home — the name, the fortune, the
          ship, all spent to reach this heading. What the Signal spent a career telling you settles
          at last:
        </p>

        <ul className="ce-epilogue" data-testid="crossing-epilogue">
          {view.epilogue.map((line) => (
            <li className="ce-line" key={line.fragmentId} data-fragment-id={line.fragmentId}>
              <b className="ce-line-title">{line.title}</b>
              <p className="ce-line-text">{line.text}</p>
            </li>
          ))}
        </ul>

        <div className="ce-actions">
          <button className="btn" data-testid="crossing-return-menu" onClick={() => returnToMenu()}>
            Return to menu
          </button>
        </div>
      </div>
    </div>
  );
}

// The combat instrument (T-307). A full-screen layer that covers the cockpit
// the instant an encounter interrupts a jump — the starmap/trade/hand behind it
// are engine-blocked during an encounter anyway (applyPlayerAction returns
// ActionBlocked), so covering them prevents dead clicks. It is a pure CLIENT of
// the combat rules: the die strip drives the SAME store selection model, the
// three stances call the store's `combat()` action, and every number shown —
// the fuel budget, the tribute preview — is read from format.ts (imported
// content constants), never recomputed. The honest PLAYER roll rides the shared
// CheckBreakdown. The whole overlay renders from `game.encounter`, so a reload
// mid-encounter restores it automatically (loadSave restores `encounter`).
function CombatOverlay({ state }: { state: CockpitState }) {
  const game = state.game;
  const encounter = game.encounter;
  const aftermath = state.combatAftermath;
  // Key off encounter OR aftermath: the engine nulls `encounter` the instant it
  // resolves, so a naive `if (encounter)` would unmount before the summary shows.
  if (!encounter && !aftermath) return null;

  return (
    <div className="combat-overlay" data-testid="combat-overlay" role="dialog" aria-label="Combat">
      <div className="co-frame">
        {/* The combat coach renders INSIDE the overlay so it overlays the
            full-screen instrument (a screen-level callout would sit behind it). */}
        <OnboardingCallout state={state} where="combat" />
        {encounter ? (
          <CombatInstrument state={state} />
        ) : (
          <CombatAftermathPanel aftermath={aftermath!} />
        )}
      </div>
    </div>
  );
}

function CombatInstrument({ state }: { state: CockpitState }) {
  const game = state.game;
  const encounter = game.encounter!;
  const readout = encounterReadout(game);
  const fuel = combatFuelStatus(game);
  const hand = game.player.dawnHand;
  const dice = hand?.dice ?? [];
  const spent = hand?.spent ?? [];
  const remaining = spent.filter((x) => !x).length;
  const armed = state.selectedDie !== null;
  // T-1402 · Forward the interceptor's CLASS so an anonymous Brigand (÷2) /
  // Reptiloid (×2) previews the exact demand the engine charges; named
  // interceptors carry no kind → the unmodified schedule.
  const tributePreview = tributeThisRound(encounter.round, encounter.interceptor.kind);

  return (
    <section className="co-instrument">
      {/* ---- enemy readout ---- */}
      <header className="co-enemy">
        <div className="co-enemy-id">
          <b className="co-enemy-name" data-testid="combat-enemy-name">
            {readout?.name}
          </b>
          <span className="co-enemy-ship" data-testid="combat-enemy-ship">
            {readout?.shipClass ? `${readout.shipClass} · ` : ''}
            {readout?.shipName}
          </span>
          <span className="co-enemy-hist" data-testid="combat-enemy-history">
            {readout?.history}
          </span>
        </div>
        <div className="co-enemy-meta">
          <span className="co-tier" data-testid="combat-enemy-tier">
            TIER {readout?.tier}
          </span>
          <span className="co-round" data-testid="combat-round">
            ROUND {encounter.round}
          </span>
          <span className="co-hull" data-testid="combat-enemy-hull" data-hull={encounter.enemyHull}>
            HULL{' '}
            {Array.from({ length: Math.max(0, encounter.enemyHull) }).map((_, i) => (
              <i key={i} className="hp" />
            ))}
            <b>{encounter.enemyHull}</b>
          </span>
        </div>
      </header>

      {/* ---- T-1405 patrol contraband scan ---- */}
      {state.patrolScan && <PatrolScanReadout scan={state.patrolScan} />}

      {/* ---- fuel budget: the "can I afford to fire?" instrument ---- */}
      <div className="co-fuel" data-testid="combat-fuel">
        <span className="co-fuel-big">
          FUEL <b>{fuel.fuel.toLocaleString()}</b>
        </span>
        <span className="co-fuel-costs">
          FIGHT <b className={fuel.canFight ? '' : 'short'}>−{fuel.fightCost}</b> · RUN{' '}
          <b className={fuel.canRun ? '' : 'short'}>−{fuel.runCost}</b> · TALK{' '}
          <b>{tributePreview.toLocaleString()}cr</b>
        </span>
      </div>
      {!fuel.canFight && (
        <div className="co-offline rev" data-testid="combat-weapons-offline">
          WEAPONS OFFLINE — need {fuel.fightCost} fuel to fire, have {fuel.fuel}. Fighting now will
          misfire.
        </div>
      )}
      {state.combatMalfunction && (
        <div className="co-malfunction rev" data-testid="combat-malfunction" role="status">
          Weapons malfunction — the die burned and the enemy pressed, but no shot landed.
        </div>
      )}

      {/* ---- per-round die commitment ---- */}
      <div className="co-dice" data-testid="combat-hand">
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
              data-testid="combat-die"
              data-die-index={i}
              data-die-value={v}
              data-spent={isSpent ? '1' : '0'}
              role="button"
              tabIndex={isSpent ? -1 : 0}
              aria-pressed={state.selectedDie === i}
              aria-label={isSpent ? `die ${i + 1} spent` : `combat die ${i + 1}, value ${v}`}
              onClick={() => selectDie(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectDie(i);
                }
              }}
            >
              <span>{v}</span>
              <span className="dl">{isSpent ? 'SPENT' : 'd20'}</span>
            </div>
          );
        })}
      </div>

      {/* ---- stance commitment ---- */}
      {remaining === 0 ? (
        <div className="co-standdown">
          <p className="co-hint">Hand spent mid-fight — stand down to weather dusk and re-arm.</p>
          <button className="btn" data-testid="combat-stand-down" onClick={standDown}>
            Stand down (end day)
          </button>
        </div>
      ) : (
        <>
          <div className="co-stances">
            <button
              className="btn stance fight"
              data-testid="combat-fight"
              disabled={!armed}
              title={
                !armed
                  ? 'Pick a die first'
                  : fuel.canFight
                    ? 'Roll GUNS to hole their hull (−50 fuel)'
                    : 'Not enough fuel — this will misfire (−50 fuel gated)'
              }
              onClick={() => combat('fight')}
            >
              FIGHT
            </button>
            <button
              className="btn stance talk"
              data-testid="combat-talk"
              disabled={!armed}
              title={armed ? 'Roll TRADE to buy the lane with tribute' : 'Pick a die first'}
              onClick={() => combat('talk')}
            >
              TALK
            </button>
            <button
              className="btn stance run"
              data-testid="combat-run"
              disabled={!armed}
              title={armed ? 'Roll PILOT to break off (−10 fuel)' : 'Pick a die first'}
              onClick={() => combat('run')}
            >
              RUN
            </button>
          </div>
          <div className="co-tribute" data-testid="combat-tribute">
            Talk this round likely costs <b>{tributePreview.toLocaleString()}cr</b> tribute — the
            deal is struck on the wire.
          </div>
          {!armed && <p className="co-hint">Pick a die, then commit a stance.</p>}
        </>
      )}

      {/* The honest PLAYER roll — the store feeds CheckBreakdown the actor:'Player'
          StatCheck, never the enemy counter-attack. No stat filter here. */}
      <CheckBreakdown state={state} />
    </section>
  );
}

// The patrol contraband scan (T-1405). Surfaces the GUILE check a PATROL rolled
// against a smuggler's hold DURING the jump (engine actions/patrol.ts) — the honest
// breakdown via the shared CheckReadout, plus the consequence (caught → hold seized
// + fine + which cargo; clean → passed). A pure read of the store's `patrolScan`;
// every number is the engine's, never recomputed.
function PatrolScanReadout({ scan }: { scan: NonNullable<CockpitState['patrolScan']> }) {
  const seized: string[] = [];
  if (scan.confiscatedContract) seized.push('contract cargo');
  if (scan.confiscatedPod) seized.push('the sealed pod');
  const seizedText = seized.length > 0 ? ` — ${seized.join(' and ')} confiscated` : '';
  return (
    <section className="patrol-scan" data-testid="patrol-scan">
      <CheckReadout
        stat={Stat.GUILE}
        result={scan.check}
        label="PATROL SCAN"
        testid="patrol-scan-check"
      />
      <div
        className={scan.caught ? 'ps-result rev' : 'ps-result clear'}
        data-testid="patrol-scan-result"
        data-caught={scan.caught ? '1' : '0'}
        role="status"
      >
        {scan.caught
          ? `Hold seized — fine ${scan.fine.toLocaleString()}cr${seizedText}.`
          : 'Scan passed — hold clean.'}
      </div>
    </section>
  );
}

function CombatAftermathPanel({
  aftermath,
}: {
  aftermath: NonNullable<CockpitState['combatAftermath']>;
}) {
  return (
    <section className="co-aftermath" data-testid="combat-aftermath">
      <h2
        className="co-aftermath-head"
        data-testid="combat-aftermath-resolution"
        data-resolution={aftermath.resolution}
      >
        {aftermath.lines[0]}
      </h2>
      <ul className="co-aftermath-lines">
        {aftermath.lines.slice(1).map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="co-hint">Logged to the Galactic Wire.</p>
      <button className="btn" data-testid="combat-dismiss" onClick={dismissAftermath}>
        Back to the cockpit
      </button>
    </section>
  );
}

// The in-cockpit storylet surface (T-309; T-1406 diegetic delivery). A prose
// panel FOCUSED on the one offer the player opened from its diegetic surface —
// each choice showing its authored requirement/cost and, when unmet, a visible
// lock that also disables the button. It is a pure CLIENT of the storylet rules:
// the single mutation routes through the store's `resolveStorylet`, a die is
// spent only for a choice that requires one, and a storylet stat check rides the
// shared honest-check readout (CheckBreakdown, context 'storylet'). Combat takes
// visual precedence — the panel is hidden while an encounter/aftermath is live.
// T-1406 · The diegetic opener that surfaces a single storylet from its
// in-fiction anchor (a hold/manifest line, a wire bulletin, a port dispatch).
// Every surface renders the SAME element for one selector; the classifier
// (storyletSurface) decides which anchor an offer appears at, and clicking opens
// the focused panel on that id. It owns no rule — it just names the offer.
function StoryletOpener({ offer, onOpen }: { offer: StoryletOffer; onOpen: (id: string) => void }) {
  return (
    <button
      className="storylet-open"
      data-testid="storylet-open"
      data-storylet-open={offer.storyletId}
      onClick={() => onOpen(offer.storyletId)}
    >
      {offer.title}
    </button>
  );
}

function StoryletPanel({
  state,
  storyletId,
  onClose,
}: {
  state: CockpitState;
  storyletId: string;
  onClose: () => void;
}) {
  const game = state.game;

  // Escape closes the panel (the WireLog / Records convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // T-1406 · The panel is FOCUSED on one id (opened from its diegetic surface).
  // If that offer has drained from the live set (resolved, or gone stale), render
  // nothing — App also clears the open id, so the panel simply unmounts.
  const offer = game.storylets.available.find((o) => o.storyletId === storyletId);
  if (!offer) return null;
  // T-311: a Merchant-Guild storylet is dressed as an official wire letter — a
  // reverse-video masthead and teletype rule — rather than a plain menu. This is
  // a pure MARKUP/CSS treatment switched on the storylet id; the choices, locks
  // and resolveStorylet path are unchanged.
  const isLetter = isGuildLetter(offer.storyletId);

  return (
    <section
      className="storylet-panel"
      data-testid="storylet-panel"
      data-storylet-id={offer.storyletId}
      data-variant={isLetter ? 'letter' : undefined}
      role="dialog"
      aria-label={`Storylet: ${offer.title}`}
    >
      {isLetter && (
        <div className="storylet-letterhead" data-testid="storylet-letterhead" aria-hidden="true">
          <span className="sl-seal rev">GUILD WIRE</span>
          <span className="sl-masthead">MERCHANT GUILD OF SUN-3 · OFFICIAL NOTICE</span>
        </div>
      )}
      <header className="sl-head">
        <h2 className="sl-title" data-testid="storylet-title">
          {offer.title}
        </h2>
        <button
          className="sl-close"
          data-testid="storylet-close"
          aria-label="close"
          onClick={onClose}
        >
          &times;
        </button>
      </header>
      <p className="sl-prose" data-testid="storylet-prose">
        {offer.prose}
      </p>
      <div className="sl-choices">
        {offer.choices.map((choice: StoryletChoice) => {
          const lock = storyletChoiceLock(
            game,
            offer.storyletId,
            choice,
            state.selectedDie ?? undefined,
          );
          const cost = storyletChoiceCostLabel(game, offer.storyletId, choice);
          const needsDie = storyletChoiceNeedsDie(game, offer.storyletId, choice);
          return (
            <div
              className={lock ? 'sl-choice locked' : 'sl-choice'}
              key={choice.id}
              data-testid="storylet-choice"
              data-choice-id={choice.id}
              data-locked={lock ? '1' : '0'}
            >
              <div className="sl-choice-main">
                <button
                  className="btn small"
                  data-testid="storylet-choice-btn"
                  disabled={lock !== null}
                  title={lock ?? `Choose: ${choice.label}`}
                  onClick={() => resolveStorylet(offer.storyletId, choice.id, needsDie)}
                >
                  {choice.label}
                </button>
                {cost && (
                  <span className="sl-cost" data-testid="storylet-choice-cost">
                    {cost}
                  </span>
                )}
                {/* The "locked choices show their requirement" surface — the
                    disabled reason, rendered inline, never hidden. */}
                {lock && (
                  <span className="sl-lock" data-testid="storylet-choice-lock">
                    {lock}
                  </span>
                )}
              </div>
              <p className="sl-choice-prose">{choice.prose}</p>
            </div>
          );
        })}
      </div>
      {/* A storylet stat check (any stat) rides the shared honest-check readout,
          gated to the storylet context so it renders only here. */}
      <CheckBreakdown state={state} context="storylet" />
    </section>
  );
}

// The Hangout & lending pane (T-1404). The Spacers Hangout as a visitable place:
// the present-NPC list (from their simulated positions), the Spacer's Dare with a
// die commitment and BOTH actors' opposed honest checks, the rumor table, and
// Penny Wise's desk (borrow/repay with the interest schedule visible up front). It
// is a pure CLIENT of the engine's T-1303 venues + T-1304 lending: every mutation
// routes through the store (visitDare / borrowLoan / repayLoan), and every number
// shown is read from an engine export, a content constant, or live engine-written
// loan state — never recomputed. The HandDock stays reachable behind it, so a die
// is armed exactly as in the storylet flow.
function HangoutPanel({ state, onClose }: { state: CockpitState; onClose: () => void }) {
  const game = state.game;
  const npcs = hangoutNpcs(game);
  const rumors = hangoutRumorLines(game);
  const bounds = dareWagerBounds();
  const terms = lendingTerms();
  const loan = game.player.loan;
  const armed = state.selectedDie !== null;
  const dareOutcome = state.dareOutcome;

  const [opponentId, setOpponentId] = useState<string | null>(npcs[0]?.id ?? null);
  const [wager, setWager] = useState(bounds.min);
  const [principal, setPrincipal] = useState(terms.minPrincipal);
  const [repayAmount, setRepayAmount] = useState(loan?.outstanding ?? terms.minPrincipal);

  // Escape closes the panel (the StoryletPanel / Records convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A previously-chosen opponent may have wandered off between renders — only a
  // still-present NPC is a valid dealer (mirrors the engine's in-system guard).
  const chosen = opponentId && npcs.some((n) => n.id === opponentId) ? opponentId : null;
  const dareDisabledReason = !armed
    ? 'Pick a die to wager'
    : !chosen
      ? 'Choose an opponent from the tables'
      : null;
  const loanDisabledReason = armed ? null : 'Pick a die first';

  return (
    <section
      className="hangout-panel"
      data-testid="hangout-panel"
      role="dialog"
      aria-label="Spacers Hangout"
    >
      <header className="hp-head">
        <h2 className="hp-title">Spacers Hangout · {systemName(game.player.currentSystemId)}</h2>
        <button
          className="sl-close"
          data-testid="hangout-close"
          aria-label="close"
          onClick={onClose}
        >
          &times;
        </button>
      </header>

      {/* T-1407 · The loan coach mounts INSIDE the panel (the `loan` anchor →
          `hangout` mount), so it overlays the open panel rather than sitting
          behind it. It exists only while the panel is open, which naturally gates
          `first-loan` to "the Hangout is open." */}
      <OnboardingCallout state={state} where="hangout" />

      {/* Pane-local failure surface: a Dare / lending typed fail must be visible
          above the cockpit (the global TradePane notice sits behind this panel). */}
      {state.notice && (
        <div className="notice rev" data-testid="hangout-notice" role="status">
          {state.notice}
        </div>
      )}

      {/* ---- present NPCs (Dare opponent picker) ---- */}
      <div className="hp-section">
        <div className="hp-shead">AT THE TABLES</div>
        {npcs.length === 0 ? (
          <div className="hp-empty" data-testid="hangout-npc-empty">
            The tables are empty tonight — no one to wager against.
          </div>
        ) : (
          <ul className="hp-npcs">
            {npcs.map((n) => (
              <li key={n.id}>
                <button
                  className={chosen === n.id ? 'hp-npc on' : 'hp-npc'}
                  data-testid="hangout-npc"
                  data-npc-id={n.id}
                  aria-pressed={chosen === n.id}
                  onClick={() => setOpponentId(n.id)}
                >
                  <span className="hp-npc-name">{n.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Spacer's Dare ---- */}
      <div className="hp-section hp-dare">
        <div className="hp-shead">SPACER&apos;S DARE</div>
        <div className="hp-dare-controls">
          <label className="hp-wager">
            <span className="hp-k" data-testid="dare-wager-bounds">
              WAGER {bounds.min}–{bounds.max} cr
            </span>
            <input
              aria-label="wager amount"
              data-testid="dare-wager"
              inputMode="numeric"
              value={wager}
              onChange={(e) => setWager(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            />
          </label>
          <button
            className="btn"
            data-testid="dare-commit"
            disabled={dareDisabledReason !== null}
            title={dareDisabledReason ?? 'Roll opposed GUILE against the dealer'}
            onClick={() => chosen && visitDare(chosen, wager)}
          >
            {dareDisabledReason ?? 'Wager a die'}
          </button>
        </div>
        {dareOutcome && (
          <div className="hp-dare-result" data-testid="dare-outcome">
            {/* The honest-dice signature applied to gambling: BOTH opposed checks,
                each read straight off the engine's StatCheck via CheckReadout. */}
            <CheckReadout
              key={`dp-${state.lastCheckKey}`}
              stat={dareOutcome.player.stat}
              result={dareOutcome.player.result}
              label="YOU"
              testid="dare-check-player"
            />
            <CheckReadout
              key={`do-${state.lastCheckKey}`}
              stat={dareOutcome.opponent.stat}
              result={dareOutcome.opponent.result}
              label={dareOutcome.opponent.npcName.toUpperCase()}
              testid="dare-check-opponent"
            />
            <div
              className={dareOutcome.playerWon ? 'hp-dare-verdict won' : 'hp-dare-verdict lost'}
              data-testid="dare-result"
              data-won={dareOutcome.playerWon ? '1' : '0'}
            >
              {dareOutcome.playerWon ? 'You took the hand' : 'The dealer took the hand'} ·{' '}
              <b>{signedMargin(dareOutcome.creditsDelta)}cr</b>
            </div>
          </div>
        )}
      </div>

      {/* ---- rumor table (engine's own hangoutRumors) ---- */}
      <div className="hp-section">
        <div className="hp-shead">RUMOR TABLE</div>
        <ul className="hp-rumors" data-testid="hangout-rumors">
          {rumors.map((line, i) => (
            <li key={i} className="hp-rumor" data-testid="hangout-rumor">
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* ---- Penny Wise's desk ---- */}
      <div className="hp-section hp-lending">
        <div className="hp-shead">PENNY WISE&apos;S DESK</div>
        {/* The schedule, visible UP FRONT — all raw content constants, no projected
            total (the engine still computes the realized dusk accrual). */}
        <div className="hp-terms" data-testid="loan-terms">
          Penny Wise · {terms.minPrincipal}–{terms.maxPrincipal} cr · {terms.ratePercent}%/dusk ·{' '}
          {terms.termDays}-dusk term
        </div>
        {loan ? (
          <>
            <div className="hp-loan-status" data-testid="loan-status" data-status={loan.status}>
              OUTSTANDING <b>{loan.outstanding.toLocaleString()}cr</b> · borrowed{' '}
              {loan.principal.toLocaleString()}cr · DUE D{loan.dueDay} · {loan.status.toUpperCase()}
            </div>
            <div className="hp-lend-controls">
              <input
                aria-label="repay amount"
                data-testid="loan-repay-amount"
                inputMode="numeric"
                value={repayAmount}
                onChange={(e) =>
                  setRepayAmount(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                }
              />
              <button
                className="btn"
                data-testid="loan-repay"
                disabled={loanDisabledReason !== null || repayAmount <= 0}
                title={loanDisabledReason ?? 'Pay down the loan (spends a die)'}
                onClick={() => repayLoan(repayAmount)}
              >
                {loanDisabledReason ?? 'Repay'}
              </button>
            </div>
          </>
        ) : demoFeatureLocked('hangout-progression') ? (
          /* T-1703 · Borrowing at Penny Wise's desk is Hangout progression, so the demo
             teases-but-gates it: the `loan-borrow` control is ABSENT (a teaser stands
             in), never merely disabled. Full build: the real borrow control. */
          <DemoLock feature="hangout-progression" testid="demo-lock-lending" />
        ) : (
          <div className="hp-lend-controls">
            <input
              aria-label="loan principal"
              data-testid="loan-principal"
              inputMode="numeric"
              value={principal}
              onChange={(e) => setPrincipal(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
            />
            <button
              className="btn"
              data-testid="loan-borrow"
              disabled={loanDisabledReason !== null}
              title={loanDisabledReason ?? 'Take a loan at Penny Wise’s desk (spends a die)'}
              onClick={() => borrowLoan(principal)}
            >
              {loanDisabledReason ?? 'Borrow'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// The Records overlay (T-309): the Registry of Deeds and the Nemesis file, in
// period voice. A dismissible overlay opened from the top controls (Escape to
// close), both sections pure reads of `game.player` via format.ts. The Registry
// shows the rank, deed count, next-rank progress and the earned-deed roll with
// its citation text; the Nemesis file shows the decoded-lore index (or its
// silent empty state when no fragments have been recovered).
function RecordsOverlay({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'registry' | 'nemesis'>('registry');
  const registry = deedRegistry(game);
  const standing = factionStanding(game);
  const nemesis = nemesisFile(game);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="records-overlay"
      data-testid="records-overlay"
      role="dialog"
      aria-label="Records"
    >
      <div className="ro-frame">
        <header className="ro-head">
          <div className="ro-tabs">
            <button
              className={tab === 'registry' ? 'ro-tab on' : 'ro-tab'}
              data-testid="records-tab-registry"
              aria-pressed={tab === 'registry'}
              onClick={() => setTab('registry')}
            >
              Registry of Deeds
            </button>
            <button
              className={tab === 'nemesis' ? 'ro-tab on' : 'ro-tab'}
              data-testid="records-tab-nemesis"
              aria-pressed={tab === 'nemesis'}
              onClick={() => setTab('nemesis')}
            >
              Nemesis File
            </button>
          </div>
          <button
            className="ro-close"
            data-testid="records-close"
            aria-label="close"
            onClick={onClose}
          >
            &times;
          </button>
        </header>

        {tab === 'registry' ? (
          <section className="registry" data-testid="registry">
            <div className="registry-rank">
              <span className="rr-label">RANK</span>
              <b className="rr-value" data-testid="registry-rank">
                {registry.rankLabel}
              </b>
              <span className="rr-deeds" data-testid="registry-deed-count">
                {registry.deedCount} {registry.deedCount === 1 ? 'DEED' : 'DEEDS'}
              </span>
              {registry.nextRankLabel && registry.deedsToNextRank !== null && (
                <span className="rr-next" data-testid="registry-next-rank">
                  {registry.deedsToNextRank} to {registry.nextRankLabel}
                </span>
              )}
            </div>
            {/* T-1703 · The Conqueror capstone rank (thirty deeds, then the Nemesis
                crossing) is veteran content the demo cannot organically reach; the demo
                makes the gate EXPLICIT with a teaser rung in place of an achievable one,
                so a demo spec asserts `demo-lock-conqueror` is present. Full build: no
                teaser — the rank is earned through play. */}
            {demoFeatureLocked('conqueror') && (
              <DemoLock feature="conqueror" testid="demo-lock-conqueror" />
            )}
            {/* T-1503 · Alliance standing — a pure read of player.reputation via
                format.ts `factionStanding`. The reader that makes the four-faction
                rep visible to the player. */}
            <div className="alliance-standing" data-testid="alliance-standing">
              <span className="as-label">ALLIANCE STANDING</span>
              <ul className="as-list">
                {standing.map((s) => (
                  <li
                    className={`as-row as-${s.tone}`}
                    key={s.faction}
                    data-testid="alliance-standing-row"
                    data-faction={s.faction}
                  >
                    <span className="as-name">{s.label}</span>
                    <b className="as-value" data-testid={`alliance-standing-${s.faction}`}>
                      {s.value > 0 ? `+${s.value}` : s.value}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
            {registry.earned.length === 0 ? (
              <div className="registry-empty" data-testid="registry-empty">
                No deeds yet — the ledger is blank. Make some news.
              </div>
            ) : (
              <ul className="registry-list">
                {registry.earned.map((d) => (
                  <li
                    className="registry-deed"
                    key={d.id}
                    data-testid="registry-deed"
                    data-deed-id={d.id}
                  >
                    <div className="rd-head">
                      <b className="rd-title" data-testid="registry-deed-title">
                        {d.title}
                      </b>
                      <span className="rd-day">DAY {d.day}</span>
                    </div>
                    <p className="rd-citation" data-testid="registry-deed-citation">
                      {d.citation}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="nemesis" data-testid="nemesis">
            <div className="nemesis-head">
              <span className="nh-label">NEMESIS SIGNAL</span>
              <span className="nh-count" data-testid="nemesis-count">
                {nemesis.count} {nemesis.count === 1 ? 'FRAGMENT' : 'FRAGMENTS'} ·{' '}
                {nemesis.decodedCount} DECODED
              </span>
            </div>
            {nemesis.entries.length === 0 ? (
              <div className="nemesis-empty" data-testid="nemesis-empty">
                The Signal is silent — no fragments recovered.
              </div>
            ) : (
              <ul className="nemesis-list">
                {nemesis.entries.map((entry) => (
                  <li
                    className={entry.decoded ? 'nemesis-fragment decoded' : 'nemesis-fragment'}
                    key={entry.fragmentId}
                    data-testid="nemesis-fragment"
                    data-fragment-id={entry.fragmentId}
                    data-decoded={entry.decoded ? '1' : '0'}
                  >
                    <div className="nf-head">
                      <b className="nf-title">{entry.title}</b>
                      <span className={entry.decoded ? 'nf-tag decoded' : 'nf-tag'}>
                        {entry.decoded ? 'DECODED' : 'SIGNAL'}
                      </span>
                    </div>
                    <p className="nf-text">{entry.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
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

function Bezel({ game, seed, children }: { game: GameState; seed: number; children?: ReactNode }) {
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
      {/* T-1406 · the diegetic control switches + the readouts share the bezel's
          right column: the console switches ride the top of the frame, the status
          chips below them. */}
      <div className="bezel-right">
        {children}
        <div className="readouts">
          <span className="chip rank" data-testid="rank">
            {RENOWN_RANKS[p.registry.renownRank].label}
          </span>
          <span className="chip seed" data-testid="seed">
            SEED {seed.toLocaleString()}
          </span>
          {game.eraEvent && (
            <span className="chip era" data-testid="era-chip">
              ERA · {game.eraEvent.defId}
            </span>
          )}
          <span className="chip">
            CR <b data-testid="credits">{p.credits.toLocaleString()}</b>
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
      </div>
    </header>
  );
}

// The coordinate-accurate starmap (T-304). Plan a jump entirely here: pick a die
// from the hand, click a reachable system to preview the engine's own fuel cost /
// DC / danger, then commit. Every rule number is read from the engine (via
// format.ts helpers) — the UI only projects coordinates and gates clicks.
function Starmap({ state }: { state: CockpitState }) {
  const game = state.game;
  const [target, setTarget] = useState<number | null>(null);

  const proj = starmapProjection(game);
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  const npcCounts = knownNpcCounts(game);
  const eraSystems = new Set(game.eraEvent?.affectedSystemIds ?? []);
  const dieArmed = state.selectedDie !== null;

  // T-1403 · off-lane sweep affordances. The button gates on an armed die AND the
  // engine's own fuel affordability; the label mirrors the confirm-jump pattern,
  // naming the reason it is disabled (read from the engine preview, never invented).
  const sweep = explorationPreview(game);
  const canSweep = dieArmed && sweep.canAfford;
  const sweepLabel = !dieArmed
    ? 'Pick a die to sweep'
    : !sweep.canAfford
      ? `Need ${sweep.fuelCost} fuel`
      : 'Off-lane sweep';

  const hereNode = proj.here;
  // A transparent per-node hit target, narrower than the node spacing so
  // neighbours never intercept, tall enough that the node's centre (used by
  // click) lands on it. Decorative marks are pointer-events:none in CSS.
  const hitW = Math.max(proj.scale * 0.85, 10);
  const targetNode = target !== null ? (proj.nodes.find((n) => n.id === target) ?? null) : null;
  // The target is only ever set to a reachable node, but recompute honestly.
  const preview = target !== null ? routePreview(game, target) : null;
  // A stale target (e.g. after a jump moved us) simply resolves to no preview.
  const showPreview = preview !== null && targetNode !== null && target !== here;

  const commit = () => {
    if (target === null) return;
    travelTo(target);
    setTarget(null);
  };

  return (
    <section className="pane starmap">
      <header>
        <h2>Starmap</h2>
        <span className="tag">{visited.size} CHARTED</span>
      </header>
      <div className="body">
        <svg
          className="smsvg"
          viewBox={proj.viewBox}
          role="img"
          aria-label="Starmap"
          preserveAspectRatio="xMidYMid meet"
        >
          {hereNode && proj.ringUnits > 0 && (
            <circle
              className="fuel-ring"
              data-testid="fuel-ring"
              data-radius-units={proj.ringUnits}
              cx={hereNode.sx}
              cy={hereNode.sy}
              r={proj.ringRadius}
            />
          )}
          {/* Ring collapses to nothing at zero fuel — still expose the radius. */}
          {hereNode && proj.ringUnits === 0 && (
            <circle
              className="fuel-ring empty"
              data-testid="fuel-ring"
              data-radius-units={0}
              cx={hereNode.sx}
              cy={hereNode.sy}
              r={0}
            />
          )}
          {hereNode && targetNode && showPreview && (
            <line
              className={preview.reachable ? 'route-line' : 'route-line blocked'}
              x1={hereNode.sx}
              y1={hereNode.sy}
              x2={targetNode.sx}
              y2={targetNode.sy}
            />
          )}
          {proj.nodes.map((n) => {
            const isHere = n.id === here;
            const reachable = isHere ? true : routePreview(game, n.id).reachable;
            const clickable = !isHere && reachable;
            const cls = [
              'smsys',
              isHere ? 'here' : visited.has(n.id) ? 'visited' : 'unvisited',
              n.isRim ? 'rim' : '',
              !isHere && !reachable ? 'unreachable' : '',
              target === n.id ? 'sel' : '',
            ]
              .filter(Boolean)
              .join(' ');
            const pipCount = npcCounts.get(n.id) ?? 0;
            return (
              <g
                key={n.id}
                className={cls}
                data-testid="starmap-system"
                data-system-id={n.id}
                data-reachable={reachable ? '1' : '0'}
                data-visited={visited.has(n.id) ? '1' : '0'}
                data-here={isHere ? '1' : '0'}
                aria-label={n.name}
                aria-disabled={clickable ? undefined : 'true'}
                onClick={clickable ? () => setTarget(n.id) : undefined}
                transform={`translate(${n.sx} ${n.sy})`}
              >
                <circle className="smdot" r={5} />
                {eraSystems.has(n.id) && (
                  <g className="era-badge" data-testid="era-badge" transform="translate(6 -6)">
                    <title>{game.eraEvent?.defId ?? 'Era event'}</title>
                    <rect x={-3} y={-3} width={6} height={6} rx={1} />
                  </g>
                )}
                {Array.from({ length: pipCount }).map((_, i) => (
                  <circle
                    key={i}
                    className="npc-pip"
                    data-testid="npc-pip"
                    cx={-6 + i * 4}
                    cy={-9}
                    r={1.6}
                  />
                ))}
                <text className="smlabel" x={0} y={16}>
                  {n.name}
                </text>
                <rect className="smhit" x={-hitW / 2} y={-12} width={hitW} height={32} />
              </g>
            );
          })}
        </svg>

        {showPreview && (
          <div className="route-preview" data-testid="route-preview">
            <div className="rp-head">
              PLOT &#9656; <b>{systemName(target!)}</b>
            </div>
            <div className="rp-grid">
              <span className="rp-k">DISTANCE</span>
              <span className="rp-v" data-testid="route-distance">
                {preview.distance}
              </span>
              <span className="rp-k">FUEL</span>
              <span className="rp-v" data-testid="route-fuel">
                {preview.fuelCost}
              </span>
              <span className="rp-k">PILOT DC</span>
              <span className="rp-v" data-testid="route-dc">
                {preview.dc}
              </span>
              <span className="rp-k">DANGER</span>
              <span className="rp-v" data-testid="route-danger">
                {preview.dangerLevel}
              </span>
            </div>
            <button
              className="btn"
              data-testid="confirm-jump"
              disabled={!dieArmed || !preview.reachable}
              onClick={commit}
            >
              {dieArmed ? 'Confirm jump' : 'Pick a die to jump'}
            </button>
          </div>
        )}

        {/* T-1403 · Off-lane sweep. The starmap is a pure client of the engine's
            Explore action: the DC / fuel cost / effective modifier are read from
            the engine+content (explorationPreview), the sweep routes through the
            store's single `explore()` verb, and the loot / nav-check outcome reads
            below via `explorationOutcome` + the shared PILOT CheckBreakdown. */}
        <div className="explore-sweep" data-testid="explore-panel">
          <div className="es-head">OFF-LANE SWEEP</div>
          <div className="es-cost" data-testid="explore-cost">
            PILOT DC {sweep.dc} · FUEL {sweep.fuelCost} · NAV{' '}
            {signedMargin(sweep.effectiveModifier)}
          </div>
          <button
            className="btn"
            data-testid="explore-sweep"
            disabled={!canSweep}
            onClick={() => explore()}
          >
            {sweepLabel}
          </button>
          {state.explorationOutcome && (
            <div className="es-outcome" data-testid="exploration-outcome">
              {state.explorationOutcome}
            </div>
          )}
        </div>

        <CheckBreakdown state={state} only={Stat.PILOT} />
      </div>
    </section>
  );
}

// The ship & shipyard instrument (T-308). A pure CLIENT of the shipyard rules:
// every price, every before→after projection, and every "disabled, here's why"
// reason is read from the engine's `quoteShipyard` (via format.ts), and the only
// mutations route through the store's single `shipyard()` action. The pane never
// calls the engine to change state and owns no shipyard rule.
function ShipPane({ state }: { state: CockpitState }) {
  const game = state.game;
  const ship = game.player.ship;
  const armed = state.selectedDie !== null;
  const components = shipComponents(game);
  const equipment = specialEquipmentRows(game);
  const [podQty, setPodQty] = useState(10);

  // Fuel curve + hold instruments read from any quote's `before` (a pure read of
  // the current ship). Use a cheap no-op-ish repair-all quote just for `before`.
  const curve = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
    spendDie: 0,
  }).before;
  const podQuote = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'buy-cargo-pods',
    quantity: Math.max(1, podQty),
    spendDie: 0,
  });
  const repairAllQuote = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
    spendDie: 0,
  });
  const anyDamaged = components.some((c) => c.damaged);

  return (
    <section className="pane ship" data-testid="ship-pane">
      <header>
        <h2>Ship &amp; Yard · {ship.isAstraxialHull ? 'Astraxial' : 'Junker'}</h2>
        <span className="tag">
          PODS <b data-testid="ship-pods">{ship.cargoPods}</b>/{curve.maxCargoPods}
        </span>
      </header>
      <div className="body">
        {/* ---- fuel-curve readout (persistent, auto-updates on drive change) ---- */}
        <div className="ship-fuelcurve" data-testid="fuel-curve">
          <span className="fc-k">FUEL/JUMP</span>
          <span className="fc-v" data-testid="fuel-per-jump">
            {curve.fuelPerJump}
          </span>
          <span className="fc-k">RANGE</span>
          <span className="fc-v" data-testid="jump-range">
            {curve.maxJumpDistance}
          </span>
          <span className="fc-k">FUEL</span>
          <span className="fc-v">
            {ship.fuel.toLocaleString()}/{ship.maxFuel.toLocaleString()}
          </span>
          {/* T-1205 cabin → crew capacity: a reader of the cabin component, grows
              when the cabin is upgraded (T-1306 socket for real crew rules). */}
          <span className="fc-k">CREW</span>
          <span className="fc-v" data-testid="crew-capacity">
            {curve.crewCapacity}
          </span>
        </div>

        {/* ---- component grid ---- */}
        <div className="ship-grid" data-testid="component-grid">
          {components.map((c) => (
            <ComponentRow key={c.id} row={c} game={game} armed={armed} />
          ))}
        </div>
        <div className="ship-repair-all">
          <button
            className="btn"
            data-testid="repair-all"
            disabled={!armed || !anyDamaged || !repairAllQuote.ok}
            title={
              !anyDamaged
                ? 'All systems at full condition'
                : armed
                  ? `Repair every system · ${repairAllQuote.cost.toLocaleString()}cr`
                  : 'Pick a die first'
            }
            onClick={() => shipyard({ action: 'repair', repairMode: 'all' })}
          >
            {anyDamaged
              ? `Repair all · ${repairAllQuote.cost.toLocaleString()}cr`
              : 'All systems nominal'}
          </button>
          {anyDamaged && !repairAllQuote.ok && repairAllQuote.failure && (
            <span className="ship-reason" data-testid="repair-all-reason">
              {shipyardFailureExplanation(repairAllQuote.failure)}
            </span>
          )}
        </div>

        {/* ---- cargo pods ---- */}
        <div className="ship-pods-block" data-testid="pods-block">
          <div className="pods-head">
            CARGO PODS · <b>{ship.cargoPods}</b>/{curve.maxCargoPods}
          </div>
          <div className="pods-controls">
            <input
              aria-label="pods amount"
              data-testid="pods-amount"
              inputMode="numeric"
              value={podQty}
              onChange={(e) => setPodQty(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
            />
            <button
              className="btn"
              data-testid="buy-pods"
              disabled={!armed || !podQuote.ok}
              title={
                armed
                  ? `Buy ${podQty} pods · ${podQuote.cost.toLocaleString()}cr`
                  : 'Pick a die first'
              }
              onClick={() => shipyard({ action: 'buy-cargo-pods', quantity: Math.max(1, podQty) })}
            >
              {armed ? `Buy pods · ${podQuote.cost.toLocaleString()}cr` : 'Pick a die to buy'}
            </button>
          </div>
          <div className="pods-preview" data-testid="pods-preview">
            {podQuote.before.cargoPods} &rarr; <b>{podQuote.after.cargoPods}</b> pods
          </div>
          {!podQuote.ok && podQuote.failure && (
            <span className="ship-reason" data-testid="pods-reason">
              {shipyardFailureExplanation(podQuote.failure)}
            </span>
          )}
        </div>

        {/* ---- special equipment (ALL rows, disabled-not-hidden) ---- */}
        <div className="ship-equip" data-testid="equipment-list">
          <div className="equip-head">SPECIAL EQUIPMENT</div>
          {equipment.map((row) => (
            <div
              className={row.owned ? 'equip-row owned' : 'equip-row'}
              key={row.id}
              data-testid="equipment-row"
              data-equipment={row.id}
              data-owned={row.owned ? '1' : '0'}
            >
              <div className="equip-main">
                <span className="equip-name">{row.name}</span>
                {row.owned ? (
                  <span className="equip-tag" data-testid="equipment-installed">
                    INSTALLED
                  </span>
                ) : (
                  <span className="equip-price">{row.quote.cost.toLocaleString()}cr</span>
                )}
                <button
                  className="btn small"
                  data-testid="buy-equipment"
                  disabled={row.owned || !armed || !row.quote.ok}
                  title={
                    row.owned
                      ? 'Already installed'
                      : !armed
                        ? 'Pick a die first'
                        : row.quote.ok
                          ? `Install · ${row.quote.cost.toLocaleString()}cr`
                          : row.quote.failure
                            ? shipyardFailureExplanation(row.quote.failure)
                            : 'Unavailable'
                  }
                  onClick={() => shipyard({ action: 'buy-special-equipment', equipment: row.id })}
                >
                  {row.owned ? 'Owned' : 'Install'}
                </button>
              </div>
              {/* The "exclusion conflict shows why" surface — the typed reason,
                  rendered rather than hidden, whenever the item can't be bought. */}
              {!row.owned && row.quote.failure && (
                <span className="ship-reason" data-testid="equipment-reason">
                  {shipyardFailureExplanation(row.quote.failure)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ---- crew roster (T-1405 · the dice-progression source) ---- */}
        <CrewSection game={game} armed={armed} />
      </div>
    </section>
  );
}

// The crew roster (T-1405). A pure CLIENT of the T-1306 crew rules: every hire
// price / berth budget / benefit reads content (`crewRoster` / `crewBenefitLabel`),
// and the only mutations route through the store's `hireCrew` / `dismissCrew`. Like
// the equipment list it disables-not-hides an unaffordable hire and shows the
// engine-derived reason. A hire's dice benefit lands at the NEXT dawn (the store
// verb documents why), so this pane surfaces the roster, not a live-hand change.
function CrewSection({ game, armed }: { game: GameState; armed: boolean }) {
  const roster = crewRoster(game);
  return (
    <div className="ship-crew" data-testid="crew-list">
      <div className="crew-head">
        CREW · <b>{roster.berthsUsed}</b>/{roster.berths} berths
      </div>
      {roster.hired.map((row) => (
        <div
          className="crew-row hired"
          key={row.role.id}
          data-testid="crew-member"
          data-role-id={row.role.id}
        >
          <div className="crew-main">
            <span className="crew-name">{row.role.name}</span>
            <span className="crew-benefit">{crewBenefitLabel(row.role)}</span>
            <button
              className="btn small ghost"
              data-testid="dismiss-crew"
              data-role-id={row.role.id}
              disabled={!armed}
              title={
                armed ? 'Dismiss this crew member (spends a die, no refund)' : 'Pick a die first'
              }
              onClick={() => dismissCrew(row.role.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
      {/* T-1703 · Crew hiring IS the Hangout dice progression (crew grant the extra
          die / re-roll / floor at the next dawn), so the demo teases-but-gates it: the
          hireable rows and their `hire-crew` buttons are ABSENT (a teaser stands in),
          never merely disabled, so a demo spec asserts zero `hire-crew` elements. Full
          build: the real roster. */}
      {demoFeatureLocked('hangout-progression') && roster.hired.length === 0 && (
        <DemoLock feature="hangout-progression" testid="demo-lock-hangout" />
      )}
      {!demoFeatureLocked('hangout-progression') &&
        roster.hireable.map((row) => (
          <div
            className="crew-row hireable"
            key={row.role.id}
            data-testid="crew-hireable"
            data-role-id={row.role.id}
          >
            <div className="crew-main">
              <span className="crew-name">{row.role.name}</span>
              <span className="crew-benefit">{crewBenefitLabel(row.role)}</span>
              <span className="crew-price">{row.role.hirePrice.toLocaleString()}cr</span>
              <button
                className="btn small"
                data-testid="hire-crew"
                data-role-id={row.role.id}
                disabled={!armed || !row.canHire}
                title={
                  !armed
                    ? 'Pick a die first'
                    : row.canHire
                      ? `Hire · ${row.role.hirePrice.toLocaleString()}cr`
                      : (row.reason ?? 'Cannot hire')
                }
                onClick={() => hireCrew(row.role.id)}
              >
                Hire
              </button>
            </div>
            {/* Disabled-not-hidden: the engine-derived reason, rendered whenever the
              role can't be hired right now (no berth / unaffordable). */}
            {row.reason && (
              <span className="ship-reason" data-testid="crew-reason">
                {row.reason}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

// One component grid row: strength + condition pips (damage-highlighted), an
// Upgrade button (to the next tier, with a before→after preview) and, when the
// system is damaged, a single-step Repair. Every number is the engine's quote.
function ComponentRow({
  row,
  game,
  armed,
}: {
  row: ShipComponentRow;
  game: GameState;
  armed: boolean;
}) {
  const upgradeQuote =
    row.nextTier !== null
      ? shipyardQuote(game, {
          type: 'Shipyard',
          action: 'buy-component-tier',
          component: row.id,
          tier: row.nextTier,
          spendDie: 0,
        })
      : null;
  const repairQuote = row.damaged
    ? shipyardQuote(game, {
        type: 'Shipyard',
        action: 'repair',
        component: row.id,
        repairMode: 'single',
        spendDie: 0,
      })
    : null;

  // condition 0-9 → 5 pips
  const on = Math.round((row.condition / 9) * 5);

  return (
    <div
      className={row.damaged ? 'comp-row damaged' : 'comp-row'}
      data-testid="ship-component"
      data-component={row.id}
      data-damaged={row.damaged ? '1' : '0'}
    >
      <div className="comp-id">
        <span className="comp-name">{row.name}</span>
        <span className="comp-str">
          STR <b data-testid="component-strength">{row.strength}</b>
        </span>
        <span className="comp-cond" data-testid="component-condition">
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className={i < on ? 'on' : ''} />
          ))}
        </span>
      </div>
      <div className="comp-actions">
        {upgradeQuote && row.nextTier !== null && (
          <span className="comp-upgrade">
            <button
              className="btn small"
              data-testid="upgrade-component"
              disabled={!armed || !upgradeQuote.ok}
              title={
                armed
                  ? `Upgrade to tier ${row.nextTier} · ${upgradeQuote.cost.toLocaleString()}cr`
                  : 'Pick a die first'
              }
              onClick={() =>
                shipyard({ action: 'buy-component-tier', component: row.id, tier: row.nextTier! })
              }
            >
              Upgrade · {upgradeQuote.cost.toLocaleString()}cr
            </button>
            <span className="comp-preview" data-testid="component-preview">
              STR {upgradeQuote.before.component?.strength} &rarr;{' '}
              <b>{upgradeQuote.after.component?.strength}</b>
              {row.id === 'hull' && (
                <>
                  {' · PODS '}
                  {upgradeQuote.before.maxCargoPods} &rarr; {upgradeQuote.after.maxCargoPods}
                </>
              )}
              {row.id === 'drives' && (
                <>
                  {' · FUEL/JUMP '}
                  {upgradeQuote.before.fuelPerJump} &rarr; {upgradeQuote.after.fuelPerJump}
                </>
              )}
            </span>
            {!upgradeQuote.ok && upgradeQuote.failure && (
              <span className="ship-reason" data-testid="component-reason">
                {shipyardFailureExplanation(upgradeQuote.failure)}
              </span>
            )}
          </span>
        )}
        {repairQuote && (
          <button
            className="btn small ghost"
            data-testid="repair-component"
            disabled={!armed || !repairQuote.ok}
            title={
              armed
                ? `Repair one step · ${repairQuote.cost.toLocaleString()}cr`
                : 'Pick a die first'
            }
            onClick={() => shipyard({ action: 'repair', component: row.id, repairMode: 'single' })}
          >
            Repair · {repairQuote.cost.toLocaleString()}cr
          </button>
        )}
      </div>
    </div>
  );
}

function Manifest({ state }: { state: CockpitState }) {
  const board = state.game.market.manifestBoard;
  const here = state.game.player.currentSystemId;
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
          // T-1402 · A REAL engine number for the destination line — the previewed
          // jump fuel cost — replaces the fabricated `jumpsBetween` "jumps" count no
          // engine rule ever read.
          const preview = routePreview(state.game, c.destination);
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
                &#9656; {systemName(c.destination)} · {preview.fuelCost} fuel · {c.pods} pods
              </div>
              {/* T-1402 · Signing SPENDS a die — it is not a TRADE check. The engine
                  (resolveTrade) burns the die and never rolls or reads its value, so
                  the manifest must render signing as a die COST, not a "+ TRADE" check.
                  (HAGGLE below is the real TRADE DC-12 roll.) */}
              <div className="check" data-testid="sign-row">
                <span className="lbl">SIGN</span>
                <span className={dieVal !== undefined ? 'slot ready' : 'slot'}>
                  {dieVal ?? '—'}
                </span>
                <span className="mono">costs 1 die</span>
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
      {/* The manifest owns the haggle check only — filter by context so a
          storylet check (any stat) surfaces in its own panel, not here. */}
      <CheckBreakdown state={state} exclude={Stat.PILOT} context="haggle" />
    </section>
  );
}

// The trade pane (T-305): the port-side controls that sit beside the manifest
// board — a visible failure notice, the active-contract tracker, the fuel depot
// and the debt ledger. Every button routes through a store action; the pane
// never calls the engine directly (the store stays the sole engine caller).
function TradePane({
  state,
  onOpenStorylet,
}: {
  state: CockpitState;
  onOpenStorylet: (id: string) => void;
}) {
  const game = state.game;
  const p = game.player;
  const active = p.activeContract;
  const armed = state.selectedDie !== null;

  const [fuelAmount, setFuelAmount] = useState(100);
  const [debtAmount, setDebtAmount] = useState(500);

  const fuelPrice = game.market.localFuelPrice;
  const debtDue = p.debtDueDay - game.day;

  // T-1405 · The contraband-hold badge + the port-authority ledger, both pure reads
  // (contrabandHold / portLedger read the SAME engine state the patrol scan and the
  // dusk economy gate on — never recomputed here).
  const hold = contrabandHold(game);
  const ledger = portLedger(game);

  // T-1406 · The diegetic storylet surfaces the port owns: HOLD dispatches (cargo
  // riding in the hold, a boarded derelict's pod, a fence) open from the manifest
  // line inside the active-contract block; PORT dispatches (auditors, passengers,
  // the Wise One / Sage, chains, veteran) open from the Port Ledger. Both read the
  // engine's live offer set via the pure classifier — no rule lives here.
  const holdOffers = offersForSurface(game, 'hold');
  const portOffers = offersForSurface(game, 'port');

  // T-1402 · Pre-commit advisory: the engine charges for the full request but
  // clamps the tank, so buying past the tank's headroom silently wastes credits.
  // Surface the clamp BEFORE the buy so the overspend is never a silent charge.
  const fuelQuote = fuelPurchaseQuote(game, fuelAmount);

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

        {/* T-1406 · PORT DISPATCHES — the diegetic surface for storylets the port
            delivers (a Guild auditor at the gantry, a passenger booking a berth,
            the Wise One / Sage, a chain follow-up, veteran beats). Each opens its
            focused panel. The TOTAL classifier's default lands here, so a newly
            authored storylet always has a door — the reachability guarantee. */}
        {portOffers.length > 0 && (
          <div className="ledger-block port-dispatches" data-testid="port-dispatches">
            <div className="lb-head">PORT DISPATCHES</div>
            {portOffers.map((o) => (
              <StoryletOpener key={o.storyletId} offer={o} onOpen={onOpenStorylet} />
            ))}
          </div>
        )}

        {/* Active-contract tracker — makes the sign→carrying transition visible
            and explains why a second sign is refused. */}
        <div className="ledger-block active-contract" data-testid="active-contract">
          <div className="lb-head">
            ACTIVE CONTRACT
            {/* T-1405 · Contraband-HOLD indicator (distinct from the manifest's
                contraband OFFER flag). Shows whenever the ship is carrying illicit
                cargo — a contraband contract OR a sealed pod — i.e. exactly when a
                patrol would scan the hold. */}
            {hold.carrying && (
              <span className="flag shady contraband-hold" data-testid="contraband-hold">
                CONTRABAND HOLD
              </span>
            )}
          </div>
          {active ? (
            <>
              <div className="lb-row">
                <span className="goods">{cargoName(active.cargoType)}</span>
                <span className="pay">{active.payment.toLocaleString()}cr</span>
              </div>
              <div className="dest">
                &#9656; {systemName(active.destination)} · {active.pods} pods
              </div>
              {/* T-1604 · Abandon-contract escape hatch. Dumping the cargo costs a
                  die and voids the payment, but it is the ONLY in-game way to clear
                  a run the ship can no longer deliver (a destination beyond a full
                  tank's single jump) — without it a stranded contract soft-locks
                  the player, since the sign gate refuses a new job while one rides.
                  Mirrors the manifest's die-arm affordance so it is never a dead
                  click. Reader: store.ts abandonContract → engine forfeit-cargo. */}
              <div className="lb-controls">
                <button
                  className="btn subtle"
                  data-testid="abandon-contract"
                  disabled={!armed}
                  title={
                    armed
                      ? 'Spend the selected die to dump the cargo and void the contract'
                      : 'Pick a die first, then abandon the contract'
                  }
                  onClick={() => abandonContract()}
                >
                  {/* Label is STABLE (armed state shows in `disabled`/title only) so
                      it never perturbs the active-contract block's text snapshot. */}
                  Abandon contract
                </button>
              </div>
            </>
          ) : (
            <div className="lb-empty" data-testid="active-contract-empty">
              Hold is empty — sign a manifest offer to take a job.
            </div>
          )}
          {/* T-1406 · HOLD dispatches — a storylet the hold itself delivers (a
              seal on the crates, a derelict's sealed pod, a fence at the dock)
              opens from its manifest line here, whether or not a contract rides.
              This is the "storylet opens from its manifest line" surface. */}
          {holdOffers.length > 0 && (
            <div className="hold-dispatches" data-testid="hold-dispatches">
              <div className="dispatch-head">HOLD · something wants attention</div>
              {holdOffers.map((o) => (
                <StoryletOpener key={o.storyletId} offer={o} onOpen={onOpenStorylet} />
              ))}
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
          {/* T-1402 · The overspend warning fires pre-commit whenever the request
              overfills the tank — you'd pay for fuel the clamp discards. */}
          {fuelQuote.overspends && (
            <div className="lb-note warn" data-testid="fuel-overspend-warning" role="status">
              Paying for {fuelQuote.fuelWasted.toLocaleString()} fuel the tank can&apos;t hold.
            </div>
          )}
          {!fuelQuote.canAfford && fuelAmount > 0 && (
            <div className="lb-note warn" data-testid="fuel-unaffordable" role="status">
              Short {(fuelQuote.cost - p.credits).toLocaleString()}cr for this fill.
            </div>
          )}
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

        {/* Port authority (T-1405) — buy the stake you stand in, then watch its
            launch-fee income tick at dusk. Buy costs a die (die-costed like the
            shipyard); the income ledger below is the "watch income tick" surface. */}
        <div className="ledger-block port-authority" data-testid="port-authority">
          <div className="lb-head">PORT AUTHORITY</div>
          {ledger.current ? (
            <div className="port-current" data-testid="port-current">
              <div className="lb-row">
                <span className="goods">{ledger.current.name}</span>
                {ledger.current.quote.alreadyOwned ? (
                  <span className="flag" data-testid="port-owned">
                    OWNED
                  </span>
                ) : (
                  <span className="pay">{ledger.current.quote.cost.toLocaleString()}cr</span>
                )}
              </div>
              <div className="lb-row">
                <span className="mono">
                  INCOME <b data-testid="port-current-income">{ledger.current.quote.income}</b>
                  cr/dusk
                </span>
                {/* T-1703 · In the demo, buying port authority is a teased-but-gated
                    veteran feature: the buy button is ABSENT (a teaser stands in its
                    place, rendered below the row), never merely disabled, so a demo
                    reachability spec asserts zero `buy-port` elements. Full build: the
                    real buy affordance. */}
                {!ledger.current.quote.alreadyOwned && !demoFeatureLocked('ports') && (
                  <button
                    className="btn"
                    data-testid="buy-port"
                    disabled={!armed || !ledger.current.quote.ok}
                    title={
                      !armed
                        ? 'Pick a die first'
                        : ledger.current.quote.ok
                          ? `Buy the stake · ${ledger.current.quote.cost.toLocaleString()}cr`
                          : ledger.current.quote.failure
                            ? portFailureExplanation(ledger.current.quote.failure)
                            : 'Unavailable'
                    }
                    onClick={() => buyPort()}
                  >
                    {armed
                      ? `Buy · ${ledger.current.quote.cost.toLocaleString()}cr`
                      : 'Pick a die to buy'}
                  </button>
                )}
              </div>
              {/* T-1703 · Demo teaser standing in for the buy affordance. */}
              {!ledger.current.quote.alreadyOwned && demoFeatureLocked('ports') && (
                <DemoLock feature="ports" testid="demo-lock-ports" />
              )}
              {/* Disabled-not-hidden: the typed reason, whenever the buy is refused
                  (already-owned is surfaced above as OWNED, not as an error). Suppressed
                  in the demo — the teaser above explains why there is no buy control. */}
              {!demoFeatureLocked('ports') &&
                !ledger.current.quote.ok &&
                ledger.current.quote.failure &&
                !ledger.current.quote.alreadyOwned && (
                  <span className="ship-reason" data-testid="port-reason">
                    {portFailureExplanation(ledger.current.quote.failure)}
                  </span>
                )}
            </div>
          ) : (
            <div className="lb-empty" data-testid="port-none">
              No port authority here — the rim is ungoverned.
            </div>
          )}

          {/* Income ledger — every owned stake with its per-dusk income and the
              total the dusk economy accrues. The "watch income tick at dusk" read. */}
          {ledger.owned.length > 0 && (
            <div className="port-ledger" data-testid="port-ledger">
              {ledger.owned.map((o) => (
                <div
                  className="lb-row"
                  key={o.systemId}
                  data-testid="port-owned-row"
                  data-system-id={o.systemId}
                >
                  <span className="mono">{o.name}</span>
                  <span className="mono">
                    <b>{o.income}</b>cr/dusk
                  </span>
                </div>
              ))}
              <div className="lb-row port-total">
                <span className="mono">TOTAL / DUSK</span>
                <span className="mono">
                  <b data-testid="port-income-total">{ledger.totalDuskIncome}</b>cr
                </span>
              </div>
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
// recomputed in the UI. The pane that owns a check filters by stat so a check
// renders exactly once: the manifest shows TRADE haggles, the starmap PILOT
// jumps (`only`/`exclude`), never both at once.
function CheckBreakdown({
  state,
  only,
  exclude,
  context,
}: {
  state: CockpitState;
  only?: Stat;
  exclude?: Stat;
  context?: string;
}) {
  const lc = state.lastCheck;
  if (!lc) return null;
  if (only !== undefined && lc.stat !== only) return null;
  if (exclude !== undefined && lc.stat === exclude) return null;
  // A storylet check can be ANY stat (GRIT/GUILE/GUNS…), so it can't be selected
  // by stat like the manifest/starmap panes. Filter by the check's context
  // instead, so a storylet panel shows only storylet checks and the "one check
  // per surface" invariant (T-303/T-304) holds.
  if (context !== undefined && lc.context !== context) return null;
  return (
    <CheckReadout
      key={state.lastCheckKey}
      stat={lc.stat}
      result={lc.result}
      label={`CHECK${lc.context ? ` · ${lc.context.toUpperCase()}` : ''}`}
      testid="check-breakdown"
    />
  );
}

// The presentational honest-check readout — one resolved `CheckResult` rendered as
// die + stat + modifier + total vs DC + margin + verdict, in reading order. Split
// out of CheckBreakdown (T-1404) so the Spacer's Dare can render BOTH opposed
// actors' checks (the "honest-dice signature applied to gambling") with the SAME
// inner markup the rest of the cockpit uses. `testid` names the OUTER row (each
// Dare actor gets its own); the inner `check-*` testids are shared. Every number is
// read straight off the engine's CheckResult — nothing is recomputed here.
function CheckReadout({
  stat,
  result: r,
  label,
  testid,
}: {
  stat: Stat;
  result: CheckResult;
  label: string;
  testid: string;
}) {
  const verdict = checkVerdict(r);
  const pass = r.success;
  return (
    <div className={`check-breakdown ${verdict}`} data-testid={testid} data-verdict={verdict}>
      <span className="cb-lbl">{label}</span>
      <span className="cb-expr">
        d20 <b data-testid="check-die">{r.die}</b>
        {' + '}
        <span data-testid="check-stat">{statName(stat)}</span> <b>{r.modifier}</b>
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
function Wire({ game, onOpenStorylet }: { game: GameState; onOpenStorylet: (id: string) => void }) {
  const [logOpen, setLogOpen] = useState(false);
  const lines = wireLines(game);
  const items = lines.length > 0 ? lines : ['The wire is quiet. Roll the day and make some news.'];
  // T-1406 · Storylets the WIRE delivers (Guild-pressure notices, rimward rumors)
  // surface as clickable BULLETINS in the cap bar — not inside the scrolling
  // ticker, where a moving target is hostile to click. This is the "a wire item
  // opens its storylet" surface.
  const bulletins = offersForSurface(game, 'wire');
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
        {bulletins.length > 0 && (
          <span className="wire-bulletins" data-testid="wire-bulletins">
            <span className="wire-bulletin-label">BULLETIN</span>
            {bulletins.map((o) => (
              <StoryletOpener key={o.storyletId} offer={o} onOpen={onOpenStorylet} />
            ))}
          </span>
        )}
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
  // T-1405 · Crew-granted dawn-hand progression — the floor and remaining re-roll
  // charges, read straight off the engine aggregator (never recomputed). The hand
  // size itself is already variable: `dice.map` below renders however many dice the
  // engine dealt (5 base, up to 7 with a First Officer aboard).
  const mods = dawnHandModifiers(state.game);
  const canReroll = mods.rerollsRemaining > 0;
  // The dawn scramble is JS-driven, so gate it on the setting OR the OS media
  // query (the CSS kill-switch only reaches CSS animations).
  const reduced = state.reducedMotion || systemPrefersReducedMotion();
  const display = useDiceRoll(dice, state.bootKey, reduced);

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
        {mods.floor > 0 && (
          <span className="dawn-badge floor" data-testid="dawn-floor">
            FLOOR {mods.floor}
          </span>
        )}
        {mods.rerollsRemaining > 0 && (
          <span className="dawn-badge reroll" data-testid="dawn-rerolls">
            RE-ROLL &times;{mods.rerollsRemaining}
          </span>
        )}
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
            // The die slot is UNCLIPPED (the die itself has a hexagon clip-path,
            // which would clip an in-die reroll button and swallow its clicks), so
            // the per-die reroll affordance sits on the slot, over the die's corner.
            <div className="die-slot" key={i}>
              <div
                className={cls}
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
              {/* T-1405 · Per-die re-roll affordance (PRD §7 "allow one re-roll").
                  Shown on each UNSPENT die whenever a crew re-roll charge remains.
                  It consumes a charge, NOT a selected die — so it does not depend on
                  `selectedDie`. */}
              {canReroll && !isSpent && (
                <button
                  className="die-reroll"
                  data-testid="die-reroll"
                  data-die-index={i}
                  aria-label={`re-roll die ${i + 1}`}
                  title="Re-roll this die (spends one charge)"
                  onClick={() => reroll(i)}
                >
                  &#8635;
                </button>
              )}
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
function useDiceRoll(finalDice: number[], bootKey: number, reduced: boolean): number[] {
  const [display, setDisplay] = useState<number[]>(finalDice);
  const seedRef = useRef(0);
  useEffect(() => {
    if (reduced) {
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
