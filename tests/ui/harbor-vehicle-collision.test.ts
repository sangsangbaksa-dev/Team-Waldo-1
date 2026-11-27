import { describe, expect, it } from 'vitest';
import { makeVehicle } from '../../project-harbor/vehicles/domain.js';
import { resolveVehicleWall, vehicleBlocked } from '../../project-harbor/world/vehicle-collision';
describe('Harbor vehicle wall resolution', () => {
  it('detects a front corner before the center enters a wall', () => {
    expect(vehicleBlocked({ x: 10, z: 10, yaw: 0 }, 4.6, 1.85, (_, z) => z > 11.5)).toBe(true);
  });
  it('reverts a blocked move and reduces speed without teleporting forward', () => {
    const car = makeVehicle(1, 'sedan', 10, 11, 0);
    car.vz = 10;
    expect(resolveVehicleWall(car, { x: 10, z: 9, yaw: 0 }, (_, z) => z > 11.5)).toBe(true);
    expect(car.z).toBe(9); expect(car.health).toBeLessThan(100); expect(Math.abs(car.vz)).toBeLessThan(10);
  });
  it('keeps an unblocked movement intact', () => {
    const car = makeVehicle(1, 'bike', 10, 11, 0);
    expect(resolveVehicleWall(car, { x: 10, z: 9, yaw: 0 }, () => false)).toBe(false);
    expect(car.z).toBe(11); expect(car.health).toBe(100);
  });
});
