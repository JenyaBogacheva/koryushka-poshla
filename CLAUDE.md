# CLAUDE.md — Scrabble (Корюшка пошла)

Family-style three-player Russian Scrabble (Эрудит) for browser play. Server-authoritative game engine + WebSocket protocol + React UI. House rules diverge from standard Scrabble; see the spec.

## Project Context

- **Variant:** Russian Эрудит (104 tiles, 2 blanks; Ё/Ъ separate tiles)
- **Players:** Exactly 3, fixed slots, no accounts
- **Scope:** Personal/family project — usability and house-rule fidelity matter more than competitive correctness
- **Status:** M1 (server engine) complete. M2 = HTTP/WS, M3+ = UI.

## Authoritative Documents

- `docs/superpowers/specs/2026-04-30-scrabble-design.md` — design spec, source of truth for all game rules. **When the code disagrees with the spec, the spec wins.** Update one or the other deliberately, never silently.
- `docs/superpowers/plans/` — milestone plans, TDD task lists.

## Repository Layout

- `shared/` — Types shared between client and server (`types.ts`)
- `server/` — Game engine, no I/O, no framework
  - `letters.ts` — Cyrillic alphabet, vowel/consonant/sign classification, substitution rules
  - `premiums.ts` — 15×15 premium-square map
  - `data/` — Russian tile distribution (JSON + loader)
  - `bag.ts`, `rack.ts`, `board.ts` — primitive game state ops
  - `moves.ts` — move geometry validation
  - `scoring.ts` — letter/word multipliers, reusable bonuses, +10 bingo
  - `dictionary.ts` — advisory word check (stub in M1)
  - `game.ts` — `Game` class composing all of the above
  - `persistence.ts` — JSON save/load active game, archive finished
- `tests/` — Vitest unit tests, one file per server module
- `scripts/demo-game.ts` — programmatic full-game smoke test
- `data/` — Runtime persistence target (gitignored): `data/game.json` + `data/history/`

## Key Design Decisions

- **Server-authoritative.** Client never computes score or validates moves — it sends placements, server returns the result. Don't add client-side logic that duplicates server rules.
- **Pure modules + thin orchestrator.** Each server module is a set of pure-ish functions over plain data; `Game` is the only stateful class. New rules go in the relevant pure module, not in `Game`.
- **No external runtime deps.** Engine and tests run with just Node 20 + TypeScript + Vitest. Don't pull in lodash, immer, etc. for one-off needs.
- **Deterministic RNG (mulberry32, seeded).** All randomness routes through `makeRng(seed)` so games and tests are reproducible. Don't call `Math.random()` in engine code.
- **Russian house rules** (see spec §3 for full list): one-way letter substitutions (Ё→Е, Ъ→Ь, Ш→Щ, Й→И), reusable bonus squares (center DW one-time), +10 bingo (not +50), multi-spot placement, all-vowel/consonant free redraw, blank-swap, player-initiated game end. **These are intentional deviations from standard Scrabble.** Don't "fix" them toward standard rules.

## Build & Development

```bash
nvm use            # node 20 per .nvmrc
npm install
npm test           # vitest run (96 tests as of M1)
npm run typecheck  # tsc --noEmit
npm run demo       # tsx scripts/demo-game.ts — full game end-to-end
```

Before committing, always run: `npm run typecheck && npm test`.

## Code Style (TypeScript)

- TypeScript strict mode is on (incl. `noUncheckedIndexedAccess`); respect non-null assertions only where you can prove the index is valid
- `camelCase` for functions/variables, `PascalCase` for types/classes, `UPPER_SNAKE_CASE` for constants
- Single quotes for string literals; backticks only for interpolation/multiline
- Prefer `type` over `interface` unless you need declaration merging
- Discriminated unions (`{ kind: '...' }`) for result/error types — see `MoveError` in `server/moves.ts` for the pattern
- Use `import type { ... }` for type-only imports
- `.js` extension on relative imports (NodeNext / ESNext module resolution requires it even though the source is `.ts`)
- Path aliases: `@shared/*` and `@server/*` (configured in `tsconfig.json`); use them for cross-package imports
- Pure functions over methods where possible; the `Game` class is the orchestrator, modules export functions
- Named constants over magic numbers (`SIZE = 15`, `CENTER_ROW = 7`, etc.)
- Errors: validation returns `{ ok: false, error: { kind, ... } }`; only throw for programmer errors / invariant violations
- Test files: `tests/<module>.test.ts`, Vitest `describe`/`it`, arrange-act-assert structure
- Assert order: `expect(actual).toEqual(expected)`

## Engineering Principles

- **YAGNI.** Don't add features, options, or abstractions that aren't needed by the current milestone. If a future milestone might need it, the future milestone can add it.
- **KISS.** Prefer the boring, direct solution. Three similar lines beat a clever helper. A `for` loop beats a six-stage pipeline if it reads more clearly.
- **No premature abstractions.** Wait for the third use site before extracting a helper. A type union with two members doesn't need a generic.
- **No speculative configurability.** Hardcode the value the spec calls for. Add a parameter only when there's a real second caller passing a different value.
- **Trust internal callers.** Validate at boundaries (HTTP/WS handlers, persistence load) — not between pure modules. Don't re-check things the type system already guarantees.
- **No dead code.** If a variable, branch, or option isn't used, delete it — don't leave it "in case." Same for commented-out code: delete it; git remembers.
- **Fail loud at invariants, soft at user input.** Programmer-error paths throw. User-input paths return a typed error.

## TDD

This codebase was built test-first and stays that way. For any new rule, scoring tweak, or validation:
1. Write the failing test in `tests/<module>.test.ts`
2. Implement the smallest change that makes it pass
3. Run `npm test` — full suite, not just the new file

Tests must hit real module code paths, not mocks of the module under test.

## Rules

- This is a personal project — optimize for clarity and correctness against the spec, not for generality
- Don't introduce frameworks, build tools, or dependencies without an explicit need from the current milestone
- Persistence files (`data/game.json`, `data/history/*.json`) are runtime artifacts — never commit them
- Don't put Co-Authored-By trailers in commits
- Keep `shared/types.ts` truly shared (no Node-only imports, no server logic)
- When the spec is ambiguous, ask before guessing — don't quietly invent a rule
