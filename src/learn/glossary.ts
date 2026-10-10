/** Glossary for the Learn tab: plain-language definitions of the lab's terms. */
export interface GlossaryEntry {
  readonly term: string;
  readonly meaning: string;
}

export const GLOSSARY: readonly GlossaryEntry[] = [
  { term: 'Avalanche effect', meaning: 'A tiny change to a hash’s input flips about half of its output bits.' },
  { term: 'basicConstraints', meaning: 'Certificate extension saying whether the key belongs to a CA (`CA:TRUE`) and how many CA levels may sit below it (`pathlen`).' },
  { term: 'CA (certificate authority)', meaning: 'An entity that signs certificates, vouching that a public key belongs to a name.' },
  { term: 'Certificate (X.509)', meaning: 'A signed statement binding an identity to a public key, with validity dates and rules.' },
  { term: 'Chain of trust', meaning: 'The sequence of certificates from a signer up to a trusted root, each signed by the next.' },
  { term: 'Critical extension', meaning: 'A rule that software must understand and enforce, or else reject the certificate.' },
  { term: 'CSR (certificate signing request)', meaning: 'A request for a certificate: a name and public key, signed with the matching private key.' },
  { term: 'Digest', meaning: 'The output of a hash function; 32 bytes for SHA-256.' },
  { term: 'Digital signature', meaning: 'A value only the private key’s owner can produce, proving data is unchanged and was signed with that key.' },
  { term: 'End entity', meaning: 'A certificate holder that may not issue certificates, such as the University (`CA:FALSE`).' },
  { term: 'Fingerprint', meaning: 'The SHA-256 of a whole certificate: a unique identifier that cannot be faked.' },
  { term: 'Hash function', meaning: 'A one-way function turning any data into a fixed-size digest.' },
  { term: 'Intermediate CA', meaning: 'A CA certified by another CA, such as the Ministry; it lets the root key stay offline.' },
  { term: 'keyUsage', meaning: 'Certificate extension listing what the key may do, such as sign certificates or sign documents.' },
  { term: 'pathlen', meaning: 'The maximum number of CA levels allowed below a CA. `pathlen:0` means end entities only.' },
  { term: 'PEM', meaning: 'A certificate or key as Base64 text between `-----BEGIN` and `-----END` lines.' },
  { term: 'PKI (public key infrastructure)', meaning: 'The whole system of keys, certificates, CAs and trust.' },
  { term: 'Private key', meaning: 'The secret half of a key pair; it signs. It must never be shared.' },
  { term: 'Proof of possession', meaning: 'A CSR’s own signature, showing the requester holds the private key.' },
  { term: 'Public key', meaning: 'The shareable half of a key pair; it verifies signatures.' },
  { term: 'Root CA', meaning: 'The top of a chain. It signs its own certificate and is trusted only because a verifier installed it.' },
  { term: 'SHA-256', meaning: 'The hash function used throughout the course and the lab.' },
  { term: 'Trust anchor', meaning: 'A root certificate in the verifier’s trust store; where every valid chain must end.' },
  { term: 'Trust store', meaning: 'The verifier’s own list of trusted roots. Nothing the sender includes is ever added to it.' },
];
