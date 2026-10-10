import type { Asn1Node } from '../../pki/index.ts';

function Head({ node }: { node: Asn1Node }) {
  return (
    <span className="asn1__head">
      {node.label && <span className="asn1__label">{node.label}</span>}
      <span className="asn1__type">{node.typeName}</span>
      {node.value !== undefined && node.value !== '' && <span className="asn1__value">{node.value}</span>}
      <span className="asn1__meta">
        {node.headerLength + node.length} bytes at {node.offset}
        {node.encapsulates ? ', contains DER' : ''}
      </span>
    </span>
  );
}

function Node({ node }: { node: Asn1Node }) {
  if (node.children.length === 0) {
    return (
      <li className="asn1__node">
        <Head node={node} />
      </li>
    );
  }
  return (
    <li className="asn1__node">
      <details open={node.depth < 2}>
        <summary>
          <Head node={node} />
        </summary>
        <ul className="asn1__children">
          {node.children.map((c) => (
            <Node key={c.offset} node={c} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/** The certificate's binary structure, as `openssl asn1parse` reads it. */
export function Asn1Tree({ root }: { root: Asn1Node }) {
  return (
    <ul className="asn1" aria-label="ASN.1 structure">
      <Node node={root} />
    </ul>
  );
}
