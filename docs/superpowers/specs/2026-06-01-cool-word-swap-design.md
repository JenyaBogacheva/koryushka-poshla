# Cool-Word Tile Swap — Design Spec

**Date:** 2026-06-01
**Status:** Draft for review
**Relates to:** main design spec `2026-04-30-scrabble-design.md` (this adds a House Rule)

## 1. Goal

Let a player who is chasing a "cool word" trade one of their rack tiles for a
specific tile from another player — but only if that player agrees. The asker
pays **−5**, the giver earns **+5**. It is a family honor-system mechanic in the
same spirit as the +5 "helping hand": no rule polices whether the word is real
or ever played; the point cost is the only deterrent against frivolous trades.

## 2. Player Experience

1. On **your turn**, before submitting a move, you open the swap dialog from your
   own player card / action bar.
2. You choose **one opponent** (whose rack is currently visible), pick **one of
   your tiles** to give and **one of their tiles** to take, and **type the word**
   you are chasing (≥ 7 Cyrillic letters).
3. Sending the offer shows a **celebratory banner to everyone** — the declared
   word plus a random phrase (see §6).
4. The chosen opponent sees the banner with **Accept / Decline**.
   - **Accept:** the two tiles swap racks; asker **−5**, giver **+5**; a `swap`
     event is logged; banner clears.
   - **Decline:** the offer clears, nothing is logged.
5. The swap **does not cost the asker their turn** — they place tiles and submit
   their move as usual afterward.

## 3. Rules

| Aspect | Behavior |
|---|---|
| **When** | Only on the initiator's own turn, before they submit a move. |
| **Turn cost** | None. The initiator still places and submits normally. |
| **Cool-word gate** | Self-declared. Initiator must type a word of **≥ 7 Cyrillic letters**. Server logs it verbatim; never verifies it is a real word or that it is ever played. |
| **Selection** | Initiator picks **both** tiles: which of their own to give, which of the target's to take. Target only accepts or declines the whole deal. |
| **Target eligibility** | Any of the other two players **whose rack is currently visible** (initiator must be able to see the tile they are taking). Default rack visibility is `true`, so this is the normal case. |
| **Points** | On accept: initiator `−5`, giver `+5`. Mirrors the +5 helping hand. |
| **Negative score** | Allowed. Scores stay additive and "taken as-is", consistent with the main spec; a swap may push a score below zero. |
| **Concurrency** | At most **one** pending swap at a time (only one player has the turn). |
| **Undo** | A completed swap does **not** arm or clear single-step undo — it is a mutual agreement, like the +5 award. |
| **Clearing a pending offer** | Submitting a move, passing, swap-all, or ending the game clears any pending offer. The initiator may also explicitly cancel it. |

## 4. Data Model

Additions to `shared/types.ts`.

```ts
export type SwapOffer = {
  fromSlot: Slot;        // initiator (−5 on accept)
  toSlot: Slot;          // chosen giver (+5 on accept)
  giveTileId: string;    // initiator's tile → moves to target on accept
  takeTileId: string;    // target's tile → moves to initiator on accept
  word: string;          // declared cool word (≥ 7 letters)
  phrase: string;        // celebratory line chosen server-side (§6)
  createdAt: number;
};

export type SwapRecord = {
  kind: 'swap';
  fromSlot: Slot;
  toSlot: Slot;
  word: string;
  gaveLetter: Letter;    // letter the initiator gave away
  tookLetter: Letter;    // letter the initiator received
  timestamp: number;
};
```

- `GameState` gains `pendingSwap: SwapOffer | null` (null outside an active offer;
  persisted to `data/game.json` so a mid-offer reload resumes correctly).
- `SwapRecord` joins the `GameEvent` union.
- Games persisted before this feature lack `pendingSwap`; `Game.fromState` defaults
  it to `null` (same pattern as the `turnOrder` back-fill).

## 5. Protocol

**Client → server (additions to `ClientMessage`):**

| Type | Payload | Meaning |
|---|---|---|
| `offerSwap` | `{ toSlot, giveTileId, takeTileId, word }` | Open a swap offer on your turn. |
| `respondSwap` | `{ accept: boolean }` | Target accepts or declines the pending offer. |
| `cancelSwap` | `{}` | Initiator withdraws their pending offer. |

Server picks `phrase` and `createdAt`; the client does not send them.

**Server behavior:**

- `offerSwap` validation (return `moveRejected`/`error` on failure):
  - phase is `playing` and `fromSlot === turnIndex`;
  - no existing `pendingSwap`;
  - `toSlot` is one of the other two slots and that player's `rackVisible === true`;
  - `giveTileId` is in the initiator's rack; `takeTileId` is in the target's rack;
  - `word` has ≥ 7 Cyrillic letters.
  - On success: store `pendingSwap` (phrase chosen server-side), push snapshot.
- `respondSwap` (sender must equal `pendingSwap.toSlot`):
  - **accept:** move `giveTile` initiator→target and `takeTile` target→initiator;
    `players[fromSlot].score -= 5`; `players[toSlot].score += 5`; push a `SwapRecord`
    (`gaveLetter`/`tookLetter` read from the moved tiles); clear `pendingSwap`.
  - **decline:** clear `pendingSwap`; log nothing.
  - push snapshot.
- `cancelSwap` (sender must equal `pendingSwap.fromSlot`): clear `pendingSwap`, snapshot.
- Turn-advancing actions (`submitMove`, `pass`, `swapAll`, `endGame`) clear any
  pending swap as part of their normal flow.

All of this is server-authoritative; the client never moves tiles or changes
score itself.

## 6. Celebratory Phrases

Chosen at random server-side when an offer is created, stored on the `SwapOffer`
so every client renders the same line:

- «Какое крутое слово!»
- «Вот это да!»
- «Ну и ну!»
- «Вот это слово так слово!»
- «Какая красота!»

## 7. UI

- **Offer dialog** (initiator, own turn): opponent selector (visible-rack players
  only), a tile picker for own rack + the chosen opponent's rack, and a word input
  that validates ≥ 7 Cyrillic letters before the *Offer* button enables.
- **Pending banner** (everyone): the declared word + the chosen phrase. The target's
  banner adds *Accept* / *Decline*; the initiator's adds *Cancel*; bystander sees it
  read-only.
- **Move log:** a `swap` line, e.g. «Женя ↔ Маша: отдала Р, взяла К — ради слова
  «КОРЮШКА»». (Exact wording finalized during implementation against existing
  `MoveLog` patterns.)
- Disabled/hidden when it is not your turn, when an offer is already pending, or
  when no opponent has a visible rack.

## 8. Testing

Server unit tests (`tests/game.test.ts`) covering:

- Happy path: offer → accept exchanges the right tiles, applies −5/+5, logs a
  `SwapRecord`, clears `pendingSwap`, and does **not** advance the turn.
- Decline clears the offer and logs nothing.
- Cancel by initiator clears the offer.
- Rejections: not your turn / wrong phase; offer to a hidden-rack player; tile not
  in the named rack; word under 7 letters; second offer while one is pending;
  `respondSwap` from the wrong slot.
- A pending offer is cleared by submitting a move / passing / ending the game.
- Negative score is permitted.
- Persistence round-trip with a non-null `pendingSwap`; `fromState` back-fills a
  missing `pendingSwap` to `null`.

Integration test (`tests/integration/`): 3 fake WS clients run offer→accept and
offer→decline end-to-end, asserting snapshots and redaction.

## 9. Out of Scope (YAGNI)

- Verifying the declared word against the dictionary or against what is actually
  played.
- Counting swaps toward the M6a "helper" badge (could revisit later).
- Trading more than one tile per side.
- Offers to players with hidden racks (blind requests).
- Score flooring at zero.
