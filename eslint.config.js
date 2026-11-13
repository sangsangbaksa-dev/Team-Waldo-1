import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    // The strategy domain must remain executable in Node without a renderer.
    files: ['src/battle/{war,model,rules,combat,territory,unitSpatialIndex,base,squads,battlefieldLayout,events}.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'phaser', './view', './graphics', './baseUI', '**/render/*', '**/scenes/*'] }],
      'no-restricted-globals': ['error', 'Date', 'performance', 'window', 'document'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Keep strategy simulation deterministic.' },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // sim은 순수 TS: Phaser와 비결정적 API 사용 금지
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['phaser', '**/render/*', '**/scenes/*'] }],
      'no-restricted-globals': ['error', 'Date', 'performance', 'window', 'document'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'world.rng를 사용하세요.' },
      ],
    },
  },
);
