# Steam achievements — the Registry of Deeds, mirrored

**T-1702a.** This is the table to paste into the Steamworks partner site
(App Admin → Stats & Achievements → Achievement Configuration). It is not
documentation of an intention: it is generated from
`packages/ui/src/steam.ts`'s `ACHIEVEMENT_MANIFEST`, and
`packages/ui/src/__tests__/steam.test.ts` asserts row-for-row that this file and
that constant agree. Add a Deed to `packages/content/src/deeds.ts` without
regenerating this file and the unit suite goes red — which is the only thing
that keeps a hand-maintained partner table from rotting.

## What these are

`docs/PRD-REIMAGINED.md` §8.2 does not describe achievements as a separate
system: **the achievements are the Deeds**, "in-world entries in the Spacer's
Registry". So there is nothing here the game does not already do. The engine
(`packages/engine/src/deeds.ts`) decides what is earned and emits `DeedEarned`;
`packages/ui/src/steam.ts` maps that event to an API name; the Electron shell
(`packages/desktop/src/steam.ts`) hands the string to Steamworks. No `GameState`
field, no `GameEvent` and no save migration exist for any of it.

## Conventions

- **API name** — derived mechanically, never authored: `DEED_` + the deed id,
  uppercased. A hand-kept table can omit a deed and nobody notices for a year;
  a derived one cannot.
- **Display name** — the Deed's own `title`. The Registry and the store page say
  the same thing because they are the same thing.
- **Description** — the Deed's `citationTemplate` with its leading
  `On day {day},` / `By day {day},` clause dropped and the sentence re-opened in
  caps. A description is authored once, before any career exists, so there is no
  day to substitute.
- **Hidden** — set every row to *not* hidden. The Registry is a public record
  in-fiction; hiding the list would contradict the thing it is a mirror of.
- **Icons** — not shipped, and not a code task. Steam requires a 64×64 achieved
  and unachieved icon per row; the art order (90 files, derived from this table's
  length and pinned by a test) is item **C2** of
  `docs/RELEASE-CHECKLIST.md` §C, where it is an open decision awaiting the user.

`RANK_CONQUEROR` is the one **renown rank** in the table. It is not a Deed — it
is the career capstone (`RENOWN_RANKS.CONQUEROR`, PRD §5.2/§9), and it rides
`RenownRankUp`, not `DeedEarned`. The other nine ranks are deliberately **not**
mirrored: they are pure functions of deed count, so they would unlock as a side
effect of achievements the player already holds. See `packages/ui/src/steam.ts`'s
header for that decision in full.

## T-1702b · The other two partner-site configurations

These are the parts of Steamworks that **no code can create**. The shell drives
both features through the API at runtime, but each needs a one-time setup in App
Admin that a human has to perform — so they live here, in the one file the
partner-site setup pastes from, alongside the achievement table. Each of them is
tracked as an open item in `docs/RELEASE-CHECKLIST.md` §D (rows **D1**–**D5**),
which is where the user's confirmation is recorded.

### 1. Rich presence (App Admin → Community → Rich Presence)

`packages/desktop/src/presence.ts` sets exactly three keys on every publish:

| Key | Value | Notes |
| --- | --- | --- |
| `system` | the current star system's authored name | e.g. `Aldebaran-1` |
| `day` | the current career day, as a string | e.g. `12` |
| `steam_display` | `#Status_InSystem` | Steam's reserved key; the value is a **token**, never prose |

Add one localization token, for English (`english`):

```
#Status_InSystem = Day {#day} — {#system}
```

`{#day}` and `{#system}` interpolate the two custom keys above. Pointing
`steam_display` at a token is the only supported way to show a rich-presence
string — there is no "just send a sentence" API — which is why the shell owns no
prose. `packages/ui/src/format.ts`'s `richPresenceLine` emits that same sentence
for the Settings row so a player can read exactly what their friends see, and
`packages/ui/src/__tests__/steam.test.ts` asserts this file and that function
cannot drift apart.

Under the Spacewar dev sandbox (app 480) no such token exists, so a live friends
list would show a blank status while the three custom keys are still delivered —
which is a **pass**, exactly as an achievement `rejected` by the 480 backend is:
it proves the call reached Steamworks.

### 2. Steam Cloud (App Admin → Cloud)

**Auto-Cloud must stay OFF.** The game drives the ISteamRemoteStorage API
directly (`packages/desktop/src/cloud.ts`); enabling Auto-Cloud as well would
have both mechanisms writing the same files.

Enable Steam Cloud with quota for the seven files the shell syncs — the autosave
`sq.save.v1`, the three slot envelopes `sq.slot.{1,2,3}.v1` and their three
display-meta files `sq.slot.{1,2,3}.meta`. T-1605c measured a 1,000-day career at
about **10.9 MiB**, so size the quota for four envelopes at that ceiling plus the
tiny meta files:

| Setting | Value | Why |
| --- | --- | --- |
| Byte quota | **128 MiB** per user | 4 × ~10.9 MiB with generous headroom for a longer career than any measured |
| File count quota | **32** | 7 today; headroom for more slots without a partner-site change |

Nothing else is synced, and the exclusions are deliberate — see `cloud.ts`'s
`CLOUD_CARRIED`. In particular `sq.migrated.from-localstorage.v1` is
**machine-local** and must never ride the cloud: syncing it down would make a
fresh machine skip its own localStorage import.

The conflict policy is **restore-only-when-absent**: the cloud seeds a machine
with no career and backs up the one you have. It is not a two-way merge, because
`listFiles()` carries no modification time and "newest wins" cannot be
implemented honestly against this API.

## The table

| API name | Display name | Description |
| --- | --- | --- |
| `DEED_FIRST_MANIFEST` | First Manifest | The Guild ledger first trusted this captain with a manifest. |
| `DEED_FIRST_DELIVERY` | First Delivery | Cargo reached its mark and the port clerks took notice. |
| `DEED_MERCY_RUNNER` | Mercy Runner | Medical cargo made Fomalhaut-2 before hope ran dry. |
| `DEED_FIRST_JUMP` | First Jump | The ship broke orbit and proved the route was real. |
| `DEED_ROAD_REGULAR` | Road Regular | Five clean jumps had made the spacelanes familiar. |
| `DEED_RIMWARD_BOUND` | Rimward Bound | The registry marked a jump into the Rim Stars. |
| `DEED_FUEL_FUMES_ARRIVAL` | Fuel-Fumes Arrival | Arrival came on fumes and stubborn math. |
| `DEED_FIRST_COMBAT_WIN` | First Combat Win | An interceptor yielded to superior fire. |
| `DEED_SILVER_TONGUE` | Silver Tongue | A hostile bridge stood down after one better argument. |
| `DEED_CLEAN_GETAWAY` | Clean Getaway | The ship outran trouble and left no forwarding vector. |
| `DEED_DEBT_FIRST_PAYMENT` | First Debt Payment | The Merchant Guild received its first coin back. |
| `DEED_DEBT_CLEARED` | Debt Cleared | The Guild marker closed with a clean final stamp. |
| `DEED_TOUR_ONE_CLEARED` | Tour One Complete | The Guild marker closed clean and the veteran lanes opened to this captain. |
| `DEED_BROKER_SHARK` | Broker Shark | A broker learned this captain could count twice. |
| `DEED_YARD_RAT` | Yard Rat | The first yard chit hit the ship account. |
| `DEED_CARGO_EXPANSION` | Cargo Expansion | New pods widened the hold and the horizon. |
| `DEED_BEACON_KEEPER` | Beacon Keeper | An answered mayday earned this captain a quiet line in the beacon-net logs. |
| `DEED_DARE_FIRST` | First Dare | This captain sat down to a Spacer’s Dare and stayed. |
| `DEED_DARE_WON` | Took the Pot | The table paid out and the dealer counted it twice. |
| `DEED_HIGH_ROLLER` | High Roller | A stake worth a hold of cargo rode one hand — and came back doubled. |
| `DEED_TABLE_REGULAR` | Table Regular | The Hangout dealers had stopped explaining the rules to this captain. |
| `DEED_CONTRABAND_RUN` | Contraband Run | A load no manifest describes reached its buyer and no one asked a question. |
| `DEED_SLIPPED_THE_SCAN` | Slipped the Scan | A patrol swept the hold, found paperwork, and waved this ship through. |
| `DEED_KNOWN_TO_THE_LEAGUE` | Known to the League | A League scan found what the manifest denied, and the name went on a list. |
| `DEED_RUN_SEIZED` | Run Seized | The hold was opened, the cargo was carried off, and the fine was paid on the spot. |
| `DEED_RAY_S_LEDGER` | Ray's Ledger | The Ghost Runner opened a page for this captain and wrote the name in pencil. |
| `DEED_FIRST_MARKER` | First Marker | Penny Wise advanced the credits and named the day they came due. |
| `DEED_PAID_IN_FULL` | Paid in Full | The marker cleared and Penny Wise tore the page out herself. |
| `DEED_BAD_PAPER` | Bad Paper | The term ran out unpaid, and the collectors started asking after this hull. |
| `DEED_DEEP_WATER` | Deep Water | This captain borrowed to the ceiling and flew out owing every credit of it. |
| `DEED_FIRST_CHART` | First Chart | This captain left the lane and put something new on a chart. |
| `DEED_DERELICT_BOARDER` | Boarder | A dead hull was boarded and stripped of everything worth carrying. |
| `DEED_BEACON_CHASER` | Beacon Chaser | A beacon still calling into the dark finally got an answer. |
| `DEED_CARTOGRAPHER` | Cartographer | Five charted marks off the lanes bore this captain’s survey stamp. |
| `DEED_RICH_HULK` | Rich Hulk | One dead ship paid better than a season of honest freight. |
| `DEED_PORT_AUTHORITY` | Port Authority | A controlling stake in a port authority changed hands, and this captain held it. |
| `DEED_LANDLORD` | Landlord | Two ports levied their launch fees in this captain’s name. |
| `DEED_RENTIER` | Rentier | Twenty dusks of other spacers’ launch fees had arrived without this captain lifting a finger. |
| `DEED_SIGNED_THE_CREW` | Signed the Crew | A berth was filled and this ship stopped being a one-hander. |
| `DEED_FAT_MANIFEST` | Fat Manifest | A single delivery paid out five thousand credits and the broker paid it smiling. |
| `DEED_RIM_RUNNER` | Rim Runner | Cargo was set down past the last patrol buoy and the buyer paid in hard credits. |
| `DEED_TOLL_PAID` | Toll Paid | A demand was met in credits rather than fire, and both ships flew on. |
| `DEED_SIGNAL_HUNTER` | Signal Hunter | A fragment of something older than the Confederation entered this captain’s file. |
| `DEED_COLD_CASE` | Cold Case | Three separate signals said the same impossible thing, and the file stopped being a curiosity. |
| `DEED_LIARS_DICE_CLEARED_SUN_3` | The Long Table Swept | The last cup at the Long Table came up short, and Sun-3 had nobody left to sit down. |
| `DEED_LIARS_DICE_CLEARED_ALDEBARAN_1` | The Weighbridge Swept | The Weighbridge weighed three losing claims in a row and booked every one of them against the house. |
| `DEED_LIARS_DICE_CLEARED_ALTAIR_3` | The Waypost Swept | The Waypost’s regulars ran out of dice to hide behind, one bench at a time. |
| `DEED_LIARS_DICE_CLEARED_ARCTURUS_6` | The Garrison Mess Swept | The Garrison Mess lost its last hand to a civilian, and not one hand went near a sidearm. |
| `DEED_LIARS_DICE_CLEARED_DENEB_4` | The Standing Hall Swept | The Standing Hall went quiet: every cup on the long stone had been called, and every one of them had lied. |
| `DEED_LIARS_DICE_CLEARED_DENEBOLA_5` | The Incident Book Swept | The Incident Book took three fresh entries, all of them about the same captain winning. |
| `DEED_LIARS_DICE_CLEARED_FOMALHAUT_2` | The Fittings Swept | The Fittings ran out of people willing to lose at their own table, and everyone there discovered urgent work. |
| `DEED_LIARS_DICE_CLEARED_MIRA_9` | The Dry Tank Swept | The Dry Tank lived up to its name — every seat at that table had been drained. |
| `DEED_LIARS_DICE_CLEARED_POLLUX_7` | The Turnaround Swept | The whole shift at the Turnaround had been called and caught, between one departure and the next. |
| `DEED_LIARS_DICE_CLEARED_PROCYON_5` | The Bonded Room Swept | The Bonded Room stamped its last losing claim and closed the book on its own house. |
| `DEED_LIARS_DICE_CLEARED_REGULUS_6` | The High Table Swept | The High Table was beaten end to end, and its silver cups were rinsed out by a rim hauler. |
| `DEED_LIARS_DICE_CLEARED_RIGEL_8` | The Underhold Swept | The Underhold’s last player pushed the pot across and let this captain walk back up the stairs. |
| `DEED_LIARS_DICE_CLEARED_SPICA_3` | The Second Watch Swept | The Second Watch called its last bluff into the dark and lost it, along with the two before it. |
| `DEED_LIARS_DICE_CLEARED_VEGA_6` | The Long Room Swept | The Long Room ran the whole length of its table and found nobody who could beat this captain. |
| `DEED_LIARS_DICE_GRAND_SLAM` | The Whole Circuit | There was no house left on the circuit holding a player this captain had not called and caught. |
| `RANK_CONQUEROR` | Conqueror | Registry seals the Conqueror rank: the frontier keeps one name now, and it is Player. |
