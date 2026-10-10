import { CertificateFacts } from '../common/CertificateFacts.tsx';
import { Command } from '../common/Command.tsx';
import { Disclosure } from '../common/Disclosure.tsx';
import { HexBlocks } from '../common/HexBlocks.tsx';
import { commonName } from '../common/format.ts';
import { EnvironmentPanel } from '../shell/EnvironmentPanel.tsx';
import { DiplomaForm } from './DiplomaForm.tsx';
import { StageRow, type StageStatus } from './StageRow.tsx';
import { Ledger } from './Ledger.tsx';
import { useLab } from '../../state/LabProvider.tsx';
import { currentStage, type Stage, type Task } from '../../state/lab.ts';
import {
  certifyMinistry,
  certifyUniversity,
  createRoot,
  requestMinistry,
  requestUniversity,
  signDiploma,
  type SubordinateParty,
} from '../../state/operations.ts';
import { checkEnvironment, environmentReady } from '../../crypto/index.ts';

const ORDER: Stage[] = ['root', 'ministry-request', 'ministry-certify', 'university-request', 'university-certify', 'sign', 'done'];

/** Status of a bench row that spans the given stages. */
function rowStatus(current: Stage, first: Stage, last: Stage): StageStatus {
  const c = ORDER.indexOf(current);
  if (c > ORDER.indexOf(last)) return 'done';
  if (c >= ORDER.indexOf(first)) return 'current';
  return 'locked';
}

const BUSY_TEXT: Record<Task, string> = {
  root: 'Generating an RSA-4096 key pair…',
  'ministry-request': 'Generating the Ministry’s RSA-4096 key pair…',
  'ministry-certify': 'The Root is signing…',
  'university-request': 'Generating the University’s RSA-3072 key pair…',
  'university-certify': 'The Ministry is signing…',
  sign: 'Hashing and signing…',
  'whole-lab': 'Setting up the whole lab: three key pairs and three certificates…',
};

function CsrFacts({ party }: { party: SubordinateParty }) {
  const c = party.csrSummary;
  return (
    <dl className="facts">
      <div className="facts__row"><dt>Request</dt><dd>Certificate signing request (PKCS#10)</dd></div>
      <div className="facts__row"><dt>Subject</dt><dd>{commonName(c.subject)}</dd></div>
      <div className="facts__row"><dt>Key</dt><dd>{c.publicKey ? `RSA-${c.publicKey.modulusLength}` : 'unknown'}</dd></div>
      <div className="facts__row"><dt>Proof of possession</dt><dd>{c.signatureValid ? 'Signature verified' : 'Signature invalid'}</dd></div>
    </dl>
  );
}

export function BenchView({ onOpenVerifier }: { onOpenVerifier: () => void }) {
  const { state, run } = useLab();
  const { root, ministry, university } = state;
  const stage = currentStage(state);
  const busy = state.busy !== null;
  const envOk = environmentReady(checkEnvironment());
  const errorFor = (tasks: Task[]) =>
    state.error && tasks.includes(state.error.task) ? (
      <p className="form-error" role="alert">
        {state.error.message}
      </p>
    ) : null;
  const busyFor = (tasks: Task[]) =>
    state.busy && tasks.includes(state.busy) ? (
      <p className="busy" role="status">
        {BUSY_TEXT[state.busy]}
      </p>
    ) : null;

  return (
    <div className="bench">
      <div className="bench__main">
        <section className="intro" aria-labelledby="bench-title">
          <h1 id="bench-title" className="intro__title">
            Issue a diploma that anyone can verify, without phoning the registrar.
          </h1>
          <p className="intro__lede">
            Build the chain of trust in the same order as the course practical. Every button performs real RSA and
            SHA-256 operations in this browser, and every result shown is read back from the real key or certificate.
            Keys never leave this tab.
          </p>
        </section>

        {envOk ? (
          <Disclosure title="Instrument check: this browser can run the lab">
            <EnvironmentPanel />
          </Disclosure>
        ) : (
          <EnvironmentPanel />
        )}

        <ol className="stages">
          <StageRow
            n={1}
            title="Create the trust anchor"
            provenance="course §10–12"
            status={rowStatus(stage, 'root', 'root')}
            intro="The Demo National Root CA: an RSA-4096 key and a self-signed certificate, valid for 10 years."
          >
            {state.root ? (
              <CertificateFacts summary={state.root.summary} />
            ) : (
              <button type="button" className="button button--primary" disabled={busy || !envOk}
                onClick={() => run('root', async () => { const s = await createRoot(); return { type: 'root-created', root: s.result, entries: s.entries }; })}>
                Create the root CA
              </button>
            )}
            {busyFor(['root'])}
            {errorFor(['root'])}
            <Disclosure title="What happened?">
              <p>A 4096-bit RSA key pair was generated in this browser. The root then signed its own certificate with its own private key, so its Subject and Issuer are the same: nobody vouches for a root.</p>
              <p>A root is trusted only because verifiers choose to install it. In real systems its private key is kept offline in a hardware security module. Here it lives in this tab’s memory, marked non-extractable, and disappears when you reload.</p>
            </Disclosure>
            <Disclosure title="OpenSSL equivalent">
              <Command lines={['openssl genrsa -out rootCA\\private\\rootCA-key.pem 4096', 'openssl req -x509 -new -sha256 -key rootCA\\private\\rootCA-key.pem -out rootCA\\certs\\rootCA-cert.pem -days 3650']} />
            </Disclosure>
          </StageRow>

          <StageRow
            n={2}
            title="Delegate to the Ministry of Education"
            provenance="course §13–19"
            status={rowStatus(stage, 'ministry-request', 'ministry-certify')}
            intro="The Ministry makes its own key and asks the Root to certify it. The certificate carries CA:TRUE, pathlen:0."
          >
            {state.ministry && (state.ministry.summary ? <CertificateFacts summary={state.ministry.summary} /> : <CsrFacts party={state.ministry} />)}
            {!state.ministry && (
              <button type="button" className="button button--primary" disabled={busy}
                onClick={() => run('ministry-request', async () => { const s = await requestMinistry(); return { type: 'ministry-updated', ministry: s.result, entries: s.entries }; })}>
                Generate the Ministry’s key and CSR
              </button>
            )}
            {ministry && !ministry.certificate && root && (
              <button type="button" className="button button--primary" disabled={busy}
                onClick={() => run('ministry-certify', async () => { const s = await certifyMinistry(ministry, root); return { type: 'ministry-updated', ministry: s.result, entries: s.entries }; })}>
                Root signs the Ministry’s certificate
              </button>
            )}
            {busyFor(['ministry-request', 'ministry-certify'])}
            {errorFor(['ministry-request', 'ministry-certify'])}
            <Disclosure title="What happened?">
              <p>The Ministry generated its own key pair. The Root never sees that private key. The Ministry wrapped its name and public key in a certificate signing request and signed the request itself, which proves it holds the matching private key.</p>
              <p>The Root checked that proof, then signed a certificate for the Ministry with the <em>Root’s</em> private key, adding the extensions from the course’s intermediate-ext.cnf: CA:TRUE (it may certify others), pathlen:0 (but only end entities, never another CA) and keyUsage keyCertSign, cRLSign.</p>
            </Disclosure>
            <Disclosure title="OpenSSL equivalent">
              <Command lines={[
                'openssl genrsa -out intermediateCA\\private\\intermediateCA-key.pem 4096',
                'openssl req -new -sha256 -key intermediateCA\\private\\intermediateCA-key.pem -out intermediateCA\\intermediateCA.csr -subj "/C=ET/O=Mahtem Lab/OU=Ministry of Education (simulated)/CN=Demo MoE Issuing CA"',
                'openssl x509 -req -sha256 -in intermediateCA\\intermediateCA.csr -CA rootCA\\certs\\rootCA-cert.pem -CAkey rootCA\\private\\rootCA-key.pem -CAcreateserial -out intermediateCA\\certs\\intermediateCA-cert.pem -days 1825 -extfile intermediate-ext.cnf',
              ]} />
            </Disclosure>
          </StageRow>

          <StageRow
            n={3}
            title="Certify the University"
            provenance="extension (course §25)"
            status={rowStatus(stage, 'university-request', 'university-certify')}
            intro="Abay Valley University gets a signing certificate from the Ministry: CA:FALSE, allowed to sign documents but never certificates."
          >
            {state.university && (state.university.summary ? <CertificateFacts summary={state.university.summary} /> : <CsrFacts party={state.university} />)}
            {!state.university && (
              <button type="button" className="button button--primary" disabled={busy}
                onClick={() => run('university-request', async () => { const s = await requestUniversity(); return { type: 'university-updated', university: s.result, entries: s.entries }; })}>
                Generate the University’s key and CSR
              </button>
            )}
            {university && !university.certificate && ministry && (
              <button type="button" className="button button--primary" disabled={busy}
                onClick={() => run('university-certify', async () => { const s = await certifyUniversity(university, ministry); return { type: 'university-updated', university: s.result, entries: s.entries }; })}>
                Ministry signs the University’s certificate
              </button>
            )}
            {busyFor(['university-request', 'university-certify'])}
            {errorFor(['university-request', 'university-certify'])}
            <Disclosure title="What happened?">
              <p>The same request-and-sign exchange, one level down. This time the Ministry’s private key signs, and the certificate says CA:FALSE with keyUsage digitalSignature and nonRepudiation: the University may sign diplomas, but its key cannot vouch for anyone else.</p>
              <p>The course describes this step (§25) without giving its commands, so the lab marks it as an extension.</p>
            </Disclosure>
          </StageRow>

          <StageRow
            n={4}
            title="Sign the diploma"
            provenance="course §4, §21"
            status={rowStatus(stage, 'sign', 'sign')}
            intro="The University hashes the diploma’s exact bytes with SHA-256 and signs the digest with its private key."
          >
            {state.signed ? (
              <div className="signed">
                <dl className="facts">
                  <div className="facts__row"><dt>Document</dt><dd>{state.signed.document.byteLength} bytes of UTF-8 JSON</dd></div>
                  <div className="facts__row"><dt>SHA-256</dt><dd><HexBlocks blocks={state.signed.digestBlocks} label="Digest of the signed diploma" /></dd></div>
                  <div className="facts__row"><dt>Signature</dt><dd>{state.signed.signature.byteLength} bytes, RSASSA-PKCS1-v1_5</dd></div>
                </dl>
                <button type="button" className="button button--primary" onClick={onOpenVerifier}>
                  Hand it to a verifier
                </button>
              </div>
            ) : (
              <DiplomaForm disabled={busy || !university?.certificate}
                onSign={(d) => {
                  if (!university?.certificate) return;
                  void run('sign', async () => { const s = await signDiploma(university, d); return { type: 'diploma-signed', signed: s.result, entries: s.entries }; });
                }} />
            )}
            {busyFor(['sign'])}
            {errorFor(['sign'])}
            <Disclosure title="What happened?">
              <p>The diploma was turned into exact bytes (UTF-8 JSON) and hashed with SHA-256 into a 32-byte digest. The RSA signature operation then used the University’s private key on that digest.</p>
              <p>This is not “encrypting the diploma”: the diploma stays readable. The signature is a separate 384-byte value that only the University’s private key could have produced, and that anyone can check with the University’s public key.</p>
            </Disclosure>
            <Disclosure title="OpenSSL equivalent">
              <Command lines={['openssl dgst -sha256 -sign university-key.pem -out diploma.sig diploma.json']} />
            </Disclosure>
          </StageRow>
        </ol>
      </div>
      <Ledger entries={state.ledger} />
    </div>
  );
}
