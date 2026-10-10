import { MAX_MESSAGE_BYTES } from './constants.ts';
import { type Bytes, toBytes } from './encoding.ts';
import { CryptoInputError } from './errors.ts';

/** Enforce the message size limit and hand Web Crypto a plain ArrayBuffer-backed view. */
export function guardMessage(data: Uint8Array, what = 'Message'): Bytes {
  if (!(data instanceof Uint8Array)) {
    throw new CryptoInputError(`${what} must be bytes (Uint8Array).`);
  }
  if (data.byteLength > MAX_MESSAGE_BYTES) {
    throw new CryptoInputError(
      `${what} is ${data.byteLength.toLocaleString('en')} bytes; the lab accepts at most ${MAX_MESSAGE_BYTES.toLocaleString('en')} bytes (1 MiB).`,
    );
  }
  return data.buffer instanceof ArrayBuffer ? (data as Bytes) : toBytes(data);
}
