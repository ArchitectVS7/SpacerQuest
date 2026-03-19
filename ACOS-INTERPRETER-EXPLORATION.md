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

## 3. ACOS Command Inventory (Extracted from SpacerQuest Source)

### General-Purpose (BASIC-like)

These are standard BASIC commands that any BASIC interpreter would handle:

| Command | Usage in SQ | Notes |
|---------|-------------|-------|
| `print` | Everywhere | Text output, supports `\` for newline, `hl$`/`of$` for ANSI highlights |
| `input` | Everywhere | User text input, `input #1,var` for file input |
| `if` ... `goto`/assignment | Everywhere | Conditionals (no `then` keyword, just inline) |
| `goto` | Everywhere | Label-based jumps |
| `gosub` / `return` | Everywhere | Subroutine calls |
| `on` ... `goto` | SP.WARP, etc. | Computed goto |
| `for` / `next` | SP.START, etc. | Counting loops |
| `val()` | SP.YARD, etc. | String to number |
| `str$()` | SP.WARP, etc. | Number to string |
| `len()` | SP.START, etc. | String length |
| `left$()` / `right$()` | SP.WARP, etc. | String slicing |
| `chr$()` | Everywhere | Character from code, supports multi-arg: `chr$(13)`, `chr$(45,49)` |
| `not` / `and` / `or` | Everywhere | Boolean operators |
| `mod` / `div` | SP.FIGHT, etc. | Integer arithmetic |

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
| `append` | SP.TOP, etc. | Append mode |
| `delete` | Various | Delete record |

### BBS/GBBS-Specific Commands

These are the **problematic** ones -- they have no analog in standard BASIC:

| Command | Usage | What It Does |
|---------|-------|-------------|
| `link "segment"` | Everywhere | **Load and execute another ACOS segment** -- this is the inter-module call mechanism. Equivalent to loading another compiled program. |
| `on nocar goto label` | Every module | **Modem carrier-loss trap** -- jumps to cleanup code when the remote user disconnects. This is an interrupt/signal handler. |
| `store "a:var"` | SP.START | **Persist all variables to disk** -- saves the entire variable state to a file for segment switching. |
| `recall "a:var"` | Implied by link | **Restore all variables from disk** -- loads variable state after segment switch. |
| `log` | SP.START, etc. | **Write to BBS audit log** |
| `info(N)` | SP.START | **Query BBS system info** -- `info(5)` = is user a sysop, etc. |
| `setint()` | Not in SQ directly | **Set interface mode** (modem settings) |
| `free` | SP.FIGHT1 | **Release memory** / garbage collect |
| `public label` | Every module | **Export label** for inter-segment linking |
| `seg` | SP.START | **Segment marker** -- indicates start of a compiled segment |
| `pop` | SP.YARD | **Pop return address** from gosub stack (discard pending return) |
| `get` / `key` | Various | **Single-character input** (non-blocking or blocking keypress) |
| `peek` / `poke` | Various | **Direct memory access** (6502 memory map) |

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

### Building a CoCo BASIC Interpreter: Feasibility

**This is significantly easier than ACOS** because:

1. **Well-documented** -- Microsoft BASIC is thoroughly documented. The CoCo BASIC reference manual is freely available online.
2. **Standard dialect** -- It's a superset of standard Microsoft BASIC. Many interpreters already exist.
3. **No BBS coupling** -- CoCo BASIC is a general-purpose language. No `link`/`store`/`recall` segment management.
4. **Existing implementations** -- Multiple CoCo emulators exist (MAME/MESS, XRoar, VCC). The BASIC interpreter ROM is well-understood.
5. **Hardware abstraction is bounded** -- Graphics (PMODE, HSCREEN), sound (PLAY, SOUND), and joystick (JOYSTK) are the main hardware interfaces. These map cleanly to HTML5 Canvas and Web Audio.

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

## 8. Recommendations

### For SpacerQuest Specifically
**Continue with the current TypeScript approach.** The rewrite is well along, tests exist, and the architecture is sound. Building an ACOS interpreter now would be scope creep that delays delivery.

### For Historical Preservation / Future Projects
**An ACOS interpreter is a worthwhile project**, but as a standalone tool:
1. Start with the GBBS Pro 6502 assembly source to extract the complete token/opcode set
2. Build the core BASIC layer first (reusable across projects)
3. Add the GBBS runtime layer as a pluggable "platform" module
4. Use SpacerQuest's 29 modules as the primary test suite
5. Target Node.js/TypeScript for the interpreter (natural web deployment)

### For CoCo BASIC
**Start from an existing BASIC interpreter** and add CoCo-specific commands. The language is standard enough that 60-70% of the work is already done by existing open-source projects. This is a cleaner, more bounded project than an ACOS interpreter.

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
- SpacerQuest original source: `/home/user/SpacerQuest/Decompile/Source-Text/`
- SpacerQuest variable map: `/home/user/SpacerQuest/SQ/SQ.VAR`
