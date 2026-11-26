import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Project Harbor download page', () => {
  const html = readFileSync(new URL('../../project-harbor/index.html', import.meta.url), 'utf8');

  it('offers Windows and Linux downloads and does not load the browser game', () => {
    expect(html).toContain('Windows 다운로드');
    expect(html).toContain('Linux 다운로드');
    expect(html).toContain('ProjectHarbor-0.3.1-windows-x64.zip');
    expect(html).toContain('ProjectHarbor-0.3.1-windows-x64.exe');
    expect(html).toContain('ProjectHarbor-0.3.1-linux-x64.tar.gz');
    expect(html).toContain('ProjectHarbor-0.3.1-linux-x86_64.AppImage');
    expect(html).not.toContain('v0.2.0');
    expect(html).not.toMatch(/브라우저에서 바로 플레이|차량 자유주행/);
    expect(html).not.toMatch(/<button[\s>]/);
    expect(html).not.toMatch(/world\/ui\.ts|vehicles\/ui\.js|harbor-world-stage|harbor-drive/);
  });

  it('keeps the playable world in the desktop shell', () => {
    const shell = readFileSync(new URL('../../project-harbor/desktop/shell.html', import.meta.url), 'utf8');
    expect(shell).toContain('data-harbor="desktop"');
    expect(shell).toContain('id="harbor-world-stage"');
    expect(shell).toContain('../world/ui.ts');
    expect(shell).toContain('포트 캘러웨이를 불러오는 중');
    expect(shell).not.toMatch(/차량 자유주행/);
  });
});
