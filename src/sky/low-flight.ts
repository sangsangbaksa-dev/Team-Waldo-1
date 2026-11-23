export const LOW_FLIGHT_RULES = {
  minSpeed: 155,
  minTerrainHeight: 30,
  minClearance: 18,
  maxClearance: 135,
  duration: 1.25,
  cooldown: 5,
  points: 180,
  fuel: 0.12,
} as const;

interface AircraftStatus {
  alive: boolean;
  speed: number;
  fuel: number;
}

export interface LowFlightReward {
  points: number;
  fuel: number;
}

/** Tracks a single sortie's terrain-skimming bonus without depending on rendering. */
export class LowFlightChallenge {
  charge = 0;
  cooldown = 0;
  runs = 0;

  reset(): void {
    this.charge = 0;
    this.cooldown = 0;
    this.runs = 0;
  }

  advance(dt: number, aircraft: AircraftStatus, terrainHeight: number, clearance: number): LowFlightReward | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!aircraft.alive || this.cooldown > 0 || aircraft.speed < LOW_FLIGHT_RULES.minSpeed
      || terrainHeight < LOW_FLIGHT_RULES.minTerrainHeight
      || clearance < LOW_FLIGHT_RULES.minClearance || clearance > LOW_FLIGHT_RULES.maxClearance) {
      this.charge = 0;
      return null;
    }

    this.charge += dt;
    if (this.charge < LOW_FLIGHT_RULES.duration) return null;

    this.charge = 0;
    this.cooldown = LOW_FLIGHT_RULES.cooldown;
    this.runs++;
    return {
      points: LOW_FLIGHT_RULES.points,
      fuel: Math.min(LOW_FLIGHT_RULES.fuel, Math.max(0, 1 - aircraft.fuel)),
    };
  }
}
