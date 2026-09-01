import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

async function lintRuleIds(code: string, filePath: string) {
  const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js' });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map(({ ruleId }) => ruleId);
}

describe('ESLint React protections', () => {
  it('reports conditional hook calls', async () => {
    const ruleIds = await lintRuleIds(`
      import { useEffect } from 'react';
      export function BrokenHook({ ready }: { ready: boolean }) {
        if (ready) useEffect(() => undefined, []);
        return null;
      }
    `, 'src/__lint-fixtures__/BrokenHook.tsx');

    expect(ruleIds).toContain('react-hooks/rules-of-hooks');
  });

  it('reports non-component exports that break Fast Refresh boundaries', async () => {
    const ruleIds = await lintRuleIds(`
      export function Widget() { return <div />; }
      export function helper() { return 1; }
    `, 'src/__lint-fixtures__/Widget.tsx');

    expect(ruleIds).toContain('react-refresh/only-export-components');
  });
});
