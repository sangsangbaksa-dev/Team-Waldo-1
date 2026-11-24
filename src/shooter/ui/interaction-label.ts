import { VEHICLES, WEAPONS } from '../config';
import type { Interaction } from '../application/interaction';

export function interactionLabel(interaction: Interaction | null): string | null {
  if (!interaction) return null;
  switch (interaction.kind) {
    case 'weapon': return WEAPONS[interaction.weapon].name;
    case 'bag-full': return '파츠 가방이 가득 찼습니다';
    case 'vehicle': return `${VEHICLES[interaction.vehicle].name} 탑승`;
  }
}
