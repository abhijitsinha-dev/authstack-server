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

const HEADER_PATTERN = /^(\w+)(?:\(([^)]*)\))?!?:\s*(\S.*)$/;

export default {
  extends: ['@commitlint/config-conventional'],

  // 2. Custom Parser
  parserPreset: {
    parserOpts: {
      headerPattern: HEADER_PATTERN,
      breakingHeaderPattern: HEADER_PATTERN,
    },
  },

  // 3. Custom Plugins for Warnings & Lowercase Rule
  plugins: [
    {
      rules: {
        'header-emoji-warning': ({ header }) => {
          const match = header.match(HEADER_PATTERN);
          if (!match) return [true];

          const subject = match[3];
          const hasEmoji = /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/u.test(subject);

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
        // 👇 New custom rule: Enforce lowercase, but ignore filenames
        'subject-lowercase-files-exception': ({ header }) => {
          const match = header.match(HEADER_PATTERN);
          if (!match) return [true];
          const subject = match[3];

          // Remove filenames from the subject before checking for uppercase.
          // Matches words with extensions (e.g., README.md, App.tsx) and dotfiles (e.g., .env)
          const subjectWithoutFiles = subject
            .replace(/\b[\w-]+\.[a-zA-Z0-9]+\b/g, '')
            .replace(/\.[a-zA-Z0-9]+\b/g, '');

          // Check if any uppercase letters remain
          const hasUppercase = /[A-Z]/.test(subjectWithoutFiles);

          return [
            !hasUppercase,
            'subject must be lowercase (except for filenames like README.md or App.tsx)',
          ];
        },
        'body-lowercase-files-exception': ({ body }) => {
          if (!body) return [true]; // Body is optional
          const bodyWithoutFiles = body
            .replace(/\b[\w-]+\.[a-zA-Z0-9]+\b/g, '')
            .replace(/\.[a-zA-Z0-9]+\b/g, '');
          const hasUppercase = /[A-Z]/.test(bodyWithoutFiles);
          return [
            !hasUppercase,
            'body must be lowercase (except for filenames like README.md or App.tsx)',
          ];
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

    // 👇 Enforce our new lowercase rule as an ERROR
    'subject-lowercase-files-exception': [2, 'always'],
    'body-lowercase-files-exception': [2, 'always'],

    // --- WARNINGS (Recommended Rules) ---
    'scope-empty': [1, 'never'],
    'header-emoji-warning': [1, 'always'],
    'header-colon-space-warning': [1, 'always'],
  },
};
