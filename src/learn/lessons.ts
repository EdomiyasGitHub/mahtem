/**
 * The guided lessons of the Learn tab, as plain data.
 *
 * Text is plain strings; `backticks` mark code and are rendered as <code>
 * by a safe formatter (no HTML is ever parsed). Each lesson links into the
 * lab's existing screens, or offers an in-lesson playground that runs real
 * cryptography through src/crypto.
 */

export type LessonView = 'bench' | 'chain' | 'attacks' | 'verify';

/** Lab progress a lesson can detect by itself. */
export type Milestone = 'root' | 'ministry' | 'university' | 'signed';

export interface QuizOption {
  readonly text: string;
  readonly correct: boolean;
  /** Shown after choosing this option: why it is right or wrong. */
  readonly why: string;
}

export interface QuizQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly QuizOption[];
}

export interface Lesson {
  readonly id: string;
  readonly n: number;
  readonly title: string;
  readonly course: string;
  readonly paragraphs: readonly string[];
  /** An in-lesson playground, or a task on one of the lab's screens. */
  readonly practice:
    | { readonly kind: 'playground'; readonly playground: 'hash' | 'sign'; readonly intro: string }
    | { readonly kind: 'task'; readonly view: LessonView; readonly label: string; readonly task: string; readonly doneWhen: Milestone | null };
  readonly quiz: readonly QuizQuestion[];
}

export const LESSONS: readonly Lesson[] = [
  {
    id: 'hashing',
    n: 1,
    title: 'Hashing: a fingerprint for data',
    course: 'course §2, §5',
    paragraphs: [
      'A hash function turns any amount of data into a short, fixed-size value called a digest. SHA-256, the function used in the course and throughout this lab, always produces 32 bytes (256 bits), whether you hash one letter or a whole book.',
      'Two properties make it useful for security. It is one-way: you cannot rebuild the input from the digest. And it is collision-resistant: nobody can find two different inputs with the same digest.',
      'Change a single character and about half of the 256 output bits flip. This is the avalanche effect, and it is why a forger cannot make a small, invisible change to a signed document.',
    ],
    practice: {
      kind: 'playground',
      playground: 'hash',
      intro: 'Type some text, keep it as the reference, then change one character and count the bits that flip.',
    },
    quiz: [
      {
        id: 'hash-length',
        prompt: 'You hash a 10-page document and a single word with SHA-256. How long are the two digests?',
        options: [
          { text: 'The document’s digest is longer', correct: false, why: 'A hash always has the same length, whatever the input size.' },
          { text: 'Both are 32 bytes', correct: true, why: 'SHA-256 always outputs 256 bits, which is 32 bytes.' },
          { text: 'It depends on the words used', correct: false, why: 'The content changes the digest’s value, never its length.' },
        ],
      },
      {
        id: 'hash-forgery',
        prompt: 'Why can’t a forger change a CGPA from 3.12 to 3.92 and keep the same digest?',
        options: [
          { text: 'The digest stores a copy of the original text', correct: false, why: 'A digest stores no text at all: it is a fixed-size fingerprint.' },
          { text: 'Any change flips about half the bits, and finding a different input with the same digest is computationally infeasible', correct: true, why: 'That is collision resistance combined with the avalanche effect.' },
          { text: 'SHA-256 is protected by a secret key', correct: false, why: 'SHA-256 uses no key: anyone can compute it. Keys come in with signatures (lesson 2).' },
        ],
      },
    ],
  },
  {
    id: 'signatures',
    n: 2,
    title: 'Signing and verifying',
    course: 'course §1–5',
    paragraphs: [
      'RSA uses a key pair. The private key signs and must stay secret. The public key verifies and can be given to anyone.',
      'Signing hashes the message with SHA-256, then applies the RSA private-key operation to that digest. The result is a separate value: the signature. The message itself is not hidden, because signing is not encrypting.',
      'Verifying hashes the received message again and uses the public key to check the signature against it. If one byte changed, or a different key made the signature, verification fails.',
    ],
    practice: {
      kind: 'playground',
      playground: 'sign',
      intro: 'Generate a key pair, sign a message, then change the message, or check with the wrong public key, and watch verification fail.',
    },
    quiz: [
      {
        id: 'sign-key',
        prompt: 'Which key does the University use to sign a diploma?',
        options: [
          { text: 'The University’s private key', correct: true, why: 'Only the private key can make a signature; it never leaves its owner.' },
          { text: 'The University’s public key', correct: false, why: 'A public key can only verify. Anyone has it, so it can’t prove who signed.' },
          { text: 'The Ministry’s private key', correct: false, why: 'The Ministry signs certificates, never the diploma itself.' },
        ],
      },
      {
        id: 'sign-proves',
        prompt: 'A signature verifies correctly. On its own, what does that prove?',
        options: [
          { text: 'The message is unchanged and was signed with the matching private key', correct: true, why: 'That is exactly what a signature gives: integrity and authenticity of the key.' },
          { text: 'The signer is Abay Valley University', correct: false, why: 'Linking a key to a name needs a certificate and a chain of trust (lessons 3–5).' },
          { text: 'The message was kept secret', correct: false, why: 'Signing provides no secrecy; the message stays readable.' },
        ],
      },
    ],
  },
  {
    id: 'certificates',
    n: 3,
    title: 'Certificates: whose key is this?',
    course: 'course §8, §10–12',
    paragraphs: [
      'A signature tells you a message was signed with a particular key. It cannot tell you who owns that key. A certificate answers that question.',
      'An X.509 certificate contains a subject (whose key it is), the public key, an issuer (who vouches for it), a validity period, a serial number and extensions. The issuer signs all of it.',
      'A root CA signs its own certificate, so its subject and issuer are the same. Nobody vouches for a root: it is trusted only because a verifier chose to install it.',
    ],
    practice: {
      kind: 'task',
      view: 'bench',
      label: 'Open the lab bench',
      task: 'Create the root CA on the lab bench, then open the Trust chain and inspect its Fields and Extensions.',
      doneWhen: 'root',
    },
    quiz: [
      {
        id: 'cert-binds',
        prompt: 'What does a certificate bind together?',
        options: [
          { text: 'An identity and a public key', correct: true, why: 'The issuer’s signature vouches that this public key belongs to this subject.' },
          { text: 'A document and its signature', correct: false, why: 'That is a signed document. A certificate is about keys and names.' },
          { text: 'A private key and a public key', correct: false, why: 'A certificate never contains a private key.' },
        ],
      },
      {
        id: 'cert-root-issuer',
        prompt: 'Who is the issuer of the root CA’s certificate?',
        options: [
          { text: 'The root itself: it is self-signed', correct: true, why: 'Subject and issuer are the same name; it signed itself with its own key.' },
          { text: 'The Ministry of Education', correct: false, why: 'The Ministry is below the root; the root vouches for the Ministry, not the other way round.' },
          { text: 'The verifier', correct: false, why: 'Verifiers decide whether to trust a root; they don’t issue it.' },
        ],
      },
    ],
  },
  {
    id: 'authorities',
    n: 4,
    title: 'CSRs and certificate authorities',
    course: 'course §13–19, §23',
    paragraphs: [
      'The Ministry of Education needs a certificate from the Root, but must never hand over its private key. So it generates its own key pair and sends a certificate signing request (CSR): its name and public key, signed with its own private key. That signature is proof of possession.',
      'The Root checks the CSR’s signature, then signs a certificate for the Ministry with the Root’s private key. The certificate’s rules come from the Root, never from the request.',
      'The Ministry’s certificate says `CA:TRUE, pathlen:0`: it may issue certificates, but only to end entities like the University, never to another CA. The University’s certificate says `CA:FALSE`: it may sign documents, but never certificates.',
    ],
    practice: {
      kind: 'task',
      view: 'bench',
      label: 'Open the lab bench',
      task: 'Generate the Ministry’s key and CSR, have the Root sign it, then inspect the Ministry’s extensions on the Trust chain.',
      doneWhen: 'ministry',
    },
    quiz: [
      {
        id: 'csr-why',
        prompt: 'Why is a CSR signed by the requester?',
        options: [
          { text: 'To prove the requester holds the matching private key', correct: true, why: 'This is proof of possession: only the key’s owner could sign the request.' },
          { text: 'So the Root can copy the private key', correct: false, why: 'The private key never leaves the requester, not even inside a CSR.' },
          { text: 'To encrypt the request', correct: false, why: 'A CSR is readable by anyone; the signature only proves possession.' },
        ],
      },
      {
        id: 'csr-pathlen',
        prompt: 'The Ministry’s certificate has `pathlen:0`. Which certificate may it issue?',
        options: [
          { text: 'A University certificate with CA:FALSE', correct: true, why: 'An end entity is allowed under pathlen:0.' },
          { text: 'A “Regional Bureau” CA certificate', correct: false, why: 'A CA beneath the Ministry would exceed pathlen:0. Try attack scenario 7.' },
          { text: 'A new root certificate', correct: false, why: 'A root is self-signed; no CA issues one.' },
        ],
      },
      {
        id: 'csr-intermediate',
        prompt: 'Why use an intermediate CA instead of having the Root sign everything?',
        options: [
          { text: 'The root key can stay offline, and a compromised intermediate can be replaced without replacing the root', correct: true, why: 'This is the course’s answer in §23: it limits the damage of everyday use.' },
          { text: 'Intermediate CAs make signatures faster', correct: false, why: 'Speed is not the reason; protecting the root key is.' },
          { text: 'RSA requires at least two keys in a chain', correct: false, why: 'RSA has no such rule; this is an organisational choice.' },
        ],
      },
    ],
  },
  {
    id: 'validation',
    n: 5,
    title: 'Chain validation and the trust store',
    course: 'course §19, §21–22, §28',
    paragraphs: [
      'To trust a diploma, a verifier walks up the chain: the University’s certificate was signed by the Ministry, the Ministry’s by the Root, and the Root is in the verifier’s own trust store.',
      'At every link it checks the signature and the rules: CA:TRUE, pathlen, key usage and dates. The verifier desk shows this as seven checks. Check 3 judges the content; checks 4 to 7 judge the identity.',
      'The trust store is the verifier’s decision. A root that arrives with the document proves nothing, even if it carries the real root’s exact name.',
    ],
    practice: {
      kind: 'task',
      view: 'bench',
      label: 'Open the lab bench',
      task: 'Sign the diploma and hand it to a verifier. On the verifier desk, change one character, restore it, then un-tick the root in the trust store.',
      doneWhen: 'signed',
    },
    quiz: [
      {
        id: 'val-trust',
        prompt: 'Where does a verifier’s trust ultimately come from?',
        options: [
          { text: 'The roots the verifier chose to put in its trust store', correct: true, why: 'Every chain must end at one of those roots, matched by fingerprint.' },
          { text: 'The root certificate included with the document', correct: false, why: 'Anyone can include a root. That is exactly the rogue-root attack.' },
          { text: 'The name written on the certificate', correct: false, why: 'Names can be copied by anyone. Only signatures and the trust store count.' },
        ],
      },
      {
        id: 'val-tamper',
        prompt: 'You change the CGPA on a received diploma. Which check fails?',
        options: [
          { text: 'Check 3, the signature', correct: true, why: 'The bytes changed, so the digest changed, so the signature no longer matches.' },
          { text: 'Check 6, the trust anchor', correct: false, why: 'The chain is untouched: the identity checks 4–7 still pass.' },
          { text: 'None of them', correct: false, why: 'Any change to the bytes breaks the signature.' },
        ],
      },
    ],
  },
  {
    id: 'attacks',
    n: 6,
    title: 'Attacks, and why they fail',
    course: 'course §21, §26',
    paragraphs: [
      'Attacks fall into two groups. Content attacks change the document or move a signature to another one: the certificates are fine, but check 3 fails.',
      'Identity attacks forge or abuse the chain. The signature can be mathematically perfect, yet the chain breaks a rule, like pathlen or CA:FALSE, or ends at a root you don’t trust.',
      'The rogue-root attack is the clearest lesson: a forged root with the real root’s exact name, a fake Ministry and a fake University. Every signature verifies, and the diploma is still rejected.',
    ],
    practice: {
      kind: 'task',
      view: 'attacks',
      label: 'Open the attack bench',
      task: 'Run all ten attacks, then open scenario 5 (rogue root) and scenario 8 (University acting as a CA).',
      doneWhen: null,
    },
    quiz: [
      {
        id: 'atk-rogue',
        prompt: 'In the rogue-root scenario, what does `openssl dgst -verify` say about the forger’s signature?',
        options: [
          { text: 'Verified OK', correct: true, why: 'The forger really signed it; the maths is fine. The chain of trust is what fails.' },
          { text: 'Verification failure', correct: false, why: 'The signature is valid. Only `openssl verify` on the chain rejects it.' },
        ],
      },
      {
        id: 'atk-two',
        prompt: 'Which attack breaks two rules at once?',
        options: [
          { text: 'The University acting as a CA', correct: true, why: 'The University is CA:FALSE, and the Ministry’s pathlen:0 is exceeded too.' },
          { text: 'Changing one character', correct: false, why: 'That breaks only the signature check.' },
          { text: 'An expired certificate', correct: false, why: 'That breaks only the validity check.' },
        ],
      },
    ],
  },
];
