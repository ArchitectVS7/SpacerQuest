# ACOS Interpreter Feasibility Exploration

## Background

Gemini suggested building an ACOS interpreter to run the original SpacerQuest source directly, rather than rewriting the game in modern TypeScript. Claude initially pushed back on this due to the GBBS-specific nature of ACOS. This document explores both approaches formally.

---

## 1. What Is ACOS?

**ACOS** ("All Purpose Communications Operating System") is a tokenized BASIC-like language created by Greg Schaefer (Boulder, CO) specifically for **GBBS Pro** (Golden Board Bulletin System) on Apple II under ProDOS. It is:

- **Not truly compiled** -- it's tokenized (bytecode-like), executed by an interpreter baked into the GBBS Pro runtime (written in 6502 assembly)
- **BASIC-derived** -- syntactically descended from Applesoft BASIC with BBS-specific extensions
- **Modular** -- programs are broken into "segments" (`.S` files) that `link` to each other
- **BBS-coupled** -- deeply intertwined with GBBS Pro's user management, modem control, and file systems

### Variants

| Name | Description |
|------|-------------|
| ACOS | Original by Greg Schaefer |
| MACOS | "Modified ACOS" -- added arrays, better debugging |
| METAL | Clean-room rewrite with same grammar, no ACOS code |
| LLUCE | Complete rewrite by Andrew Wells for L&L Productions |

### Current Status

GBBS Pro source (including the ACOS runtime in 6502 assembly) is open source under GPL 3 on GitHub: [callapple/GBBS-2.x](https://github.com/callapple/GBBS-2.x). The 410+ page printed manual is available through the A.P.P.L.E. bookstore. No standalone ACOS command reference exists freely online -- the definitive reference is the GBBS Pro v2.2 manual (pp. 64-77).

---

## 2. SpacerQuest's ACOS Footprint

### Source Code Inventory

| Metric | Value |
|--------|-------|
| ACOS source modules | 29 files |
| Total lines of code | ~11,776 |
| Data/asset files | 140 files (in `SQ/`) |
| Documented variables | 56+ (see `SQ/SQ.VAR`) |
| Star systems | 28 |
| Ship components | 8 |

### Module Breakdown

| Category | Modules |
|----------|---------|
| Entry/Exit | SP.START, SP.END, SP.LINK, SP.GAME |
| Navigation | SP.WARP, SP.LIFT, SP.SPEED, SP.DOCK1, SP.DOCK2 |
| Combat | SP.FIGHT1, SP.FIGHT2, SP.ARENA1, SP.ARENA2 |
| Economy | SP.CARGO, SP.YARD, SP.BAR, SP.REAL, SP.BLACK |
| Character | SP.REG, SP.EDIT1, SP.EDIT2, SP.EDIT3, SP.TOP |
| Special | SP.MAL, SP.VEST, SP.PATPIR, SP.RIMPIR, SP.SAVE |
| Admin | SP.SYSOP |

---

## 3. ACOS Command Inventory (Extracted from SpacerQuest Source + GBBS Research)

### General-Purpose (BASIC-like)

These are standard BASIC commands that any BASIC interpreter would handle:

| Command | Usage in SQ | Notes |
|---------|-------------|-------|
| `print` | Everywhere | Text output, supports `\` for newline, `hl$`/`of$` for ANSI highlights |
| `print #3` | Various | Output to specific device (device 3 = local screen only) |
| `input` | Everywhere | User text input, `input #1,var` for file input |
| `input @N` | Various | Input with options (N controls behavior/timeout) |
| `if` ... `goto`/assignment | Everywhere | Conditionals (no `then` keyword, just inline) |
| `if` ... `else` | Various | `if expr goto x:else statement` |
| `goto` | Everywhere | Label-based jumps |
| `gosub` / `return` | Everywhere | Subroutine calls |
| `on` ... `goto` | SP.WARP, etc. | Computed goto |
| `for` / `next` | SP.START, etc. | Counting loops |
| `val()` | SP.YARD, etc. | String to number |
| `str$()` | SP.WARP, etc. | Number to string |
| `len()` | SP.START, etc. | String length |
| `left$()` / `right$()` | SP.WARP, etc. | String slicing |
| `mid$(s,pos,len)` | Various | Substring extraction |
| `chr$()` | Everywhere | Character from code, supports multi-arg: `chr$(13)`, `chr$(45,49)` |
| `chr$(n,count)` | Various | Repeat character N times (non-standard!) |
| `asc()` | Various | Character to ASCII code |
| `instr(s1,s2)` | Various | Find substring position |
| `not` / `and` / `or` | Everywhere | Boolean operators |
| `mod` / `div` | SP.FIGHT, etc. | Integer arithmetic |
| `random(n)` | Various | Random number generation |

**Important limitation:** ACOS integers cap at ~32767. SpacerQuest works around this by splitting credits across two variables: `g1` (10K multiples) and `g2` (remainder <10K), with a `crfix` subroutine to handle overflow between them.

### File I/O

| Command | Usage | Notes |
|---------|-------|-------|
| `open #N, filename` | Everywhere | Open file channel |
| `close` | Everywhere | Close current/all channels |
| `input #N, var` | Everywhere | Read from file |
| `print #N, value` | SP.START, etc. | Write to file |
| `position #N, recsize, recnum` | Everywhere | Seek to record (fixed-width record access!) |
| `mark(N)` | SP.START | Get file position/size |
| `create filename` | SP.START | Create new file |
| `kill filename` | SP.START | Delete file |
| `copy filename` | SP.YARD, etc. | **Display text file to terminal** (not file copy!) |
| `copy (N) #F` | Various | Display N lines from file handle |
| `append #N` | SP.TOP, etc. | Set append mode on channel |
| `delete` | Various | Delete record |
| `eof(N)` | Various | End-of-file check |

### BBS/GBBS-Specific Commands

These are the **problematic** ones -- they have no analog in standard BASIC:

| Command | Usage | What It Does |
|---------|-------|-------------|
| `link "segment"` | Everywhere | **Load and execute another ACOS segment** -- this is the inter-module call mechanism. Equivalent to loading another compiled program. |
| `link "seg","label"` | Various | **Link to segment at specific exported label** |
| `on nocar goto label` | Every module | **Modem carrier-loss trap** -- jumps to cleanup code when the remote user disconnects. This is an interrupt/signal handler. |
| `store "a:var"` | SP.START | **Persist all variables to disk** -- saves the entire variable state to a file for segment switching. |
| `recall "a:var"` | Implied by link | **Restore all variables from disk** -- loads variable state after segment switch. |
| `log` | SP.START, etc. | **Write to BBS audit log** / set default volume |
| `info(N)` | SP.START | **Query BBS system info** -- `info(5)` = is user a sysop, etc. |
| `setint(N)` | Not in SQ directly | **Set interface/interrupt mode** (modem settings) |
| `modem(N)` | Various | **Direct modem control** |
| `clock(N)` | Various | **System clock access** -- `clock(1)` = elapsed time, `clock(2)` = time limit |
| `time$` / `date$` | Various | **Current time/date strings** |
| `flag(N)` | Various | **BBS system flag access** |
| `edit(N)` | Various | **Editor/system mode query** |
| `free` | SP.FIGHT1 | **Release memory** / garbage collect |
| `public label` | Every module | **Export label** for inter-segment linking |
| `seg` | SP.START | **Segment marker** -- indicates start of a compiled segment |
| `pop` | SP.YARD | **Pop return address** from gosub stack (discard pending return) |
| `get` | Various | **Single-character input** (blocking keypress) |
| `key(N)` | Various | **Non-blocking keypress check** -- `key(0)` polls for input |
| `clear key` | Various | **Clear keyboard buffer** |
| `peek` / `poke` | Various | **Direct memory access** (6502 memory map) -- SQ uses `peek(-16384)` for keyboard latch, `poke 37,0` for cursor position |

### ANSI/Terminal Control (via conventions, not commands)

SpacerQuest uses string variables for ANSI escape sequences:
- `hl$` = highlight on (bold/color)
- `of$` = highlight off
- `\\` in print = newline
- `chr$(12)` = clear screen
- `chr$(7)` = bell
- `chr$(8,2)` = backspace 2 positions

---

## 4. What Would an ACOS Interpreter Require?

### Tier 1: Core Language (Feasible -- ~2-3 weeks)

A standard BASIC interpreter core:

1. **Lexer/Tokenizer** -- Parse ACOS source into tokens
2. **Expression evaluator** -- Arithmetic, string ops, comparisons
3. **Variable system** -- Integer numbers and strings (name$ convention), no arrays in base ACOS
4. **Flow control** -- `goto`, `gosub`/`return`, `for`/`next`, `if`, `on...goto`
5. **String functions** -- `left$`, `right$`, `len`, `val`, `str$`, `chr$`
6. **Label resolution** -- ACOS uses labels (not line numbers) with `:` suffix
7. **Multiple statements per line** -- `:` delimiter

This is well-trodden ground. Many open-source BASIC interpreters exist to reference.

### Tier 2: File I/O System (Moderate -- ~1-2 weeks)

ACOS uses a fixed-record file I/O system that maps well to modern databases:

1. **Channel-based file I/O** -- `open #1, "filename"`, `close`
2. **Record positioning** -- `position #1, 256, x` (seek to record x of size 256 bytes)
3. **Sequential I/O** -- `input #1, var1\var2\var3` (backslash-delimited multi-field reads)
4. **File management** -- `create`, `kill`, `mark()`
5. **Copy** -- Display a text file (this is screen output, not file duplication)

The record-based I/O is a **close match for database rows**. You could back this with SQLite, JSON files, or even Prisma.

### Tier 3: BBS Runtime Environment (Hard -- ~3-4 weeks)

This is where the GBBS coupling creates real difficulty:

| Feature | Difficulty | Why It's Hard |
|---------|-----------|---------------|
| `link` / `store` / `recall` | **High** | Entire variable space must serialize, new segment loads and runs with fresh code but restored variables. Essentially coroutine/process management. |
| `on nocar goto` | **Medium** | Need to simulate carrier-loss as a signal/interrupt. In a web context, this maps to WebSocket disconnect events. |
| `info(N)` | **Medium** | Need to map each `info()` code to an equivalent. Some are trivial (sysop check), others are hardware-specific (baud rate). |
| `public` / `seg` | **Medium** | Segment linking and symbol export. Need a module loader. |
| `peek` / `poke` | **Hard** | Direct 6502 memory access. SQ doesn't use these heavily, but any usage would need a memory map emulation. |
| `setint()` | **Low** | Modem interface -- can be stubbed for web. |

### Tier 4: Data File Compatibility (Medium -- ~1 week)

The original game stores data in fixed-width binary records:
- Player records: 256 bytes each across `SPACERS1`/`SPACERS2`
- Pirate records, battle logs, alliance data, etc.
- The `\` delimiter in `input #1,a$\b$\c$` reads multiple fields per record

You'd need to either:
- **A)** Parse the original binary data files (reverse-engineer the record format)
- **B)** Seed fresh data (like we do now with Prisma)

---

## 5. Honest Assessment: ACOS Interpreter vs. Current Approach

### Cost Comparison

| Approach | Effort | Lines of Code | Behavior Fidelity |
|----------|--------|---------------|-------------------|
| **Current rewrite** (TypeScript/React) | ~6-8 weeks total | ~15,000+ | High, but requires manual verification of every formula |
| **ACOS interpreter** | ~6-10 weeks for interpreter + runtime | ~5,000-8,000 (interpreter) + 11,776 (original ACOS) | Near-perfect IF the interpreter is correct |

### Arguments FOR an ACOS Interpreter

1. **Perfect gameplay fidelity** -- The original code IS the specification. No translation errors possible. Every formula, every edge case, every screen layout comes for free.
2. **Reusable** -- Other GBBS ACOS games could run on the same interpreter. There were many: Land of Spur, Trade Wars clones, etc.
3. **Historical preservation** -- A working ACOS interpreter has archival value beyond SpacerQuest.
4. **The source is available** -- We have all 29 decompiled ACOS source files in readable text format.
5. **Smaller blast radius** -- Bugs in the interpreter are interpreter bugs. The game logic is proven (ran for years on real BBSes).

### Arguments AGAINST an ACOS Interpreter

1. **The BBS runtime is the hard part** -- The core BASIC interpreter is maybe 40% of the work. The remaining 60% is emulating the GBBS runtime environment (`link`/`store`/`recall`, `info()`, `on nocar`, etc.). This is where my earlier pushback came from.
2. **No complete ACOS specification exists online** -- The 410-page manual exists only in print. We'd be reverse-engineering from source code and the 6502 assembly ACOS runtime.
3. **Testing the interpreter itself** -- You need tests for the interpreter, not just the game. Each ACOS command needs verification.
4. **Modern web integration** -- Even with a working interpreter, you still need the WebSocket transport, React frontend, xterm.js terminal, authentication, etc. The ACOS interpreter only replaces the `src/game/` layer.
5. **We're mostly done** -- The current TypeScript rewrite is already functional. Starting over with an interpreter now would be net negative on this specific project.

### The Middle Path: Hybrid Approach

There's an interesting middle ground:
- Build a **lightweight ACOS-to-TypeScript transpiler** instead of a runtime interpreter
- Convert the 29 modules to TypeScript functions automatically
- Hand-verify the output, keeping original ACOS as reference
- This gives you fidelity checking without a full runtime

---

## 6. What About Other ACOS Programs?

If the goal extends beyond SpacerQuest to **general ACOS program preservation**, the interpreter approach becomes much more compelling:

| Factor | SpacerQuest Only | General ACOS |
|--------|-----------------|--------------|
| ROI of interpreter | Low (we're nearly done) | High (many programs preserved) |
| Community interest | Niche | Moderate (retro computing) |
| GBBS runtime fidelity needed | Partial (no modem) | Full |
| Documentation investment | Worth it for one game? | Worth it for an ecosystem |

The GBBS Pro source is on GitHub. The ACOS runtime (in 6502 assembly in the `SOURCE/ACOS/` directory) IS the specification. A dedicated effort could reverse-engineer the complete token set and semantics from that assembly code.

---

## 7. TRS-80 Color Computer BASIC: A Comparison

You asked about CoCo BASIC as well. Here's how it compares:

### What Is CoCo BASIC?

The TRS-80 Color Computer shipped with **Color BASIC**, a Microsoft BASIC variant for the Motorola 6809E processor. It came in four tiers:

| Level | Source | Key Additions |
|-------|--------|---------------|
| **Color BASIC** | ROM (all CoCos) | Core BASIC, keyboard, video, cassette I/O |
| **Extended Color BASIC** | ROM (optional) | `PLAY` (music), `DRAW` (vector graphics), `PCLS`, `PSET`, etc. |
| **Disk Extended Color BASIC** | ROM (disk controller) | `OPEN`, `CLOSE`, `WRITE`, `GET`, `PUT`, disk file I/O |
| **Super Extended Color BASIC** | ROM (CoCo 3 only) | Enhanced graphics modes, `WIDTH`, `PALETTE`, `HSCREEN` |

### Complete Keyword Sets (from ROM source analysis)

**Color BASIC statements:** `AUDIO ON/OFF`, `CLEAR`, `CLOAD`, `CLOADM`, `CLOSE`, `CLS`, `CONT`, `CSAVE`, `CSAVEM`, `DATA`, `DIM`, `END`, `EXEC`, `FOR..TO..STEP/NEXT`, `GOSUB`, `GOTO`, `IF..THEN..ELSE`, `INPUT`, `LET`, `LINE INPUT`, `LIST`, `LLIST`, `MOTOR ON/OFF`, `NEW`, `ON..GOTO`, `ON..GOSUB`, `OPEN`, `POKE`, `PRINT`, `PRINT @`, `READ`, `REM`, `RENUM`, `RESET`, `RESTORE`, `RETURN`, `RUN`, `SET`, `SKIPF`, `SOUND`, `STOP`

**Color BASIC functions:** `ABS`, `ASC`, `CHR$`, `COS`, `EOF`, `EXP`, `FIX`, `HEX$`, `INKEY$`, `INT`, `JOYSTK`, `LEFT$`, `LEN`, `LOG`, `MEM`, `MID$`, `PEEK`, `POINT`, `POS`, `RIGHT$`, `RND`, `SGN`, `SIN`, `SQR`, `STR$`, `STRING$`, `TAB`, `TAN`, `ATN`, `USR`, `VAL`

**Extended Color BASIC additions:** `CIRCLE`, `COLOR`, `DEF FN`, `DEF USR`, `DEL`, `DLOAD`, `DRAW`, `EDIT`, `GET`, `LINE`, `PAINT`, `PCLEAR`, `PCLS`, `PCOPY`, `PLAY`, `PMODE`, `PRESET`, `PSET`, `PUT`, `SCREEN`, `TIMER`, `BUTTON`, `INSTR`, `PPOINT`, `USRn`, `VARPTR`

**Disk Extended Color BASIC additions:** `BACKUP`, `CLOSE`, `COPY`, `CVN`, `DIR`, `DRIVE`, `DSKI$`, `DSKO$`, `DSKINI`, `FIELD`, `FILES`, `FREE`, `GET`, `KILL`, `LOAD`, `LOADM`, `LOC`, `LOF`, `LSET`, `MERGE`, `MKN$`, `OPEN`, `PUT`, `RENAME`, `RSET`, `SAVE`, `SAVEM`, `UNLOAD`, `WRITE`

**Super Extended Color BASIC additions (CoCo 3):** `ATTR`, `HBUFF`, `HCIRCLE`, `HCLS`, `HCOLOR`, `HDRAW`, `HGET`, `HLINE`, `HPAINT`, `HPOINT`, `HPRINT`, `HPUT`, `HRESET`, `HSCREEN`, `HSET`, `HSTAT`, `LOCATE`, `LPEEK`, `LPOKE`, `ON BRK`, `ON ERR`, `PALETTE`, `PALETTE CMP`, `PALETTE RGB`, `RGB`, `WIDTH`

### Existing CoCo Tools and Emulators

Unlike ACOS, there is a rich ecosystem of existing tools:

| Tool | Type | Notes |
|------|------|-------|
| [XRoar](https://www.6809.org.uk/xroar/) | Emulator | Full CoCo emulator, **has a WebAssembly/browser build** |
| MAME/MESS | Emulator | Multi-system, supports CoCo 1/2/3 |
| VCC | Emulator | Virtual Color Computer (Windows) |
| [coco_roms](https://github.com/tomctomc/coco_roms) | Source | Complete 6809 assembly source for all Color BASIC ROM versions |
| [BASIC-To-6809](https://github.com/nowhereman999/BASIC-To-6809) | Compiler | CoCo BASIC compiler to native 6809 code |
| [coco-tools](https://github.com/jamieleecho/coco-tools) | Tools | Python tools including Color BASIC converter |
| [Color Computer Archive](https://colorcomputerarchive.com/) | Archive | Comprehensive CoCo software/docs library |

The ROM source code being available on GitHub means the complete specification is known. No reverse engineering needed.

### Building a CoCo BASIC Interpreter: Feasibility

**This is significantly easier than ACOS** because:

1. **Well-documented** -- Microsoft BASIC is thoroughly documented. The CoCo BASIC reference manual is freely available online. The complete ROM source code is on GitHub.
2. **Standard dialect** -- It's a superset of standard Microsoft BASIC. Many interpreters already exist.
3. **No BBS coupling** -- CoCo BASIC is a general-purpose language. No `link`/`store`/`recall` segment management.
4. **Existing implementations** -- Multiple CoCo emulators exist. XRoar already runs in the browser via WebAssembly.
5. **Hardware abstraction is bounded** -- Graphics (PMODE, HSCREEN), sound (PLAY, SOUND), and joystick (JOYSTK) are the main hardware interfaces. These map cleanly to HTML5 Canvas and Web Audio.

### CoCo BASIC: Unique Features vs. Standard BASIC

Things a CoCo BASIC interpreter must handle that generic BASIC interpreters don't:
- **`PRINT @`** -- Position-based printing using screen positions 0-511
- **`SET(x,y,color)` / `RESET` / `POINT`** -- 64x32 semigraphics block characters
- **`PMODE 0-4`** -- Page-based graphics modes (not standard pixel coordinates)
- **`DRAW`** -- Turtle-like vector graphics via string macros ("U5R3D5L3")
- **`PLAY`** -- Music macro language for sound synthesis ("T120O4L4CDEFGAB")
- **`JOYSTK(0-3)`** -- Joystick axis values 0-63
- **`CLOAD`/`CSAVE`** -- Cassette I/O (virtual in an interpreter)
- **`DSKI$`/`DSKO$`** -- Direct sector I/O (Disk Extended only)
- **Line numbers required** -- Programs use line numbers, not labels

### CoCo BASIC vs. ACOS: Key Differences

| Feature | CoCo BASIC | ACOS |
|---------|-----------|------|
| Line numbers | Yes (required) | No (labels) |
| Variable types | Float, Integer (%), String ($) | Integer, String ($) |
| Arrays | Yes (DIM) | No (base ACOS), Yes (MACOS) |
| Graphics | Yes (PMODE, DRAW, CIRCLE, etc.) | No (terminal-only) |
| Sound | Yes (PLAY, SOUND) | No |
| File I/O | Sequential & Random (DECB) | Channel-based with record positioning |
| Module system | None (monolithic) | Yes (segments with link/store/recall) |
| User I/O model | Local keyboard/screen | Remote terminal over modem |
| Interrupts | ON ERR, ON BRK | ON NOCAR |
| Memory access | PEEK/POKE (6809 address space) | PEEK/POKE (6502 address space) |
| Specification | Complete, public | Manual exists in print only |

### Effort Estimate for CoCo BASIC Interpreter

| Component | Effort |
|-----------|--------|
| Core BASIC (expressions, flow control, variables) | 2-3 weeks |
| Color BASIC commands (keyboard, screen, cassette) | 1 week |
| Extended Color BASIC (DRAW, PLAY, graphics) | 2 weeks |
| Disk Extended Color BASIC (file I/O) | 1 week |
| Super Extended Color BASIC (CoCo 3 modes) | 1-2 weeks |
| **Total** | **7-9 weeks** |

Note: Existing open-source BASIC interpreters (like [EndBASIC](https://github.com/endbasic/endbasic), [PC-BASIC](https://github.com/robhagemans/pcbasic), or [jsbasic](https://github.com/nickthecook/jsbasic)) could serve as starting points, reducing the effort to adapting the CoCo-specific commands.

---

## 8. CoCo BASIC Native Interpreter: Language Without the Hardware

### The Core Idea

Rather than running CoCo BASIC inside an emulator (which emulates the entire CoCo 3 hardware — 6809 CPU, GIME chip, PIAs, SAM — just to interpret BASIC), build a **standalone interpreter** that understands CoCo BASIC syntax but executes natively on modern hardware. Strip the language from the machine.

This is what **QB64 did for QBasic** and **FreeBASIC did for QuickBASIC**. Nobody has done it for CoCo Color BASIC.

### What You Get

- Write programs in the familiar CoCo BASIC syntax — line numbers, `GOTO`, `GOSUB`, the whole feel
- Run on any modern OS (Windows, macOS, Linux) or in a browser
- No ROM images needed (you're not emulating hardware, you're interpreting a language)
- No 64K memory ceiling, no 0.89MHz clock, no 32K BASIC program limit
- Access to modern resources: large arrays, long strings, fast execution, native filesystem

### What Translates Cleanly (~70% of the language)

All core BASIC has zero hardware dependency and just works:

- **Flow control** — `IF/THEN/ELSE`, `FOR/NEXT`, `GOTO`, `GOSUB`, `ON...GOTO`, `WHILE/WEND`
- **Variables** — strings, numbers (upgradeable from 5-byte Microsoft float to full double precision)
- **String functions** — `LEFT$`, `RIGHT$`, `MID$`, `LEN`, `CHR$`, `ASC`, `INSTR`, `STRING$`, `STR$`, `VAL`
- **Math** — `ABS`, `SIN`, `COS`, `TAN`, `ATN`, `SQR`, `LOG`, `EXP`, `INT`, `FIX`, `SGN`, `RND`
- **I/O** — `PRINT`, `INPUT`, `LINE INPUT`, `INKEY$` (text in/out, maps to terminal or window)
- **Arrays** — `DIM` (remove the size limits)
- **Data** — `DATA` / `READ` / `RESTORE` (for non-machine-code uses)
- **Functions** — `DEF FN` user-defined functions
- **File I/O** — `OPEN`, `CLOSE`, `INPUT#`, `PRINT#`, `WRITE`, `EOF`, `LOF` (map to native filesystem)

### What Needs an Abstraction Layer (~20%)

These features are hardware-coupled but have clean modern equivalents:

**Graphics:**
CoCo BASIC's `PMODE 0-4`, `HSCREEN`, `SET/RESET/POINT` are tied to specific video hardware, but the *concepts* are simple geometric operations:

| CoCo Command | What It Does | Modern Backend |
|---|---|---|
| `PSET(X,Y,C)` | Draw pixel | SDL2 / HTML5 Canvas |
| `LINE(X1,Y1)-(X2,Y2),C` | Draw line | SDL2 / Canvas |
| `CIRCLE(X,Y,R,C)` | Draw circle | SDL2 / Canvas |
| `PAINT(X,Y,C)` | Flood fill | SDL2 / Canvas |
| `DRAW "U5R3D5L3"` | Turtle graphics via string macros | SDL2 / Canvas |
| `SET(X,Y,C)` / `RESET` | Block semigraphics (64x32) | Canvas with scaled blocks |
| `HSCREEN` modes | CoCo 3 hi-res (320x200, 640x200) | Canvas at native or scaled resolution |

Two modes could be offered: a **compatibility mode** (emulating original resolution, e.g., 256x192 for PMODE 4, scaled up) and an **unleashed mode** (arbitrary modern resolutions).

**Sound:**
| CoCo Command | Modern Backend |
|---|---|
| `SOUND freq, duration` | Web Audio API / SDL2 Audio |
| `PLAY "T120O4L4CDEFGAB"` | Parse music macro language, synthesize via Web Audio |

The `PLAY` music macro language is well-documented and self-contained — a fun parser to build.

**`PRINT @`:**
Position-based printing (`PRINT @320, "HELLO"` puts text at screen position 320). Maps to cursor positioning in a terminal or text overlay in a graphical window. Trivial.

### What Breaks (~10%)

**`PEEK` / `POKE` to hardware addresses:**
These are meaningless without CoCo hardware. But they have *semantic* equivalents. A keyboard read is still a keyboard read. The interpreter could maintain a **virtual address map** for commonly-used addresses:

| Address | Original Purpose | Native Mapping |
|---|---|---|
| `PEEK(65280)` / `$FF00` | PIA — keyboard column | Intercept → return keyboard state |
| `POKE 65281,x` / `$FF01` | PIA — keyboard row select | Intercept → set keyboard scan mode |
| `PEEK(339)` | Current cursor position | Intercept → return cursor pos |
| `POKE 65497,0` | High-speed mode (CoCo 3) | Intercept → set speed flag |
| `POKE 1024-1535` | Direct video RAM writes | Intercept → route to display layer |

You wouldn't map all 65536 addresses — just the ~50 that programs actually use. Unknown addresses could warn or no-op.

**`DATA` / `POKE` / `EXEC` for machine code:**
When a program POKEs 6809 opcodes into memory and `EXEC`s them, those bytes literally cannot run on x86/ARM. Options:

1. **Ignore it** — many programs are pure BASIC. This covers most casual/educational use.
2. **Embed a 6809 CPU core** — only invoked on `EXEC`. Not emulating the whole CoCo, just a tiny CPU for those code blocks.
3. **Provide modern alternatives** — `USR` could invoke a plugin/FFI system instead of machine code routines.

Machine code in CoCo BASIC was used for performance-critical routines (scrolling, sprite movement, sound effects) that a modern interpreter wouldn't need — native speed makes them unnecessary.

### Beyond Nostalgia: What Modern Extensions Could Look Like

The exciting part — CoCo BASIC syntax with modern capabilities:

| Old Limitation | Modern Extension |
|---|---|
| 64K RAM total | Unlimited `DIM` arrays, megabyte strings |
| 5-byte floats (~9 digit precision) | Full IEEE 754 double precision |
| 256x192 max graphics (PMODE 4) | Arbitrary resolution, true color |
| Line numbers required | Keep for nostalgia, optionally allow labels too |
| 255-character string limit | Unlimited strings |
| No structured programming | Optional: `WHILE/WEND`, `SUB/END SUB`, `SELECT CASE` |
| Cassette/floppy I/O only | Native filesystem, possibly network I/O |
| No error handling (pre-CoCo 3) | `ON ERR` available from Super Extended, could extend further |

You'd have a language that *feels* like 1988 but *runs* like 2026.

### Available Building Blocks

The pieces exist to make this feasible:

| Resource | What It Provides |
|---|---|
| [ANTLR4 grammar](https://github.com/ssorrrell/coco3-extended-color-basic-vscode) | Parser grammar for CoCo BASIC (VS Code extension) |
| [CoCo ROM source](https://github.com/tomctomc/coco_roms) | Exact behavior of every keyword, in 6809 assembly |
| [Color BASIC Unravelled](https://techheap.packetizer.com/computers/coco/unravelled_series/color-basic-unravelled.pdf) | Annotated ROM disassembly with full commentary |
| Existing BASIC interpreters | [EndBASIC](https://github.com/endbasic/endbasic), [PC-BASIC](https://github.com/robhagemans/pcbasic), [jsbasic](https://github.com/nickthecook/jsbasic) as reference/starting points |
| SDL2 / HTML5 Canvas | Graphics and sound backends |

### Estimated Effort (Native Interpreter, Not Emulator)

| Component | Effort | Notes |
|---|---|---|
| Lexer + parser (CoCo BASIC syntax) | 1-2 weeks | ANTLR4 grammar exists as starting point |
| Core interpreter (variables, expressions, flow control) | 2-3 weeks | Well-understood problem space |
| Text I/O (`PRINT`, `INPUT`, `INKEY$`, `PRINT @`) | 1 week | Terminal or windowed output |
| File I/O (Disk Extended BASIC) | 1 week | Map to native filesystem |
| Graphics abstraction (PMODE, HSCREEN, DRAW, etc.) | 2-3 weeks | SDL2 or Canvas backend |
| Sound (PLAY, SOUND) | 1 week | Web Audio or SDL2 Audio |
| PEEK/POKE virtual address map | 1 week | ~50 commonly-used addresses |
| **Total** | **9-12 weeks** | For a fully-featured interpreter |

A minimal text-only interpreter (no graphics, no sound) could be done in **4-5 weeks**.

---

## 9. Recommendations

### For SpacerQuest Specifically
**Continue with the current TypeScript approach.** The rewrite is well along, tests exist, and the architecture is sound. Building an ACOS interpreter now would be scope creep that delays delivery.

### For Historical Preservation / Future Projects
**An ACOS interpreter is a worthwhile project**, but as a standalone tool:
1. Start with the GBBS Pro 6502 assembly source to extract the complete token/opcode set
2. Build the core BASIC layer first (reusable across projects)
3. Add the GBBS runtime layer as a pluggable "platform" module
4. Use SpacerQuest's 29 modules as the primary test suite
5. Target Node.js/TypeScript for the interpreter (natural web deployment)

### For CoCo BASIC (Emulator Path)
**Start from an existing BASIC interpreter** and add CoCo-specific commands. The language is standard enough that 60-70% of the work is already done by existing open-source projects. This is a cleaner, more bounded project than an ACOS interpreter.

### For CoCo BASIC (Native Interpreter Path)
**Build a standalone CoCo BASIC interpreter** that runs the language natively, divorced from the 6809/CoCo 3 hardware. This is the "QB64 for CoCo BASIC" approach — nostalgia for the language, freedom from the hardware. Start text-only (4-5 weeks), add graphics/sound as a second phase. Use the ANTLR4 grammar and ROM source as specification. Target TypeScript (browser deployment) or Rust/Go (native CLI) depending on delivery goals.

---

## 10. Deep Dive: CoCo BASIC Interpreter Ecosystem Research

Research conducted March 2026 into existing tools, grammars, and interpreter projects relevant to building a native CoCo Color BASIC interpreter.

### ANTLR4 Grammar (ssorrrell/coco3-extended-color-basic-vscode)

**Status**: Partial/Pre-release (version 0.x)

The project references a separate "BASICLanguageParser" repository containing the grammar work. It targets approximately 140 reserved words from Color BASIC and is designed for **syntax parsing** (tokenization, syntax highlighting) rather than execution. The README explicitly states: "Most of the features have been temporarily disconnected to debug issues with the language server."

**Verdict**: Not suitable as a starting point for a native interpreter. The grammar is incomplete and designed for IDE features (hover documentation, syntax coloring), not runtime semantics.

### Existing Standalone CoCo BASIC Interpreter Projects

**Finding**: No standalone native interpreters found in JavaScript, TypeScript, Python, or Rust.

What does exist:
- **Rusty CoCo** (Rust) — A full hardware emulator that runs the original CoCo ROM-based BASIC interpreter. Achieves compatibility by running actual system ROMs via 6809 CPU emulation, not by reimplementing BASIC.
- **BasTo6809 Compiler** (CoCo community) — Compiles CoCo BASIC to 6809 assembly, not an interpreter.
- Various archived emulators and tools, but no modern native interpreter projects.

**Conclusion**: The CoCo BASIC native interpreter space is empty. All existing solutions either run the original ROM or compile to assembly. This represents a genuine gap.

### QB64 and FreeBASIC: Architecture Analysis

These two projects represent the closest precedents for "old BASIC dialect on modern hardware":

**QB64** (Modern QBasic):
- **Architecture**: Compiler-based — transpiles BASIC source → C++ → GCC native binaries
- **Language**: C (64.2%), C++ (21.4%), Python (10.7%)
- **Compatibility**: Full QBasic/QuickBASIC 4.5 + extended modern features
- **Modern integration**: MP3/Ogg/WAV audio, 32-bit color, TrueType fonts, BMP/PNG/JPEG images, multithreading
- **Key design choice**: Compilation over interpretation for performance and native binaries

**FreeBASIC** (Self-hosting QuickBASIC compiler):
- **Architecture**: Self-hosting compiler with modular design, uses GNU Binutils backend
- **Features**: OOP, namespaces, function overloading, inline assembly, C-style preprocessor
- **Compatibility mode**: Optionally backwards-compatible with QuickBASIC
- **Active development**: 2004–2025 (continuous updates)
- **Key design choice**: Modular, self-hosting architecture for maintainability

**Common pattern**: Both chose **compilation** over interpretation. This avoids runtime interpretation overhead and generates native executables. For a CoCo BASIC project targeting the browser (TypeScript), interpretation is more natural; for a native CLI tool (Rust/Go), compilation could be considered.

### PC-BASIC and EndBASIC as Starting Points

**PC-BASIC** (Python, GPL v3):
- Implements GW-BASIC, BASICA, PCjr Cartridge Basic, and Tandy 1000 GWBASIC
- Goal: "Bug-for-bug compatibility" with original interpreters
- Python-based (80.3% of codebase), modular architecture separating interpreter core from hardware emulation
- Implements Microsoft Binary Format (MBF) floating-point arithmetic for data file compatibility
- **For CoCo**: GW-BASIC is a closer ancestor to Color BASIC than most alternatives. Modular architecture suggests adaptability, but CoCo-specific graphics/sound would require substantial new implementation.

**EndBASIC** (Rust, cross-platform):
- Hybrid dialect inspired by Amstrad Locomotive BASIC 1.1 and QuickBASIC 4.5
- Education-focused; pure Rust implementation
- Multiple interfaces: web-based REPL, CLI, graphical console
- Hardware integration (Raspberry Pi GPIO)
- **For CoCo**: Cleaner modern architecture, good cross-platform story. However, Locomotive BASIC semantics differ significantly from Color BASIC.

**Assessment**: PC-BASIC's modular interpreter core is more directly applicable (GW-BASIC is closer to Color BASIC than Locomotive BASIC), but both would require substantial divergence for CoCo-specific features. A fresh interpreter modeled after PC-BASIC's architecture may be more practical than forking either project.

### PLAY Command: Music Macro Language (MML) Specification

The `PLAY` command implements **Music Macro Language (MML)**, a micro-language for synthesizing music. First implemented in Sharp MZ series, standardized through Microsoft's GW-BASIC.

**Core syntax**:
- **Notes**: `C D E F G A B` (case-insensitive)
- **Accidentals**: `+` or `#` for sharp, `-` for flat (e.g., `C#`, `D-`)
- **Duration**: Number = fraction of whole note — `L1` whole, `L4` quarter, `L8` eighth, `L16` sixteenth
- **Rest**: `R` followed by duration (e.g., `R4` quarter rest)
- **Octave**: `On` sets octave (0–6), `<` down, `>` up
- **Tempo**: `Tn` quarter-notes per minute (T32–T255, default T120)

**Implementation complexity**: Moderate. Requires:
1. String tokenization (notes, commands)
2. State machine for octave/tempo/duration tracking
3. Audio synthesis (frequency calculation + waveform generation via Web Audio API)
4. Buffer management (GW-BASIC holds 32 PLAY commands in buffer; exceeding halts until drained)

No nested structures, conditionals, or complex control flow — this is a self-contained domain that can be implemented independently once the core interpreter is stable.

**CoCo-specific**: Color Computers could use the optional Sound Cartridge (26-3144A) or SAM speech/sound cartridge. The PLAY command follows GW-BASIC MML syntax with hardware-specific limitations.

### Key Insights Summary

1. **No existing native CoCo BASIC interpreters** — this is a genuine gap in the retro computing ecosystem
2. **QB64 and FreeBASIC** demonstrate compilation as the preferred model for old BASIC dialects on modern hardware
3. **PC-BASIC** is the most complete BASIC interpreter in modern code (Python), with modular architecture closest to what we'd need
4. **The ANTLR4 grammar** is not usable for execution — only for syntax highlighting
5. **PLAY/MML** is well-specified and moderately complex — a fun standalone parsing problem
6. **Architectural recommendation**: A fresh interpreter in TypeScript (for browser deployment) or Rust (for native performance) modeled after PC-BASIC's modular design would be more practical than adapting any existing project

### Additional References (from research)

- [QB64 Repository](https://github.com/QB64Team/qb64)
- [FreeBASIC Repository](https://github.com/freebasic/fbc)
- [FreeBASIC Wiki](https://www.freebasic.net/)
- [PC-BASIC (PyPI)](https://pypi.org/project/pcbasic/)
- [PC-BASIC (GitHub)](https://github.com/robhagemans/pcbasic)
- [EndBASIC (GitHub)](https://github.com/endbasic/endbasic)
- [Rusty CoCo (GitHub)](https://github.com/gorsat/coco)
- [Music Macro Language (Wikipedia)](https://en.wikipedia.org/wiki/Music_Macro_Language)
- [Microsoft BASIC MML (VGMPF Wiki)](https://www.vgmpf.com/Wiki/index.php?title=Microsoft_BASIC_MML)
- [GW-BASIC PLAY Documentation](https://hwiegman.home.xs4all.nl/gw-man/PLAY.html)
- [CoCo Central - TRS-80 Manuals](https://cococentral.com/trs-80-manuals/)
- [CoCo 3 BASIC Quick Reference Manual (PDF)](https://colorcomputerarchive.com/repo/Documents/Manuals/Hardware/Color%20Computer%203%20BASIC%20Quick%20Reference%20Manual%20(Tandy).pdf)
- [Color Computer Hardware Programming (Lomont)](https://www.lomont.org/software/misc/coco/Lomont_CoCoHardware.pdf)

---

## References

- [GBBS Pro Official Repository](https://gbbs.applearchives.com/)
- [GBBS 2.x Source Code (GitHub)](https://github.com/callapple/GBBS-2.x)
- [GBBS/ACOS Wiki](https://bbs.fandom.com/wiki/GBBS/ACOS)
- [GBBS Pro v2.2 Manual TOC](https://docplayer.net/171442424-Gbbs-pro-bulletin-board-system-version-2-2-produced-by-brian-wiser-bill-martens.html)
- [In Search of the GBBS Pro ACOS Manual](https://blog.fsck.com/2007/03/05/in-search-of-the-gbbs-pro-acos-manual/)
- [Color BASIC (Wikipedia)](https://en.wikipedia.org/wiki/Color_BASIC)
- [Extended Color BASIC (Wikipedia)](https://en.wikipedia.org/wiki/Extended_Color_BASIC)
- [TRS-80 Color Computer (CoCopedia)](https://www.cocopedia.com/wiki/index.php/TRS-80_Color_Computer)
- [Disk Extended Color BASIC (Wikipedia)](https://en.wikipedia.org/wiki/Disk_Extended_Color_BASIC)
- [Color BASIC Unravelled (PDF)](https://techheap.packetizer.com/computers/coco/unravelled_series/color-basic-unravelled.pdf)
- [CoCo ROM Source (GitHub)](https://github.com/tomctomc/coco_roms)
- [Color Computer Archive](https://colorcomputerarchive.com/)
- SpacerQuest original source: `/home/user/SpacerQuest/Decompile/Source-Text/`
- SpacerQuest variable map: `/home/user/SpacerQuest/SQ/SQ.VAR`
