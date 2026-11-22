export function describeStartupError(error: unknown): {
  title: string; description: string; retryable: boolean;
};
