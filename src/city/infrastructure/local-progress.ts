import { DIFFICULTY, type Difficulty } from '../defs';
import { TUT_KEY } from '../tutorial';
import { CITY_KEY, readCityCareer } from '../../records';

const DIFFICULTY_KEY = 'waldo-city-diff';

export function readDifficulty(): Difficulty {
  try {
    const value = localStorage.getItem(DIFFICULTY_KEY);
    if (value && value in DIFFICULTY) return value as Difficulty;
  } catch { /* Storage is optional. */ }
  return 'd4';
}

export function saveDifficulty(value: Difficulty): void {
  try { localStorage.setItem(DIFFICULTY_KEY, value); } catch { /* Storage is optional. */ }
}

export function readTutorialDone(): boolean {
  try { return localStorage.getItem(TUT_KEY) === '1'; } catch { return false; }
}

export function saveTutorialDone(): void {
  try { localStorage.setItem(TUT_KEY, '1'); } catch { /* Storage is optional. */ }
}

export function saveCityResult(win: boolean, place: number): void {
  try {
    const career = readCityCareer();
    localStorage.setItem(CITY_KEY, JSON.stringify({
      matches: career.matches + 1, wins: career.wins + Number(win),
      best: career.best ? Math.min(career.best, place) : place,
    }));
  } catch { /* Storage is optional. */ }
}
