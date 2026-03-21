


The following items from Decompile/Source-Text need to be implememted and tested in spacerquest-web


# FIGHT
  - Salvage system (FIGHT2.S:139-193): After winning, player searches wreckage for component upgrades (drive, cabin, LSS, nav, robotics, shields, weapon bonuses) or
  credits/gold. Modern calculateLoot only returns credits; the component salvage mechanic is entirely absent
  - Full tribute complexity: 5 surrender paths (alliance raid, smuggling confiscation, pirate tribute, etc.) are collapsed to one generic path


# GAME
  - WOF daily win limit (SP.GAME.S lines 47, 53: uh wins vs ui=12 cap, gak "closed for renovations"): Original tracks daily win count per player. Requires a wofWinsToday field on the Character schema (database migration). Noted in PRD under section 9.7b.2.

  - Spacer's Dare interactive "Roll again?" (SP.GAME.S addit2 label): Original prompts the player per roll. Current implementation uses the computer AI table as a player
   strategy proxy. Full interactivity would require per-roll state management in pub.ts. Noted in PRD under section 9.7b.3. 
   
# LIFT
  - Port lift-off fee (SP.LIFT.S lines 127–128, 138–160): Formula zh=(h1*10)+((15-sp)*10) + rank surcharge if sc>4 zh=zh+(sc*100) + 50% ally discount. This requires: fee
   calculation before startTravel, credit deduction, port ownership lookup, alliance discount check, fee logging. Structural change to the navigate/travel flow. Not
  implemented in this pass.                                                                                                                                              
  - Bribe system (SP.LIFT.S lines 76–109): Requires q1 launch contract system which is not present in the modern game. Flagged as intentional deviation (BBS-era mechanic
   removed).   
   


# REG
  Blocked (needs discussion):                                                                                                                                            
  - Space Patrol HQ full flow (S key → J/C/O/K/L): Needs schema additions (patrolDistance, patrolOath, patrolTripsCompleted) — placeholder only                          
  - Score promotion formula (every 100th battle+rescue triggers promotion point) — not yet wired into code paths                                                         
  - Patrol payoff s2 update formulas — require patrol schema fields to implement    

# START
  Blocked (needs discussion):
  1. SP.START operations submenu items (main1, lines 201-211) not accessible from modern main-menu:
     - B=Alliance Bulletins, K=Battles Log, G=Space News, H=Help, M=Map, P=Port Fuel Prices,
       S=Space Heroes, V=Who Was Here Today — these keys exist in the original SP.START operations
       menu but are not reachable from the modern main-menu.ts.
     - The modern design deliberately merged SP.LINK (main terminal) and SP.START (operations) into
       one screen with different key assignments (B=Bank, S=Shipyard, P=Pub, etc.).
     - Several of these screens exist (space-news, bulletin-board) but have no navigation path from
       the main menu. Requires architectural decision on how to expose these.

  2. Conqueror restart bonus (SP.SYSOP.S newspcr): When a Conqueror creates a new character, they
     should start with g1=10 (100,000 cr) instead of g1=1 (10,000 cr). This requires the character
     creation flow to check isConqueror status. Blocked on character creation design.


# VEST
  - Hostile takeover asset-based cost formula (y = o3*2 × 10,000)
  - Invest/Acquire command (CEO of unowned system)


