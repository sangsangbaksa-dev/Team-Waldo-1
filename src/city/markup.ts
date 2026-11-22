/** Untrusted room nicknames and match-feed entries must be text, never HTML. */
export function escapeCityText(text: string): string {
  return text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] ?? c));
}
export function safeCityColor(color:string):string {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color)?color:'#ffffff';
}
