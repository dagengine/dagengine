import {
  MAX_RETRIES,
  MAX_RATE_LIMIT_WAIT,
  RATE_LIMIT_KEYWORDS,
  MAX_DELAY_BETWEEN_RETRIES,
  BASE_DELAY_BETWEEN_RETRIES,
} from './const';

interface ErrorWithStatus {
  status?: number;
  statusCode?: number;
  message?: string;
}

function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  const err = error as ErrorWithStatus;

  // Check HTTP status codes
  if (err.status === 429 || err.statusCode === 429) {
    return true;
  }

  // Check error message for rate limit keywords
  const message = err.message || '';
  return RATE_LIMIT_KEYWORDS.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (retryCount: number, error: Error) => Promise<void> | void;
}

/**
 * Retry function with exponential backoff and rate limit detection
 */
export async function retry<T>(
  fn: (retryCount: number) => Promise<T>,
  options: RetryOptions = {}
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

      // Calculate wait time based on error type
      let waitTime: number;

      if (isRateLimitError(error)) {
        // Aggressive backoff for rate limits (3^n growth)
        waitTime = Math.min(baseDelay * Math.pow(3, retryCount), MAX_RATE_LIMIT_WAIT);
        console.log(
          `Rate limit detected, waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${maxRetries + 1}`
        );
      } else {
        // Standard exponential backoff for other errors (2^n growth)
        waitTime = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        console.log(
          `Retry ${retryCount + 1}/${maxRetries + 1} after error: ${lastError.message}. Waiting ${waitTime / 1000}s`
        );
      }

      // Execute retry callback if provided
      if (onRetry) {
        try {
          await onRetry(retryCount, lastError);
        } catch (callbackError) {
          console.warn('Retry callback failed:', callbackError);
          // Don't fail the retry loop due to callback errors
        }
      }

      // Wait before next retry
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, waitTime));

      retryCount++;
    }
  }

  throw lastError;
}
