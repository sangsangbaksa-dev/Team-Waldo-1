export function isFreshGameKey(event: Pick<KeyboardEvent, "repeat" | "isComposing" | "ctrlKey" | "metaKey" | "altKey">): boolean;
export function canSaveOnInterruption(hasLevel: boolean, state: string): boolean;
export function resolveHubUrl(baseUrl: string): string;
