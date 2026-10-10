import type { ReactNode } from 'react';

/** Progressive disclosure: explanations and technical detail on request. */
export function Disclosure({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="disclosure" open={open}>
      <summary className="disclosure__summary">{title}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}
