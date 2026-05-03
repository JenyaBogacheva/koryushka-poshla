type Props = {
  href: string;
  label?: string;
};

/** Consistent top-left back link used across non-game pages. */
export function BackLink({ href, label = 'назад' }: Props) {
  return (
    <a
      href={href}
      className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-ink-soft transition-transform hover:-translate-x-0.5 hover:text-ink lg:left-6 lg:top-6"
      style={{
        background: 'var(--color-panel)',
        boxShadow: '0 1px 0 rgba(60,50,35,0.06), 0 2px 6px rgba(60,50,35,0.08)',
      }}
    >
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>←</span>
      <span>{label}</span>
    </a>
  );
}
