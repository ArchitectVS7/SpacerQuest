/**
 * T-142 · VERBATIM SAMPLES from real T-140 and T-141 output.
 *
 * WHY A TS MODULE AND NOT A DATA FILE. The real artefacts these lines were cut
 * from live under `.scratch/`, which is gitignored — a test that read them would
 * pass on the machine that produced them and fail on every clean clone. So the
 * sample is committed, and it is committed SMALL: `docs/balance/smoke/README.md`
 * warns that a large committed copy of a live artefact becomes a second, staler
 * copy of it, and that warning applies here exactly as it applies to a fixture.
 *
 * PROVENANCE
 *   - TRACE_JSONL_SAMPLE: the first 20 lines of
 *     `.scratch/balance/traces-t140-trace-shard1of1.jsonl`, a 22,357-line trace
 *     produced by `balance:sweep --trace-npc-decisions` under label
 *     `t140-trace` (sampled 2026-08-01). 16 `intent` lines and 4 `contract`
 *     lines across six archetypes, including candidates carrying weight 0 — the
 *     listed-but-unreachable case the report has to tell apart from
 *     never-offered.
 *   - PLAYTEST_JSONL_SAMPLE / PLAYTEST_CSV_SAMPLE: the SAME seven entries of a
 *     real T-141 export (five actions, one engine error, one tester
 *     annotation), produced 2026-08-01 by driving real `applyPlayerAction` calls
 *     through `@spacerquest/engine` and recording them through
 *     `packages/ui/src/playtestLog.ts`'s real `recordAction` / `recordError` /
 *     `recordAnnotation`, serialized by its real `toJsonl` and `toCsv`. Same
 *     entries in both flavours DELIBERATELY: the CSV is a lossy flattening of
 *     the same record, so the two must produce identical action counts, and
 *     `../balance-report.test.ts` asserts exactly that.
 *
 * Nothing here is hand-written. Do not edit a line to make a test pass — re-cut
 * the sample from a fresh run instead.
 */

export const TRACE_JSONL_SAMPLE =
  [
    '{"day":1,"npcId":"npc-the-warden","archetype":"veteran","ideal":"Justice","kind":"intent","candidates":[{"option":"Trade","weight":0},{"option":"Travel","weight":4},{"option":"Combat","weight":8},{"option":"Patrol","weight":5},{"option":"Socialize","weight":0}],"roll":16.83552961749956,"chosen":"Patrol"}',
    '{"day":1,"npcId":"npc-admiral-stern","archetype":"veteran","ideal":"Order","kind":"intent","candidates":[{"option":"Trade","weight":2},{"option":"Travel","weight":4},{"option":"Combat","weight":4},{"option":"Patrol","weight":5},{"option":"Socialize","weight":1}],"roll":15.219717927277088,"chosen":"Socialize"}',
    '{"day":1,"npcId":"npc-frost-helm","archetype":"veteran","ideal":"Logic","kind":"intent","candidates":[{"option":"Trade","weight":8},{"option":"Travel","weight":4},{"option":"Combat","weight":2},{"option":"Patrol","weight":2},{"option":"Socialize","weight":1}],"roll":7.1857400997541845,"chosen":"Trade"}',
    '{"day":1,"npcId":"npc-frost-helm","archetype":"veteran","ideal":"Logic","kind":"contract","candidates":[{"option":"0","weight":191.55555555555554},{"option":"1","weight":162.9090909090909},{"option":"2","weight":214.66666666666666},{"option":"3","weight":222.85714285714286}],"roll":0.22798180114477873,"chosen":"3"}',
    '{"day":1,"npcId":"npc-neon-shade","archetype":"smuggler","ideal":"Mystery","kind":"intent","candidates":[{"option":"Trade","weight":2},{"option":"Travel","weight":10},{"option":"Combat","weight":2},{"option":"Patrol","weight":1},{"option":"Socialize","weight":2}],"roll":16.319843447767198,"chosen":"Socialize"}',
    '{"day":1,"npcId":"npc-dust-devil","archetype":"trader","ideal":"Profit","kind":"intent","candidates":[{"option":"Trade","weight":10},{"option":"Travel","weight":2},{"option":"Combat","weight":2},{"option":"Patrol","weight":0},{"option":"Socialize","weight":1}],"roll":2.694041080540046,"chosen":"Trade"}',
    '{"day":1,"npcId":"npc-junk-lord","archetype":"veteran","ideal":"Possession","kind":"intent","candidates":[{"option":"Trade","weight":8},{"option":"Travel","weight":4},{"option":"Combat","weight":4},{"option":"Patrol","weight":2},{"option":"Socialize","weight":0}],"roll":10.659774948377162,"chosen":"Travel"}',
    '{"day":1,"npcId":"npc-crimson-hawk","archetype":"fighter","ideal":"Glory","kind":"intent","candidates":[{"option":"Trade","weight":1},{"option":"Travel","weight":3},{"option":"Combat","weight":10},{"option":"Patrol","weight":2},{"option":"Socialize","weight":2}],"roll":14.731775346212089,"chosen":"Patrol"}',
    '{"day":1,"npcId":"npc-star-chaser","archetype":"explorer","ideal":"Discovery","kind":"intent","candidates":[{"option":"Trade","weight":1},{"option":"Travel","weight":12},{"option":"Combat","weight":0},{"option":"Patrol","weight":1},{"option":"Socialize","weight":1}],"roll":5.186322836671025,"chosen":"Travel"}',
    '{"day":1,"npcId":"npc-solar-flare","archetype":"gambler","ideal":"Power","kind":"intent","candidates":[{"option":"Trade","weight":1},{"option":"Travel","weight":2},{"option":"Combat","weight":5},{"option":"Patrol","weight":2},{"option":"Socialize","weight":2}],"roll":11.192328806966543,"chosen":"Socialize"}',
    '{"day":1,"npcId":"npc-iron-clad","archetype":"fighter","ideal":"Dominance","kind":"intent","candidates":[{"option":"Trade","weight":1},{"option":"Travel","weight":1},{"option":"Combat","weight":10},{"option":"Patrol","weight":6},{"option":"Socialize","weight":0}],"roll":17.611588918603957,"chosen":"Patrol"}',
    '{"day":1,"npcId":"npc-black-tide","archetype":"veteran","ideal":"Power","kind":"intent","candidates":[{"option":"Trade","weight":2},{"option":"Travel","weight":4},{"option":"Combat","weight":10},{"option":"Patrol","weight":2},{"option":"Socialize","weight":1}],"roll":1.5770113135222346,"chosen":"Trade"}',
    '{"day":1,"npcId":"npc-black-tide","archetype":"veteran","ideal":"Power","kind":"contract","candidates":[{"option":"0","weight":192},{"option":"1","weight":187},{"option":"2","weight":246.85714285714286},{"option":"3","weight":389.45454545454544}],"roll":0.043550751404836774,"chosen":"3"}',
    '{"day":1,"npcId":"npc-cargo-king","archetype":"trader","ideal":"Wealth","kind":"intent","candidates":[{"option":"Trade","weight":12},{"option":"Travel","weight":2},{"option":"Combat","weight":0},{"option":"Patrol","weight":1},{"option":"Socialize","weight":1}],"roll":9.762339387089014,"chosen":"Trade"}',
    '{"day":1,"npcId":"npc-cargo-king","archetype":"trader","ideal":"Wealth","kind":"contract","candidates":[{"option":"0","weight":6040},{"option":"1","weight":1700}],"roll":0.23158671823330224,"chosen":"0"}',
    '{"day":1,"npcId":"npc-plasma-burn","archetype":"fighter","ideal":"Power","kind":"intent","candidates":[{"option":"Trade","weight":1},{"option":"Travel","weight":2},{"option":"Combat","weight":10},{"option":"Patrol","weight":4},{"option":"Socialize","weight":1}],"roll":7.574787658173591,"chosen":"Combat"}',
    '{"day":1,"npcId":"npc-neon-fox","archetype":"gambler","ideal":"Advantage","kind":"intent","candidates":[{"option":"Trade","weight":4},{"option":"Travel","weight":2},{"option":"Combat","weight":1},{"option":"Patrol","weight":0},{"option":"Socialize","weight":6}],"roll":9.597191945184022,"chosen":"Socialize"}',
    '{"day":1,"npcId":"npc-the-chef","archetype":"smuggler","ideal":"Flavor","kind":"intent","candidates":[{"option":"Trade","weight":10},{"option":"Travel","weight":6},{"option":"Combat","weight":0},{"option":"Patrol","weight":0},{"option":"Socialize","weight":4}],"roll":15.931948288343847,"chosen":"Travel"}',
    '{"day":1,"npcId":"npc-zero-risk","archetype":"trader","ideal":"Survival","kind":"intent","candidates":[{"option":"Trade","weight":8},{"option":"Travel","weight":2},{"option":"Combat","weight":0},{"option":"Patrol","weight":2},{"option":"Socialize","weight":1}],"roll":6.617238279664889,"chosen":"Trade"}',
    '{"day":1,"npcId":"npc-zero-risk","archetype":"trader","ideal":"Survival","kind":"contract","candidates":[{"option":"0","weight":1740},{"option":"1","weight":1920},{"option":"2","weight":7356},{"option":"3","weight":1896}],"roll":0.06356234615668654,"chosen":"2"}',
  ].join('\n') + '\n';

export const PLAYTEST_JSONL_SAMPLE =
  [
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":1,"kind":"action","action":{"type":"Trade","action":"buy-fuel","fuelAmount":4,"spendDie":0},"events":[{"type":"TradeEvent","characterId":"player","action":"buy-fuel","success":true,"fuelAmount":4,"cost":32,"actionDetails":"Bought 4 fuel for 32 credits."}]}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":1,"kind":"action","action":{"type":"Trade","action":"sign-contract","contractIndex":0,"spendDie":1},"events":[{"type":"TradeEvent","characterId":"player","action":"sign-contract","success":true,"destination":3,"cargoType":6,"payment":1960,"actionDetails":"Signed contract to deliver cargo to 3 for 1960 credits."},{"type":"DeedEarned","day":1,"deedId":"first_manifest","title":"First Manifest","citation":"On day 1, the Guild ledger first trusted this captain with a manifest.","renownRank":"COMMANDER"},{"type":"RenownRankUp","day":1,"previousRank":"LIEUTENANT","newRank":"COMMANDER","deedCount":1},{"type":"WireEntry","day":1,"kind":"plain","message":"Registry confirms Player as Commander — one deed on the board, and the port clerks have stopped asking how the name is spelled."},{"type":"StoryletOffered","day":1,"storyletId":"cargo.precious-metals.escort-shakedown","scheduled":false}]}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":1,"kind":"action","action":{"type":"Explore","spendDie":2},"events":[{"type":"StatCheck","actor":"Player","stat":"PILOT","dc":12,"result":{"die":9,"modifier":1,"total":10,"dc":12,"success":false,"margin":-2,"nat20":false,"nat1":false}},{"type":"ExplorationFailed","day":1,"systemId":1,"reason":"nav-check"},{"type":"WireEntry","day":1,"kind":"plain","message":"Player\'s nav sweep off system 1 turned up nothing but static."}]}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":1,"kind":"action","action":{"type":"Wait"},"events":[]}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":1,"kind":"action","action":{"type":"Travel","destinationId":9999},"events":[{"type":"ActionBlocked","day":1,"actionType":"Travel","reason":"destination-locked"}]}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":2,"kind":"error","error":"applyPlayerAction requires DAY phase"}',
    '{"sessionId":"1628e70e-1fb2-42dc-af4e-1f20abfe35a5","day":4,"kind":"annotation","note":"Board felt empty here — flagging the moment."}',
  ].join('\n') + '\n';

export const PLAYTEST_CSV_SAMPLE =
  [
    'sessionId,day,kind,actionType,action,events,note,error',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,1,action,Trade,"{""type"":""Trade"",""action"":""buy-fuel"",""fuelAmount"":4,""spendDie"":0}","[{""type"":""TradeEvent"",""characterId"":""player"",""action"":""buy-fuel"",""success"":true,""fuelAmount"":4,""cost"":32,""actionDetails"":""Bought 4 fuel for 32 credits.""}]",,',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,1,action,Trade,"{""type"":""Trade"",""action"":""sign-contract"",""contractIndex"":0,""spendDie"":1}","[{""type"":""TradeEvent"",""characterId"":""player"",""action"":""sign-contract"",""success"":true,""destination"":3,""cargoType"":6,""payment"":1960,""actionDetails"":""Signed contract to deliver cargo to 3 for 1960 credits.""},{""type"":""DeedEarned"",""day"":1,""deedId"":""first_manifest"",""title"":""First Manifest"",""citation"":""On day 1, the Guild ledger first trusted this captain with a manifest."",""renownRank"":""COMMANDER""},{""type"":""RenownRankUp"",""day"":1,""previousRank"":""LIEUTENANT"",""newRank"":""COMMANDER"",""deedCount"":1},{""type"":""WireEntry"",""day"":1,""kind"":""plain"",""message"":""Registry confirms Player as Commander — one deed on the board, and the port clerks have stopped asking how the name is spelled.""},{""type"":""StoryletOffered"",""day"":1,""storyletId"":""cargo.precious-metals.escort-shakedown"",""scheduled"":false}]",,',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,1,action,Explore,"{""type"":""Explore"",""spendDie"":2}","[{""type"":""StatCheck"",""actor"":""Player"",""stat"":""PILOT"",""dc"":12,""result"":{""die"":9,""modifier"":1,""total"":10,""dc"":12,""success"":false,""margin"":-2,""nat20"":false,""nat1"":false}},{""type"":""ExplorationFailed"",""day"":1,""systemId"":1,""reason"":""nav-check""},{""type"":""WireEntry"",""day"":1,""kind"":""plain"",""message"":""Player\'s nav sweep off system 1 turned up nothing but static.""}]",,',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,1,action,Wait,"{""type"":""Wait""}",[],,',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,1,action,Travel,"{""type"":""Travel"",""destinationId"":9999}","[{""type"":""ActionBlocked"",""day"":1,""actionType"":""Travel"",""reason"":""destination-locked""}]",,',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,2,error,,,,,applyPlayerAction requires DAY phase',
    '1628e70e-1fb2-42dc-af4e-1f20abfe35a5,4,annotation,,,,Board felt empty here — flagging the moment.,',
  ].join('\n') + '\n';
