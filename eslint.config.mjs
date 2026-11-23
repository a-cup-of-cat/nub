import ts from 'typescript';
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  { files: ['**/*.{mjs,js,jsx}'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } }, rules: { 'no-debugger': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error' } },
  { files: ['**/*.ts','**/*.tsx'], processor: {
    preprocess(source, path) { return [ts.transpileModule(source,{fileName:path,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText]; },
    postprocess(messages) { return messages.flat(); }
  }, rules: { 'no-debugger': 'error', 'no-duplicate-case':'error', 'no-unreachable':'error' } }
];
