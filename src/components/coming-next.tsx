// Stands in for a tab whose page is in a later build step, so no tab leads to a 404 meanwhile.
export function ComingNext({ title, what }: { title: string; what: string }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-muted">{what}</p>
    </section>
  );
}
