/** A digest shown as eight 8-character blocks, optionally marked same/different against another. */
export function HexBlocks({ blocks, compareTo, label }: { blocks: readonly string[]; compareTo?: readonly string[]; label: string }) {
  return (
    <span className="hex" role="group" aria-label={label}>
      {blocks.map((b, i) => {
        const state = compareTo ? (compareTo[i] === b ? 'same' : 'diff') : 'plain';
        return (
          <span key={i} className={`hex__block hex__block--${state}`}>
            {b}
          </span>
        );
      })}
    </span>
  );
}
