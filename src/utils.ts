import {
  BASE_DELAY_BETWEEN_RETRIES,
  MAX_DELAY_BETWEEN_RETRIES,
  MAX_RETRIES,
} from "./const.ts";

const RATE_LIMIT_KEYWORDS = ["rate", "limit", "capacity", "quota", "429"];

function isRateLimitError(error: any): boolean {
  if (!error) return false;

  if (error.status === 429 || error.statusCode === 429) {
    return true;
  }

  const message = error.message || "";
  return RATE_LIMIT_KEYWORDS.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase()),
  );
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (retryCount: number, error: Error) => Promise<void> | void;
}

/**
 * Retry logic with exponential backoff
 */
export async function retry<T>(
  fn: (retryCount: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = MAX_RETRIES,
    baseDelay = BASE_DELAY_BETWEEN_RETRIES,
    maxDelay = MAX_DELAY_BETWEEN_RETRIES,
    onRetry,
  } = options;

  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount <= maxRetries) {
    try {
      return await fn(retryCount);
    } catch (error) {
      lastError = error as Error;

      if (retryCount >= maxRetries) {
        throw error;
      }

      // Calculate wait time
      let waitTime: number;
      if (isRateLimitError(error)) {
        // Rate limit backoff - longer waits
        waitTime = Math.min(baseDelay * Math.pow(3, retryCount), 60000);
        console.log(
          `Rate limit hit, waiting ${waitTime / 1000} seconds before retry ${retryCount + 1}/${maxRetries + 1}`,
        );
      } else {
        // Standard exponential backoff
        waitTime = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        console.log(
          `Error, retry ${retryCount + 1}/${maxRetries + 1}: ${(error as Error).message}. Waiting ${waitTime / 1000}s.`,
        );
      }

      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === "function") {
        await onRetry(retryCount, error as Error);
      }

      await new Promise((resolve) => setTimeout(resolve, waitTime));
      retryCount++;
    }
  }

  throw lastError;
}
