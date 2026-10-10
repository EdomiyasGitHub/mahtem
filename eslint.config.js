// Mahtem lint configuration.
// Beyond code quality, this file enforces security architecture decisions
// (see docs/adr). Each restriction carries the reason in its message.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Ways untrusted text could become executable HTML. Banned everywhere in src/. */
const htmlSinks = [
  {
    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
    message: 'Security: certificate fields and documents are untrusted input. Render as text, never as HTML.',
  },
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: 'Security: writing HTML strings is an XSS sink. Use React rendering.',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'Security: insertAdjacentHTML is an XSS sink.',
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]",
    message: 'Security: document.write is an XSS sink.',
  },
];

/** Direct Web Crypto access. Only src/crypto/ may touch SubtleCrypto. */
const subtleOutsideCryptoLayer = {
  selector: "MemberExpression[property.name='subtle']",
  message: 'Architecture: only src/crypto/ may use crypto.subtle. Call a function from the crypto layer instead.',
};

const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'Security: Mahtem makes no network requests (CSP connect-src none). Keys must never leave the browser.',
}));

const storageGlobals = ['localStorage', 'sessionStorage'].map((name) => ({
  name,
  message: 'Security: never persist lab state as plain strings. Key persistence, if ever added, uses non-extractable CryptoKeys in IndexedDB.',
}));

const restrictedProperties = [
  { object: 'navigator', property: 'sendBeacon', message: 'Security: no outbound requests.' },
  { object: 'window', property: 'fetch', message: 'Security: no outbound requests.' },
  { object: 'globalThis', property: 'fetch', message: 'Security: no outbound requests.' },
  { object: 'window', property: 'localStorage', message: 'Security: no plain-string persistence.' },
  { object: 'window', property: 'sessionStorage', message: 'Security: no plain-string persistence.' },
];

export default tseslint.config(
  { ignores: ['dist/', 'dist-smoke/', 'node_modules/', 'coverage/', 'interop/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
    },
  },
  // Application code (and browser check pages): every guardrail, including the crypto-layer boundary.
  {
    files: ['src/**/*.{ts,tsx}', 'smoke/**/*.ts'],
    ignores: ['src/crypto/**'],
    rules: {
      'no-restricted-syntax': ['error', ...htmlSinks, subtleOutsideCryptoLayer],
      'no-restricted-globals': ['error', ...networkGlobals, ...storageGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
    },
  },
  // The crypto layer: may use SubtleCrypto, but everything else still applies.
  {
    files: ['src/crypto/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...htmlSinks],
      'no-restricted-globals': ['error', ...networkGlobals, ...storageGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
    },
  },
  // Only src/pki/x509.ts may import the X.509 library (it loads the required polyfill first).
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
    ignores: ['src/pki/x509.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@peculiar/x509', message: 'Import from src/pki/x509.ts, which loads reflect-metadata first.' },
          { name: 'reflect-metadata', message: 'Loaded once, by src/pki/x509.ts.' },
        ],
      }],
    },
  },
  // Playwright fixtures call a parameter named `use`; React's hook rules don't apply there.
  {
    files: ['tests/e2e/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  // Tests may assert non-null: a missing value should fail the test loudly anyway.
  {
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  // Node-side tooling and tests.
  {
    files: ['scripts/**/*.{mjs,ts}', 'tests/**/*.ts', 'vite.config.ts', 'vite.smoke.config.ts', 'playwright.config.ts', 'security/**/*.ts', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
