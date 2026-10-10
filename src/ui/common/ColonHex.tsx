import { Fragment } from 'react';

/** Colon-separated hex (AB:CD:…) that wraps only after a colon, never inside a byte. */
export function ColonHex({ value }: { value: string }) {
  const parts = value.split(':');
  return (
    <span className="mono">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p}
          {i < parts.length - 1 && (
            <>
              :<wbr />
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}

export const isColonHex = (v: string) => /^([0-9A-F]{2}:)+[0-9A-F]{2}$/i.test(v);
