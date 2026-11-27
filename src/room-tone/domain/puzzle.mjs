const answers = [[0, 1, 2], [1, 3, 1], [1, 2, 0], [2, 1, 0]];
const circuit = ["5 A", "10 A", "15 A"];
const tune = [["71.2", "72.4", "73.6", "74.8"], ["80.0", "81.2", "82.4", "83.6"], ["90.6", "91.8", "93.0", "94.2"]];
const phase = ["0°", "90°", "180°", "270°"];
export function initialChoices(chapter) { return chapter === 2 ? [] : [0, 0, 0]; }
export function dialOptions(chapter, index) {
  return (chapter === 0 ? circuit : chapter === 1 ? tune[index] : phase).slice();
}
export function validSolution(chapter, choices) {
  const expected = answers[chapter];
  return Boolean(expected && Array.isArray(choices) && choices.length === expected.length && expected.every((value, index) => choices[index] === value));
}
