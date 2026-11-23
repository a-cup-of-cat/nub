import { stripTypeScriptTypes } from 'node:module';
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{mjs,js,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-debugger': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    processor: {
      preprocess(source, path) {
        return [stripTypeScriptTypes(source, { mode: 'strip' })];
      },
      postprocess(messages) {
        return messages.flat();
      },
    },
    rules: { 'no-debugger': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error' },
  },
];
