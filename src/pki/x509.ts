/**
 * The ONLY module that imports @peculiar/x509 (enforced by lint).
 *
 * The library depends on tsyringe, which needs the Reflect metadata API.
 * Importing the polyfill here, before the library, guarantees the order.
 * The library performs all its cryptography through the browser's Web Crypto.
 */
import 'reflect-metadata';

export * from '@peculiar/x509';
