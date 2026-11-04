// Existe por um motivo concreto: em 04/11/2026 uma constante foi usada numa
// rota sem ser importada, o build passou com --no-lint e o erro só apareceu
// na tela do usuário. no-undef é a regra que pega isso.
//
// Só essa regra, de propósito. Sem o plugin do React o JSX não conta como uso,
// então "não usado" vira dezenas de falsos positivos e o sinal se perde.
import globals from "globals";

export default [
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: { "no-undef": "error" },
  },
  { ignores: [".next/**", "node_modules/**", "public/**"] },
];
