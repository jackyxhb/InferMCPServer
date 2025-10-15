export function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) {
    throw createAbortError(message);
  }
}
