// commitlint.config.mjs

// 1. Define your custom types (scopes are fully open)
const TYPES = {
  feat: '✨',
  fix: '🐛',
  docs: '📚',
  style: '💎',
  refactor: '📦',
  perf: '🚀',
  test: '🚨',
  build: '🛠',
  ci: '⚙️',
  chore: '♻️',
  revert: '🗑',
};

export default {
  extends: ['@commitlint/config-conventional'],

  // 2. Custom Parser
  parserPreset: {
    parserOpts: {
      headerPattern: /^(\w*)(?:\((.*)\))?!?:\s*(.*)$/,
      breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!?:\s*(.*)$/,
    },
  },

  // 3. Custom Plugins for Warnings
  plugins: [
    {
      rules: {
        'header-emoji-warning': ({ header }) => {
          const match = header.match(/^(\w*)(?:\((.*)\))?!?:\s*(.*)$/);
          if (!match) return [true];

          const subject = match[3];
          const hasEmoji = /^\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(subject);

          return [hasEmoji, 'emoji is recommended in the header (e.g., "feat: ✨ add feature")'];
        },
        'header-colon-space-warning': ({ header }) => {
          const colonIndex = header.indexOf(':');
          if (colonIndex !== -1) {
            const charAfterColon = header[colonIndex + 1];
            if (charAfterColon && charAfterColon !== ' ') {
              return [
                false,
                'a space is required after the colon (e.g., "feat: message", not "feat:message")',
              ];
            }
          }
          return [true];
        },
      },
    },
  ],

  // 4. The Rules
  rules: {
    // --- ERRORS (Strict Rules) ---
    'type-enum': [2, 'always', Object.keys(TYPES)],
    'header-max-length': [2, 'always', 50],
    'body-max-line-length': [2, 'always', 72],
    'footer-max-line-length': [2, 'always', 72],
    'header-full-stop': [2, 'never', '.'],
    'subject-full-stop': [2, 'never', '.'],
    'body-full-stop': [2, 'never', '.'],
    'subject-empty': [2, 'never'],

    // --- WARNINGS (Recommended Rules) ---
    // Level 1 = Warning, 'never' means it should NEVER be empty
    'scope-empty': [1, 'never'],
    'header-emoji-warning': [1, 'always'],
    'header-colon-space-warning': [1, 'always'],
  },
};
