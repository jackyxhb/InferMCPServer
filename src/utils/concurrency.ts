import { createAbortError } from "./abort.js";

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ProfileState {
  active: number;
  limit: number;
  queue: PendingRequest[];
}

export class ConcurrencyLimiter {
  private readonly states = new Map<string, ProfileState>();

  async acquire(key: string, limit: number, signal?: AbortSignal): Promise<() => void> {
    const normalizedLimit = Math.max(1, limit);
    let state = this.states.get(key);
    if (!state) {
      state = { active: 0, limit: normalizedLimit, queue: [] };
      this.states.set(key, state);
    } else {
      state.limit = normalizedLimit;
    }

    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      this.release(key);
    };

    if (state.active < state.limit) {
      state.active += 1;
      return release;
    }

    return new Promise((resolve, reject) => {
      const abortError = createAbortError("Operation cancelled before starting");
      let abortListener: (() => void) | undefined;

      const pending: PendingRequest = {
        resolve: () => {
          if (abortListener && signal) {
            signal.removeEventListener("abort", abortListener);
          }
          state!.active += 1;
          resolve(release);
        },
        reject: (error: Error) => {
          if (abortListener && signal) {
            signal.removeEventListener("abort", abortListener);
          }
          reject(error);
        }
      };

      state!.queue.push(pending);

      if (signal) {
        abortListener = () => {
          const index = state!.queue.indexOf(pending);
          if (index >= 0) {
            state!.queue.splice(index, 1);
          }
          pending.reject(abortError);
        };

        if (signal.aborted) {
          abortListener();
          return;
        }

        signal.addEventListener("abort", abortListener, { once: true });
      }
    });
  }

  private release(key: string): void {
    const state = this.states.get(key);
    if (!state) {
      return;
    }

    if (state.active > 0) {
      state.active -= 1;
    }

    const next = state.queue.shift();
    if (next) {
      next.resolve();
      return;
    }

    if (state.active === 0) {
      this.states.delete(key);
    }
  }
}
