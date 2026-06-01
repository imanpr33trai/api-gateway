import { defineConfig } from 'oxfmt'

export default defineConfig({
  arrowParens: 'avoid',
  jsxSingleQuote: false,
  quoteProps: 'consistent',
  semi: false,
  sortPackageJson: true,
  singleQuote: true,
  sortImports: {
    groups: [
      'side_effect',
      'side_effect_style',
      'style',
      ['builtin', 'external', 'unknown'],
      ['internal', 'parent', 'sibling', 'index']
    ],
    newlinesBetween: true,
    order: 'asc'
  },
  trailingComma: 'none',
  printWidth: 80
})
