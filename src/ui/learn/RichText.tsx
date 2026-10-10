import { Fragment } from 'react';

/**
 * Plain text where `backticks` mark code. Splits the string and renders text
 * nodes and <code> elements: no HTML is ever parsed, so lesson text cannot inject markup.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
