export function MissingParams() {
  const here = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const link = (slot: number, name: string) => `${here}?slot=${slot}&name=${encodeURIComponent(name)}`;
  return (
    <main className="mx-auto max-w-2xl p-8 text-ink">
      <h1 className="mb-3 text-2xl font-bold">Корюшка пошла</h1>
      <p className="mb-4">
        Откройте эту страницу с параметрами <code>?slot=N&amp;name=Имя</code>, где <code>N</code> — 0, 1 или 2.
      </p>
      <ul className="space-y-1 font-mono text-sm">
        <li><a className="underline" href={link(0, 'Игрок1')}>{link(0, 'Игрок1')}</a></li>
        <li><a className="underline" href={link(1, 'Игрок2')}>{link(1, 'Игрок2')}</a></li>
        <li><a className="underline" href={link(2, 'Игрок3')}>{link(2, 'Игрок3')}</a></li>
      </ul>
    </main>
  );
}
