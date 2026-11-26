import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Project Harbor download page', () => {
  const html = readFileSync(new URL('../../project-harbor/index.html', import.meta.url), 'utf8');

  it('offers Windows and Linux downloads and does not load the browser game', () => {
    expect(html).toContain('Windows 다운로드');
    expect(html).toContain('Linux 다운로드');
    expect(html).toContain('project-harbor-windows-x86_64.zip');
    expect(html).toContain('project-harbor-linux-x86_64.tar.gz');
    expect(html).not.toMatch(/브라우저에서 바로 플레이|차량 자유주행/);
    expect(html).not.toMatch(/<button[\s>]/);
    expect(html).not.toMatch(/world\/ui\.ts|vehicles\/ui\.js|harbor-world-stage|harbor-drive/);
  });
});
