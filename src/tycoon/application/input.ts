const commands = new Set(['Escape', 'Enter', 'Tab', 'KeyE', 'KeyF', 'KeyH', 'KeyM', 'KeyV', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9']);

export function isRepeatedCommand(code: string, repeat: boolean): boolean {
  return repeat && commands.has(code);
}
