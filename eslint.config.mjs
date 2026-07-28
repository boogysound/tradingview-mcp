// Minimal lint guard.
//
// Primary purpose: catch `no-undef` ("X is not defined") — the exact class of bug
// that an unfinished refactor introduces silently. When imports are renamed
// (e.g. `evaluate` -> `_evaluate` behind a `_resolve(_deps)` helper) but a few
// call sites are missed, the code parses fine and only throws at runtime.
// `no-undef` flags those statically, so CI blocks the regression at PR time.
//
// Globals below are the runtime APIs used across src/ (Node + browser/CDP context).
//
// `files` covers .mjs too (not just .js) — found live 28.07.2026: every file
// under scripts/premarket/ is .mjs, so it had been silently invisible to
// this whole config the entire time. A `setTimeframe is not defined`
// ReferenceError from an incomplete refactor (moving fetchBars to utils.mjs
// left one direct setTimeframe call without its own import) only surfaced
// via a live launchd run, not via `eslint .` despite it reporting 0 problems.
export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', console: 'readonly',
        process: 'readonly', Buffer: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', WebSocket: 'readonly', AbortController: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly', global: 'readonly',
        __dirname: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly',
        FormData: 'readonly', Blob: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
