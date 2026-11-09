/**
 * Stock a bill could not take back off the shelf — shown by the bill editor
 * after a correction down, and by the register after a delete (SPEC §26.6).
 * Plain markup with every string already translated, so the server page and
 * the client editor both render it.
 */
export function ShortfallNotice({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div role="status" className="rounded-xl bg-terracotta/10 px-4 py-3 font-body text-sm text-terracotta">
      <p>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {lines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
