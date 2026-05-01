import type { Board as BoardT } from '@shared/types';
import { PREMIUMS } from '@shared/premiums';
import { Square } from './Square.js';

const SQUARE_SIZE = 52;
const GRID = 15;

type Props = { board: BoardT };

export function Board({ board }: Props) {
  return (
    <div
      className="grid gap-px rounded-md bg-ink/20 p-px shadow-md"
      style={{
        gridTemplateColumns: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        gridTemplateRows: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        width: GRID * SQUARE_SIZE + (GRID + 1),
      }}
    >
      {board.flatMap((row, r) =>
        row.map((cell, c) => (
          <Square
            key={`${r},${c}`}
            row={r}
            col={c}
            cell={cell}
            premium={PREMIUMS[r]![c]!}
            size={SQUARE_SIZE}
          />
        )),
      )}
    </div>
  );
}
