/** The OpenSSL command a lab operation corresponds to. Shown as text; never executed by the browser. */
export function Command({ lines, note }: { lines: readonly string[]; note?: string | undefined }) {
  return (
    <div className="command">
      <pre className="command__code">
        <code>{lines.join('\n')}</code>
      </pre>
      <p className="command__note">{note ?? 'The browser did not run OpenSSL. It performed the equivalent operation with Web Crypto.'}</p>
    </div>
  );
}
