import type { Board as BoardT } from '@shared/types';
import { PREMIUMS } from '@shared/premiums';
import { Square } from './Square.js';

const SQUARE_SIZE = 42;
const GRID = 15;

type Props = { board: BoardT; readOnly?: boolean };

export function Board({ board, readOnly = false }: Props) {
  return (
    <div
      className="grid bg-cell rounded"
      style={{
        gridTemplateColumns: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        gridTemplateRows: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        padding: 4,
        boxShadow:
          '0 14px 36px rgba(50,40,25,0.28), 0 0 0 6px var(--color-panel), 0 0 0 7px rgba(60,50,35,0.28)',
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
            readOnly={readOnly}
          />
        )),
      )}
    </div>
  );
}
