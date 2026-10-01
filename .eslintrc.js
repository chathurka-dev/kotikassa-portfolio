module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // Disallow any — forces explicit types everywhere
    '@typescript-eslint/no-explicit-any': 'error',
    // Catch unused variables (underscore prefix to intentionally ignore)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Warn on console.log but allow warn/error for intentional logging
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['node_modules/', '.next/', 'dist/', '*.config.js', '*.config.ts'],
}
