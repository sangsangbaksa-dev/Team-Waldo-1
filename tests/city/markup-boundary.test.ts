import {describe,it,expect} from 'vitest';
import {escapeCityText,safeCityColor} from '../../src/city/markup';
import {escapeRaceText} from '../../src/race/frame-plan';
describe('Game HUD content boundaries',()=>{
  it('escapes arbitrary opponent nicknames in city ranks, HUD and damage reports',()=>{
    const name='</b><img src=x onerror=alert(1)> & "rival"';
    const html=escapeCityText(name);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('</b>');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });
  it('prevents match feed text from injecting attributes or elements',()=>{
    const text='Target <a href="javascript:alert(1)">owned</a>';
    expect(escapeCityText(text)).not.toContain('<a');
    expect(escapeCityText(text)).not.toContain('href="');
    expect(safeCityColor('#ff5d5d')).toBe('#ff5d5d');
    expect(safeCityColor('red; background:url(x)')).toBe('#ffffff');
  });
  it('keeps race result opponent names as plain text',()=>{
    const nickname='<svg onload=alert(1)>';
    expect(escapeRaceText(nickname)).toBe('&lt;svg onload=alert(1)&gt;');
  });
});
