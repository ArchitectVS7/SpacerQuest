import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
// T-136 · THE ANIMATION DEPENDENCY, NEW TO THIS REPO (GSAP 3.15.0, GreenSock
// Standard "No Charge" License — credited in `credits.ts` / `docs/CREDITS.md` and
// named in the commit body). It earns its place on exactly one job: the Liar's
// Dice REVEAL, a sequenced, staggered, callback-bearing timeline (dim the table →
// lift the dealer's four shrouds in stagger → land the verdict) that CSS keyframes
// can only fake with hand-tuned per-element delays. Everything static — the cubes,
// the pips, the glow, the shroud — stays CSS.
//
// THE INSTANT RAIL IS LOAD-BEARING: under reduced motion the timeline is NEVER
// CREATED (not "created and skipped"), so the settled DOM exists on the very next
// render. That is what keeps the e2e honest and the tabletop-ui skill's
// "every animation must also run in a synchronous instant mode" satisfied.
import { gsap } from 'gsap';
import {
  CARGO_TYPES,
  NEMESIS_SYSTEM_ID,
  RENOWN_RANKS,
  STAR_SYSTEMS,
  Stat,
  type HangoutVenueId,
} from '@spacerquest/content';
import {
  DARE_DICE_PER_SIDE,
  DARE_MAX_FACE,
  DARE_MAX_QUANTITY,
  isLatticeMove,
  minOpeningQuantity,
  type DareMoveKind,
  type GameState,
  type CheckResult,
  type ShipComponentId,
  type StoryletOffer,
} from '@spacerquest/engine';
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
  dareMove,
  darePeek,
  clearDareReveal,
  clearDareBeats,
  visitSocial,
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
  dismissSuccession,
  dismissOnboarding,
  // T-187 · the first-turn walkthrough's three player controls.
  ackWalkthroughStep,
  skipWalkthrough,
  restartWalkthrough,
  // T-200 · the opening marker's one control.
  dismissOpeningMarker,
  dismissRecovery,
  standDown,
  toggleFx,
  clearBloom,
  saveToSlot,
  loadSlot,
  deleteSlot,
  exportCareer,
  importCareer,
  setReducedMotion,
  setTextSize,
  // T-141 · The opt-in playtest log's player-facing controls (spec §3/§5).
  setPlaytestLogging,
  flagPlaytestMoment,
  exportPlaytestLog,
  type CockpitState,
  type SlotSummary,
  type TextSize,
} from './store';
import * as sound from './sound';
import {
  systemName,
  cargoName,
  // T-215 · the 3D lat/long globe (T-188's ruled candidate 4B) — the geometry,
  // the camera clamp and the label-collision suppressor are all pure and live in
  // format.ts; this file only renders what they return and drives the pointer.
  starmapGlobe,
  clampGlobeView,
  GLOBE_MIN_ZOOM,
  GLOBE_MAX_ZOOM,
  type GlobeView,
  type LabelMetrics,
  routePreview,
  explorationPreview,
  recoveryReadout,
  hangoutOpen,
  hangoutNpcs,
  hangoutRosterOpponents,
  hangoutHouse,
  hangoutVenueOffered,
  hangoutRumorLines,
  dareWagerBounds,
  // T-197 · the two daily Hangout caps, rendered beside the controls they bound.
  hangoutSocialPlays,
  hangoutDareRounds,
  dareScene,
  lendingTerms,
  fuelPurchaseQuote,
  dawnHandModifiers,
  crewRoster,
  crewBenefitLabel,
  fittedModuleRows,
  portLedger,
  portFailureExplanation,
  contrabandHold,
  knownNpcCounts,
  wireLines,
  wireLog,
  npcNameIndex,
  npcDossier,
  dispositionHint,
  statName,
  checkVerdict,
  signedMargin,
  cargoHasStorylet,
  contractIsUrgent,
  encounterReadout,
  combatFuelStatus,
  tributeThisRound,
  shipComponents,
  shipDiagram,
  ASTRAXIAL_PATH,
  JUNKER_PATH,
  SHIP_DIAGRAM_BAY,
  SHIP_DIAGRAM_BAY_SEGMENTS,
  SHIP_DIAGRAM_FITTING_ORIGIN,
  SHIP_DIAGRAM_FUEL_BAR,
  SHIP_DIAGRAM_GEOMETRY,
  SHIP_DIAGRAM_VIEWBOX,
  specialEquipmentRows,
  shipyardQuote,
  honorList,
  shipyardFailureExplanation,
  storyletChoiceCostLabel,
  storyletChoiceNeedsDie,
  storyletChoiceLock,
  deedRegistry,
  manifestSheet,
  ledgerFascia,
  factionStanding,
  nemesisFile,
  crossingStatus,
  activeOnboardingPrompt,
  isGuildLetter,
  availableStorylets,
  offersForSurface,
  resolutionCeremony,
  endingScreen,
  demoBannerLine,
  demoEndCard,
  demoLockNotice,
  editionLabel,
  saveRecoveryMessage,
  saveWriteFailedMessage,
  updateStatusMessage,
  steamStatusMessage,
  steamAchievementsMessage,
  cloudStatusMessage,
  richPresenceLine,
  presenceMessage,
  type SaveRecoveryNotice,
  type DareRevealView,
  type DareSceneView,
  type DemoBannerView,
  type DemoEndView,
  type EndingView,
  type OnboardingAnchor,
  type OnboardingMount,
  type ResolutionCeremonyView,
  type ShipComponentRow,
  type ShipDiagramMark,
  type ShipDiagramRegion,
  type ShipDiagramRegionId,
  type SuccessionSummary,
  type WireLogEntry,
  type StoryletChoice,
} from './format';
// T-187 · The first-turn walkthrough's pure rules — the script, the rails
// predicate and the card copy. All presentation; see the module header for why it
// coexists with (and never replaces) T-311's contextual coach above.
import {
  currentWalkthroughStep,
  railsAllows,
  railsHighlights,
  railsSuspended,
  walkthroughActive,
  walkthroughCardCopy,
  walkthroughJumpTarget,
  WALKTHROUGH_STEP_COUNT,
  type RailsRegion,
} from './walkthrough';
// T-200 · The opening marker. `openingMarkerView` is the ONLY source of the
// figures and copy `OpeningMarker` renders — every number in it is read live off
// `GameState`, so this file carries no debt literal of its own.
import { openingMarkerPending, openingMarkerView } from './opening';
// T-1701a · Which store the cockpit is actually running against, and where its
// saves live. `storageBackend` selects the right noun in the two storage-failure
// sentences ("this browser" vs "the game"); `saveLocation` is the path the
// Settings "Saves" row shows the player. Both are READ HERE — that is the
// reader standing constraint 7 requires, asserted by
// `packages/desktop/e2e/shell.spec.ts`.
// T-1701b · `shellVersion` and `updateStatus` are the shell's answer to "what
// build am I running, and will it update itself?" — READ HERE by `BuildRow`,
// which is the whole player-facing surface of the packaging/updater task.
// T-1702a · `steamStatus` is the shell's answer to "are my Deeds being recorded
// as Steam achievements?" — READ HERE by `SteamRow`, together with
// `steam.ts`'s `ACHIEVEMENT_MANIFEST`, which is the player-facing surface of the
// Steamworks task.
// T-1702b · `cloudStatus` and `cloudRestored` are the shell's answer to "are my
// careers backed up, and did anything come down from the cloud on this launch?"
// — READ HERE by `SteamRow`, which is where both halves of the Cloud & presence
// task become reachable by a player with no dev tools.
import {
  storageBackend,
  saveLocation,
  shellVersion,
  updateStatus,
  steamStatus,
  cloudStatus,
  cloudRestored,
} from './storage';
import { achievementManifest, presenceLine } from './steam';
// T-1703 · Which edition this bundle IS (Vite `define`, compiled in). Read here
// by the Settings → Build → Edition row and by `SteamRow`'s achievement
// denominator, which differs by exactly one between the two builds.
import { BUILD_EDITION } from './edition';
// T-1704 · What VERSION this bundle is (Vite `define`, compiled in — the same
// mechanism as the edition). Read here by `BuildRow`, which is the only place a
// player can see it, and the only reader `version.ts` has.
import { BUILD_VERSION } from './version';
// T-1704 · The licences this artifact ships under. Read here by `CreditsPanel`,
// which is the only place a player can read them — and a licence notice that
// never reaches the player is not an attribution that shipped.
import { CREDITS, creditDetail, creditLine } from './credits';
// T-141 · The two settled strings the Playtest row must show. Imported rather
// than re-typed: `docs/PLAYTEST-TELEMETRY_SPEC.md` §3 settles the disclosure
// wording, and a golden test pins it — a literal copy here could drift from the
// promise the spec makes without failing anything.
import { PLAYTEST_DISCLOSURE, PLAYTEST_TOGGLE_LABEL } from './playtestLog';

// T-196c · `dropDie` is GONE. It bridged a native HTML5 drop back into the
// store's selection model by calling `selectDie` and then running the action —
// correct while its only caller (drag-to-sign) cost a die, and wrong the moment
// signing became a FREE ACTION: a free verb would have armed or replaced the die
// the player had queued for their next Main Action. Its sole call site now signs
// directly. `DIE_MIME` stays — the hand dock's `dragstart` still writes it.
const DIE_MIME = 'application/x-sq-die';

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

// The audio mixer (T-310, folded into Settings by T-1406). Four master/SFX/
// music/ambient sliders (T-185 added `music`) + a mute toggle, reflecting the
// persisted mixer state through
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
      {/* T-185 · The procedural score's own fader, between the one-shots and the
          bed it sits between in the mix. `music.ts` synthesizes it; this row is
          a pure client of `sound.ts`'s mixer exactly as the other three are. */}
      {slider('music', 'Music', 'vol-music')}
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

      {/* T-187 · The walkthrough's escape hatch in the other direction. Resetting
          the record to `off` is the ONE state `newGame` re-arms from, so this
          promises a fresh career on rails rather than dropping rails over a
          career already in flight — which is what the label says. */}
      <div className="set-section">
        <span className="set-head">Tutorial</span>
        <div className="set-row">
          <span className="set-label">Replay first-turn walkthrough</span>
          <button
            className="btn small"
            data-testid="set-replay-walkthrough"
            onClick={restartWalkthrough}
          >
            Arm
          </button>
        </div>
        <span className="set-note">
          Arms the seven-step walkthrough on your next New Game. Your current career is not
          interrupted.
        </span>
      </div>

      <StorageRow />
      <BuildRow />
      <SteamRow state={state} />
      <PlaytestPanel state={state} />
      <CreditsPanel />
      <SavesPanel state={state} />
    </div>
  );
}

// T-141 · OPT-IN PLAYTEST LOGGING — the consent surface.
//
// The player-facing whole of `docs/PLAYTEST-TELEMETRY_SPEC.md`: the toggle (§3),
// the disclosure that must sit beside it (§3), the "flag this moment"
// annotation (§1) and the player-triggered export (§5). Placed after Steam and
// before Credits, in the run of Settings sections that describe THE BUILD, and
// before the save slots, which stay the panel's last block on the rule
// `CreditsPanel` already states.
//
// OFF BY DEFAULT AND VISIBLY SO. The toggle reads `state.playtestLogging`, which
// `store.ts`'s `init()` seeds from `storage.ts`'s `KeyValueStore` — never from
// the save file, so a save round-trip cannot turn capture on (spec §3, asserted
// by `__tests__/playtest-log.test.ts`).
//
// THE DISCLOSURE IS ALWAYS RENDERED, not only when enabled: a player deciding
// whether to opt in is exactly the player who needs to read what is captured.
// Its text comes from `playtestLog.ts`'s `PLAYTEST_DISCLOSURE` constant, so this
// component owns no prose of its own — the same rule `SteamRow` follows with
// `presenceLine`.
//
// The flag and export controls appear ONLY when logging is on: a button that
// would refuse is worse than a button that is not there, and the store's actions
// still say why if either is reached another way.
function PlaytestPanel({ state }: { state: CockpitState }) {
  const [note, setNote] = useState('');
  const submitNote = () => {
    flagPlaytestMoment(note);
    setNote('');
  };
  return (
    <div className="set-section" data-testid="playtest-panel">
      <span className="set-head">Playtest</span>
      <div className="set-row">
        <span className="set-label">{PLAYTEST_TOGGLE_LABEL}</span>
        <button
          className={state.playtestLogging ? 'set-toggle on' : 'set-toggle'}
          data-testid="set-playtest-logging"
          aria-pressed={state.playtestLogging}
          onClick={() => setPlaytestLogging(!state.playtestLogging)}
        >
          {state.playtestLogging ? 'On' : 'Off'}
        </button>
      </div>
      <span className="set-note" data-testid="playtest-disclosure">
        {PLAYTEST_DISCLOSURE}
      </span>
      {state.playtestLogging ? (
        <>
          <div className="set-row">
            <span className="set-label">Flag this moment</span>
            <span className="set-value" data-testid="playtest-entry-count">
              {state.playtestLogEntries} captured
            </span>
          </div>
          <div className="set-row">
            <input
              className="set-input"
              data-testid="playtest-flag-input"
              aria-label="Note for this moment"
              placeholder="What happened?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitNote();
              }}
            />
            <button className="btn small" data-testid="playtest-flag" onClick={submitNote}>
              Flag
            </button>
          </div>
          <div className="set-row">
            <span className="set-label">Export Playtest Log</span>
            <span className="set-acts">
              <button
                className="btn small"
                data-testid="playtest-export-json"
                onClick={() => exportPlaytestLog('json')}
              >
                JSONL
              </button>
              <button
                className="btn small"
                data-testid="playtest-export-csv"
                onClick={() => exportPlaytestLog('csv')}
              >
                CSV
              </button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

// T-1701a · WHERE YOUR SAVES LIVE.
//
// The player-facing surface of the Electron shell, and the READER of both new
// exports from `storage.ts` (standing constraint 7). On the web build it says
// "Browser storage" — honest, and there is no path a player could open. Under
// the shell it shows the absolute OS app-data directory, which is the answer to
// "where did my career go?" and the thing a bug report needs to attach.
//
// Deliberately NOT a button: opening a folder is a shell capability the renderer
// does not have, and adding an IPC channel for it would be scope this task's
// Accept does not name. The path is selectable text.
//
// `data-storage-backend` is the structural handle — prose may be re-voiced, the
// backend id is what a spec should assert on (the same rule `RecoveryNotice`'s
// `data-recovery-code` follows). Asserted in `packages/desktop/e2e/shell.spec.ts`
// (desktop) and `packages/ui/e2e/settings-saves.spec.ts` (web).
function StorageRow() {
  return (
    <div className="set-section">
      <span className="set-head">Storage</span>
      <div className="set-row">
        <span className="set-label">Saves</span>
        <span
          className="set-value"
          data-testid="save-location"
          data-storage-backend={storageBackend}
        >
          {saveLocation ?? 'Browser storage'}
        </span>
      </div>
    </div>
  );
}

// T-1701b · WHAT BUILD YOU ARE RUNNING, AND WHETHER IT UPDATES ITSELF.
//
// The player-facing surface of the packaging + updater task, and the READER of
// both new exports from `storage.ts` (standing constraint 7). On the web build
// there is no shell, so Updates says the browser handles it — honest, and neither
// line ever claims an update is coming when the packaged build's updater is inert
// (which it is in every build this repo produces; see
// `packages/desktop/src/updater.ts`).
//
// T-1704 · VERSION NOW HAS TWO SOURCES, AND THE SHELL WINS WHEN IT IS PRESENT.
// The row used to read "Web build" off the web, because nothing stamped the
// bundle; `version.ts` now does, so the rule is: the SHELL is the authority when
// there is one (a packaged binary knows the version of the installer the player
// actually ran, which can be older than any bundle in this repo), and the
// COMPILED STAMP otherwise. `data-version-source` names which of the two answered
// — without it a spec could not tell a shell that happened to agree with the
// bundle from a shell that was never asked.
//
// Deliberately NOT a "Check now" button: nothing to check against without a
// feed, and a button that does nothing is worse than a sentence that is true.
//
// `data-update-status` is the structural handle — prose may be re-voiced, the
// state id is what a spec should assert on (the `data-storage-backend` /
// `data-recovery-code` precedent). Asserted in `packages/desktop/e2e/shell.spec.ts`
// (dev shell → `unsupported`), `packages/desktop/e2e/packaged.spec.ts` (a real
// package → `inert`) and `packages/ui/e2e/settings-saves.spec.ts` (web → `web`).
function BuildRow() {
  return (
    <div className="set-section">
      <span className="set-head">Build</span>
      <div className="set-row">
        <span className="set-label">Version</span>
        <span
          className="set-value"
          data-testid="app-version"
          data-version-source={shellVersion ? 'shell' : 'bundle'}
        >
          {shellVersion ?? BUILD_VERSION}
        </span>
      </div>
      <div className="set-row">
        <span className="set-label">Updates</span>
        <span
          className="set-value"
          data-testid="update-status"
          data-update-status={updateStatus ?? 'web'}
        >
          {updateStatusMessage(updateStatus)}
        </span>
      </div>
      {/* T-1703 · WHICH EDITION THIS BUILD IS. The player-facing reader of the
          compiled `BUILD_EDITION` (edition.ts) — the answer to "am I playing the
          demo?" without dev tools, and the row a bug report screenshots. It sits
          in Build beside Version/Updates because that is where facts about the
          BINARY live; what the edition COSTS you in play is said at each gated
          control instead. `data-edition` is the structural handle, on the
          `data-update-status` / `data-storage-backend` precedent. */}
      <div className="set-row">
        <span className="set-label">Edition</span>
        <span className="set-value" data-testid="build-edition" data-edition={BUILD_EDITION}>
          {editionLabel(BUILD_EDITION)}
        </span>
      </div>
    </div>
  );
}

// T-1702a · WHETHER YOUR DEEDS ARE REACHING STEAM.
//
// The player-facing surface of the Steamworks task, and the READER of
// `storage.ts`'s `steamStatus` and of `steam.ts`'s `ACHIEVEMENT_MANIFEST`
// (standing constraint 6/7). Two lines, because "connected" and "mirrored" are
// different questions: the first says whether Steam answered at all, the second
// shows the MIRROR ITSELF — how much of the Registry has a Steam counterpart —
// which is the thing this task actually built. Without the second line a player
// could see "Connected" and still have no idea achievements are Deeds.
//
// The count comes from `state.game.player.registry.earned`, the same engine
// state the Records → Registry tab reads. It is never recomputed here; the UI is
// a client of the rules, never their owner.
//
// Deliberately NOT a button: there is nothing to click. Steam either answered at
// boot or it did not, and a "reconnect" control would promise a capability the
// Steamworks API does not offer mid-process. The mirror re-reconciles on its own
// at every career entry point (see `store.ts`'s backfill calls).
//
// `data-steam-status` is the structural handle — prose may be re-voiced, the
// state id is what a spec should assert on (the `data-storage-backend` /
// `data-update-status` / `data-recovery-code` precedent). Asserted in
// `packages/desktop/e2e/shell.spec.ts` (dev shell → `ready` under the recording
// client, and `unavailable` with no app id), `packages/desktop/e2e/packaged.spec.ts`
// (a real package → `unavailable`) and `packages/ui/e2e/settings-saves.spec.ts`
// (web → `web`).
//
// T-1702b ADDS TWO MORE ROWS to the same section, and they are the entire
// player-facing surface of Cloud & rich presence:
//
//   * "Cloud saves" — the READER of `storage.ts`'s `cloudStatus` AND
//     `cloudRestored`. The restore COUNT is there for the same reason the
//     achievements tally is: it makes the sync itself visible, not merely the
//     connection. Deliberately not a "sync now" button — the upload is coalesced
//     and the restore only ever runs at boot (see `desktop/src/cloud.ts`), so a
//     button would promise a capability the design does not have.
//   * "Shown to friends" — the exact sentence Steam publishes, composed from the
//     same pure `presenceLine(game)` the sender uses, so the row and the friends
//     list cannot disagree.
function SteamRow({ state }: { state: CockpitState }) {
  const earned = state.game.player.registry.earned.length;
  const line = presenceLine(state.game);
  return (
    <div className="set-section">
      <span className="set-head">Steam</span>
      <div className="set-row">
        <span className="set-label">Status</span>
        <span
          className="set-value"
          data-testid="steam-status"
          data-steam-status={steamStatus ?? 'web'}
        >
          {steamStatusMessage(steamStatus)}
        </span>
      </div>
      <div className="set-row">
        <span className="set-label">Achievements</span>
        <span className="set-value" data-testid="steam-achievements">
          {/* T-1703 · The denominator is EDITION-SCOPED (`achievementManifest`):
              45 in the full build, 44 in the demo, because the Conqueror capstone
              is on the demo's gate list. This row is the player-visible reader of
              that difference and is asserted on BOTH builds by
              `e2e/demo-gate.spec.ts`. */}
          {steamAchievementsMessage(steamStatus, earned, achievementManifest(BUILD_EDITION).length)}
        </span>
      </div>
      {/* T-1702b · The two halves of Cloud & rich presence, made reachable by a
          player through Settings with no dev tools (standing constraint 6). Both
          carry the state id as a data attribute on the same precedent as
          `data-steam-status` — prose may be re-voiced, the id is what a spec
          asserts on. */}
      <div className="set-row">
        <span className="set-label">Cloud saves</span>
        <span
          className="set-value"
          data-testid="steam-cloud"
          data-cloud-status={cloudStatus ?? 'web'}
        >
          {cloudStatusMessage(cloudStatus, cloudRestored)}
        </span>
      </div>
      <div className="set-row">
        <span className="set-label">Shown to friends</span>
        {/* Composed from the SAME pure `presenceLine` the sender uses, so what
            this row shows and what Steam actually receives cannot drift. */}
        <span className="set-value" data-testid="steam-presence">
          {presenceMessage(steamStatus, richPresenceLine(line.system, line.day))}
        </span>
      </div>
    </div>
  );
}

// T-1704 · WHOSE WORK IS IN THIS BUILD.
//
// The player-facing surface of the release sweep, and the READER of `credits.ts`
// (standing constraints 6 and 7). It exists because the OFL and the MIT licence
// both require their notice to travel with the distributed work: a credits file
// that lives only in the repository is an attribution the person holding the
// binary never receives. Settings is where every other fact about the artifact
// already lives (Storage, Build, Steam), so this is the fourth section rather
// than a fifth popover — the "menu ceremony" PRD §2 forbids.
//
// Placed AFTER Steam and BEFORE the save slots deliberately: Storage → Build →
// Steam → Credits is one run of FACTS ABOUT THE ARTIFACT, and the save slots stay
// the panel's last block because they are the only thing here a player operates.
// Splitting the facts around the controls would be the worse trade — the cost is
// that the slots sit further down a scrolling popover, which is a scroll, not a
// click. `data-credit-id` is the structural handle, on the `data-update-status` /
// `data-storage-backend` precedent.
//
// Every string is composed by `credits.ts` (`creditLine` / `creditDetail`), so
// this component owns no prose at all — the same rule `SteamRow` follows with
// `presenceLine`. Asserted consumed by `packages/ui/e2e/settings-saves.spec.ts`
// (the web build) and `packages/desktop/e2e/packaged.spec.ts` (a real packaged
// binary, which is the artifact the licences actually attach to).
function CreditsPanel() {
  return (
    <div className="set-section" data-testid="credits-panel">
      <span className="set-head">Credits</span>
      {CREDITS.map((credit) => {
        const detail = creditDetail(credit);
        return (
          <div className="credit-row" key={credit.id} data-credit-id={credit.id}>
            <div className="set-row">
              <span className="set-label">{credit.name}</span>
              <span className="set-value">{creditLine(credit)}</span>
            </div>
            {detail ? <span className="credit-detail">{detail}</span> : null}
          </div>
        );
      })}
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
  // T-1703 · The import file picker. A hidden native `<input type="file">` driven
  // by a visible button, because a bare file input cannot be styled into the
  // console aesthetic and Playwright drives it with `setInputFiles` either way.
  const importRef = useRef<HTMLInputElement | null>(null);

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
      {/* T-1703 · THE CARRY, made reachable by a player (standing constraint 6).
          Export writes the same `createSave(state, seed)` envelope every other
          persistence path writes; import runs it back through the engine's
          `loadSave` → `promoteEdition`, which is what turns a demo career into a
          full one. Placed above the slots because it is the same idea one level
          out: a slot moves a career between saves, this moves it between INSTALLS.
          Both live on every build — the full game needs the import side for the
          demo's carry, and the demo needs the export side to hand it over. */}
      <span className="set-head">Career file</span>
      <div className="set-row">
        <span className="set-label">Transfer</span>
        <span className="ss-controls">
          <button className="btn small" data-testid="export-career" onClick={() => exportCareer()}>
            Export career
          </button>
          <button
            className="btn small"
            data-testid="import-career"
            onClick={() => importRef.current?.click()}
          >
            Import career
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".sav,application/json"
            data-testid="import-career-input"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input BEFORE awaiting, so re-picking the same file
              // fires `change` again (a browser suppresses it otherwise).
              e.target.value = '';
              if (file) void importCareer(file);
            }}
          />
        </span>
      </div>
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

  // T-136 · A hand of Liar's Dice FORCES the pane open. While `dareHand` stands
  // the engine refuses Trade / Travel / Shipyard / Storylet / Explore / a second
  // VisitHangout with `ActionBlocked{active-dare-hand}`, so a player who closed
  // the panel would have no legal verb left but Reroll / Crew / Port / End day.
  // The panel is the only place the hand can be played from, so it stays mounted
  // and loses its close control until the table settles.
  const dareHandLive = s.game.dareHand !== null;

  // T-1505c · THE CAREER'S TERMINUS. Null until the engine says the career ended
  // (`careerEnded` → the ship is on the far side of the Nemesis shear); the UI
  // never decides this itself. Read AFTER every hook above, and rendered as an
  // EARLY RETURN that replaces the cockpit — the engine refuses every verb from
  // here, so leaving the terminal mounted behind it would be a screen of dead
  // controls over a system with no port, board or hangout. The only way out is
  // the screen's own `newGame` control, which lands on a fresh day-1 cockpit.
  // T-1703 · THE DEMO'S TERMINUS. Null until the ENGINE says the licence expired
  // (`demoConcluded` → the career rolled past `DEMO_FINAL_DAY`); the UI never
  // decides this either. Checked BEFORE the crossing ending because the two are
  // mutually exclusive in practice (33 days cannot reach the shear) and this is
  // the one a demo player will actually see. Same early-return shape: the engine
  // refuses every verb from here, so leaving the cockpit mounted behind it would
  // be a screen of dead controls.
  const demoEnd = demoEndCard(s.game);
  if (demoEnd) {
    return (
      <div className="tube">
        <EffectsLayer />
        {!reduced && <div className="sweep" key={s.bootKey} aria-hidden="true" />}
        <div className="screen">
          <DemoEndCard view={demoEnd} seed={s.seed} notice={s.notice} />
        </div>
      </div>
    );
  }

  const ending = endingScreen(s.game);
  if (ending) {
    // T-1605a · The recovery notice is deliberately NOT mounted here: a recovery
    // boot always lands on a fresh day-1 career, which can never be an ended one,
    // so this branch is unreachable with `s.recovery` set. Omission by decision.
    return (
      <div className="tube">
        <EffectsLayer />
        {!reduced && <div className="sweep" key={s.bootKey} aria-hidden="true" />}
        <div className="screen">
          <EndingScreen view={ending} seed={s.seed} />
        </div>
      </div>
    );
  }

  return (
    <div className="tube">
      <EffectsLayer />
      {!reduced && <div className="sweep" key={s.bootKey} aria-hidden="true" />}

      <div className="screen">
        {/* T-1605a · The corrupt-save notice, first child of the screen so it is
            the first thing the player sees. Before this, a save that would not
            load was swallowed by the store and the player was silently handed a
            fresh career (store.ts `readSave`'s bare catch). */}
        {s.recovery && <RecoveryNotice recovery={s.recovery} />}
        {/* T-1605c · The autosave-write-failed banner, beside the corrupt-save
            notice: same slot, same styling, the other half of the same honesty.
            The read side was T-1605a; this is the write side, and it is the
            failure a 1,000-day career actually hits ON THE WEB BUILD (~10.9 MiB
            of save against a ~5 MB localStorage quota). T-1701a's Electron shell
            has no such quota, but a disk write can still fail, so the banner is
            backend-aware rather than retired. */}
        {s.saveWriteFailed && <SaveWriteFailedNotice />}
        {/* T-1406 · The control cluster is DIEGETIC now — a row of console
            switches on the terminal bezel, in-fiction, rather than a floating
            top-right toolbar. Same buttons, same testids; the audio popover is
            gone (folded into Settings) and the storylet launcher is gone
            (storylets open from their diegetic surfaces below). */}
        {/* T-1703 · The standing demo banner — days left on the licence, in the
            bezel where the day/era already are. Null (renders nothing) on a full
            build, so the full cockpit is byte-identical. */}
        <DemoBanner game={s.game} />
        <Bezel game={s.game} seed={s.seed}>
          <div className="ctrls">
            <button onClick={toggleFx}>{s.fx ? 'CRT: ON' : 'CRT: OFF'}</button>
            {hangoutAvailable && (
              <button
                className="hangout-launch"
                data-testid="hangout-toggle"
                {...railsProps(s, 'hangout')}
                aria-expanded={hangoutPanelOpen}
                onClick={() => setHangoutPanelOpen((v) => !v)}
              >
                Cantina
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
        <Wire game={s.game} onOpenStorylet={setOpenStoryletId} railsOff={railsOff(s, 'wire')} />
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
          !ceremony && (
            <StoryletPanel
              state={s}
              storyletId={openStoryletId}
              onClose={() => setOpenStoryletId(null)}
            />
          )}
        {(hangoutPanelOpen || dareHandLive) && hangoutAvailable && (
          <HangoutPanel
            state={s}
            onClose={() => setHangoutPanelOpen(false)}
            locked={dareHandLive}
          />
        )}
        <HandDock state={s} />
        {/* Contextual first-time coach prompt for the cockpit affordances. The
            combat coach lives inside the combat overlay (below); this instance
            handles hand / manifest / starmap anchors. Only one prompt shows at a
            time (the selector guarantees it), so the two mounts never collide. */}
        <OnboardingCallout state={s} where="screen" />
        {/* T-187 · The scripted first-turn walkthrough's step card. A SIBLING of
            the contextual coach, never a replacement: it only ever renders on a
            genuinely first-time career, and while it is up the coach above
            stands down (see `OnboardingCallout`'s first line). */}
        <WalkthroughCard state={s} />
        {/* T-200 · The opening marker. Mounted AFTER the walkthrough card on
            purpose: both want the birth of a career, and this one goes first —
            you learn WHY you are out here before anyone teaches you the controls.
            The collision is resolved in one direction only (the card stands down
            while this is up, see `WalkthroughCard`'s first line) and it is a
            RENDER-TIME suppression, not a state change: dismiss the dispatch and
            the walkthrough is still sitting on step 1. */}
        <OpeningMarker state={s} />
        <CombatOverlay state={s} />
        {ceremony && <ResolutionCeremony state={s} view={ceremony} />}
        {/* T-1602b · The death beat. Mounted OUTSIDE the combat overlay on
            purpose: a dusk life-support failure kills the ship with no encounter
            on screen at all, and the combat killing blow nulls the encounter
            before this renders — so hanging it off the overlay would make half
            the deaths in the game invisible. */}
        {s.succession && <SuccessionNotice succession={s.succession} />}
        {recordsOpen && <RecordsOverlay game={s.game} onClose={() => setRecordsOpen(false)} />}
      </div>
    </div>
  );
}

// T-1605a · The corrupt-save notice. Rendered above the bezel so it is the first
// thing on the screen, `role="alert"` so a screen reader announces it, and NON-
// MODAL like the onboarding coach — the fresh career underneath is playable while
// it is up. The prose comes from `format.ts saveRecoveryMessage`; the ENGINE's own
// failure code rides along as a structural attribute, because the sentence is
// prose that may be re-voiced while the code is what a spec should assert on.
function RecoveryNotice({ recovery }: { recovery: SaveRecoveryNotice }) {
  return (
    <div
      className="notice recovery"
      data-testid="recovery-notice"
      data-recovery-code={recovery.code}
      data-recovery-preserved={recovery.preserved ? '1' : '0'}
      role="alert"
    >
      <span>{saveRecoveryMessage(recovery, storageBackend)}</span>
      <button className="btn small" data-testid="recovery-dismiss" onClick={dismissRecovery}>
        Dismiss
      </button>
    </div>
  );
}

// T-1605c · The autosave-write-failed banner. Same slot, styling and `role="alert"`
// as `RecoveryNotice` above — no new CSS system — but deliberately NOT dismissable:
// `recovery` describes something that already happened once at boot, while this
// describes a condition that is STILL TRUE and stays true for every action the
// player takes until a write lands. A dismiss button would let the cockpit go
// quiet again while continuing to lose the career, which is the exact failure this
// fixes. It clears itself the moment `store.ts autosave()` succeeds.
// READER of `CockpitState.saveWriteFailed`: this component.
function SaveWriteFailedNotice() {
  return (
    <div className="notice recovery" data-testid="save-write-failed-notice" role="alert">
      <span>{saveWriteFailedMessage(storageBackend)}</span>
    </div>
  );
}

// ===========================================================================
// T-187 · THE FIRST-TURN WALKTHROUGH — the rails and the step card.
// ===========================================================================
//
// THE RAILS. `railsOff(state, region)` is the single predicate every guarded node
// asks. A `true` answer puts React 19's first-class `inert` prop on that node,
// which kills pointer events, keyboard focus AND accessibility-tree exposure for
// the whole subtree — that is what "the player's next legal action is constrained
// to the scripted one" actually means, and it is far more honest than a CSS
// overlay that merely LOOKS unclickable. `data-rails-off="1"` rides along as the
// CSS hook and the e2e's assertion target.
//
// NESTING IS LOAD-BEARING: an `inert` ancestor cannot be un-inerted by a
// descendant, so the attribute goes on the narrowest node that matches a region —
// never on `.pane.starmap` (which contains both the plot controls and the
// off-lane sweep, two different regions) and never on the Trade pane's root
// (whose fuel depot is a region of its own that steps 4 and 6 must be able to
// open).
function railsOff(state: CockpitState, region: RailsRegion): boolean {
  return !railsAllows(state.walkthrough, state, region);
}

/** The attributes every rails-guarded node spreads: `inert` + the dim hook when
 *  the region is closed, the highlight hook when it is the one the current step
 *  is asking for, and NOTHING at all otherwise — so a cockpit with no walkthrough
 *  running renders exactly the markup it always did. */
function railsProps(
  state: CockpitState,
  region: RailsRegion,
): { inert?: boolean; 'data-rails-off'?: '1'; 'data-rails-active'?: '1' } {
  if (railsOff(state, region)) return { inert: true, 'data-rails-off': '1' };
  if (railsHighlights(state.walkthrough, state, region)) return { 'data-rails-active': '1' };
  return {};
}

/**
 * The step popup — the "pop ups" half of the owner's ask.
 *
 * Visually heavier than `.onboarding` — opaque, 2px frame, a "STEP n OF 7"
 * counter, `role="dialog"` — but there is NO backdrop, NO focus trap, and (as of
 * the first e2e run) NO pointer capture on the frame itself: only its two buttons
 * take clicks. That last one is a MEASURED fix, not a style preference — a card
 * that swallows the click it is telling the player to make is a tutorial blocking
 * its own lesson. The constraining is the RAILS' job, and the always-open
 * `hand` / `chrome` regions are what keep this from ever soft-locking a career.
 *
 * Renders nothing when the walkthrough is not running, when the ENGINE has taken
 * over the screen (`railsSuspended` — a live encounter, a hand at the tables, an
 * aftermath, a death, a patrol scan), or when all seven steps are done.
 */
function WalkthroughCard({ state }: { state: CockpitState }) {
  // T-200 · The ONE line of interaction with the opening marker, and the exact
  // idiom `OnboardingCallout` already uses for `walkthroughActive` below: while
  // the Guild dispatch covers the cockpit, this card stands down, because two
  // full-screen first-time overlays at once is the failure mode. Nothing else
  // changes — the record is untouched, so the card returns on step 1 the moment
  // the dispatch is signed.
  if (openingMarkerPending(state.openingMarker)) return null;
  if (!walkthroughActive(state.walkthrough) || railsSuspended(state)) return null;
  const step = currentWalkthroughStep(state.walkthrough);
  if (!step) return null;
  const copy = walkthroughCardCopy(state.walkthrough, step, state.game);
  return (
    <aside
      className="walkthrough"
      data-testid="walkthrough"
      data-walkthrough-step={step.id}
      data-walkthrough-index={step.index}
      data-walkthrough-anchor={step.anchor}
      role="dialog"
      aria-live="polite"
      aria-label="First-turn walkthrough"
    >
      <span className="wt-counter">
        STEP {step.index} OF {WALKTHROUGH_STEP_COUNT}
      </span>
      <b className="wt-title">{step.title}</b>
      <p className="wt-what">{copy.what}</p>
      <p className="wt-why">{copy.why}</p>
      <div className="wt-acts">
        <button className="wt-skip" data-testid="walkthrough-skip" onClick={skipWalkthrough}>
          Skip tutorial
        </button>
        {step.ack && (
          <button className="wt-next" data-testid="walkthrough-next" onClick={ackWalkthroughStep}>
            Next
          </button>
        )}
      </div>
    </aside>
  );
}

/**
 * T-200 · THE OPENING MARKER — the debt as a cold open.
 *
 * A one-shot Guild dispatch that lands over the day-1 cockpit at the birth of a
 * career, discharging `docs/PRD-REIMAGINED.md`'s standing promise that the object
 * is "stated on the first screen". The figure is the largest thing on the tube;
 * the prose names the PRIOR OBLIGATIONS that put the player out here.
 *
 * AN OVERLAY, NOT AN EARLY RETURN. `EndingScreen` and the demo end card REPLACE
 * the cockpit because the engine refuses every verb from there. Here the cockpit
 * is fully alive underneath — this is a beat over it, not a substitute for it,
 * which is also why every other spec's DOM is unchanged behind it.
 *
 * Every number comes from `openingMarkerView(state.game)` — `player.debt` and
 * `player.debtDueDay`, read live. The raw figures ride out as attributes as well
 * as prose (the `RecoveryNotice` / `data-recovery-code` precedent): a sentence is
 * prose that may be re-voiced, an attribute is what a spec asserts on.
 */
function OpeningMarker({ state }: { state: CockpitState }) {
  if (!openingMarkerPending(state.openingMarker)) return null;
  const view = openingMarkerView(state.game);
  return (
    <div
      className="opening-marker"
      data-testid="opening-marker"
      data-opening-debt={view.debt}
      data-opening-due={view.dueDay}
      role="dialog"
      aria-modal="true"
      aria-label="Guild marker"
    >
      <div className="om-frame">
        <span className="om-kicker" data-testid="opening-marker-kicker">
          {view.kicker}
        </span>
        <h2 className="om-title">{view.title}</h2>

        {/* The figure. Not a chip, not a ledger row — the one thing on the tube
            with any size to it, which is the whole difference between a hook and
            the bezel readout that has carried this number until now. */}
        <div className="om-figure">
          <b className="om-owed" data-testid="opening-marker-debt">
            {view.debtLabel}
          </b>
          <span className="om-due" data-testid="opening-marker-due">
            CALLED ON DAY {view.dueDay} · {view.dueLabel.toUpperCase()}
          </span>
        </div>

        <div className="om-prose">
          {view.prose.map((paragraph, index) => (
            <p key={index} data-testid="opening-marker-prose">
              {paragraph}
            </p>
          ))}
        </div>

        <p className="om-signoff" data-testid="opening-marker-signoff">
          {view.signOff}
        </p>

        {/* The foot of the document. The dashed rule + clearing-house stamp is
            what keeps the bottom of this frame reading as a dispatch rather than
            a dialog's action bar — the tabletop-ui "diegetic, never web-app
            chrome" rule, applied to the one element most likely to break it. */}
        <div className="om-foot">
          <span className="om-stamp" data-testid="opening-marker-stamp">
            {view.stamp}
          </span>
          <button
            className="btn om-sign"
            data-testid="opening-marker-dismiss"
            onClick={dismissOpeningMarker}
          >
            {view.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// The contextual onboarding coach (T-311). A NON-MODAL callout anchored to the
// real affordance it teaches — no backdrop, no focus trap, nothing disabled, so
// the player can act on the affordance while it is up (which auto-dismisses it).
// This is the "no modal tutorial walls" guarantee. `where` selects which of
// THREE mount points this instance is: the combat coach renders INSIDE the
// combat overlay, the loan coach INSIDE the open Hangout panel (both overlays
// cover the cockpit), and everything else at screen level. Each mount asks
// `activeOnboardingPrompt` for ITS OWN highest-priority active, unseen prompt
// (F-121-2) — so a prompt routed to a closed-panel mount can never claim a
// different mount's slot and render nowhere.
function OnboardingCallout({ state, where }: { state: CockpitState; where: OnboardingMount }) {
  // T-187 · The ONE line of interaction between the two teaching systems: while
  // the scripted first-turn walkthrough is on rails, the contextual coach stands
  // down at every mount, because two coach cards on screen at once is the failure
  // mode. Nothing else changes — `reconcileOnboarding` keeps running underneath,
  // so the delivery-flow prompts auto-dismiss as the scripted actions land, and
  // the moment the walkthrough finishes or is skipped this coach resumes for
  // every prompt still unseen.
  if (walkthroughActive(state.walkthrough)) return null;
  // The screen mount is suppressed while the combat overlay covers the cockpit,
  // so a lower-priority screen prompt can never render behind the overlay.
  if (where === 'screen' && state.game.encounter != null) return null;
  const prompt = activeOnboardingPrompt(state.game, state.onboardingSeen, where);
  if (!prompt) return null;
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

// T-1602b · THE SUCCESSION NOTICE — the death beat, made visible.
//
// Until this existed a player who lost their ship watched the combat overlay
// silently unmount, their credits halve, their ship turn into a junker and their
// position teleport, with no in-the-moment explanation at all: the only trace was
// the obituary buried in the Wire log. This is that explanation.
//
// It is a pure CLIENT of `successionSummary` (format.ts), which is itself pure
// translation of the engine's typed `ShipLost` / `LegacySuccession` /
// `TradeEvent{forfeit-cargo}` / obituary `WireEntry` batch. Every number below is
// the engine's own; the obituary prose is the ENGINE's sentence, verbatim — the
// UI does not author the death.
//
// Acknowledging clears the client-side `succession` state → this unmounts back to
// a fully playable cockpit (the successor's hand is spent, so the legal move is
// `end-day`; no soft-lock).
function SuccessionNotice({ succession }: { succession: SuccessionSummary }) {
  return (
    <div
      className="succession-notice"
      data-testid="succession-notice"
      data-reason={succession.reason}
      role="dialog"
      aria-label="Ship lost"
    >
      <div className="sn-frame">
        <header className="sn-head">
          <span className="sn-kicker">REGISTRY OF LOSSES · DAY {succession.day}</span>
          <h2 className="sn-title">SHIP LOST</h2>
          <span
            className="sn-lost-to"
            data-testid="succession-lost-to"
            data-lost-to={succession.lostTo}
          >
            {succession.lostToLabel}
          </span>
        </header>

        <p className="sn-obituary" data-testid="succession-obituary">
          {succession.obituary}
        </p>

        <dl className="sn-estate">
          <div className="sn-row">
            <dt>INHERITED</dt>
            <dd data-testid="succession-inherited-credits">
              {succession.inheritedCredits.toLocaleString()} CR
            </dd>
          </div>
          <div className="sn-row">
            <dt>DEBTS CARRIED</dt>
            <dd data-testid="succession-debt">{succession.debtOutstanding.toLocaleString()} CR</dd>
          </div>
          <div className="sn-row">
            <dt>LICENCES PASSED ON</dt>
            <dd data-testid="succession-count">{succession.successionCount}</dd>
          </div>
          {succession.cargoForfeited !== null && (
            <div className="sn-row">
              <dt>CARGO LOST</dt>
              <dd data-testid="succession-cargo">{succession.cargoForfeited}</dd>
            </div>
          )}
        </dl>

        <button className="btn" data-testid="succession-ack" onClick={dismissSuccession}>
          Claim the licence
        </button>
      </div>
    </div>
  );
}

// T-1505c · THE ENDING. The career's terminus, rendered.
//
// This screen REPLACES the cockpit rather than covering it (see the early return
// in `App`), for two reasons. (1) Truthfulness: on the far side of the shear the
// engine refuses every verb with `ActionBlocked{'career-ended'}`, so a cockpit
// behind this screen would be a wall of dead controls. (2) Safety: the panes
// would be rendering `STAR_SYSTEMS[NEMESIS_SYSTEM_ID]` — a system with no port,
// no depot and no hangout content.
//
// It is a pure CLIENT: every string and number comes from `endingScreen`
// (format.ts) → engine `careerEpilogue` + content `CROSSING_ENDING`. It owns no
// rule. Its ONE control starts a fresh career through the same `newGame(seed)`
// store action the masthead's New game button uses, which lands the player back
// on a clean day-1 cockpit — the app's entry surface, since there is no separate
// menu screen. There is deliberately NO close button: the far side is not a room
// you back out of.
// T-1703 · THE DEMO BANNER. A standing line, not a dismissable notice: the day
// ceiling is a condition that stays true for every action the player takes, which
// is the same argument `SaveWriteFailedNotice` makes for not being dismissable.
// The days-remaining figure comes from the engine (`demoDaysRemaining` via
// `demoBannerLine`) and is never recomputed here.
//
// `data-demo-days-remaining` is the structural handle — prose may be re-voiced,
// the number is what a spec asserts on (the `data-update-status` precedent).
// READER of `format.ts`'s `demoBannerLine`: this component.
function DemoBanner({ game }: { game: GameState }) {
  const view: DemoBannerView | null = demoBannerLine(game);
  if (!view) return null;
  return (
    <div
      className="notice demo-banner"
      data-testid="demo-banner"
      data-demo-days-remaining={String(view.daysRemaining)}
      role="status"
    >
      <span>{view.line}</span>
    </div>
  );
}

// T-1703 · THE DEMO END CARD — the screen that replaces the cockpit once the
// licence expires. A sibling of `EndingScreen` below (same frame, same stat rows,
// same single control), because it is the same kind of moment: a career that can
// no longer be played, summarised, with one way forward.
//
// THE ONE CONTROL IS **EXPORT**, not "new game", and that is the point of the
// whole task: the demo's job is to hand the career to the full game. A New career
// button is deliberately absent — replaying the same 33 days is not what a player
// who just finished them wants, and the export is what "demo-save carries into
// full game" looks like from the player's side.
function DemoEndCard({
  view,
  seed,
  notice,
}: {
  view: DemoEndView;
  seed: number;
  notice: string | null;
}) {
  return (
    <div
      className="ending-screen demo-end"
      data-testid="demo-end-card"
      data-seed={seed}
      role="dialog"
      aria-label="Demo complete"
    >
      <div className="es-frame">
        <header className="es-head">
          <span className="es-kicker" data-testid="demo-end-kicker">
            {view.kicker}
          </span>
          <h2 className="es-title" data-testid="demo-end-title">
            {view.title}
          </h2>
        </header>

        <div className="es-prose">
          {view.body.map((paragraph, index) => (
            <p key={index} data-testid="demo-end-prose">
              {paragraph}
            </p>
          ))}
        </div>

        <dl className="es-stats">
          {view.stats.map((row) => (
            <div className="es-stat" key={row.key} data-testid="demo-end-stat" data-stat={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <button
          className="btn es-return"
          data-testid="demo-end-export"
          onClick={() => exportCareer()}
        >
          {view.cta}
        </button>
        {notice && (
          <p className="es-signoff" data-testid="demo-end-notice">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

function EndingScreen({ view, seed }: { view: EndingView; seed: number }) {
  return (
    <div
      className="ending-screen"
      data-testid="ending-screen"
      role="dialog"
      aria-label="Career ending"
    >
      <div className="es-frame">
        <header className="es-head">
          <span className="es-kicker" data-testid="ending-kicker">
            {view.kicker}
          </span>
          <h2 className="es-title" data-testid="ending-title">
            {view.title}
          </h2>
        </header>

        {/* The last thing the Galactic Wire ever files about this captain. The
            cockpit ticker that used to carry it is gone with the cockpit, so this
            line is `CROSSING_WIRE.crossed`'s player-facing reader now. */}
        <p className="es-wire" data-testid="ending-wire">
          {view.lastWire}
        </p>

        <div className="es-prose">
          {view.prose.map((paragraph, index) => (
            <p key={index} data-testid="ending-prose">
              {paragraph}
            </p>
          ))}
        </div>

        <dl className="es-stats">
          {view.stats.map((row) => (
            <div className="es-stat" key={row.key} data-testid="ending-stat" data-stat={row.key}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="es-signoff" data-testid="ending-signoff">
          {view.signOff}
        </p>

        <button className="btn es-return" data-testid="ending-return" onClick={() => newGame(seed)}>
          {view.returnLabel}
        </button>
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
  // T-1603c · Forward the TIER GAP for the same reason: the engine now scales the
  // demand by how far the interceptor outranks the player (content
  // TRIBUTE_TIER_GAP_STEP), so a preview that dropped it would quote a number the
  // engine never charges. The cockpit is a client of the engine rule, not a
  // second implementation of it.
  const tributePreview = tributeThisRound(
    encounter.round,
    encounter.interceptor.kind,
    encounter.interceptor.tier - game.player.tier,
  );

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
          {/* T-207 · The named captain's own voice. Both are `null` for an
              ANONYMOUS raider at every round — `AnonymousInterceptorProfile` has no
              catchphrases (T-205's deliberate shape) — so React emits nothing at
              all on that path and the anonymous header's DOM is byte-identical to
              what it was before this task. Printed verbatim: no added quote marks,
              no case change (the `roomLine` convention this file keeps). */}
          {readout?.enterLine && (
            <span className="co-enemy-hist co-enemy-bark" data-testid="combat-enemy-bark">
              {readout.enterLine}
            </span>
          )}
          {readout?.battleLine && (
            <span className="co-enemy-hist co-enemy-bark" data-testid="combat-enemy-battle-bark">
              {readout.battleLine}
            </span>
          )}
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
      <div
        className="co-fuel"
        data-testid="combat-fuel"
        // T-1602a · The fuel budget, structured. Straight off the SAME
        // `combatFuelStatus` read the band below renders as prose — no new rule,
        // no recomputation. `canRun` is the engine's own gate (a RUN below
        // RUN_FUEL_COST burns the die, misses, and lets the enemy press —
        // actions/combat.ts), so it is the one number a stance decision must not
        // guess at from parsed text.
        // READER: e2e/tour-one-career.spec.ts via e2e/support/career.ts — its
        // encounter policy picks RUN when `data-can-run` is '1' and TALK when it
        // is not, and `data-fuel` rides the run report's encounter rows.
        data-fuel={fuel.fuel}
        data-can-run={fuel.canRun ? '1' : '0'}
      >
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
      {/* T-207 · The captain's parting word. Its own element, deliberately OUTSIDE
          the `<ul>` above: that list is things that happened, this is somebody
          talking. `null` for an anonymous raider, so this panel is byte-identical
          to today's on that path — nothing was appended to `lines` either. */}
      {aftermath.opponentLine && (
        <p className="co-aftermath-bark" data-testid="combat-aftermath-bark">
          {aftermath.opponentLine}
        </p>
      )}
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

/** T-132 · One authored `flavour` line beside its venue's controls. Renders NOTHING
 *  when the port authors no line for that venue — never a placeholder, never the
 *  default row's line reached for by hand (`portHangoutFor` already did the row
 *  resolution; the default row's `flavour` is genuinely empty). */
function VenueFlavour({ line, venue }: { line?: string; venue: HangoutVenueId }) {
  if (!line) return null;
  return (
    <p className="hp-flavour" data-testid="hangout-flavour" data-venue={venue}>
      {line}
    </p>
  );
}

/** T-132 · Display strings for the three social venues. Labels and tooltips ONLY —
 *  they decide no outcome; the venue's numbers are the port's and its resolution is
 *  the engine's. */
const SOCIAL_LABELS: Record<'meet' | 'befriend' | 'insult', string> = {
  meet: 'Introduce yourself',
  befriend: 'Buy a round',
  insult: 'Say the wrong thing',
};
const SOCIAL_TITLES: Record<'meet' | 'befriend' | 'insult', string> = {
  meet: 'Give your name to the table (spends a die)',
  befriend: 'Roll GUILE against the house DC to win them over (spends a die)',
  insult: 'A hard word, no roll, and the room remembers (spends a die)',
};

// The Hangout & lending pane (T-1404). The Spacers Hangout as a visitable place:
// the present-NPC list (from their simulated positions), the Spacer's Dare with a
// die commitment and BOTH actors' opposed honest checks, the three social venues
// (T-132: meet / befriend / insult), the rumor table, and Penny Wise's desk
// (borrow/repay with the interest schedule visible up front). It is a pure CLIENT
// of the engine's T-1303 venues + T-1304 lending: every mutation routes through the
// store (visitDare / visitSocial / borrowLoan / repayLoan), and every number shown
// is read from an engine export, a content constant, or live engine-written loan
// state — never recomputed. The HandDock stays reachable behind it, so a die is
// armed exactly as in the storylet flow.
//
// T-132 · SIX OF SEVEN VENUES ARE SURFACED HERE, and the seventh is absent on
// purpose: `rumor` emits precisely the `hangoutRumors` output the rumor table
// below already renders for free, so a control for it would be strictly dominated
// (see `visitSocial`'s docstring in store.ts). T-197 · that argument SURVIVED the
// freeing and got stronger: rumor used to be dominated because it cost a die for
// nothing new, and now it is dominated because it costs nothing for nothing new.
//
// T-197 · NO CONTROL IN THIS PANE REQUIRES AN ARMED DIE ANY MORE except PEEK
// (docs/DAWN-HAND-REDESIGN.md §3). Two daily caps replaced the die, and BOTH are
// rendered as counts beside the controls they bound — `social-plays-left` and
// `dare-rounds-left` — so neither can refuse a click the player could not see
// coming.
//
// EVERY per-port difference in this pane is a CONTENT field read through an engine
// accessor — `hangoutHouse` (the authored prose) and `hangoutVenueOffered` (the
// same `venueOffered` predicate `resolveVisitHangout` refuses on). There is no
// per-port branch here and there must never be one.
function HangoutPanel({
  state,
  onClose,
  locked,
}: {
  state: CockpitState;
  onClose: () => void;
  /** T-136 · A hand of Liar's Dice is on the table. The engine blocks Trade,
   *  Travel, Shipyard, Storylet, Explore and a second VisitHangout behind
   *  `ActionBlocked{active-dare-hand}` while it stands, so a closable panel would
   *  leave the player with no legal verb but Reroll / Crew / Port / End day — a
   *  soft-lock. The pane stays mounted and the close affordance goes away. */
  locked: boolean;
}) {
  const game = state.game;
  const npcs = hangoutNpcs(game);
  // T-145 · The house's OWN three seats (pool A). A parallel list beside the
  // roaming captains, never a replacement — the picker renders them as two
  // separate sections, which is how all 42 become reachable through the real UI.
  const roster = hangoutRosterOpponents(game);
  const rumors = hangoutRumorLines(game);
  const bounds = dareWagerBounds(game);
  const terms = lendingTerms(game);
  const loan = game.player.loan;
  // T-197 · the two daily caps, read through `format.ts` accessors that delegate
  // to the ENGINE's own rules — no restated arithmetic in the pane (§4a/§4b).
  const socialPlays = hangoutSocialPlays(game);
  const dareRounds = hangoutDareRounds(game);
  // T-197 · `armed` SURVIVES, narrowed to ONE reader: the Peek control inside
  // `LiarsDiceScene`. Peek is the one check inside an open hand, stayed a Main
  // Action by ruling (§3), and still spends a die. No other control in this pane
  // reads it — the T-196c treatment at the yard and trade panes, applied here.
  const armed = state.selectedDie !== null;
  // T-136 · THE FOG PROJECTION, and the ONLY thing the live scene is given. It has
  // no `dealerDice` field; see `format.ts`'s `DareSceneView`.
  const scene = dareScene(game);
  const house = hangoutHouse(game);
  const socialOutcome = state.socialOutcome;
  const offers = (v: HangoutVenueId) => hangoutVenueOffered(game, v);
  const socialVenues = (['meet', 'befriend', 'insult'] as const).filter(offers);

  const [opponentId, setOpponentId] = useState<string | null>(npcs[0]?.id ?? null);
  const [wager, setWager] = useState(bounds.min);
  const [principal, setPrincipal] = useState(terms.minPrincipal);
  const [repayAmount, setRepayAmount] = useState(loan?.outstanding ?? terms.minPrincipal);

  // Escape closes the panel (the StoryletPanel / Records convention) — EXCEPT
  // while a hand stands, for the reason `locked` documents.
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  // T-133 (owner ruling D7) · the principal control tracks the LIVE port's band.
  // `useState(terms.minPrincipal)` is only correct on the render that mounted the
  // pane; a captain who closes the desk at the home hall, flies to the garrison
  // mess and reopens it would otherwise be looking at a number the local
  // quartermaster will not count out. Re-clamped rather than reset, so a figure
  // the new desk CAN honour survives the move. The engine clamps regardless
  // (`loanBandFor` in `resolveVisitHangout`) — this is the pane declining to
  // display an ask the port would silently trim.
  useEffect(() => {
    setPrincipal((p) => Math.max(terms.minPrincipal, Math.min(terms.maxPrincipal, p)));
  }, [terms.minPrincipal, terms.maxPrincipal]);

  // A previously-chosen opponent may have wandered off between renders — only a
  // still-present NPC is a valid dealer (mirrors the engine's in-system guard).
  //
  // T-145 · …OR a non-broke roster opponent at this port. Two separate validities,
  // deliberately: `chosenRoaming` is the one the SOCIAL venues need (they call
  // `applyDisposition`, which needs an `NpcState`), and `chosen` is the wider one
  // the Dare accepts. Without the wider one the commit button could never enable
  // for a roster seat; without the narrower one the pane would offer
  // meet/befriend/insult against a roster opponent and the engine would typed-fail
  // it with 'no-opponent'.
  const chosenRoaming = opponentId && npcs.some((n) => n.id === opponentId) ? opponentId : null;
  const chosenRoster =
    opponentId && roster.some((r) => r.id === opponentId && !r.broke) ? opponentId : null;
  const chosen = chosenRoaming ?? chosenRoster;
  // T-197 · THE DIE IS GONE FROM ALL SEVEN VENUES, AND TWO DAILY CAPS TOOK ITS
  // PLACE (docs/DAWN-HAND-REDESIGN.md §3/§4a/§4b). Every `!armed` arm below is
  // retired — a freed Hangout action neither requires nor clears the armed die.
  // What replaces them is NOT silence: each cap gets its own disabled reason,
  // drawn from the same engine accessors the resolver refuses on, so a spent-out
  // pool or a closed table explains itself BEFORE the click. That is the
  // "never a silent dead button" criterion, and it is why these arms exist at all
  // rather than the buttons simply being left enabled to earn a typed refusal.
  // `armed` SURVIVES in this pane, narrowed to ONE reader: PEEK, inside
  // `LiarsDiceScene`, which is still a Main Action and still spends a die.
  const dareDisabledReason = !chosen
    ? 'Choose an opponent from the tables'
    : dareRounds.remaining <= 0
      ? 'The house has closed the table for tonight'
      : null;
  // The lending pair is free AND outside both caps (§3: the single-loan slot and
  // credits were always its real bounds), so it has no disabled reason left at
  // all — the engine's own `already-has-loan` / `insufficient-credits` refusals
  // render as notices, exactly as they did before.
  const loanDisabledReason: string | null = null;
  // T-132 · the same shape as `dareDisabledReason` — a social venue needs a
  // captain who is still at the tables. T-145: a ROAMING one. T-197: …and a play
  // left in the day's social pool.
  const socialDisabledReason = !chosenRoaming
    ? 'Choose someone at the tables'
    : socialPlays.remaining <= 0
      ? 'No social plays left today'
      : null;

  return (
    <section
      className="hangout-panel"
      data-testid="hangout-panel"
      role="dialog"
      aria-label="Spacers Cantina"
      // T-187 · Open only on step 7. `railsSuspended` covers a LIVE hand
      // (`game.dareHand`), so once the cards are dealt the table is fully
      // playable with no rails over it — which is what step 7 is asking for.
      {...railsProps(state, 'hangout')}
    >
      <header className="hp-head">
        {/* T-132 (F-101-6) · The house's AUTHORED name, in place of the generic
            literal that stood here since T-1404. Fourteen ports author one;
            `hangoutHouse` falls back to the engine's DEFAULT_PORT_HANGOUT row at a
            port that does not, so there is no UI-side default to drift. */}
        <h2 className="hp-title" data-testid="hangout-house">
          {house.houseName} · {systemName(game.player.currentSystemId)}
        </h2>
        {!locked && (
          <button
            className="sl-close"
            data-testid="hangout-close"
            aria-label="close"
            onClick={onClose}
          >
            &times;
          </button>
        )}
      </header>

      {/* The room-establishing line, when the port authors one. Absent ⇒ nothing
          renders here at all — never a placeholder. */}
      {house.roomLine && (
        <p className="hp-room-line" data-testid="hangout-room-line">
          {house.roomLine}
        </p>
      )}

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

      {/* ---- present NPCs (Dare opponent picker) ----
          T-136 · HIDDEN WHILE A HAND STANDS. The engine refuses EVERY
          `VisitHangout` behind `ActionBlocked{active-dare-hand}` (`day.ts`), so the
          opponent picker, the three social venues and Penny Wise's desk are all
          dead affordances until the table settles — precisely the class of bug
          `action-blocked-parity.spec.ts` exists to prevent. The rumor table is a
          FREE read (no action, no die) and stays. */}
      {!locked && (
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
                    {/* T-203 · The standing you already have with this captain,
                        BEFORE you commit to a hand — the same five bands the
                        combat header prints for a named interceptor, off the
                        `disposition` `hangoutNpcs` already carries. Rendered
                        unconditionally on a pool-B row: "No standing with you" is
                        the honest neutral baseline a grudge has to read
                        differently from. The house's own seats below get nothing
                        — pool A has no disposition to state. */}
                    <span className="hp-npc-tag" data-testid="hangout-npc-standing">
                      {' '}
                      · {dispositionHint(n.disposition)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---- T-145 · the house's own three seats (pool A) ----
          A SECOND, VISUALLY SEPARATE SECTION. These are the fixed Liar's Dice
          roster: they are always at their port (they take no part in the roam and
          cannot die), they are beat-ONCE for the completion sets, and their purses
          are finite and never regenerate. A beaten seat is marked and still
          playable — a rematch pays normally, it simply records nothing. A BROKE
          seat is disabled with its reason, because the engine refuses it with
          `HangoutEvent{failReason:'opponent-broke'}` before the die is spent, and
          a button that can only fail is the class of bug the venue gates exist to
          prevent. */}
      {!locked && roster.length > 0 && (
        <div className="hp-section">
          <div className="hp-shead">THE HOUSE&apos;S OWN</div>
          <ul className="hp-npcs">
            {roster.map((r) => (
              <li key={r.id}>
                <button
                  className={chosen === r.id ? 'hp-npc on' : 'hp-npc'}
                  data-testid="hangout-roster-opponent"
                  data-npc-id={r.id}
                  data-beaten={String(r.beaten)}
                  data-broke={String(r.broke)}
                  disabled={r.broke}
                  aria-pressed={chosen === r.id}
                  title={
                    r.broke
                      ? 'They are cleaned out — that seat will not take a wager.'
                      : r.beaten
                        ? 'Already beaten — a rematch pays, but records nothing.'
                        : 'Sit down against the house'
                  }
                  onClick={() => setOpponentId(r.id)}
                >
                  <span className="hp-npc-name">{r.name}</span>
                  {r.beaten && <span className="hp-npc-tag"> · beaten</span>}
                  {r.broke && <span className="hp-npc-tag"> · cleaned out</span>}
                  {/* T-146 · "Read the Table", at unlock tier ≥ 3 only. Absent on a
                      'mixed' seat by ruling — that read does not exist until the
                      hand resolves the mix at open, and it arrives then on
                      `DareHandStarted.opponentRead`. Nothing renders, never a
                      placeholder. */}
                  {r.read && (
                    <span className="hp-npc-tag" data-testid="hangout-roster-read">
                      {' '}
                      · {r.read}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---- Liar's Dice (the Spacer's Dare) ----
          T-136 · A THREE-STATE BLOCK. Idle: the wager input + "wager a die", which
          is still how a hand OPENS. Live: the table itself, driven by
          `dareScene`'s fog projection. Settled: the reveal frame, dismissible back
          to idle. The three are mutually exclusive by construction — a hand is
          open or it is not. */}
      <div className="hp-section hp-dare">
        <div className="hp-shead">SPACER&apos;S DARE</div>
        <VenueFlavour line={house.flavour.dare} venue="dare" />
        {scene === null && state.dareReveal === null && (
          <div className="hp-dare-controls">
            <label className="hp-wager">
              {/* T-146 · At unlock tier 5 the band clamp is gone at BOTH ends, so
                  `bounds.max` is null and there is no ceiling to print — rendering
                  the range would read "WAGER 0– cr". The solvency clamp still
                  applies; it is simply not a band. */}
              <span className="hp-k" data-testid="dare-wager-bounds">
                {bounds.max === null
                  ? `WAGER ${bounds.min}+ cr · no ceiling`
                  : `WAGER ${bounds.min}–${bounds.max} cr`}
              </span>
              <input
                aria-label="wager amount"
                data-testid="dare-wager"
                inputMode="numeric"
                value={wager}
                onChange={(e) => setWager(Math.max(0, Number.parseInt(e.target.value, 10) || 0))}
              />
            </label>
            {/* T-197 · THE ROUNDS LEFT, VISIBLE BEFORE THE CLICK (§4b). Without
                this the cap's typed refusal would be the first the player hears
                of it, which is the "silent dead button" the Accept criterion
                forbids. `perDay` scales with the Liar's Dice unlock tier, so the
                line also teaches that playing well buys more table time. */}
            <span className="hp-k" data-testid="dare-rounds-left">
              ROUNDS {dareRounds.remaining}/{dareRounds.perDay} TODAY
            </span>
            <button
              className="btn"
              data-testid="dare-commit"
              disabled={dareDisabledReason !== null}
              title={dareDisabledReason ?? 'Seat yourself and deal a hand of Liar’s Dice'}
              onClick={() => chosen && visitDare(chosen, wager)}
            >
              {/* T-197 · "Wager a die" was literally true and is no longer — the
                  open is free, and the wager is credits. */}
              {dareDisabledReason ?? 'Deal a hand'}
            </button>
          </div>
        )}
        {(scene !== null || state.dareReveal !== null) && (
          <LiarsDiceScene
            view={scene}
            reveal={state.dareReveal}
            beats={state.dareBeats}
            armed={armed}
            reduced={state.reducedMotion || systemPrefersReducedMotion()}
            lastCheck={state.lastCheck}
            lastCheckKey={state.lastCheckKey}
          />
        )}
      </div>

      {/* ---- T-132 · the three social venues (F-101-4) ----
          `meet` / `befriend` / `insult` — authored at all fourteen ports since
          T-122–T-124 and, until this task, dispatchable from nowhere in the UI.
          Each control is gated on the SAME `venueOffered` predicate the engine
          refuses on, so a hall that seats no stranger simply shows no
          introduction; the whole section disappears when a port runs none of the
          three. No per-port branch: the gate is one call, evaluated identically
          everywhere. */}
      {!locked && socialVenues.length > 0 && (
        <div className="hp-section hp-social">
          <div className="hp-shead">THE ROOM</div>
          {/* T-197 · THE DAY'S SOCIAL PLAYS, VISIBLE BEFORE THE CLICK (§4a). The
              pool is what replaced the die for meet/befriend/insult, and a
              `social-limit-reached` refusal must never be the first the player
              hears of it. Read through `hangoutSocialPlays` → the engine's own
              `socialPlaysRemaining` + the content constant; the pane computes
              nothing. A FAILED befriend still spends one, which is why the count
              can fall without a warmth line appearing beside it. */}
          <div className="hp-terms" data-testid="social-plays-left">
            SOCIAL PLAYS {socialPlays.remaining}/{socialPlays.perDay} TODAY
          </div>
          {socialVenues.map((v) => (
            <div key={v} className="hp-social-venue">
              <button
                className="btn"
                data-testid="hangout-social"
                data-venue={v}
                disabled={socialDisabledReason !== null}
                title={socialDisabledReason ?? SOCIAL_TITLES[v]}
                onClick={() => chosen && visitSocial(v, chosen)}
              >
                {socialDisabledReason ?? SOCIAL_LABELS[v]}
              </button>
              <VenueFlavour line={house.flavour[v]} venue={v} />
            </div>
          ))}
          {socialOutcome && (
            <div
              className="hp-social-result"
              data-testid="social-outcome"
              data-venue={socialOutcome.venue}
            >
              {/* `befriend` is the only social venue that rolls; its check rides the
                  shared honest-dice readout exactly as the Dare's two do. */}
              {socialOutcome.check && (
                <CheckReadout
                  key={`sc-${state.lastCheckKey}`}
                  stat={socialOutcome.check.stat}
                  result={socialOutcome.check.result}
                  label={socialOutcome.npcName.toUpperCase()}
                  testid="social-check"
                />
              )}
              {/* Composed from the engine's numbers only. A zero delta is shown as a
                  zero (a failed charm check, or a port that authors `meet: 0`) —
                  an honest nothing, never a hidden one. */}
              <div
                className="hp-social-verdict"
                data-testid="social-result"
                data-delta={String(socialOutcome.dispositionDelta)}
              >
                {socialOutcome.npcName} ·{' '}
                {socialOutcome.dispositionDelta === 0 ? (
                  <b>no ground gained</b>
                ) : (
                  <b>{signedMargin(socialOutcome.dispositionDelta)} warmth</b>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- rumor table (engine's own hangoutRumors) ----
          T-132 · This table is a FREE read, rendered every frame — which is exactly
          why the seventh venue, `VisitHangout{rumor}`, gets no control: it would
          spend a die to produce these same lines. */}
      <div className="hp-section">
        <div className="hp-shead">RUMOR TABLE</div>
        <VenueFlavour line={house.flavour.rumor} venue="rumor" />
        <ul className="hp-rumors" data-testid="hangout-rumors">
          {rumors.map((line, i) => (
            <li key={i} className="hp-rumor" data-testid="hangout-rumor">
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* ---- Penny Wise's desk ----
          T-132 (F-123-1) · Gated on the SAME `venueOffered(systemId, 'borrow')`
          predicate `resolveVisitHangout` refuses on and `sim/protocol.ts` filters
          its legal actions with. Until that task the desk rendered unconditionally,
          so a row that omits `borrow`/`repay` advertised a credit desk it does not
          run and clicking it burned the player's attention on a typed refusal.
          `repay` is gated independently because a row may withhold either alone;
          both narrowings are CONTENT's.
          T-133 (owner ruling D7) · …and the BAND below is content's too. No
          authored row withholds the desk any more — Arcturus-6's garrison mess,
          which used to, now runs it against a 1,000cr ceiling instead — so the gate
          is currently the identity at all fourteen ports and the per-port
          difference the player actually sees is the principal band. The gate stays:
          a later row may close a desk again, and the pane must follow content
          either way. */}
      {!locked && offers('borrow') && (
        <div className="hp-section hp-lending">
          <div className="hp-shead">PENNY WISE&apos;S DESK</div>
          {/* The schedule, visible UP FRONT — no projected total (the engine still
            computes the realized dusk accrual). T-133: the BAND is the live port's
            (`lendingTerms` → `loanBandFor`); the rate and the term are still the
            global constants, because D7 made the depth per-port and left the price
            alone. */}
          <div className="hp-terms" data-testid="loan-terms">
            Penny Wise · {terms.minPrincipal}–{terms.maxPrincipal} cr · {terms.ratePercent}%/dusk ·{' '}
            {terms.termDays}-dusk term
          </div>
          <VenueFlavour line={house.flavour.borrow} venue="borrow" />
          {loan ? (
            <>
              <div className="hp-loan-status" data-testid="loan-status" data-status={loan.status}>
                OUTSTANDING <b>{loan.outstanding.toLocaleString()}cr</b> · borrowed{' '}
                {loan.principal.toLocaleString()}cr · DUE D{loan.dueDay} ·{' '}
                {loan.status.toUpperCase()}
              </div>
              {offers('repay') && (
                <>
                  <VenueFlavour line={house.flavour.repay} venue="repay" />
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
              )}
            </>
          ) : (
            <div className="hp-lend-controls">
              <input
                aria-label="loan principal"
                data-testid="loan-principal"
                inputMode="numeric"
                // T-133 · the DOM carries the PORT's band, so the bounds are
                // assertable without reading prose. Read off `lendingTerms`
                // (→ `loanBandFor`), never off a global constant.
                data-min={terms.minPrincipal}
                data-max={terms.maxPrincipal}
                value={principal}
                onChange={(e) =>
                  setPrincipal(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
                }
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
      )}
    </section>
  );
}

// =========================================================================
// T-136 · THE LIAR'S DICE TABLE
// (`docs/LIARS-DICE_REDESIGN.md`; the tabletop-ui house style)
// =========================================================================
//
// THE HIDDEN-DICE RULE, STATED AS CODE DISCIPLINE — this is the claim the e2e
// verifies, so it is written here rather than left to a reviewer's memory:
//
//   `LiarsDiceScene` receives a `DareSceneView` (the fog projection, which HAS NO
//   `dealerDice` FIELD) and, separately, a `DareRevealView | null` built from the
//   engine's own `DareHandResolved` event. A dealer cube is mounted from
//   `DareRevealView.dealerDice` and from the single peeked die, AND FROM NOWHERE
//   ELSE. There is no code path in this file from `game.dareHand.dealerDice` into
//   JSX — the component is never handed the `GameState` at all.
//
// Before the reveal, each dealer slot is a SHROUD: an element that contains no
// cube and carries no face data. `dare-dealer-die` therefore exists (four of
// them, always — the table has four cups) with `data-hidden="1"` and NO
// `data-face`, and `packages/ui/e2e/liars-dice.spec.ts` asserts exactly that at
// three separate frames of a live hand.

/** The canonical d6 pip layouts, as 3×3 grid cells. `a`..`g` are the seven
 *  positions a standard die face uses; the CSS gives each a grid area. */
const D6_PIPS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  1: ['d'],
  2: ['a', 'g'],
  3: ['a', 'd', 'g'],
  4: ['a', 'b', 'f', 'g'],
  5: ['a', 'b', 'd', 'f', 'g'],
  6: ['a', 'b', 'c', 'e', 'f', 'g'],
});

/**
 * A real CSS-3D d6 — six absolutely-positioned faces on a `preserve-3d` cube, no
 * WebGL and no 3D-engine dependency. THE FACE IS SELECTED BY A TRANSFORM ON THE
 * CUBE (`.d6[data-face]` in `theme.css`), never by re-ordering faces in the DOM:
 * every face is always mounted in the same order, so a die "showing 4" is the
 * same six elements a die "showing 1" is, rotated.
 */
function D6({ value, spin }: { value: number; spin?: boolean }) {
  return (
    <span className="d6-mount">
      <span className={spin ? 'd6-spin settling' : 'd6-spin'}>
        <span className="d6" data-face={value} aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <span key={f} className={`d6-face d6-f${f}`}>
              {D6_PIPS[f].map((p) => (
                <i key={p} className={`d6-pip d6-p${p}`} />
              ))}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/** The dealer's cup before the reveal: an opaque holo-shroud with NOTHING inside
 *  it. Deliberately its own component so "the shroud has no cube" is one fact in
 *  one place rather than a condition inside a bigger render. */
function DealerShroud() {
  return (
    <span className="ld-shroud" aria-hidden="true">
      <span className="ld-shroud-cup" />
    </span>
  );
}

const DARE_MOVE_LABEL: Readonly<Record<DareMoveKind, string>> = Object.freeze({
  bid: 'Open the bidding',
  'raise-face': 'Raise the face',
  'raise-quantity': 'Raise the count',
  'raise-both': 'Raise both',
  challenge: 'Call the bluff',
  fold: 'Fold',
  peek: 'Peek',
});

const DARE_OUTCOME_LINE: Readonly<Record<string, string>> = Object.freeze({
  'challenge-win': 'You took the pot',
  'challenge-loss': 'The house took the pot',
  'player-fold': 'You folded — the cup was never lifted',
  'dealer-fold': 'The dealer folded — the cup was never lifted',
  'timeout-fold': 'Dusk closed the table — the cup was never lifted',
});

function LiarsDiceScene({
  view,
  reveal,
  beats,
  armed,
  reduced,
  lastCheck,
  lastCheckKey,
}: {
  /** The fog projection of the LIVE hand. Null once the hand settles. */
  view: DareSceneView | null;
  /** The settled frame, off `DareHandResolved`. Null while the hand stands. */
  reveal: DareRevealView | null;
  beats: CockpitState['dareBeats'];
  armed: boolean;
  reduced: boolean;
  lastCheck: CockpitState['lastCheck'];
  lastCheckKey: number;
}) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // The dealer's synchronous answer (§9.4) has already happened by the time this
  // renders — there is no turn to wait for. This flag exists ONLY so the
  // whose-turn readout can name the beat that is playing out of the queue.
  const [dealerBeat, setDealerBeat] = useState(false);

  const bid = reveal ? reveal.bid : (view?.bid ?? null);
  const bidder = view?.bidder ?? null;
  const dealerName = view?.dealerName ?? reveal?.dealerName ?? 'the dealer';
  const playerDice = view ? view.playerDice : (reveal?.playerDice ?? []);
  const revealedDealerDice = reveal?.dealerDice ?? null;
  const dealerSlots = view
    ? view.dealerDieCount
    : // A settled FOLD reveals nothing (§6.1), so there is no revealed row to size
      // from — the house always seats `DARE_DICE_PER_SIDE`, and the engine says so.
      // T-146 · the house seats as many as the captain does, at every tier, so the
      // player's own revealed row is the right size for the shroud row. Both
      // arrays are always the same length and `DareHandResolved.playerDice` is
      // always present, so no new event field is owed. The constant is the
      // last-resort fallback only.
      (revealedDealerDice?.length ?? reveal?.playerDice.length ?? DARE_DICE_PER_SIDE);
  const history = view?.history ?? [];
  const legal = view?.legalMoves ?? [];

  // ---- the claim being composed (never a re-derivation of the lattice) ----
  const [quantity, setQuantity] = useState(1);
  const [face, setFace] = useState(1);
  const bidKey = bid ? `${bid.quantity}x${bid.face}` : 'none';
  useEffect(() => {
    // Re-seed the composer whenever the standing claim moves: the cheapest legal
    // raise is the sensible default, and the ceiling is the ENGINE's constant.
    if (bid) {
      // T-146 · the ceiling is the LIVE HAND's frozen `maxQuantity` (§8 row 45);
      // the constant is the fallback for the settled frame, where there is no view.
      setQuantity(Math.min(bid.quantity + 1, view?.maxQuantity ?? DARE_MAX_QUANTITY));
      setFace(bid.face);
    } else {
      // T-160 · The OPENING composer seeds at the engine's own opening floor
      // (§16.2 shape (b)): `minOpeningQuantity(own(face))`, not the literal 1. A
      // seed of 1 would open the pane on a claim the engine now refuses whenever
      // the captain holds a one — which is most hands — and the pane would read as
      // broken rather than as a rule. The FLOOR is the engine's function; the pane
      // only counts its own dice and asks.
      setFace(1);
      setQuantity(minOpeningQuantity((view?.playerDice ?? []).filter((die) => die === 1).length));
    }
  }, [bidKey]);

  // ---- the dealer's answer, played as a beat (never awaited) ----
  const beatKey = beats.map((b) => b.type).join('|') + `:${beats.length}`;
  useEffect(() => {
    const dealerAnswered = beats.some((b) => b.type === 'DareBidPlaced' && b.actor === 'dealer');
    if (!dealerAnswered || reduced) {
      // THE INSTANT RAIL: nothing is staged, the queue drains on this very render.
      setDealerBeat(false);
      clearDareBeats();
      return;
    }
    setDealerBeat(true);
    const t = setTimeout(() => {
      setDealerBeat(false);
      clearDareBeats();
    }, 620);
    return () => clearTimeout(t);
  }, [beatKey, reduced]);

  // The Hangout pane is a long scroll and the reveal is its dramatic moment; a
  // verdict that lands below the fold is a verdict the player does not see. Bring
  // the table into view whenever it opens or settles. `block: 'nearest'` so a
  // scene already on screen is left exactly where it is.
  useEffect(() => {
    sceneRef.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal, view === null]);

  // ---- the reveal timeline (the one job the animation library has) ----
  // Cinematic: dim the table, lift the four shrouds in stagger, land the verdict.
  // Reduced: THE TIMELINE IS NEVER CREATED, so the settled DOM is final on this
  // render — which is what makes the e2e non-flaky and the UI never input-blocked.
  useLayoutEffect(() => {
    const root = sceneRef.current;
    if (!root || !reveal || reduced) return;
    const cubes = root.querySelectorAll('.ld-dealer .d6-mount');
    const verdict = root.querySelector('.ld-verdict');
    const tl = gsap.timeline();
    timelineRef.current = tl;
    tl.fromTo(root, { '--ld-dim': 0 }, { '--ld-dim': 1, duration: 0.28, ease: 'power2.out' });
    tl.from(
      cubes,
      { opacity: 0, y: -14, scale: 0.82, duration: 0.42, stagger: 0.13, ease: 'power3.out' },
      '<0.1',
    );
    if (verdict) tl.from(verdict, { opacity: 0, y: 8, duration: 0.4, ease: 'power2.out' }, '-=0.1');
    tl.to(root, { '--ld-dim': 0, duration: 0.5, ease: 'power2.inOut' });
    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, [reveal, reduced]);

  const canMove = (m: DareMoveKind) => legal.includes(m);
  // T-146 · the engine's lattice, asked with the HAND's frozen ceiling. Still no
  // arithmetic here deciding what may be claimed.
  // T-160 · plus the opening floor's input (§16.2 shape (b)). `own` is a COUNT the
  // engine's own rule consumes, not a rule of the pane's — the pane still decides
  // nothing about what may be claimed.
  const claimOk = (m: DareMoveKind, q: number, f: number) =>
    isLatticeMove(
      bid,
      m,
      q,
      f,
      view?.maxQuantity ?? DARE_MAX_QUANTITY,
      (view?.playerDice ?? []).filter((die) => die === f).length,
    );

  return (
    <div
      className="ld-scene"
      data-testid="dare-scene"
      ref={sceneRef}
      // The decoration is SKIPPABLE, never awaited: a click lands the timeline.
      // (`progress()` returns the timeline for chaining, hence the discard.)
      onClick={() => {
        timelineRef.current?.progress(1);
      }}
    >
      {/* ---- the house's side of the table ---- */}
      <div className="ld-side ld-dealer">
        <div className="ld-seat" data-testid="dare-dealer-name">
          {dealerName.toUpperCase()}
        </div>
        {/* T-203 · The ROAMING dealer's standing with you, kept up for the life of
            the hand — the same disposition bands the combat header prints for a
            named interceptor, so a captain you insulted last week is recognisable
            across the table. `null` on a roster hand (pool A has no disposition),
            so nothing renders there at all — the `roomLine` convention, never a
            placeholder. Mutually exclusive with `tableTalk` below (that one is
            non-null only on a roster hand), so no roster DOM ordering moves. */}
        {view?.dealerHistory && (
          <p className="ld-tabletalk ld-dealer-standing" data-testid="dare-dealer-history">
            {view.dealerHistory}
          </p>
        )}
        {/* T-207 · The ROAMING captain's own voice, under their standing. Reuses
            `.ld-tabletalk` verbatim — this is the same KIND of thing as the roster
            seat's line below (an authored italic bark), so it must not grow a
            second set of spacing rules that could drift from it. `null` on a
            roster hand (the readout hard-nulls on a `ld-` id), so nothing renders
            and the pool-A DOM below is unmoved. Printed verbatim: no quote marks
            added, no case change. */}
        {view?.dealerTableTalk && (
          <p className="ld-tabletalk" data-testid="dare-dealer-table-talk">
            {view.dealerTableTalk}
          </p>
        )}
        {/* T-145 · The roster opponent's authored TABLE TALK, printed verbatim
            for the life of the hand. Absent on a roaming hand ⇒ nothing renders
            here at all, never a placeholder — the `roomLine` convention. */}
        {view?.tableTalk && (
          <p className="ld-tabletalk" data-testid="dare-table-talk">
            {view.tableTalk}
          </p>
        )}
        {/* T-146 · "READ THE TABLE" — the engine's own line, unlocked at tier ≥ 3.
            Absent below that ⇒ nothing renders at all, never a placeholder. The
            pane maps nothing here; it prints the string the engine emitted. */}
        {view?.opponentRead && (
          <p className="ld-tabletalk ld-read" data-testid="dare-table-read">
            {view.opponentRead}
          </p>
        )}
        <div className="ld-dice">
          {Array.from({ length: dealerSlots }, (_, i) => {
            // THE ONLY TWO SOURCES OF A DEALER FACE, both from the engine:
            const shown =
              revealedDealerDice?.[i] ??
              (view?.peeked && view.peeked.index === i ? view.peeked.value : null);
            const peeked = !revealedDealerDice && shown !== null;
            return (
              <span
                key={i}
                // `dare-dealer-face` is a REVEAL-ONLY class — it exists in the
                // markup on the settled challenge frame and at no other moment,
                // which is what lets the e2e sweep the scene's whole innerHTML for
                // the string instead of trusting a selector.
                className={
                  revealedDealerDice
                    ? 'ld-die dare-dealer-face'
                    : peeked
                      ? 'ld-die peeked'
                      : 'ld-die hidden'
                }
                data-testid="dare-dealer-die"
                {...(shown === null ? { 'data-hidden': '1' } : { 'data-face': String(shown) })}
                {...(peeked ? { 'data-peeked': '1' } : {})}
              >
                {shown === null ? <DealerShroud /> : <D6 value={shown} spin={!reduced} />}
              </span>
            );
          })}
        </div>
      </div>

      {/* ---- the table itself: the standing claim + whose call it is ---- */}
      <div className="ld-table">
        {bid ? (
          <div
            className="ld-bid"
            data-testid="dare-bid"
            data-quantity={String(bid.quantity)}
            data-face={String(bid.face)}
          >
            <b>{bid.quantity}</b>
            <span className="ld-x">&times;</span>
            <b>{bid.face}</b>
            <span className="ld-bid-owner">
              {reveal
                ? 'the standing claim'
                : bidder === 'player'
                  ? 'your claim'
                  : `${dealerName}’s claim`}
            </span>
          </div>
        ) : (
          <div className="ld-bid empty">NO CLAIM ON THE TABLE</div>
        )}
        {view && (
          <div
            className="ld-turn"
            data-testid="dare-turn"
            data-actor={dealerBeat ? 'dealer' : 'player'}
          >
            {dealerBeat ? 'THE DEALER ANSWERS…' : 'YOUR CALL'}
          </div>
        )}
      </div>

      {/* ---- your side ---- */}
      <div className="ld-side ld-player">
        <div className="ld-seat">YOUR HAND</div>
        <div className="ld-dice">
          {playerDice.map((v, i) => (
            <span
              key={i}
              className="ld-die"
              data-testid="dare-player-die"
              data-face={String(v)}
              aria-label={`your die ${i + 1}, showing ${v}`}
            >
              <D6 value={v} spin={!reduced} />
            </span>
          ))}
        </div>
      </div>

      {/* ---- the ledger. Every number off the projection / the event; the ante
              and the headroom are the ENGINE's `anteFor` / `headroomFor`. ---- */}
      {view && (
        <div className="ld-ledger">
          <span className="ld-cell">
            SEED <b>{view.seedWager}</b>
          </span>
          <span className="ld-cell" data-testid="dare-ante">
            ANTE <b>{view.ante}</b>
          </span>
          <span className="ld-cell" data-testid="dare-pot-player">
            YOUR STAKE <b>{view.potPlayer}</b>
          </span>
          <span className="ld-cell" data-testid="dare-pot-dealer">
            HOUSE STAKE <b>{view.potDealer}</b>
          </span>
          <span className="ld-cell" data-testid="dare-headroom">
            ROOM LEFT <b>{view.playerHeadroom}</b>
          </span>
        </div>
      )}

      {/* ---- the public record of the hand ---- */}
      {history.length > 0 && (
        <ol className="ld-history" data-testid="dare-history">
          {history.map((h, i) => (
            <li
              key={i}
              className={h.actor === 'player' ? 'ld-hrow you' : 'ld-hrow house'}
              data-testid="dare-history-entry"
              data-actor={h.actor}
              data-move={h.move}
            >
              <span className="ld-hactor">{h.actor === 'player' ? 'YOU' : 'HOUSE'}</span>
              <span className="ld-hclaim">
                {h.quantity} &times; {h.face}
              </span>
              <span className="ld-hmove">{DARE_MOVE_LABEL[h.move]}</span>
              <span className="ld-hante">{h.antePaid > 0 ? `−${h.antePaid}cr` : '—'}</span>
            </li>
          ))}
        </ol>
      )}

      {/* ---- the peek's honest roll, when one was made ---- */}
      {view && lastCheck && lastCheck.context === 'gamble' && (
        <CheckReadout
          key={`peek-${lastCheckKey}`}
          stat={lastCheck.stat}
          result={lastCheck.result}
          label="PEEK"
          testid="dare-peek-check"
        />
      )}

      {/* ---- the controls, rendered FROM `legalDareMoves` ----
              One button per legal KIND, and every composed claim validated with the
              engine's own `isLatticeMove`. There is no arithmetic here deciding
              what may be claimed — that would be the pane owning a rule. */}
      {view && (
        <div className="ld-moves">
          {(canMove('bid') || canMove('raise-quantity') || canMove('raise-both')) && (
            <label className="ld-input">
              <span className="ld-k">COUNT</span>
              <input
                aria-label="claim quantity"
                data-testid="dare-quantity"
                inputMode="numeric"
                data-max={String(view?.maxQuantity ?? DARE_MAX_QUANTITY)}
                value={quantity}
                onChange={(e) => setQuantity(Number.parseInt(e.target.value, 10) || 0)}
              />
            </label>
          )}
          {canMove('bid') && (
            <label className="ld-input">
              <span className="ld-k">FACE</span>
              <input
                aria-label="claim face"
                data-testid="dare-face"
                inputMode="numeric"
                data-max={String(DARE_MAX_FACE)}
                value={face}
                onChange={(e) => setFace(Number.parseInt(e.target.value, 10) || 0)}
              />
            </label>
          )}
          {canMove('bid') && (
            <button
              className="btn"
              data-testid="dare-move"
              data-move="bid"
              disabled={!claimOk('bid', quantity, face)}
              title={`Claim ${quantity} × ${face} across all eight dice`}
              onClick={() => dareMove('bid', quantity, face)}
            >
              {DARE_MOVE_LABEL.bid} · {quantity}&times;{face}
            </button>
          )}
          {canMove('raise-quantity') && bid && (
            <button
              className="btn"
              data-testid="dare-move"
              data-move="raise-quantity"
              disabled={!claimOk('raise-quantity', quantity, bid.face)}
              title={`Raise to ${quantity} × ${bid.face} for ${view.ante}cr`}
              onClick={() => dareMove('raise-quantity', quantity, bid.face)}
            >
              {DARE_MOVE_LABEL['raise-quantity']} · {quantity}&times;{bid.face}
            </button>
          )}
          {canMove('raise-face') && bid && (
            <button
              className="btn"
              data-testid="dare-move"
              data-move="raise-face"
              title={`Raise to ${bid.quantity} × ${bid.face + 1} for ${view.ante}cr`}
              onClick={() => dareMove('raise-face', bid.quantity, bid.face + 1)}
            >
              {DARE_MOVE_LABEL['raise-face']} · {bid.quantity}&times;{bid.face + 1}
            </button>
          )}
          {canMove('raise-both') && bid && (
            <button
              className="btn"
              data-testid="dare-move"
              data-move="raise-both"
              disabled={!claimOk('raise-both', quantity, bid.face + 1)}
              title={`Raise to ${quantity} × ${bid.face + 1} for ${2 * view.ante}cr`}
              onClick={() => dareMove('raise-both', quantity, bid.face + 1)}
            >
              {DARE_MOVE_LABEL['raise-both']} · {quantity}&times;{bid.face + 1}
            </button>
          )}
          {canMove('peek') && (
            <button
              className="btn ghost"
              data-testid="dare-move"
              data-move="peek"
              disabled={!armed}
              title={
                armed
                  ? `Spend a second die on a GUILE ${view.peekDc} check to see one of the house’s dice`
                  : 'Pick a second die to peek'
              }
              onClick={() => darePeek()}
            >
              {DARE_MOVE_LABEL.peek} · DC {view.peekDc}
            </button>
          )}
          {canMove('challenge') && (
            <button
              className="btn"
              data-testid="dare-move"
              data-move="challenge"
              title="Call the bluff — all eight dice come up"
              onClick={() => dareMove('challenge')}
            >
              {DARE_MOVE_LABEL.challenge}
            </button>
          )}
          {canMove('fold') && (
            <button
              className="btn ghost"
              data-testid="dare-move"
              data-move="fold"
              // T-221 · the SAME string the priced line below prints, so the hover
              // and the table can never drift apart.
              title={view.foldTrade.line}
              onClick={() => dareMove('fold')}
            >
              {DARE_MOVE_LABEL.fold}
            </button>
          )}
          {/* T-221 · WHAT THE FOLD COSTS AND WHAT IT BUYS (LD-26 / §17.7). The
              ruling prices FOLD in two currencies; until this line existed the
              player could see neither, which makes a priced purchase a trap.
              Every number is composed in `dareFoldTrade` off the live escrow and
              the port's own `dare` row — the pane holds no threshold, no formula
              and no branch that decides an outcome. `canMove('fold')` is the
              engine's own `legalMoves`, the same legality read every control
              above uses. */}
          {canMove('fold') && (
            <p
              className="ld-tabletalk ld-fold-trade"
              data-testid="dare-fold-trade"
              data-credits={String(view.foldTrade.creditsForfeited)}
              data-disposition={String(view.foldTrade.disposition ?? '')}
            >
              {view.foldTrade.line}
            </p>
          )}
        </div>
      )}

      {/* ---- the settled frame ---- */}
      {reveal && (
        <div className="ld-reveal" data-testid="dare-reveal" data-outcome={reveal.outcome}>
          <div className={reveal.creditsDelta >= 0 ? 'ld-verdict won' : 'ld-verdict lost'}>
            {DARE_OUTCOME_LINE[reveal.outcome] ?? reveal.outcome}
            {reveal.actualCount !== null && reveal.bid && (
              <span className="ld-count">
                {' '}
                · the table showed <b>{reveal.actualCount}</b> of face {reveal.bid.face} against a
                claim of <b>{reveal.bid.quantity}</b>
              </span>
            )}
          </div>
          {/* T-145 · The roster opponent's parting line — their `lines.win` when
              they took the pot, `lines.lose` when the captain did. The ENGINE
              picked the arm and put it on `DareHandResolved`; the pane prints it. */}
          {reveal.opponentLine && (
            <p className="ld-tabletalk" data-testid="dare-opponent-line">
              {reveal.opponentLine}
            </p>
          )}
          <div className="ld-deltas">
            <span data-testid="dare-credits-delta" data-delta={String(reveal.creditsDelta)}>
              <b>{signedMargin(reveal.creditsDelta)}cr</b>
            </span>
            <span data-testid="dare-disposition-delta" data-delta={String(reveal.dispositionDelta)}>
              {reveal.dealerName} · <b>{signedMargin(reveal.dispositionDelta)}</b> warmth
            </span>
          </div>
          <button className="btn" data-testid="dare-leave" onClick={() => clearDareReveal()}>
            Leave the table
          </button>
        </div>
      )}
    </div>
  );
}

// The Records overlay (T-309): the Registry of Deeds and the Nemesis file, in
// period voice. A dismissible overlay opened from the top controls (Escape to
// close), both sections pure reads of `game.player` via format.ts. The Registry
// shows the rank, the CURRENT RANK'S CITATION (T-1504c), deed count, next-rank
// progress and the earned-deed roll with its citation text; the Nemesis file shows
// the decoded-lore index (or its silent empty state when no fragments have been
// recovered).
function RecordsOverlay({ game, onClose }: { game: GameState; onClose: () => void }) {
  const [tab, setTab] = useState<'registry' | 'nemesis'>('registry');
  const registry = deedRegistry(game);
  // T-1703 · The demo's 'conqueror' lock. Null on a full build.
  const conquerorLock = demoLockNotice(game, 'conqueror');
  const standing = factionStanding(game);
  const nemesis = nemesisFile(game);
  const crossing = crossingStatus(game);

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
              {/* T-1504c · The current rank's authored citation (content
                  RENOWN_RANKS via format.ts `rankCitation`). The engine already
                  emitted this line as the one-frame rank-up wire moment; this is
                  the standing reader, so the text is legible after the ticker has
                  moved on. Prose, so it takes its own row — the bezel `rank` chip
                  stays a chip. */}
              <p className="rr-citation" data-testid="registry-rank-citation">
                {registry.rankCitation}
              </p>
              {/* T-1602b · The DURABLE reader of the persisted
                  `player.legacy.successionCount` (format.ts `deedRegistry`). The
                  succession notice is a moment; this is the record, and it is
                  still here after a reload. Rendered only above zero, matching
                  the ending screen's rule that a first-run spacer is not told
                  about a counter that reads zero. */}
              {registry.successionCount > 0 && (
                <span className="rr-successions" data-testid="registry-successions">
                  {registry.successionCount}{' '}
                  {registry.successionCount === 1 ? 'LICENCE PASSED ON' : 'LICENCES PASSED ON'}
                </span>
              )}
            </div>
            {/* T-1703 · THE CAPSTONE ROW. Always rendered, on both builds — the
                Registry ladder's top rung is part of the record whether or not you
                have reached it. On the DEMO build it additionally carries
                `data-demo-locked="conqueror"` and the authored tease, which is the
                third name on the task's gate list and the one thing the 33-day
                ceiling could NOT hold out on its own (a rank is content, not a
                depth). On the full build the row carries no lock attribute at all
                — the mirror assertion `e2e/demo-gate.spec.ts` makes, and what turns
                the demo half from a screenshot into a gate proof. */}
            <div
              className="registry-capstone"
              data-testid="registry-capstone"
              {...(conquerorLock !== null ? { 'data-demo-locked': 'conqueror' } : {})}
            >
              <span className="rr-label">CAPSTONE</span>
              <b className="rr-value" data-testid="registry-capstone-rank">
                {RENOWN_RANKS.CONQUEROR.label}
              </b>
              <p className="rr-citation" data-testid="registry-capstone-line">
                {conquerorLock ?? RENOWN_RANKS.CONQUEROR.citation}
              </p>
            </div>
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
            {/* T-1505b · THE CROSSING. The reader of the three crossing flags and
                of the engine's `quoteCrossingStake` ladder: while locked it names
                the single next unmet clause (never a wall of conditions); once the
                stake is signed it prints the receipt; after arrival it says so.
                Hidden entirely until at least one fragment is decoded, so the
                endgame is not spoiled on day one. Every number is engine/content —
                the pane owns no rule. */}
            {crossing.state !== 'hidden' && (
              <div
                className={`crossing crossing-${crossing.state}`}
                data-testid="crossing-status"
                data-crossing-state={crossing.state}
                data-crossing-reason={crossing.reason ?? undefined}
              >
                <div className="cr-head">
                  <span className="cr-label">THE CROSSING</span>
                  <span className="cr-dc" data-testid="crossing-dc">
                    PILOT DC {crossing.dc}
                  </span>
                </div>
                {crossing.state === 'locked' && (
                  <p className="cr-lock" data-testid="crossing-lock">
                    {crossing.lockText ?? 'The stake is ready to sign at Mizar-9.'}
                  </p>
                )}
                {crossing.state === 'committed' && (
                  <p className="cr-stake" data-testid="crossing-stake">
                    STAKE SIGNED · {(crossing.stakeCredits ?? 0).toLocaleString()} CR · DAY{' '}
                    {crossing.stakeDay ?? 0}
                  </p>
                )}
                {crossing.state === 'crossed' && (
                  <p className="cr-stake" data-testid="crossing-crossed">
                    CROSSED — the carrier wave has stopped counting.
                  </p>
                )}
              </div>
            )}
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
          DAY <b data-testid="day">{game.day}</b> · DOCKED AT{' '}
          <b data-testid="docked-at">{systemName(p.currentSystemId)}</b> ·{' '}
          {/* T-1602a · The campaign era gets a handle. This line is the ONLY
              player-visible surface of T-1301's dusk-of-day-30 TOUR_ONE→VETERAN
              flip, and nothing asserted it — the flip was a receipt, not a read.
              READER: e2e/tour-one-career.spec.ts, which asserts 'Frontier Era' on
              day 30 and 'Veteran' after the ceremony on BOTH resolution branches
              (day.ts:866-885 flips the era whether or not the marker cleared).
              `docked-at` is read by the same spec's per-day run-report row. */}
          <b data-testid="campaign-era">{game.era === 'TOUR_ONE' ? 'Frontier Era' : 'Veteran'}</b>
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

// ===========================================================================
// T-215 · THE GLOBE'S INPUT LAYER AND ITS TEXT METRICS.
//
// REAL RENDERED TEXT METRICS, NOT A CHARACTER-WIDTH GUESS. The T-188 mockup
// approximated a label's width as `0.6 × font-size` per character and the ruling
// recorded that it visibly UNDER-measured, which is why 4B's own collision
// survey read low. The shipped build measures the actual glyph advances of the
// actual font through a canvas, keyed on the computed font string so a text-size
// change or a late webfont re-measures rather than shipping stale boxes.
//
// THE FONT ARRIVES LATE, AND THAT MATTERS. `index.html` pulls Chakra Petch and
// IBM Plex Mono from Google Fonts asynchronously (and a packaged offline launch
// never gets them at all), so the FIRST measurement is of a fallback stack whose
// advances differ from Plex Mono's. `document.fonts.ready` + `loadingdone` clear
// the cache and re-measure, so the suppression the player sees is computed
// against the type they are actually reading.
// ===========================================================================

/** Only reached with no canvas at all (SSR, a DOM-less test env). Deliberately
 *  PESSIMISTIC — wider than IBM Plex Mono's 0.6em and wider than every fallback
 *  in `--font-data` — so a degraded environment over-suppresses rather than
 *  shipping overlapping labels. It is never the production path. */
const GLOBE_LABEL_FONT_PX = 8;
const GLOBE_FALLBACK_METRICS: LabelMetrics = {
  widthOf: (text) => text.length * GLOBE_LABEL_FONT_PX * 0.62,
  ascent: GLOBE_LABEL_FONT_PX * 0.85,
  descent: GLOBE_LABEL_FONT_PX * 0.35,
};

let labelCtx: CanvasRenderingContext2D | null | undefined;
function measureContext(): CanvasRenderingContext2D | null {
  if (labelCtx === undefined) {
    try {
      labelCtx = document.createElement('canvas').getContext('2d');
    } catch {
      labelCtx = null;
    }
  }
  return labelCtx;
}

/** `${font}|${text}` → advance width. Cleared whenever the font changes. */
const labelWidths = new Map<string, number>();

/** Build metrics from a PROBE that is a real `.smlabel` inside the real SVG, so
 *  the computed font is whatever the cascade actually resolved — not a font
 *  string this file guessed at and would have to keep in sync with `theme.css`. */
function buildLabelMetrics(probe: SVGTextElement | null): LabelMetrics {
  const ctx = typeof document === 'undefined' ? null : measureContext();
  if (!ctx || !probe) return GLOBE_FALLBACK_METRICS;
  const cs = getComputedStyle(probe);
  const font =
    cs.font && cs.font.trim().length > 0
      ? cs.font
      : `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  ctx.font = font;
  const px = Number.parseFloat(cs.fontSize) || GLOBE_LABEL_FONT_PX;
  const m = ctx.measureText('Mg');
  // Font-box metrics where the browser exposes them: they bound EVERY glyph of
  // the face, so a name with a descender ('Procyon-5') cannot outgrow its box.
  const ascent = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || px * 0.85;
  const descent = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || px * 0.35;
  // `.smlabel` paints a `--well` halo UNDER the glyphs (`paint-order: stroke`),
  // so its rendered extent is the advance PLUS the stroke — half of it on each
  // side. Measure what is actually on screen, or the e2e proof that reads
  // `getBoundingClientRect()` would be measuring a different box than this does.
  const halo = Number.parseFloat(cs.strokeWidth) || 0;
  return {
    widthOf(text: string): number {
      const key = `${font}|${halo}|${text}`;
      const cached = labelWidths.get(key);
      if (cached !== undefined) return cached;
      ctx.font = font;
      const w = ctx.measureText(text).width + halo;
      labelWidths.set(key, w);
      return w;
    },
    ascent: ascent + halo / 2,
    descent: descent + halo / 2,
  };
}

/** The camera the globe opens on, and the one RESET returns to. */
const GLOBE_HOME: GlobeView = { yaw: 0.62, pitch: 0.34, zoom: 1 };
const GLOBE_DRAG_RADIANS_PER_PX = 0.011;
const GLOBE_KEY_STEP = 0.18;
const GLOBE_ZOOM_STEP = 1.25;
/** Pointer travel, in CSS px, above which a gesture is a ROTATION and the click
 *  it ends on must not also plot a course. Tap-vs-drag is load-bearing: the drag
 *  surface is the SVG and every node click bubbles through it. */
const GLOBE_TAP_SLOP_PX = 4;

// The coordinate-accurate starmap (T-304), rebuilt by T-215 as the rotatable 3D
// lat/long globe T-188 ruled for (candidate 4B). Plan a jump entirely here: pick
// a die from the hand, click a reachable system to preview the engine's own fuel
// cost / DC / danger, then commit. Every rule number is read from the engine (via
// format.ts helpers) — the UI only projects coordinates and gates clicks.
function Starmap({ state }: { state: CockpitState }) {
  const game = state.game;
  const [target, setTarget] = useState<number | null>(null);
  const here = game.player.currentSystemId;

  // ---- T-215 · the camera. EPHEMERAL, and never persisted: a yaw in a save
  // file would owe a migration for a value with no gameplay meaning. ----
  const [view, setView] = useState<GlobeView>(GLOBE_HOME);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [grabbing, setGrabbing] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const probeRef = useRef<SVGTextElement | null>(null);
  /** pointerId → last client position. Two entries means a pinch. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  /** Total pointer travel of the gesture in flight — the tap-vs-drag test. */
  const travelled = useRef(0);

  // Re-measure on mount (the probe does not exist on the first render) and
  // whenever the player changes text size.
  const [fontTick, setFontTick] = useState(0);
  useLayoutEffect(() => {
    labelWidths.clear();
    setFontTick((t) => t + 1);
  }, [state.textSize]);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) return;
    let live = true;
    const remeasure = () => {
      if (!live) return;
      labelWidths.clear();
      setFontTick((t) => t + 1);
    };
    void fonts.ready?.then(remeasure).catch(() => {});
    fonts.addEventListener?.('loadingdone', remeasure);
    return () => {
      live = false;
      fonts.removeEventListener?.('loadingdone', remeasure);
    };
  }, []);
  const metrics = useMemo(() => buildLabelMetrics(probeRef.current), [fontTick]);

  // ---- T-215 · POINTER EVENTS ONLY, and NO pointer capture. ----
  //
  // ROOT CAUSE OF THE T-188 MOBILE FAILURE, cause (a), measured rather than
  // asserted (see `e2e/starmap-globe-touch.spec.ts`): the prototype drove its
  // drag from `mousedown/mousemove/mouseup` and set no `touch-action`, so on a
  // touch device the handlers never fired AND the browser claimed the gesture
  // for panning before they could have. One Pointer-Events path plus
  // `touch-action: none` covers mouse, touch and pen with the same code.
  //
  // Capture is DELIBERATELY not used: `setPointerCapture` retargets the
  // subsequent compatibility mouse events (and therefore `click`) to the capture
  // element in Chromium, which would swallow every node click on the map. Window
  // listeners give the same "keep tracking outside the element" behaviour with no
  // effect on click targeting.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const start = pinch.current;
        if (!start) return;
        travelled.current += Math.abs(dist - start.dist);
        setView((v) => clampGlobeView({ ...v, zoom: start.zoom * (dist / start.dist) }));
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      travelled.current += Math.abs(dx) + Math.abs(dy);
      setView((v) =>
        clampGlobeView({
          ...v,
          yaw: v.yaw + dx * GLOBE_DRAG_RADIANS_PER_PX,
          pitch: v.pitch + dy * GLOBE_DRAG_RADIANS_PER_PX,
        }),
      );
    };
    const onUp = (e: PointerEvent) => {
      if (!pointers.current.delete(e.pointerId)) return;
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) setGrabbing(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // React 19 attaches `onWheel` PASSIVELY, so a `preventDefault()` inside it
  // warns and does nothing — the page would scroll while the globe zoomed.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? GLOBE_ZOOM_STEP : 1 / GLOBE_ZOOM_STEP;
      setView((v) => clampGlobeView({ ...v, zoom: v.zoom * factor }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    travelled.current = 0;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: viewRef.current.zoom,
      };
    }
    setGrabbing(true);
  };

  /** True when the gesture that just ended was a rotation, so the click it
   *  produced must not also plot a course. */
  const wasDrag = () => travelled.current > GLOBE_TAP_SLOP_PX;

  const nudge = (dYaw: number, dPitch: number) =>
    setView((v) => clampGlobeView({ ...v, yaw: v.yaw + dYaw, pitch: v.pitch + dPitch }));
  const zoomBy = (factor: number) =>
    setView((v) => clampGlobeView({ ...v, zoom: v.zoom * factor }));

  // A POINTER-FREE PATH EXISTS BY CONSTRUCTION. Arrow keys rotate, +/− zoom, 0
  // resets — this is keyboard accessibility and, equally, the guaranteed
  // fallback if any platform ever swallows the gesture the way the T-188
  // prototype's did.
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const step = GLOBE_KEY_STEP;
    switch (e.key) {
      case 'ArrowLeft':
        nudge(-step, 0);
        break;
      case 'ArrowRight':
        nudge(step, 0);
        break;
      case 'ArrowUp':
        nudge(0, -step);
        break;
      case 'ArrowDown':
        nudge(0, step);
        break;
      case '+':
      case '=':
        zoomBy(GLOBE_ZOOM_STEP);
        break;
      case '-':
      case '_':
        zoomBy(1 / GLOBE_ZOOM_STEP);
        break;
      case '0':
        setView(GLOBE_HOME);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  // PERFORMANCE, not premature optimisation: `routePreview` is engine-backed and
  // the drag re-renders at pointer rate. Memoised on the game state, it runs once
  // per state change instead of once per node per frame; the globe itself then
  // only does trigonometry.
  const reachable = useMemo(() => {
    const set = new Set<number>();
    for (const sys of Object.values(STAR_SYSTEMS)) {
      if (sys.id === game.player.currentSystemId) continue;
      if (routePreview(game, sys.id).reachable) set.add(sys.id);
    }
    return set;
  }, [game]);

  const proj = starmapGlobe(game, view, metrics, {
    reachable,
    courseId: target,
    focusId: hover,
  });
  const visited = new Set(game.player.charts.visitedSystemIds);
  const npcCounts = knownNpcCounts(game);
  const eraSystems = new Set(game.eraEvent?.affectedSystemIds ?? []);
  const dieArmed = state.selectedDie !== null;

  // T-1403 · off-lane sweep affordances. The button gates on an armed die AND the
  // engine's own fuel affordability; the label mirrors the confirm-jump pattern,
  // naming the reason it is disabled (read from the engine preview, never invented).
  const sweep = explorationPreview(game);
  // T-111 · An open multi-day recovery is a commitment the player must be able to
  // SEE, and the verb it blocks must say so rather than fail silently. The
  // predicate is the engine's own (`player.recovery !== null` — the same one
  // `resolveExploration` refuses on and `legalActions` withholds on), read
  // through the pure `recoveryReadout`; no clock is recomputed in JSX.
  const recovery = recoveryReadout(game);
  const canSweep = dieArmed && sweep.canAfford && recovery === null;
  const sweepLabel =
    recovery !== null
      ? 'Salvage op under way'
      : !dieArmed
        ? 'Pick a die to sweep'
        : !sweep.canAfford
          ? `Need ${sweep.fuelCost} fuel`
          : 'Off-lane sweep';

  const hereNode = proj.here;
  // Paint order: far nodes first, then near ones — and the current system and the
  // set course last of all. Their labels are exempt from the dot obstacles by
  // ruling, so they are the only labels that can land on another system's mark,
  // and they must land ON TOP of it rather than under. `data-testid` /
  // `data-system-id` selectors are unaffected by DOM order.
  //
  // HOVER IS DELIBERATELY NOT IN THIS KEY, and the reason is a real bug that was
  // measured, not a style preference. Re-ordering on hover moved the node's `<g>`
  // among its siblings BETWEEN `mousedown` and `mouseup` — and Blink treats a
  // moved element as a broken click target, so no `click` was dispatched at all
  // and NO starmap node could be selected. A hovered label is revealed by CSS,
  // which needs no reorder.
  const paintRank = (id: number) => (id === here || id === target ? 1 : 0);
  // Near nodes paint over far ones. `data-testid`/`data-system-id` selectors are
  // unaffected by DOM order, and every node is rendered at every rotation.
  const painted = [...proj.nodes].sort(
    (a, b) => paintRank(a.id) - paintRank(b.id) || a.depth - b.depth,
  );
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

  // T-187 · On the walkthrough's step 4 the rails PIN the destination to the
  // hold's own contract, so the scripted jump ends in a real payout for step 5 to
  // point at rather than a jump to nowhere. Null on every other step and whenever
  // the walkthrough is not running, which is the starmap's ordinary "no lock".
  const railsTarget = walkthroughJumpTarget(state.walkthrough, game);

  return (
    <section className="pane starmap">
      <header>
        <h2>Starmap</h2>
        <span className="tag">{visited.size} CHARTED</span>
      </header>
      <div className="body">
        {/* T-187 · The PLOT group — the chart and the route/commit readout — is
            the `starmap` rails region. It is a wrapper INSIDE `.pane.starmap`
            rather than the pane itself, deliberately: the off-lane sweep below is
            a region of its own (step 6), and an `inert` ancestor could never be
            un-inerted by it. */}
        <div className="sm-plot" {...railsProps(state, 'starmap')}>
          <svg
            ref={svgRef}
            className={grabbing ? 'smsvg grabbing' : 'smsvg'}
            viewBox={proj.viewBox}
            role="img"
            aria-label="Starmap"
            preserveAspectRatio="xMidYMid meet"
            tabIndex={0}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}
          >
            {/* T-215 · The METRICS PROBE: a real `.smlabel` in the real SVG,
                under a real `.smsys.here`, so the canvas measures the font the
                cascade actually resolved rather than one this file guessed —
                including `.smsys.here .smlabel`'s `font-weight: 600`, the widest
                face any label renders in, which makes every measured box a
                pessimistic bound rather than an average. Hidden, inert, and
                deliberately not a `starmap-system`. */}
            <g className="smsys here" aria-hidden="true">
              <text className="smlabel probe" data-probe="1" ref={probeRef} x={-999} y={-999}>
                Mg
              </text>
            </g>
            {/* T-215 · the dotted lat/long wireframe. NO silhouette/emphasis ring
                is drawn — the ruling forbids one, and `starmap-globe.test.ts`
                pins its absence rather than trusting this comment. */}
            <g className="graticule">
              {proj.graticule.map((c, i) => (
                <path
                  key={i}
                  className={`gline ${c.kind}${c.back ? ' back' : ''}`}
                  data-back={c.back ? '1' : '0'}
                  d={c.d}
                />
              ))}
            </g>
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
            {/* T-215 · LANES. Dim from the ship — not from Sol — to every
                reachable system; the set course is the one bright lane. The hub
                is `hereNode`, whatever system that is; Sol only ever looked like
                the hub because the sample career happens to start docked there.
                The bright lane keeps the `route-line` / `route-line blocked`
                classes the flat map used, so its two meanings are unchanged. */}
            <g className="lanes">
              {proj.lanes.map((lane) => (
                <line
                  key={lane.toId}
                  className={
                    lane.bright ? (lane.reachable ? 'route-line' : 'route-line blocked') : 'smlane'
                  }
                  data-lane-to={lane.toId}
                  data-lane-bright={lane.bright ? '1' : '0'}
                  x1={lane.x1}
                  y1={lane.y1}
                  x2={lane.x2}
                  y2={lane.y2}
                />
              ))}
            </g>
            {painted.map((n) => {
              const isHere = n.id === here;
              const canReach = isHere ? true : reachable.has(n.id);
              const clickable = !isHere && canReach;
              // T-1505b · The event horizon reads differently from a port. The node
              // is only ever in `proj.nodes` at all once the crossing stake is paid
              // (format.ts `starmapGlobe`), so the tag doubles as the visible
              // proof the gate lifted; everything else about it (reachability, the
              // route preview, Confirm jump) is the ordinary travel path, reused.
              const isCrossing = n.id === NEMESIS_SYSTEM_ID;
              // T-187 · With a rails target pinned (step 4), every OTHER node is a
              // dead click and says so in the DOM — the scripted jump is the
              // contract's own destination or nothing.
              const railsLocked = railsTarget !== null && n.id !== railsTarget;
              const cls = [
                'smsys',
                isHere ? 'here' : visited.has(n.id) ? 'visited' : 'unvisited',
                n.isRim ? 'rim' : '',
                isCrossing ? 'crossing' : '',
                !isHere && !canReach ? 'unreachable' : '',
                target === n.id ? 'sel' : '',
                // T-215 · the far hemisphere is DIMMED, never culled: it stays
                // rendered, `data-reachable`-accurate and clickable, because
                // hiding a destination the engine will happily fly to is a bug.
                n.front ? '' : 'back',
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
                  data-crossing={isCrossing ? '1' : undefined}
                  data-reachable={canReach ? '1' : '0'}
                  data-visited={visited.has(n.id) ? '1' : '0'}
                  data-here={isHere ? '1' : '0'}
                  data-depth={Math.round(n.depth * 100) / 100}
                  data-label-hidden={n.labelVisible ? '0' : '1'}
                  data-rails-locked={railsLocked ? '1' : undefined}
                  data-rails-target={railsTarget === n.id ? '1' : undefined}
                  aria-label={n.name}
                  aria-disabled={clickable && !railsLocked ? undefined : 'true'}
                  onPointerEnter={() => setHover(n.id)}
                  onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  onClick={
                    clickable && !railsLocked
                      ? () => {
                          // Tap, not the tail of a rotation. Without this every
                          // drag that ends over a node would also plot a course.
                          if (wasDrag()) return;
                          setTarget(n.id);
                        }
                      : undefined
                  }
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
                  {/* A suppressed label is RENDERED and hidden in CSS, not
                      omitted: hovering it is what brings it back, and a node
                      that keeps its text node is cheaper to reveal. */}
                  <text
                    className="smlabel"
                    data-hidden={n.labelVisible || hover === n.id ? undefined : '1'}
                    x={0}
                    y={16}
                  >
                    {n.name}
                  </text>
                  {/* T-215 · The hit target is a CIRCLE sized by `starmapGlobe`
                      to this node's nearest on-screen neighbour, so no node can
                      ever swallow another's click as the globe turns. */}
                  <circle className="smhit" r={n.hitRadius} />
                </g>
              );
            })}
          </svg>
          {/* T-215 · The pointer-free control path. Zoom and reset without a
              gesture — accessibility, and the standing fallback if a platform
              ever swallows touch the way the T-188 prototype's did. */}
          <div className="globe-ctl" data-testid="globe-controls">
            <button
              type="button"
              className="gctl"
              data-testid="globe-zoom-out"
              aria-label="Zoom out"
              onClick={() => zoomBy(1 / GLOBE_ZOOM_STEP)}
              disabled={proj.scale <= 0 || view.zoom <= GLOBE_MIN_ZOOM}
            >
              &minus;
            </button>
            <button
              type="button"
              className="gctl"
              data-testid="globe-zoom-in"
              aria-label="Zoom in"
              onClick={() => zoomBy(GLOBE_ZOOM_STEP)}
              disabled={view.zoom >= GLOBE_MAX_ZOOM}
            >
              +
            </button>
            <button
              type="button"
              className="gctl"
              data-testid="globe-reset"
              aria-label="Reset view"
              onClick={() => setView(GLOBE_HOME)}
            >
              RESET
            </button>
          </div>

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
        </div>

        {/* T-1403 · Off-lane sweep. The starmap is a pure client of the engine's
            Explore action: the DC / fuel cost / effective modifier are read from
            the engine+content (explorationPreview), the sweep routes through the
            store's single `explore()` verb, and the loot / nav-check outcome reads
            below via `explorationOutcome` + the shared PILOT CheckBreakdown. */}
        <div
          className="explore-sweep"
          data-testid="explore-panel"
          {...railsProps(state, 'explore')}
        >
          <div className="es-head">OFF-LANE SWEEP</div>
          <div className="es-cost" data-testid="explore-cost">
            PILOT DC {sweep.dc} · FUEL {sweep.fuelCost} · NAV{' '}
            {signedMargin(sweep.effectiveModifier)}
          </div>
          {recovery && (
            <div className="es-recovery" data-testid="explore-recovery">
              SALVAGE OP · {recovery.outcomeName} at {recovery.systemName} ·{' '}
              {recovery.daysRemaining === 0
                ? 'lifts at dusk'
                : `${recovery.daysRemaining} day${recovery.daysRemaining === 1 ? '' : 's'} to go`}{' '}
              · hold station or lose it
            </div>
          )}
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

// T-189 · One hull mark. The shapes come from `format.ts`'s geometry table; this
// only chooses the SVG element. Every mark is decorative (`pointer-events: none`
// in CSS) — the callout div over it is what a player clicks.
function ShipMark({ mark }: { mark: ShipDiagramMark }) {
  switch (mark.kind) {
    case 'rect':
      return <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx={mark.rx} />;
    case 'ellipse':
      return <ellipse cx={mark.cx} cy={mark.cy} rx={mark.rx} ry={mark.ry} />;
    case 'path':
      return <path d={mark.d} />;
  }
}

/** viewBox unit -> percentage of the diagram box. The SVG is drawn with
 *  `preserveAspectRatio="xMidYMid meet"` at `width:100%; height:auto`, so its
 *  box is EXACTLY the viewBox aspect and these percentages land on the same
 *  point the SVG drew. */
function pct(v: number, span: number): string {
  return `${((v / span) * 100).toFixed(3)}%`;
}

/** The leader line for a region: from the point ON the hull toward its callout,
 *  stopping `TICK` units short so the line ends at the edge of the text instead
 *  of running under it. Direction-agnostic, so a callout may sit above, below or
 *  beside its mark without a second table of endpoints. */
const LEADER_TICK = 14;
function leaderEnd(g: { x: number; y: number; labelX: number; labelY: number }): {
  x: number;
  y: number;
} {
  const dx = g.x - g.labelX;
  const dy = g.y - g.labelY;
  const len = Math.hypot(dx, dy);
  if (len <= LEADER_TICK) return { x: g.x, y: g.y };
  return { x: g.labelX + (dx / len) * LEADER_TICK, y: g.labelY + (dy / len) * LEADER_TICK };
}

/**
 * T-189 · THE SHIP, DRAWN.
 *
 * The pane's numbers used to be a ledger: eight table rows plus a flat six-cell
 * strip, all legible and none of them locatable. Here the same numbers hang off
 * the part of the hull they describe — the hold's count sits IN the cargo bay,
 * the fuel curve sits AT the engine bells, the berths sit at the cabin.
 *
 * TWO STRUCTURAL CHOICES worth stating, because they are not obvious:
 *
 *  · THE CALLOUTS ARE HTML, ABSOLUTELY POSITIONED OVER THE SVG, not `<text>`
 *    inside it. Two reasons, both hard: (1) SVG text scales with the viewBox, so
 *    a narrow column would shrink the instrument data below legibility, while
 *    HTML text stays at its CSS size; (2) `SVGElement` has no `innerText`, and
 *    `shipyard.spec.ts` reads `fuel-per-jump` with `Number(await ...innerText())`
 *    — that spec must pass UNMODIFIED, which is the mechanical proof that this
 *    task re-presented the data rather than losing it.
 *
 *  · THE DIAGRAM IS THE READOUT; THE BENCH BELOW IS THE CONTROLS. Clicking a
 *    region does not buy anything — it scrolls that system's existing bench row
 *    into view and flashes it. Nothing about the ship model or the purchase path
 *    changed; this is render-layer only.
 */
function ShipDiagram({
  game,
  onFocusRegion,
}: {
  game: GameState;
  onFocusRegion: (id: ShipDiagramRegionId) => void;
}) {
  const model = shipDiagram(game);
  const W = SHIP_DIAGRAM_VIEWBOX.width;
  const H = SHIP_DIAGRAM_VIEWBOX.height;
  const hullPath = model.hullVariant === 'astraxial' ? ASTRAXIAL_PATH : JUNKER_PATH;

  // The hold meter: TEN segments lit in proportion to the hull's capacity, never
  // one cell per pod (`maxCargoPods` reaches 100). The exact numerals are in the
  // callout; the segments are texture, so you can see the hold is nearly empty
  // without reading a single digit.
  const bay = SHIP_DIAGRAM_BAY;
  const segInset = 8;
  const segPitch = (bay.w - segInset * 2) / SHIP_DIAGRAM_BAY_SEGMENTS;
  const segLit = Math.round(model.podFill * SHIP_DIAGRAM_BAY_SEGMENTS);
  const segUsed = Math.min(segLit, Math.round(model.podUseFill * SHIP_DIAGRAM_BAY_SEGMENTS));
  const segY = bay.y + bay.h - 20;
  const segH = 10;

  const regionClass = (r: ShipDiagramRegion, base: string): string =>
    [base, r.critical ? 'critical' : r.damaged ? 'damaged' : ''].filter(Boolean).join(' ');

  return (
    <div className="shipdiagram">
      <svg
        className="shipsvg"
        data-testid="ship-diagram"
        data-hull={model.hullVariant}
        viewBox={model.viewBox}
        role="img"
        aria-label={`Ship — ${model.hullVariant} hull, ${model.podsOwned} of ${model.podsMax} cargo pods, ${model.fuel} of ${model.maxFuel} fuel`}
        preserveAspectRatio="xMidYMid meet"
      >
        {model.regions.map((r) => {
          const g = SHIP_DIAGRAM_GEOMETRY[r.id];
          return (
            <g
              key={r.id}
              className={regionClass(r, `ship-mark mark-${r.id}`)}
              data-mark-region={r.id}
            >
              <title>{r.title}</title>
              {r.id === 'hull' && <path className="hull-outline" d={hullPath} />}
              {g.marks.map((mark, i) => (
                <ShipMark key={i} mark={mark} />
              ))}
              {g.leader && (
                <line
                  className="rg-leader"
                  x1={g.x}
                  y1={g.y}
                  x2={leaderEnd(g).x}
                  y2={leaderEnd(g).y}
                />
              )}
            </g>
          );
        })}

        {/* The hold's fill meter, drawn inside the bay it measures. */}
        <g className="bay-meter" data-testid="bay-meter" data-lit={segLit} data-used={segUsed}>
          {Array.from({ length: SHIP_DIAGRAM_BAY_SEGMENTS }).map((_, i) => (
            <rect
              key={i}
              className={i < segUsed ? 'bay-seg used' : i < segLit ? 'bay-seg lit' : 'bay-seg'}
              x={bay.x + segInset + i * segPitch}
              y={segY}
              width={segPitch - 2}
              height={segH}
            />
          ))}
        </g>

        {/* The fuel bar, under the drives it feeds. */}
        <g className="fuel-bar">
          <rect
            className="fb-track"
            x={SHIP_DIAGRAM_FUEL_BAR.x}
            y={SHIP_DIAGRAM_FUEL_BAR.y}
            width={SHIP_DIAGRAM_FUEL_BAR.w}
            height={SHIP_DIAGRAM_FUEL_BAR.h}
            rx={2}
          />
          <rect
            className="fb-fill"
            data-testid="fuel-bar-fill"
            x={SHIP_DIAGRAM_FUEL_BAR.x}
            y={SHIP_DIAGRAM_FUEL_BAR.y}
            width={SHIP_DIAGRAM_FUEL_BAR.w * model.fuelFill}
            height={SHIP_DIAGRAM_FUEL_BAR.h}
            rx={2}
          />
        </g>

        {/* T-112 salvaged fittings as pips clamped to the hull spine. The named
            list stays below the diagram, unchanged — these only say "something
            is fitted, and it is part of this ship". */}
        {model.fittings.map((f, i) => (
          <g
            className="hull-fitting"
            key={f.id}
            transform={`translate(${SHIP_DIAGRAM_FITTING_ORIGIN.x + i * SHIP_DIAGRAM_FITTING_ORIGIN.step} ${SHIP_DIAGRAM_FITTING_ORIGIN.y})`}
          >
            <title>{f.name}</title>
            <rect x={-3} y={-3} width={6} height={6} rx={1} />
          </g>
        ))}
      </svg>

      {/* The readouts. `fuel-curve` kept its id here: the flat strip it named is
          gone, but the four numbers it carried are all in this group. */}
      <div className="ship-callouts" data-testid="fuel-curve">
        {model.regions.map((r) => {
          const g = SHIP_DIAGRAM_GEOMETRY[r.id];
          const podAttrs =
            r.id === 'pods'
              ? {
                  'data-pods-owned': model.podsOwned,
                  'data-pods-max': model.podsMax,
                  'data-pods-in-use': model.podsInUse,
                }
              : {};
          return (
            <div
              key={r.id}
              className={regionClass(r, `ship-region anchor-${g.anchor}`)}
              data-testid="ship-region"
              data-region={r.id}
              data-damaged={r.damaged ? '1' : '0'}
              data-critical={r.critical ? '1' : '0'}
              data-strength={r.strength ?? undefined}
              data-condition={r.condition ?? undefined}
              {...podAttrs}
              style={{ left: pct(g.labelX, W), top: pct(g.labelY, H) }}
              title={r.title}
              onClick={() => onFocusRegion(r.id)}
            >
              <span className="rg-label">{r.label}</span>
              {r.readouts.map((ro) => (
                <span className="rg-ro" key={`${r.id}-${ro.key}-${ro.testId ?? ''}`}>
                  {ro.key !== '' && <i className="rg-k">{ro.key}</i>}
                  <b className="rg-v" data-testid={ro.testId}>
                    {ro.value}
                  </b>
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
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
  // T-196c · NO `armed` CONST HERE, deliberately. Every verb this pane reaches —
  // all four Shipyard kinds, plus Crew hire/dismiss below — is a FREE ACTION
  // (docs/DAWN-HAND-REDESIGN.md §3). A Free Action must neither require, consume
  // nor DISARM the die a player armed for their next Main Action, so the yard
  // must not gate on one either. Main-Action gates (starmap jump, off-lane
  // sweep, haggle, combat) keep theirs.
  const components = shipComponents(game);
  const equipment = specialEquipmentRows(game);
  const [podQty, setPodQty] = useState(10);
  // T-189 · The diagram is the readout and the bench below is the controls, so a
  // click on a hull region has to LAND somewhere: it scrolls that system's bench
  // row into view and flashes it. Pure presentation — no engine call, no state
  // shape, and the flash is gated behind `prefers-reduced-motion` in CSS.
  const [focusedComponent, setFocusedComponent] = useState<ShipComponentId | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);
  const podsBlockRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (focusedComponent === null) return;
    const t = window.setTimeout(() => setFocusedComponent(null), 700);
    return () => window.clearTimeout(t);
  }, [focusedComponent]);
  const focusRegion = (id: ShipDiagramRegionId) => {
    if (id === 'pods' || id === 'fuel') {
      podsBlockRef.current?.scrollIntoView({ block: 'nearest' });
      return;
    }
    setFocusedComponent(id);
    benchRef.current
      ?.querySelector(`[data-testid="ship-component"][data-component="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  // Fuel curve + hold instruments read from any quote's `before` (a pure read of
  // the current ship). Use a cheap no-op-ish repair-all quote just for `before`.
  const curve = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
  }).before;
  const podQuote = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'buy-cargo-pods',
    quantity: Math.max(1, podQty),
  });
  const repairAllQuote = shipyardQuote(game, {
    type: 'Shipyard',
    action: 'repair',
    repairMode: 'all',
  });
  const anyDamaged = components.some((c) => c.damaged);
  // T-112 · The Class-B readout. Class A needs no widget of its own: a component
  // delta lands in the grid below, a pod grant in the PODS tag, and a maxFuel
  // grant in the fuel-curve readout — all three already render live ship state.
  const salvagedFittings = fittedModuleRows(game);

  return (
    <section className="pane ship" data-testid="ship-pane" {...railsProps(state, 'ship')}>
      <header>
        <h2>Ship &amp; Yard · {ship.isAstraxialHull ? 'Astraxial' : 'Junker'}</h2>
        <span className="tag">
          PODS <b data-testid="ship-pods">{ship.cargoPods}</b>/{curve.maxCargoPods}
        </span>
      </header>
      <div className="body">
        {/* ---- T-189 · the ship itself ----
            This replaced the flat `.ship-fuelcurve` strip, which is why the four
            ids it carried (`fuel-curve`, `fuel-per-jump`, `jump-range`,
            `crew-capacity`) now live INSIDE the diagram's regions — the fuel
            curve at the engine bells, the berths at the cabin. Nothing was
            dropped: `shipyard.spec.ts` reads `fuel-per-jump` unchanged. */}
        <ShipDiagram game={game} onFocusRegion={focusRegion} />

        {/* ---- T-112 salvaged fittings (explore-granted modules) ----
            Rendered only when something is fitted, so a fresh junker's pane is
            byte-identical to before. The benefit label comes from the SAME content
            table the dawn-hand aggregator reads (`format.ts` fittedModuleRows), and
            the row reuses the crew pane's `crew-benefit` class deliberately: a
            module and a crew member grant the same three benefits, so they must
            read as the same instrument. */}
        {salvagedFittings.length > 0 && (
          <div className="ship-crew" data-testid="explore-modules">
            <div className="crew-head">SALVAGED FITTINGS</div>
            {salvagedFittings.map((row) => (
              <div className="crew-row hired" key={row.id} data-testid="explore-module">
                <div className="crew-main">
                  <span className="crew-name">{row.name}</span>
                  <span className="crew-benefit">{row.benefitLabel}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- cargo pods ----
            T-189 promoted this next to the diagram: the bay is now where a player
            looks for the hold, so the control that grows it belongs directly under
            the picture of it rather than four blocks down the ledger. The block
            itself is untouched (`pods-block` still reads `10/100`). */}
        <div className="ship-pods-block" data-testid="pods-block" ref={podsBlockRef}>
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
              disabled={!podQuote.ok}
              title={`Buy ${podQty} pods · ${podQuote.cost.toLocaleString()}cr`}
              onClick={() => shipyard({ action: 'buy-cargo-pods', quantity: Math.max(1, podQty) })}
            >
              Buy pods · {podQuote.cost.toLocaleString()}cr
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

        {/* ---- T-189 · THE YARD BENCH ----
            The component grid, the repair-all button and the special-equipment
            list are all CONTROLS, and framing them under one heading is what stops
            them reading as "the ship's state" — that job now belongs to the diagram
            above. Nothing inside is hidden or restyled away: every row, id and
            button is exactly as it was, because Playwright text assertions fail on
            hidden elements and because none of it was the problem. */}
        <div className="ship-bench" data-testid="yard-bench" ref={benchRef}>
          <div className="bench-head">YARD BENCH · UPGRADE &amp; REPAIR</div>
          <div className="ship-grid" data-testid="component-grid">
            {components.map((c) => (
              <ComponentRow key={c.id} row={c} game={game} focused={focusedComponent === c.id} />
            ))}
          </div>
          <div className="ship-repair-all">
            <button
              className="btn"
              data-testid="repair-all"
              disabled={!anyDamaged || !repairAllQuote.ok}
              title={
                !anyDamaged
                  ? 'All systems at full condition'
                  : `Repair every system · ${repairAllQuote.cost.toLocaleString()}cr`
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
                    disabled={row.owned || !row.quote.ok}
                    title={
                      row.owned
                        ? 'Already installed'
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
        </div>

        {/* ---- T-1406 / N6 · Top Gun Honor List ----
            The 1991 board (`sp.top.s`), recovered from this repo's own history, and
            since N1 the FULL 31-WAY BOARD it was in the original: the player plus
            every NPC captain, ranked on strength x condition — NOT on credits, which
            is the point, since it cannot be won by hoarding, only by building.
            Rendered in the original's own shape, `Title : holder / holder`, with the
            player's competition rank in the trailing column so you can find yourself
            whether you hold the title or are twelfth on it. The completion bar it
            used to draw is gone deliberately: eight titles against a fabricated
            ceiling was a progress bar; eight titles against thirty rivals is a
            contest. See `format.ts` `honorList` for the tie and budget rules. */}
        <div className="ship-honor" data-testid="honor-list">
          <div className="honor-head">TOP GUN HONOR LIST</div>
          {honorList(game).map((t) => (
            <div
              key={t.id}
              className={t.id === 'allAround' ? 'honor-row all-around' : 'honor-row'}
              data-testid="honor-row"
              data-honor={t.id}
              data-holders={t.holders.length}
              data-rank={t.playerRank}
            >
              <span className="honor-title">{t.title}</span>
              {/* No empty-holders branch: a title cannot be vacant while the captain
                  reading the board is ranked. See `format.ts` `rankTitle`. */}
              <span className="honor-holders">
                {t.holders.map((h, i) => (
                  <span key={h.name}>
                    {i > 0 && <span className="honor-sep"> / </span>}
                    <span className={h.isPlayer ? 'honor-holder you' : 'honor-holder'}>
                      {h.name}
                    </span>
                  </span>
                ))}
                {t.overflow > 0 && <span className="honor-more"> +{t.overflow}</span>}
              </span>
              <span
                className={t.playerRank === 1 ? 'honor-rank held' : 'honor-rank'}
                title={
                  t.playerRank === 1
                    ? `You hold this title — ${t.playerScore} of a leading ${t.score}, ${t.field} captains ranked`
                    : `You rank ${t.playerRank} of ${t.field} captains — ${t.playerScore} of a leading ${t.score}`
                }
              >
                #{t.playerRank}
              </span>
            </div>
          ))}
        </div>

        {/* ---- crew roster (T-1405 · the dice-progression source) ---- */}
        <CrewSection game={game} />
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
function CrewSection({ game }: { game: GameState }) {
  const roster = crewRoster(game);
  // T-1703 · The demo's 'crew-progression' lock — "Hangout progression" on the
  // task's gate list, read as the crew/dice progression bought at the Hangout
  // (the reading and its evidence are recorded in content demo.ts). Null on a
  // full build, so nothing below changes there. DISMISS IS UNTOUCHED: a promoted
  // save can carry crew in, and you may always let someone go.
  const demoLock = demoLockNotice(game, 'crew-progression');
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
              // T-196c · No `disabled` and no die in the copy: a dismiss is a
              // FREE ACTION. The old title said "spends a die", which had been
              // false since T-196a freed the verb in the engine.
              title="Dismiss this crew member (free, no refund)"
              onClick={() => dismissCrew(row.role.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
      {roster.hireable.map((row) => (
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
              // T-1703 · TEASED, NOT REMOVED — the task's own word. The row keeps
              // its name, benefit and price so a demo player can see exactly what
              // the full game buys; only the button goes dead. `disabled` is what
              // makes Playwright's `click({ trial: true })` REJECT, which is a
              // stronger proof than absence: a hidden control proves nothing about
              // a control that is merely off-screen.
              disabled={!row.canHire || demoLock !== null}
              title={
                demoLock ??
                (row.canHire
                  ? `Hire · ${row.role.hirePrice.toLocaleString()}cr`
                  : (row.reason ?? 'Cannot hire'))
              }
              {...(demoLock !== null ? { 'data-demo-locked': 'crew-progression' } : {})}
              onClick={() => hireCrew(row.role.id)}
            >
              Hire
            </button>
          </div>
          {/* Disabled-not-hidden: the engine-derived reason, rendered whenever the
              role can't be hired right now (no berth / unaffordable). T-1703's
              demo tease takes precedence — a demo player who cannot hire at all is
              not helped by being told the berth is full. */}
          {(demoLock ?? row.reason) && (
            <span className="ship-reason" data-testid="crew-reason">
              {demoLock ?? row.reason}
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
  focused = false,
}: {
  row: ShipComponentRow;
  game: GameState;
  /** T-189 · Set for ~700ms after its region is clicked on the ship diagram, so
   *  a click on the hull lands visibly on the bench row that controls it. Pure
   *  presentation; the flash itself is gated behind `prefers-reduced-motion`. */
  focused?: boolean;
}) {
  const upgradeQuote =
    row.nextTier !== null
      ? shipyardQuote(game, {
          type: 'Shipyard',
          action: 'buy-component-tier',
          component: row.id,
          tier: row.nextTier,
        })
      : null;
  const repairQuote = row.damaged
    ? shipyardQuote(game, {
        type: 'Shipyard',
        action: 'repair',
        component: row.id,
        repairMode: 'single',
      })
    : null;

  // condition 0-9 → 5 pips
  const on = Math.round((row.condition / 9) * 5);

  // T-1602b · `data-strength` / `data-condition` below are structural
  // pass-throughs of the two numbers this row ALREADY renders — strength as
  // text, condition as five pips (which cannot be read structurally at all). No
  // new derived rule; same justification as T-1602a's four data-* additions.
  // READER: `tour-one-death.spec.ts`, proving the successor inherits an exact
  // junker (hull str 1 / cond 9, drives str 10, …).
  return (
    <div
      className={[row.damaged ? 'comp-row damaged' : 'comp-row', focused ? 'focused' : '']
        .filter(Boolean)
        .join(' ')}
      data-testid="ship-component"
      data-component={row.id}
      data-damaged={row.damaged ? '1' : '0'}
      data-strength={row.strength}
      data-condition={row.condition}
    >
      <div className="comp-id">
        <span className="comp-name">{row.name}</span>
        {/* T-1406 · WHAT THIS PART DOES, next to what it costs. The yard used to
            price a component without ever saying what it was for, which is a large
            part of why four of the eight were never bought. Every figure comes
            from the engine's own reader via `shipComponents` — the UI computes no
            effect of its own. */}
        <span className="comp-effect" data-testid="component-effect" title={row.effectLabel}>
          {row.effectLabel}: <b>{row.effectNow}</b>
          {row.effectNext !== null && row.effectNext !== row.effectNow && (
            <>
              {' \u2192 '}
              <b className="comp-effect-next">{row.effectNext}</b>
            </>
          )}
        </span>
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
              disabled={!upgradeQuote.ok}
              title={`Upgrade to tier ${row.nextTier} · ${upgradeQuote.cost.toLocaleString()}cr`}
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
            disabled={!repairQuote.ok}
            title={`Repair one step · ${repairQuote.cost.toLocaleString()}cr`}
            onClick={() => shipyard({ action: 'repair', component: row.id, repairMode: 'single' })}
          >
            Repair · {repairQuote.cost.toLocaleString()}cr
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * T-190 · THE MANIFEST IS AN OBJECT, NOT A PANE.
 *
 * The owner's read: "the contract manifest probably needs to be a clickable item,
 * available only in a port… Make it stand out as distinct from everything else."
 * That is two asks, and only ONE of them can honestly ship today:
 *
 *  (1) VISUAL DISTINCTNESS — shipped here. The board is dressed as a physical
 *      clipboard bolted to the console: a bulldog clip above the header, a
 *      reverse-video port stamp, a 2px frame with stacked-paper shadows, a slight
 *      physical tilt, punched holes and a torn bottom edge on the paper itself,
 *      and it STOWS when you click its header (the "clickable item"). The paper
 *      also re-posts itself — `key={sheet.boardKey}` remounts the sheet whenever
 *      (port, day) changes, i.e. exactly when the engine regenerates the board.
 *
 *  (2) "UNAVAILABLE WHILE NOT DOCKED" — deliberately NOT shipped. There is no
 *      in-transit state to gate on: jumps are instant, and the design decision
 *      that would give travel an occupiable duration is T-188, which is still
 *      BLOCKED on an owner ruling. Faking a docking flag against an instant-jump
 *      model is exactly what T-190's own accept clause forbids. Re-filed as T-192,
 *      which reuses the stow render path below and adds no new visual work.
 *
 * The stow is a PLAYER AFFORDANCE, never game state — it lives in component
 * state, is not persisted, and is force-open for the whole of the scripted
 * first-turn walkthrough (step 3's rails allow ONLY the manifest region, so a
 * stowed board there would be a soft-lock, and `walkthrough.spec.ts` asserts a
 * contract is visible from step 2 onward while the manifest is still rails-shut).
 *
 * Everything inside the sheet — the contract rows, the flags, the SIGN row, the
 * HAGGLE button and every handler and `data-*` attribute — is UNCHANGED. The
 * mechanical proof is that every existing e2e spec which reads the board — nine of
 * them directly, plus `e2e/support/career.ts`'s shared contract picker — passes
 * with zero edits.
 */
function Manifest({ state }: { state: CockpitState }) {
  const board = state.game.market.manifestBoard;
  const here = state.game.player.currentSystemId;
  // T-196c · `armed` SURVIVES HERE, narrowed to ONE reader: HAGGLE, which is a
  // Main Action and still spends the die it rolls. SIGN below is a Free Action
  // (docs/DAWN-HAND-REDESIGN.md §3) and no longer reads this at all — hence no
  // `dieVal` either, since the sign row stopped rendering a die slot.
  const armed = state.selectedDie !== null;
  const sheet = manifestSheet(state.game);
  const [stowed, setStowed] = useState(false);
  const open = !stowed || walkthroughActive(state.walkthrough);
  return (
    <section
      className="pane manifest-board"
      data-testid="manifest-board"
      data-manifest-open={open ? '1' : '0'}
      data-board-key={sheet.boardKey}
      {...railsProps(state, 'manifest')}
    >
      {/* The bulldog clip: what makes the frame read as a board you could lift
          off the console rather than a rectangle in a CSS grid. Pure chrome. */}
      <div className="mb-clip" aria-hidden="true">
        <span className="mb-clip-jaw" />
      </div>
      <header>
        <h2>
          <button
            type="button"
            className="mb-toggle"
            data-testid="manifest-toggle"
            aria-expanded={open}
            title={open ? 'Stow the manifest board' : 'Take the manifest board down again'}
            onClick={() => setStowed((v) => !v)}
          >
            <span className="mb-title">Manifest Board</span>
            {/* Same words the `.tag` carried before — a port stamp, not a label. */}
            <span className="mb-stamp">
              {systemName(here)} DEPOT · {board.length} OFFERS
            </span>
          </button>
        </h2>
      </header>
      {!open && (
        <div className="body">
          <p className="mb-stowed-line" data-testid="manifest-stowed">
            BOARD STOWED · {sheet.offerCount} OFFERS PINNED AT {sheet.portName.toUpperCase()}
          </p>
        </div>
      )}
      {open && (
        <div className="body">
          {/* `key` is the whole point: a new (port, day) is a genuinely new sheet,
              so React remounts this node and the re-post animation fires. */}
          <div className="mb-sheet" key={sheet.boardKey}>
            <div className="mb-punches" aria-hidden="true" />
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
                  // T-196c · ALWAYS pickable: signing is free, so a row is
                  // clickable whether or not a die is armed.
                  className="contract pickable"
                  key={i}
                  data-testid="contract"
                  // T-1602a · STRUCTURED reads of the numbers this row already renders
                  // as prose, so a caller can decide from the DOM instead of parsing
                  // "▸ Pollux-7 · 72 fuel · 10 pods". Every value is the SAME engine
                  // number rendered below (`preview` / the contract itself) — nothing
                  // new is derived here, so the UI still owns no route or pricing rule.
                  // READER: e2e/tour-one-career.spec.ts via e2e/support/career.ts —
                  // its contract picker filters on `data-contraband` / `data-dc` /
                  // `data-fuel-cost` and ranks on `data-payment`; `data-destination-id`
                  // is the starmap node it then clicks, and `data-pods` rides the run
                  // report's day log. (Same precedent as `data-system-id` /
                  // `data-reachable` on the starmap nodes.)
                  data-destination-id={c.destination}
                  data-payment={c.payment}
                  data-fuel-cost={preview.fuelCost}
                  data-dc={preview.dc}
                  data-pods={c.pods}
                  data-contraband={contraband ? '1' : '0'}
                  onClick={() => signContract(i)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('dropready');
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('dropready')}
                  // T-196c · The drop no longer routes through `dropDie`. That
                  // helper called `selectDie` before running the action, so a
                  // drag-to-sign would ARM (or replace) the player's queued die
                  // as a side effect of a FREE action — exactly the disarm this
                  // task exists to prevent. Drag is still the accessible
                  // parallel to click-to-sign; it just signs, nothing more.
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('dropready');
                    signContract(i);
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
                  {/* T-196c · Signing is a FREE ACTION (docs/DAWN-HAND-REDESIGN.md
                  §3) — it costs no die and it is still not a TRADE check, so the
                  row renders neither a die slot nor a "+ TRADE" check. (T-1402
                  wrote this row as a die COST; M17 removed the cost, so the slot
                  and the "assign a die" prompt went with it.) HAGGLE below is the
                  manifest's one real TRADE DC-12 roll, and the one control here
                  that still demands an armed die. */}
                  <div className="check" data-testid="sign-row">
                    <span className="lbl">SIGN</span>
                    <span className="mono">FREE</span>
                    <span className="arrow">&rarr;</span>
                    <span className="mono">click to sign</span>
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
            <div className="mb-tear" aria-hidden="true" />
          </div>
        </div>
      )}
      {/* The manifest owns the haggle check only — filter by context so a
          storylet check (any stat) surfaces in its own panel, not here. It sits
          OUTSIDE the sheet on purpose: it is the haggle readout, and stowing the
          paper must never hide the result of a roll the player just paid for. */}
      <CheckBreakdown state={state} exclude={Stat.PILOT} context="haggle" />
    </section>
  );
}

// T-191 · THE PORT LEDGER'S ICON LANGUAGE. One stencilled glyph per service
// module, punched into the module's own head line. Presentation-only and
// `aria-hidden` throughout: every module still announces itself by its head TEXT
// (`FUEL DEPOT`, `GUILD DEBT`, …), which is unchanged and which several e2e
// specs read verbatim. Drawn in `currentColor` so the stencil inherits whatever
// the head colour is and costs T-186's still-open palette ruling nothing.
type LedgerGlyphKind = 'dispatch' | 'hold' | 'fuel' | 'debt' | 'port';

const LEDGER_GLYPHS: Record<LedgerGlyphKind, ReactNode> = {
  // A dispatch slip with a folded corner — paper handed over a counter.
  dispatch: (
    <>
      <path d="M3 2h5l3 3v7H3z" />
      <path d="M8 2v3h3" />
      <path d="M5 8h4M5 10h3" />
    </>
  ),
  // A cargo crate, banded — what rides in the hold.
  hold: (
    <>
      <path d="M2 4h10v7H2z" />
      <path d="M2 6.5h10M7 4v7" />
    </>
  ),
  // A pump nozzle and hose — the depot.
  fuel: (
    <>
      <path d="M3 12V3h5v9" />
      <path d="M3 6h5" />
      <path d="M8 5h2v5a1.2 1.2 0 0 0 2 0V7" />
    </>
  ),
  // A struck ledger tally — the marker against you.
  debt: (
    <>
      <path d="M2 2.5h10v9H2z" />
      <path d="M4.5 5h5M4.5 7.2h5M4.5 9.4h3" />
      <path d="M2.6 11.4 11.4 2.6" />
    </>
  ),
  // A mooring bollard on a dock line — the authority you stand on.
  port: (
    <>
      <path d="M4.5 12V6a2.5 2.5 0 0 1 5 0v6" />
      <path d="M3 12h8" />
      <path d="M4.5 8h5" />
    </>
  ),
};

/** A 14x14 stencil punched into a service module's head. Chrome only. */
function LedgerGlyph({ kind }: { kind: LedgerGlyphKind }) {
  return (
    <svg
      className="lb-glyph"
      data-glyph={kind}
      viewBox="0 0 14 14"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="square"
      aria-hidden="true"
      focusable="false"
    >
      {LEDGER_GLYPHS[kind]}
    </svg>
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
  // T-196c · NO `armed` CONST HERE, deliberately. All three verbs this pane
  // reaches — abandon-contract, buy-fuel and the port buy — are FREE ACTIONS
  // (docs/DAWN-HAND-REDESIGN.md §3), so none may require, consume or DISARM the
  // die a player armed for their next Main Action.

  const [fuelAmount, setFuelAmount] = useState(100);
  const [debtAmount, setDebtAmount] = useState(500);

  const fuelPrice = game.market.localFuelPrice;
  const debtDue = p.debtDueDay - game.day;

  // T-1405 · The contraband-hold badge + the port-authority ledger, both pure reads
  // (contrabandHold / portLedger read the SAME engine state the patrol scan and the
  // dusk economy gate on — never recomputed here).
  const hold = contrabandHold(game);
  const ledger = portLedger(game);
  // T-1703 · The demo's 'port-ownership' lock ("ports" on the task's gate list).
  // Null on a full build, so the Port Authority block below is unchanged there.
  const portDemoLock = demoLockNotice(game, 'port-ownership');

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

  // T-191 · The rack's fascia — the port name and the three re-mount keys the
  // service modules animate off. A pure projection (format.ts `ledgerFascia`);
  // it derives no rule and adds no state. The keys are placed ONLY on leaf
  // readouts and decorative sweeps, never on a wrapper that contains an input —
  // remounting `fuel-amount` / `debt-amount` would blow away a typed value and
  // the caret, which would be a behaviour change wearing a styling hat.
  const fascia = ledgerFascia(game);

  return (
    <section className="pane trade" data-testid="trade-pane">
      <header>
        <h2>Port Ledger</h2>
        <span className="tag">{systemName(p.currentSystemId)} SERVICES</span>
      </header>
      <div className="body">
        {/* T-191 · The mounting rail every service module is bolted to — the
            silhouette cue that makes this quadrant read as dockside HARDWARE
            rather than a fourth copy of the pane chrome. A real element, not a
            `::before`: pseudo-elements cannot be located by Playwright, and the
            e2e has to assert the rack's parts exist here and nowhere else. */}
        <i className="lb-rail" aria-hidden="true" />
        {/* The single mechanically-checkable surface for "failure is never
            silent": whenever the store captured an engine refusal, it shows
            here in reverse-video. It clears on the next successful action. */}
        {/* T-162 · F-162-2 · KEYED ON THE RAISE, NOT THE WORDS. A second
            identical refusal used to change nothing in the DOM, so the cockpit
            read as broken rather than as refusing again. The `key` remounts the
            banner (its reveal replays); `data-notice-key` makes the raise
            assertable. Same device, same argument, as `lastCheckKey`. */}
        {state.notice && (
          <div
            className="notice rev"
            key={state.noticeKey}
            data-testid="notice"
            data-notice-key={state.noticeKey}
            role="status"
          >
            {state.notice}
          </div>
        )}

        {/* T-1406 · PORT DISPATCHES — the diegetic surface for storylets the port
            delivers (a Guild auditor at the gantry, a passenger booking a berth,
            the Wise One / Sage, a chain follow-up, veteran beats). Each opens its
            focused panel. The TOTAL classifier's default lands here, so a newly
            authored storylet always has a door — the reachability guarantee. */}
        {portOffers.length > 0 && (
          <div
            className="ledger-block port-dispatches"
            data-testid="port-dispatches"
            // T-191 · The live PORT-surface offer set, as one order-independent
            // string. READER: the `.lb-posts` key below (a re-post animation
            // when the set genuinely changes) and e2e/port-ledger.spec.ts.
            data-dispatch-key={fascia.dispatchKey}
            {...railsProps(state, 'trade')}
          >
            <div className="lb-head">
              <LedgerGlyph kind="dispatch" />
              PORT DISPATCHES
            </div>
            <div className="lb-posts" key={fascia.dispatchKey}>
              {portOffers.map((o) => (
                <StoryletOpener key={o.storyletId} offer={o} onOpen={onOpenStorylet} />
              ))}
            </div>
          </div>
        )}

        {/* Active-contract tracker — makes the sign→carrying transition visible
            and explains why a second sign is refused. */}
        <div
          className="ledger-block active-contract"
          data-testid="active-contract"
          // T-1602a · The hold's own destination + jump bill, structured. Same
          // engine export the manifest row and the starmap use (`routePreview`),
          // so the number here is the number `resolveTravel` will charge — the UI
          // still owns no route rule. Both are undefined with an empty hold (React
          // omits the attribute), which is itself the "nothing to fly" read.
          // READER: e2e/tour-one-career.spec.ts via e2e/support/career.ts — the
          // driver fuels to `data-fuel-cost` and jumps to `data-destination-id`
          // without having to re-derive either from the board it already left.
          data-destination-id={active?.destination}
          data-fuel-cost={active ? routePreview(game, active.destination).fuelCost : undefined}
          // T-187 · `inert` blocks interaction and focus but NEVER hides content:
          // the hold, its destination and its bill stay fully legible while the
          // rails are on, which is the whole point of step 5 pointing at them.
          {...railsProps(state, 'trade')}
        >
          <div className="lb-head">
            <LedgerGlyph kind="hold" />
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
                &#9656; {systemName(active.destination)} ·{' '}
                {routePreview(game, active.destination).fuelCost} fuel · {active.pods} pods
              </div>
              {/* T-1604b · The hold release (UGT finding F2). A run you cannot
                  reach — no fuel, no credits, no way to the destination — used to
                  lock the hold forever, because signing is refused while a
                  contract rides. T-196c · dumping is a FREE ACTION now: the
                  forfeited payment is the whole cost, so the control is never
                  gated and never dead. The engine owns the refusal; this button
                  only sends the action. */}
              <div className="lb-controls">
                <button
                  className="btn"
                  data-testid="abandon-contract"
                  title="Vent the cargo and clear the hold"
                  onClick={() => abandonContract()}
                >
                  {/* The label is deliberately CONSTANT: this block's text is
                      read whole by e2e/manifest-trade.spec.ts to prove a refused
                      second signing left the tracker untouched, and a label that
                      flickered with state would break that read. */}
                  DUMP THE RUN
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

        {/* Fuel depot — T-196c · buying fuel is a FREE ACTION
            (docs/DAWN-HAND-REDESIGN.md §3): credits are the whole cost, so the
            control is gated on the amount alone and is never a dead click. */}
        <div
          className="ledger-block fuel-depot"
          data-testid="fuel-depot"
          // T-191 · `${fuel}/${maxFuel}` — the exact pair the readout below
          // prints. READER: the readout's own remount key and
          // e2e/port-ledger.spec.ts, which uses it as the mechanically-checkable
          // proof that the tick animation is wired to the real state change
          // (the paint itself is deliberately off under reduced motion).
          data-fuel-key={fascia.fuelKey}
          {...railsProps(state, 'fuel')}
        >
          {/* Decorative charge sweep — remounts, and so replays, whenever the
              tank moves. Keyed on a LEAF: never on anything containing an input. */}
          <i className="lb-sweep" key={fascia.fuelKey} aria-hidden="true" />
          <div className="lb-head">
            <LedgerGlyph kind="fuel" />
            FUEL DEPOT
          </div>
          <div className="lb-row">
            <span className="mono">
              PRICE <b data-testid="fuel-price">{fuelPrice}</b>cr/unit
            </span>
            <span className="mono">
              HOLD{' '}
              <b className="lb-tick" key={fascia.fuelKey} data-testid="fuel-hold">
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
              disabled={fuelAmount <= 0}
              title="Refuel at the depot"
              onClick={() => buyFuel(fuelAmount)}
            >
              Buy · {(fuelAmount * fuelPrice).toLocaleString()}cr
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
        <div
          className="ledger-block debt-ledger"
          data-testid="debt-ledger"
          // T-191 · `${debt}:${debtDueDay}` — moves on a pay-down and on a
          // re-markered due day, and at no other time. READER: the OWED
          // readout's remount key and e2e/port-ledger.spec.ts.
          data-debt-key={fascia.debtKey}
          {...railsProps(state, 'trade')}
        >
          <i className="lb-sweep" key={fascia.debtKey} aria-hidden="true" />
          <div className="lb-head">
            <LedgerGlyph kind="debt" />
            GUILD DEBT
          </div>
          {p.debt > 0 ? (
            <>
              <div className="lb-row">
                <span className="mono">
                  OWED{' '}
                  <b className="lb-tick" key={fascia.debtKey}>
                    {p.debt.toLocaleString()}
                  </b>
                  cr
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
        <div
          className="ledger-block port-authority"
          data-testid="port-authority"
          {...railsProps(state, 'trade')}
        >
          <div className="lb-head">
            <LedgerGlyph kind="port" />
            PORT AUTHORITY
          </div>
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
                {!ledger.current.quote.alreadyOwned && (
                  <button
                    className="btn"
                    data-testid="buy-port"
                    // T-1703 · The demo's 'port-ownership' lock ("ports" on the
                    // task's gate list). Disabled-not-hidden, so the price and the
                    // income figure stay legible — the tease is the dock you can
                    // see and cannot buy.
                    disabled={!ledger.current.quote.ok || portDemoLock !== null}
                    title={
                      portDemoLock ??
                      (ledger.current.quote.ok
                        ? `Buy the stake · ${ledger.current.quote.cost.toLocaleString()}cr`
                        : ledger.current.quote.failure
                          ? portFailureExplanation(ledger.current.quote.failure)
                          : 'Unavailable')
                    }
                    {...(portDemoLock !== null ? { 'data-demo-locked': 'port-ownership' } : {})}
                    onClick={() => buyPort()}
                  >
                    Buy · {ledger.current.quote.cost.toLocaleString()}cr
                  </button>
                )}
              </div>
              {/* Disabled-not-hidden: the typed reason, whenever the buy is refused
                  (already-owned is surfaced above as OWNED, not as an error).
                  T-1703's demo tease takes precedence over an affordability
                  reason — a demo player cannot buy at any price. */}
              {portDemoLock !== null && !ledger.current.quote.alreadyOwned ? (
                <span className="ship-reason" data-testid="port-reason">
                  {portDemoLock}
                </span>
              ) : (
                !ledger.current.quote.ok &&
                ledger.current.quote.failure &&
                !ledger.current.quote.alreadyOwned && (
                  <span className="ship-reason" data-testid="port-reason">
                    {portFailureExplanation(ledger.current.quote.failure)}
                  </span>
                )
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
function Wire({
  game,
  onOpenStorylet,
  railsOff: off,
}: {
  game: GameState;
  onOpenStorylet: (id: string) => void;
  /** T-187 · The wire's bulletins open storylets, which is not a scripted step —
   *  the whole strip goes inert while the first-turn walkthrough is on rails. */
  railsOff: boolean;
}) {
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
    <div className="wire" inert={off || undefined} data-rails-off={off ? '1' : undefined}>
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
      {/* T-217 · The ticker's scroll window. `.cap` above is a normal-flow flex
          item that reserves exactly its own (data-dependent) width, and this
          takes the remainder — which is what replaced `.ticker`'s hardcoded
          `padding-left: 138px`, the magic number the LOG button and the BULLETIN
          chips had silently outgrown. */}
      <div className="wire-track">
        <div className="ticker" data-testid="wire">
          {run}
          {run}
        </div>
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
  // T-136 · A live hand of Liar's Dice outranks every other hint: `endDay`'s dusk
  // clause resolves an open hand as a player fold (§6.2), which costs the seed and
  // every ante already paid. That must never be a surprise.
  const dareHandLive = state.game.dareHand !== null;
  const hint = dareHandLive
    ? 'A hand is live at the tables — play it out. Ending the day folds it and forfeits the pot.'
    : remaining === 0
      ? 'Hand empty. Close the day — dusk moves the galaxy.'
      : state.notice
        ? state.notice
        : state.selectedDie !== null
          ? 'Die in hand. Click a contract to commit it.'
          : 'Pick a die, then assign it to an action.';

  return (
    <div className="dock" data-hand-spent={handSpent ? '1' : '0'} {...railsProps(state, 'hand')}>
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
