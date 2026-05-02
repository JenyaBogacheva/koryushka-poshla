type Props = { count: number };

export function BagIndicator({ count }: Props) {
  return (
    <div className="rounded-md bg-tile px-3 py-1.5 text-sm text-ink shadow-sm">
      Мешок: <span className="tabular-nums font-semibold">{count}</span>
    </div>
  );
}
