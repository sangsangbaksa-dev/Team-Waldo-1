/** Puzzle choices and solutions derived from the notes players actually read. */
export const circuitOptions = ["5 A", "10 A", "15 A"];
export const tuneOptions = [
  ["71.2", "72.4", "73.6", "74.8"],
  ["80.0", "81.2", "82.4", "83.6"],
  ["90.6", "91.8", "93.0", "94.2"],
];
export const phaseOptions = ["0°", "90°", "180°", "270°"];

export function dialOptions(chapter, index) {
  if (chapter === 0) return circuitOptions;
  if (chapter === 1) return tuneOptions[index] ?? [];
  if (chapter === 3) return phaseOptions;
  return [];
}

function tapeTime(label) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}
export function expectedSequence(chapter, labels) {
  if (!Array.isArray(labels) || labels.length !== 3) return [-1, -1, -1];
  if (chapter === 0) return labels.map(label => circuitOptions.indexOf(label));
  if (chapter === 1) return labels.map((label, i) =>
    tuneOptions[i].findIndex(option => Number(option) === Number.parseFloat(label)));
  if (chapter === 2) return [0, 1, 2].sort((a, b) =>
    tapeTime(labels[b]) - tapeTime(labels[a]) || a - b);
  if (chapter === 3) return labels.map(label => {
    const value = Number.parseInt(label, 10);
    return Number.isFinite(value)
      ? phaseOptions.indexOf(((value + 180) % 360 + 360) % 360 + "°")
      : -1;
  });
  return [-1, -1, -1];
}
