import { useEffect, useId, useState } from 'react';
import { generateRsaKeyPair, sign, toHex, utf8Encode, verify } from '../../crypto/index.ts';

/** Real RSA signing and verification: sign, then edit the message or switch keys. */
export function SignPlayground({ onPracticed }: { onPracticed: () => void }) {
  const id = useId();
  const [keys, setKeys] = useState<CryptoKeyPair | null>(null);
  const [other, setOther] = useState<CryptoKeyPair | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Abay Valley University certifies that Hana Tesfaye earned a BSc. CGPA 3.12');
  const [signed, setSigned] = useState<{ message: string; signature: Uint8Array } | null>(null);
  const [useOther, setUseOther] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!signed || !keys) return;
    const key = useOther && other ? other.publicKey : keys.publicKey;
    let live = true;
    void verify(key, signed.signature, utf8Encode(message)).then((v) => live && setValid(v));
    return () => {
      live = false;
    };
  }, [signed, keys, other, useOther, message]);

  useEffect(() => {
    if (valid === false) onPracticed();
  }, [valid, onPracticed]);

  async function generate() {
    setBusy(true);
    setKeys(await generateRsaKeyPair({ modulusLength: 2048 }));
    setSigned(null);
    setValid(null);
    setUseOther(false);
    setBusy(false);
  }

  return (
    <div className="playground">
      <ol className="playground__steps">
        <li>
          <button type="button" className="button" disabled={busy} onClick={() => void generate()}>
            {keys ? 'Generate a new key pair' : 'Generate an RSA-2048 key pair'}
          </button>
          {keys && <span className="playground__note"> Key pair ready. The private key is non-extractable: the browser will sign with it but never reveal it.</span>}
        </li>
        <li>
          <label htmlFor={`${id}-m`} className="field-label">Message</label>
          <textarea id={`${id}-m`} className="raw" rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} spellCheck={false} />
          <button type="button" className="button button--primary" disabled={!keys || busy}
            onClick={async () => keys && setSigned({ message, signature: await sign(keys.privateKey, utf8Encode(message)) })}>
            Sign this message with the private key
          </button>
        </li>
        {signed && (
          <li>
            <p className="playground__note">
              Signature: {signed.signature.length} bytes, starting <code>{toHex(signed.signature.subarray(0, 12))}…</code>
            </p>
            <label className="check">
              <input type="checkbox" checked={useOther} disabled={busy}
                onChange={async (e) => {
                  const on = e.target.checked;
                  if (on && !other) {
                    setBusy(true);
                    setOther(await generateRsaKeyPair({ modulusLength: 2048 }));
                    setBusy(false);
                  }
                  setUseOther(on);
                }} />
              <span>Verify with somebody else’s public key instead</span>
            </label>
          </li>
        )}
      </ol>
      {signed && valid !== null && (
        <p className={`playground__result ${valid ? 'pass-text' : 'fail-text'}`} role="status">
          {valid
            ? 'Signature valid: this exact message was signed with the matching private key.'
            : useOther
              ? 'Signature invalid: this public key does not match the private key that signed.'
              : 'Signature invalid: the message changed after it was signed.'}
        </p>
      )}
    </div>
  );
}
