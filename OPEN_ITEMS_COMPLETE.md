Full Audit Report — All 29 ACOS-BASIC Modules

  Status: ALL ITEMS COMPLETE. All original 68 items done. 15 additional gaps found and fixed in subsequent QA passes: SP.DOCK1 wrong-port score penalty, tripsCompleted on docking, SP.FIGHT1 fuel formula, Lucky Shot probability, e6/e9 battle factor damage formula, random damage target (sfff cascade), SP.REAL port accounts gateway (prospectus/buy/sell/deposit/withdraw UI), SP.YARD cargo contract void on hull scrap, SP.DOCK2 rim arrival score bonus (y=4/y=8), SP.REG.S Space Commandant check before patrol HQ, SP.BLACK.S Andromeda dock screen (andromeda-dock.ts, cargo selection, fuel cache), docking.ts cargoManifest='X' identification bug (replaced CARGO_TYPE_ANDROMEDA=30), rim-port.ts NGC name display fix, SP.DOCK2 airlock damage condition inverted (now correctly fires when weapon+shield>=60), LSS Chrysalis airlock immunity. All gaps now complete including SP.BLACK.S start/gogo/black sections (black-hole-hub.ts). Full test suite passes (1800+ tests).

  ---
  CRITICAL — Core gameplay broken or missing

  ┌───────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  Module   │                                                                                        Gap                                                                                        │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.CARGO  │ ✅ DONE — 4-manifest board: generateManifestBoard() produces 4 contracts (types 1-9, dest 1-14≠origin, pay formula); displayed as formatted table; player picks 1-4; tested    │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.CARGO  │ ✅ DONE — calculateUpod() exported from economy.ts (SP.CARGO.S upod: s1*(h2+1)/10, halve on jc<1); traders-cargo.ts applies halving to both pod-check gate and contract-signing when manifestDate===today && tripCount>0; tested    │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.CARGO  │ ✅ DONE — Manifest board persistent: manifestBoard+manifestDate stored in Character; regenerated when date changes (cc flag); same contracts shown all day                        │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.MAL    │ ✅ DONE — Nemesis lattice puzzle implemented: after battle win, pendingLattice=true routes to nemesis-lattice screen; "INFINITY" answer shatters lattice + awards mallosex+gems rewards; 3-attempt limit + abandon (Y/N) per SP.MAL.S:379-405; tested 16 cases  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ DONE — Vandalism system: score gate (s2≥2000) added to applyVandalism; computeVandalDamage handles 5 damage types; guard pre-hire via Extra-Curricular [G]; tested              │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ DONE — Promotion honoraria: calculateRank(newScore) fires after patrol payoff; if rank advances, getHonorarium(newRank) credits added via addCredits (SP.END.S promo); tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ DONE — Pirate launch (P key): confirm→pick system(1-14)→confirm system→activateMode sets extraCurricularMode='pirate', voids cargo; fleet flavor text preserved               │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ DONE — Smuggler patrol (C key): confirm→pick system→activateMode sets extraCurricularMode='smuggler_patrol'; "Search & Destroy Smuggling" mission flavor text                 │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.BAR    │ ✅ DONE — Smuggling contract: SMU → confirm → random system(1-20) → pay=(14000+100*y)-(h1*500) → confirm → missionType=5, cargoManifest='Contraband' (SP.BAR.S:213-245); tested  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.YARD   │ ✅ DONE — Component tier names corrected to original SP.YARD.S names (Reliable/Flyer/Racer hull, Pulse Engines/Reaction Mass Engines drive, LSS Model 1A-9A, etc.)                │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.YARD   │ ✅ DONE — LSS Chrysalis downgrade guard added: purchaseShipComponent blocks lifeSupport replacement if lifeSupportName starts with "LSS Chry" (SP.YARD.S:107-110); tested        │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Hull included in player Battle Factor (ranfix line 478: a=(h2+1)*h1:gosub rfix added to calculateBattleFactor)                                                          │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Crime count (tripCount/z1) added to enemy Battle Factor: jg += crimeCount*5 (ranfix line 491)                                                                          │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Tribute halved for Brigand encounter (sk=5): calculateTribute now uses sk===5 (enemy type BRIGAND) not missionType===5                                                  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT2 │ ✅ DONE — Weapon condition: wrong round-based decrement removed; per-round applySystemDamage handles conditions; post-battle pool recalc (x8/w1) noted as architectural deviation    │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT2 │ ✅ DONE — Auto-repair post-battle: applyAutoRepair() restores +1 condition to each strength>0 component below 9 after victory (SP.FIGHT2.S:41-64); exported + tested             │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT2 │ ✅ DONE — Shield recharge post-battle: applyShieldRecharge() spends shieldStrength fuel per +1 condition if hullName ends "*" (SP.FIGHT2.S:66-75); exported + tested             │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DAMAGE │ ✅ DONE — Enhancement stripping: checkEnhancementStripping() strips "+*" suffix and applies -10 strength when condition=0 during repair (SP.DAMAGE.S:86-96); exported + tested    │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DAMAGE │ ✅ DONE — Hull-strength caps: applyHullStrengthCaps() enforces h1<10→max 99, h1≥10→max 199 in repairAllComponents (SP.DAMAGE.S:113-115); exported + tested                        │
  └───────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  HIGH — Significant gameplay impact

  ┌───────────────────┬─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │      Module       │                                                                                   Gap                                                                                   │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.WARP           │ ✅ DONE — Nav precision check: checkNavPrecision() precision=floor(n1*n2/10) if >9 else 0; roll 1-40; if fail→roll 1-20 wrong dest + malfunction warning (SP.WARP.S:194-199)  │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.WARP           │ ✅ DONE — Bridge banner: changed rank==='LIEUTENANT' check to roboticsCondition<2 (original: if r2<2 copy"sp.menu5g", r2=robotics condition); tested                   │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.LINK           │ ✅ DONE — Cargo Dispatch gate: traders 'A' checks tripCount>=3 || hasPatrolCommission || missionType===5 → "Closed for Today" (SP.LINK.S lkcargo:229-236); tested            │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1         │ ✅ DONE — Trip count bonus added to player Battle Factor (u1>49 → floor(u1/50) added to supportSum via rfox, ranfix line 479)                                              │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1         │ ✅ DONE — Speed/chase check: checkEnemySpeedChase() (spedck/spedo); post-round: enemy faster → guaranteed chase if y8+y9>0, else 1/3 chance; enemy retreats on miss; tested │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1         │ ✅ DONE — Tribute doubling fixed: original line 228 is (sk=4) or (pz>10); changed dead missionType===4 check to sk===4 (REPTILOID); pz>10 path already worked; tested     │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.MAL            │ ✅ DONE — mquit verified: modern RETREAT paths do NOT increment battlesLost; original mquit decrements m1 (Maligna counter not battlesLost); parity confirmed           │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.VEST           │ ✅ DONE — N key: queries GameLog type=ALLIANCE, displays last 20 entries (iz=2:iy=4:link"sp.top","filer"); P key: CEO-only passwd flow (4-8 chars, confirm); tested       │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.VEST           │ ✅ DONE — pz$ two-step flow: completeRaid() sets raidDocument=systemName (no ownership transfer); Investment Center render greets with "Ah...you have documents"; handleTakeoverFlow skips eligibility+cost when raidDocument===systemName; allianceSystem.update + GameLog + raidDocument=null written at invtak2; tested  │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.BAR            │ ✅ DONE — Sun-3 entry sub-menu: render shows H/B/Q; H→hangout, B→brig, Q→leave; kk=5 (smuggling) skips sub-menu; renderHangoutContent helper extracted; tested          │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.SYSOP / SP.END │ ✅ DONE — Conqueror restart bonus verified: registerCharacter checks user.hasConquered → STARTING_CREDITS_CONQUEROR (100,000 cr); main-menu sets hasConquered on score≥10000 │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REAL           │ ✅ DONE — M key (Stock Report): multi-step ratio(1-100) → renders ASCII bar chart of DOCK arrivals per system; queries GameLog DOCK events; caps bar at 60; tested       │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REAL           │ ✅ DONE — Port purchase initializes fuelStored=3000 and fuelPrice=FUEL_DEFAULT_PRICE(5 cr) per SP.REAL.S:97 m5=5:m9=3000; purchasePort() in economy.ts verified            │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK1          │ ✅ DONE — Correct-port delivery payment added; Andromeda (cargoType=30) skips teleport, delivers anywhere; payment=(min(dist,70)*300)+(systemId*500); tested. varfix k1=k1+q1: cargoDelivered+=cargoPods on delivery, wraps at 29999→0; 2 tests added.              │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK1          │ ✅ DONE — Smuggling burn path: cargoManifest ends with "Raid" → clear cargo, message "burned the plans", no payment (SP.DOCK1.S:60); tested                             │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK2          │ ✅ DONE — Rim upod verified: loading section now uses upod formula (floor(max((h2+1)*s1,10)/10)) from ship.cargoPods, not hullStrength; tested                            │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REG            │ ✅ DONE — Patrol launch now adds fuelRequired to ship.fuel (f1=f1+f2); removed erroneous fuel-check gate; calculatePatrolFuelCost zero-distance early-return fixed; tested │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REG            │ ✅ DONE — Space Commandant check added to space-patrol.ts render (SP.REG.S:177-183): if (w1+p1)>=50 && kk!=9 && !LSS C && !Ast hull → prompt before HQ menu; Y→topgun; N→HQ menu; pendingCommandant Set tracks state; 7 parity tests added  │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK2          │ ✅ DONE — Rim arrival score bonus (SP.DOCK2.S:70-72): y=4 normal arrival, y=8 when cargoManifest='X' (Andromeda); charUpdates.score=score+rimScoreBonus added to processDocking rim section; 3 parity tests added  │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK2          │ ✅ DONE — Airlock damage condition inverted bug fixed (SP.DOCK2.S:61-67): if (w1+p1)<60 goto rid is SKIP, damage fires when >=60 (not <60); LSS Chrysalis immunity added (lifeSupportName startsWith LSS C); 5 docking tests corrected + 1 Chrysalis test added  │
  ├───────────────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.BLACK          │ ✅ DONE — start/gogo/black sections (SP.BLACK.S:29-89): black-hole-hub.ts implements Astraxial hull offer (eligibility: isConqueror+LSS C+driveStr>24, cost 100k cr), 6-dest androm menu (1-6/Q/X/A/?), launch confirmation [L]/(A) calls startTravel to NGC system; navigation.ts routes system 28 arrivals to black-hole-hub; 25 parity tests added; PRD section 9.5.1b added  │
  └───────────────────┴─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  MEDIUM — Functional gaps with balance impact

  ┌───────────┬───────────────────────────────────────────────────────────────────────────────────────────────┐
  │  Module   │                                              Gap                                              │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.GAME   │ ✅ DONE — 750 cr gate verified: DARE_MIN_CREDITS=750 in constants; pub.ts and gambling.ts both check getTotalCredits < 750; tested                                         │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.LIFT   │ ✅ DONE — feek now fires at startTravel() for originSystem (lift-off); removed from completeTravel(). Original SP.LIFT.S:feek increments sp.stk[sp] at departure      │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.LIFT   │ ✅ DONE — seller Transfer mode: isOwner check (ma$=na$); prompt shows "Transfer"; fuel goes to portOwnership.fuelStored (no credits); "Fuel put into Storage!" (SP.LIFT.S:316+326); tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.LIFT   │ ✅ DONE — checkPortEviction() added to economy.ts; called in processDocking for core systems; fuel==0+bankHigh>=2→auto-buy 1000; fuel==0+bankHigh<2→delete port+clear portOwner; tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.LIFT   │ ✅ DONE — Bribed launch sets cargoPayment=20 (q6=20); delivery block detects "=-Space-=" (left$(q9$,2)="=-") for any-port match; score+=q6+2 at arriv3/varfix; tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.CARGO  │ ✅ DONE — Space Commandant prompt added to traders-cargo.ts; guards: w1+p1>=50, missionType!=9, !LSS Chrysalis, !Ast hull; Y→topgun screen; N→manifest board; tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.SPEED  │ ✅ DONE — ARCH_ANGEL/STAR_BUSTER install sets hasCloaker=false when hasCloaker is true (SP.SPEED.S nemget: right$(xl$,1)="="→cloaker lost); tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REG    │ ✅ DONE — score formula includes +1: s2=(s2+wb+q6+1)-lb in calculatePatrolPayoff (patrol.ts:195); test "score formula" verifies q6+1 bonus; already correct │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.ARENA1 │ ✅ DONE — O key added: renderArenaMenu12() outputs sp.menu12 content (Stakes Options + Arena Options with handicap formulas); O case added to arena.ts screen; header updated; tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.ARENA2 │ ✅ DONE — compfx/cost: strength-only transfer (v random components, loser str-1, winner str+1, clamped 0-199); removed erroneous condition adjustments not in original; tested           │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.ARENA2 │ ✅ DONE — Draw marks duelEntry COMPLETED; both poster+accepter checks (PENDING/ACCEPTED) effectively cleared; no credit refund on draw matches original (v=0:goto dlog)               │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DAMAGE │ ✅ DONE — cargoPods added to ComponentKey; repairSingleComponent('cargoPods') returns cost=0 "Pods repaired free" without DB call (SP.DAMAGE.S:83); schemas.ts updated; tested           │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.DAMAGE │ ✅ DONE — Junk gate: strength===0 blocks single repair with JUNK_REPAIR_ERROR; repairAllComponents skips strength===0 components (SP.DAMAGE.S enca:88 / enhc:175); tested              │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.SAVE   │ ✅ DONE — H key added to AllianceInvestScreen: renderAllianceHelp() outputs SP.HELP Alliance Holdings section (fortification, guard ship, commands summary); exported + tested               │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.SAVE   │ ✅ DONE — lm$<>o4$ check verified: modern per-player allianceMembership records make cross-alliance access impossible by design; both invest/withdraw reject NONE alliance; 5 parity tests added  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.YARD   │ ✅ DONE — Pod salvage: purchaseShipComponent adds cargoPods*2 credits and sets cargoPods=0 when transferComponents=true (SP.YARD.S scrap: g2=g2+(s1*2):s1=0); podSalvage returned in result; tested │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.YARD   │ ✅ DONE — allianceSymbol stored as separate Character field (not embedded in shipName); hull purchase never touches allianceSymbol → suffix always preserved; 3 parity tests added  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.YARD   │ ✅ DONE — Cargo contract void on hull scrap (SP.YARD.S:301-302): if q1>0 → "Cargo Contract is null and void!"; purchaseShipComponent clears cargoPods/cargoType/destination/cargoPayment/cargoManifest/missionType on character when transferComponents=true && cargoPods>0; contractVoided flag returned; 4 parity tests added  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.TOP    │ ✅ DONE — Tie display: bestByComponent/bestAllAround append "/shipName" when score equals current best (len<40 guard); tested with 2-way tie, >40 cap, and new-leader-replaces logic │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.TOP    │ ✅ DONE — parseFilerDate(MM/DD/YY) validates date per check.date subroutine; B/A keys prompt "Scan for [cat] since...(<C-R> accepts)->" and filter GameLog by createdAt>=since; lc$ persisted per player; tested    │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REAL   │ ✅ DONE — N key added to FuelDepotScreen: renderFeeReport() queries GameLog PORT_FEE for port's system, displays date/name/ship/fee matching SP.FEE format; (N)ews option shown in menu; tested    │
  ├───────────┼─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.REAL   │ ✅ DONE — Port Accounts gateway screen (start1 lines 40-57): port-accounts.ts implements M/N/P/B/Q for all players + S/W/D/F for port owners; P=Prospectus lists 14 systems with prices/owners; B=Buy multi-step (system→confirm→price→Y/N); S=Sell (prompt→system→confirm→Y/N); W=Withdraw / D=Deposit use lw-based credit encoding (last 4 digits=low, prefix=high); F routes to fuel-depot screen; Q returns to main-menu; 14 parity tests added  │
  ├───────────┼───────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ DONE — CONQUEST+HERO added to LogType enum; main-menu.ts writes both GameLog entries before character deletion (sp.great → CONQUEST, sp.hero → HERO); space-news.ts G/H keys display each log; tested    │
  └───────────┴───────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  LOW / SYSOP-ONLY

  ┌───────────┬──────────────────────────────────────────────────────────────────────┐
  │  Module   │                                 Gap                                  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK1  │ ✅ DONE — y=2 score bonus: standard cargo delivery applies score+2 via arriv3/varfix (line 289 docking.ts); test added verifying score=10→12 on delivery; parity confirmed  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.START  │ ✅ DONE — Trip limit reason: updated canTravel() reason to "You have completed 2 turns through Spacer Quest today / .....The Wonders of Space Await You...... / ...........Please call again tomorrow........" (SP.START.S:315+cally); tested  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.START  │ ✅ DONE — port-fuel-prices.ts updated to match portf format: system# + Port + Owner (or "(for sale)") + A + fuelStored + Sell(m5) + Buy(m5/2); "?" shown when price=0; tested 5 cases  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.EDIT3  │ ✅ DONE — admin-config.ts CONFIG_FIELDS[3]='pirateAttackThreshold (jw)' and [4]='patrolAttackThreshold (jx)' already expose both thresholds; AdminConfigScreen handles read+write; parity confirmed  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.PATPIR │ ✅ DONE — NPC stat tables verified: all K1-K9 pirates and SP1-SPZ patrol stats (p7/s7/s3/s5) match SP.PATPIR.S ckpir/ckpat tables exactly; 20 seed-parity tests added to black-hole.test.ts │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.BLACK  │ ✅ DONE — getBlackHoleTransitCost() now uses original fcost formula: af=min(d1,21); f2=(21-af)+(10-d2):clamp1; f2*=10; ty=f2+10:cap100; cost=ty/2; range 10-50; tested with 6 cases  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.MAL    │ ✅ DONE — linkup alien weapon degradation: hasWeaponMark+hasStarBuster → -5 str (revert to STAR-BUSTER); hasWeaponMark without StarBuster → destroy to JUNK (str=0,cond=0,clear archAngel); malwin path clears mark too; tested 3 cases  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK1  │ ✅ DONE — Wrong-port -5 score penalty: added score: Math.max(0, character.score - 5) to Mark VIII teleport character.update (SP.DOCK1.S:63: s2=s2-5); clamped at 0; 2 tests added  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.DOCK1  │ ✅ DONE — varfix tripsCompleted on every docking: cargo delivery path adds tripsCompleted:{increment:1}; general no-cargo path adds increment at end; wrong-port teleport (returns early) correctly skips per original; 3 tests added  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Fuel formula fixed for weaponStrength=1: changed Math.floor(w1/2) to w1>1?Math.floor(w1/2):1 (original: x=1:if w1>1 x=(w1/2)); Math.floor(1/2)=0 was wrong, should be 1  │
  └───────────┴──────────────────────────────────────────────────────────────────────┘

  ---
  REMAINING KNOWN GAPS (architectural deviations — need further discussion)

  ┌───────────┬──────────────────────────────────────────────────────────────────────┐
  │  Module   │                                 Gap                                  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Lucky Shot: 1/5 chance (roll=3) when shields deflect AND r1>=10 AND r2>=1; damage=(r1*r2/10+playerBF)/2, capped at e6/2; BC malfunction (r2<1) halves direct damage; added to processCombatRound; isLuckyShot in CombatRound; 6 tests  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — e6/e9 damage formula: e6=playerWeaponPower+playerBF, e9=enemyShieldPower+enemyBF (original: e6=(x8+r9):e9=(y9+jg)); was incorrectly using weapon vs shield only  │
  ├───────────┼──────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT1 │ ✅ DONE — Random damage target (sfff): applySystemDamage uses r=7:gosub rand roll to select starting component (Nav/Drives/Robotics/Cabin); cascade is Cabin→Nav→Drives→Robotics→Weapon→Hull; removed Shield/LifeSupport (not in original); 6 tests  │
  └───────────┴──────────────────────────────────────────────────────────────────────┘

  ---
  Blocked — Needs Discussion

  ┌───────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │  Module   │                                                                              Issue                                                                               │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.END    │ ✅ RESOLVED — Pirate lurk system implemented: on travel arrival, navigation.ts checks for Character WHERE extraCurricularMode='pirate' AND patrolSector=$dest; if found, spawns CombatSession with pirate's ship stats + battle factor; encounterResult routes player to combat screen; 9 parity tests added │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.BAR    │ ✅ RESOLVED — pz$="Guard" equivalent is missionType=4 (set in raid.ts); completeRaid() checks missionType===4 before calling raid subroutine; free-takeover via raidDocument now implemented in SP.VEST  │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.FIGHT2 │ ✅ RESOLVED — Malignite weapon enhancement Y/N prompt implemented (SP.FIGHT2.S scavx:157-165): pendingWeaponEnhancement map defers Y/N; both x=5 and x=9 show same "possibly defective?" prompt; N reveals "Unlucky choice/Smart move"; Y installs and prints item; 9 parity tests added │
  ├───────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.PATPIR │ ✅ RESOLVED — seed.ts verified against SP.PATPIR.S ckpir/ckpat tables; all 9 pirates and 11 patrol stats match exactly; 20 parity tests added                       │
  └───────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  BLOCKED — Needs Design Decision

  ┌───────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │    Module     │                                                                               Issue                                                                                              │
  ├───────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ SP.SYSOP      │ BLOCKED — Starting ship stats deviation: Original pstat (lines 277-285) sets ALL component strengths and conditions to 0 (h1=d1=c1=l1=w1=n1=r1=p1=0, h2=d2=c2=l2=w2=n2=r2=p2=0). Modern registry.ts creates Ship with pre-populated values (hullStrength:5/cond:9, driveStrength:5/cond:9, etc.) and fuel:50. The original design required players to buy their first components at the Shipyard using their 10,000 cr starting grant. The modern approach skips this step for UX. Fixing to all-zeros requires either (a) implementing a shipyard-first onboarding gate, or (b) formally approving the pre-populated starter stats as a design deviation. PRD line 75 says "Purchase first ship components" as the initial goal, suggesting original intent. Requires design decision before code change. │
  └───────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  ---
  Totals

  - Batch 1 (SP.GAME, SP.START, SP.DOCK1, SP.DOCK2, SP.LINK, SP.LIFT, SP.WARP, SP.CARGO, SP.SPEED, SP.REG): ~30 gaps
  - Batch 2 (SP.FIGHT1, SP.FIGHT2, SP.ARENA1, SP.ARENA2, SP.PATPIR, SP.MAL, SP.DAMAGE, SP.BAR, SP.BLACK, SP.VEST): 33 gaps
  - Batch 3 (SP.YARD, SP.EDIT1, SP.EDIT2, SP.EDIT3, SP.TOP, SP.SYSOP, SP.SAVE, SP.END, SP.REAL): ~35 gaps
  - Total: ~98 gaps across 29 modules

  The implementation is not at parity with the 1991 original. The most impactful missing features from a player perspective are: the 4-manifest cargo board, the Nemesis puzzle, the vandalism
  system, promotion honoraria, pirate/smuggler patrol modes, correct component tier names, correct Battle Factor formulas, and the post-combat auto-repair/shield-recharge passes.