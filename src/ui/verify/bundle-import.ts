/**
 * Reading a bundle the user selects from disk. Files are matched by name, as
 * exported by the lab and by `npm run interop -- scenarios`. Sizes are
 * checked before reading, and every parse error becomes a plain message.
 */
import { MAX_MESSAGE_BYTES } from '../../crypto/index.ts';
import { MAX_PEM_BYTES, type X509Certificate } from '../../pki/index.ts';
import { bundleFromFiles, trustStoreFromPem } from '../../verify/index.ts';
import type { ReceivedBundle } from './types.ts';

export const BUNDLE_FILE_NAMES = ['diploma.json', 'diploma.sig', 'signer-cert.pem', 'chain.pem', 'trust-store.pem'] as const;
const LIMITS: Record<string, number> = {
  'diploma.json': MAX_MESSAGE_BYTES,
  'diploma.sig': 1024,
  'signer-cert.pem': MAX_PEM_BYTES,
  'chain.pem': MAX_PEM_BYTES,
  'trust-store.pem': MAX_PEM_BYTES,
};

export type ImportResult =
  | { ok: true; received: ReceivedBundle; anchors: X509Certificate[] | null; ignored: string[] }
  | { ok: false; error: string };

export async function importBundle(list: readonly File[]): Promise<ImportResult> {
  const byName = new Map<string, File>();
  const ignored: string[] = [];
  for (const f of list) {
    const name = f.name.toLowerCase();
    if ((BUNDLE_FILE_NAMES as readonly string[]).includes(name)) byName.set(name, f);
    else ignored.push(f.name);
  }
  const missing = ['diploma.json', 'diploma.sig', 'signer-cert.pem'].filter((n) => !byName.has(n));
  if (missing.length) {
    return { ok: false, error: `Missing ${missing.join(', ')}. Select all the files of one bundle together.` };
  }
  for (const [name, f] of byName) {
    const limit = LIMITS[name] ?? 0;
    if (f.size > limit) return { ok: false, error: `${name} is ${f.size.toLocaleString('en')} bytes, over the ${limit.toLocaleString('en')}-byte limit.` };
  }
  const bytes = async (n: string) => new Uint8Array(await (byName.get(n) as File).arrayBuffer());
  const text = async (n: string) => (byName.has(n) ? (byName.get(n) as File).text() : undefined);

  try {
    const bundle = bundleFromFiles({
      document: await bytes('diploma.json'),
      signature: await bytes('diploma.sig'),
      signerPem: (await text('signer-cert.pem')) ?? '',
      chainPem: await text('chain.pem'),
    });
    const trustPem = await text('trust-store.pem');
    const anchors = trustPem ? [...trustStoreFromPem(trustPem).anchors] : null;
    return {
      ok: true,
      received: {
        original: bundle.document,
        signature: bundle.signature,
        signer: bundle.signer,
        intermediates: bundle.intermediates,
        label: 'Loaded from files',
      },
      anchors,
      ignored,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'These files could not be read as a bundle.' };
  }
}
