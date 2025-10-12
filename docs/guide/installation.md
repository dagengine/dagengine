# Installation

---

## Requirements

- **Node.js** 16+ or 18+
- **TypeScript** 4.5+ (optional but recommended)

---

## Install

::: code-group
```bash [npm]
npm install @ivan629/dag-ai
```
```bash [yarn]
yarn add @ivan629/dag-ai
```
```bash [pnpm]
pnpm add @ivan629/dag-ai
```
:::

---

## Get API Keys

You'll need API keys for the AI providers you want to use.

### Anthropic (Claude)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add to your `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### OpenAI (GPT)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create an API key
3. Add to your `.env`:
```bash
OPENAI_API_KEY=sk-proj-...
```

### Google (Gemini)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Add to your `.env`:
```bash
GEMINI_API_KEY=AIza...
```

---

## Basic Setup

Create a simple test file:
```typescript
// test.ts
import { DagEngine, Plugin } from '@ivan629/dag-ai';

class TestPlugin extends Plugin {
  constructor() {
    super('test', 'Test', 'Test plugin');
    this.dimensions = ['test'];
  }

  createPrompt() {
    return 'Say hello';
  }

  selectProvider() {
    return { provider: 'anthropic', options: {} };
  }
}

const engine = new DagEngine({
  plugin: new TestPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});

const result = await engine.process([
  { content: 'Test', metadata: {} }
]);

console.log('Success!', result.sections[0].results.test.data);
```

Run it:
```bash
# With ts-node
npx ts-node test.ts

# Or compile first
npx tsc test.ts
node test.js
```

---

## TypeScript Setup

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Project Structure

Recommended structure:
```
my-project/
├── src/
│   ├── plugins/
│   │   ├── sentiment.ts
│   │   └── topics.ts
│   ├── index.ts
│   └── types.ts
├── .env
├── package.json
└── tsconfig.json
```

---

## Environment Variables

Create `.env` file:
```bash
# AI Providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GEMINI_API_KEY=AIza...

# Optional - Search/Data Providers
TAVILY_API_KEY=tvly-...
WHOISXML_API_KEY=at_...
```

Load with `dotenv`:
```bash
npm install dotenv
```
```typescript
import 'dotenv/config';

const engine = new DagEngine({
  plugin: new MyPlugin(),
  providers: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

---

## Verify Installation

Quick check:
```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';

console.log('✅ dag-ai installed successfully');
console.log('DagEngine:', typeof DagEngine);
console.log('Plugin:', typeof Plugin);
```

Expected output:
```
✅ dag-ai installed successfully
DagEngine: function
Plugin: function
```

---

## Next Steps

- ✅ [Quick Start](/guide/quick-start) - Build your first workflow
- ✅ [Core Concepts](/guide/core-concepts/sections) - Learn the fundamentals
- ✅ [Examples](/examples/) - See working examples

---

## Troubleshooting

### Module not found
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### TypeScript errors
```bash
# Install type definitions
npm install -D @types/node
```

### ESM vs CommonJS

dag-ai works with both:

**CommonJS:**
```typescript
const { DagEngine, Plugin } = require('@ivan629/dag-ai');
```

**ESM:**
```typescript
import { DagEngine, Plugin } from '@ivan629/dag-ai';
```

---

## Support

- 📚 [Documentation](/guide/what-is-dag-ai)
- 💬 [GitHub Discussions](https://github.com/ivan629/dag-ai/discussions)
- 🐛 [Issues](https://github.com/ivan629/dag-ai/issues)