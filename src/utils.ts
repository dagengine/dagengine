import { jsonrepair } from 'jsonrepair';

import {
  BASE_DELAY_BETWEEN_RETRIES,
  MAX_DELAY_BETWEEN_RETRIES,
  MAX_RETRIES,
} from "./const";

const RATE_LIMIT_KEYWORDS = ["rate", "limit", "capacity", "quota", "429"];

interface ErrorWithStatus {
  status?: number;
  statusCode?: number;
  message?: string;
}

function isRateLimitError(error: unknown): boolean {
  if (!error) return false;

  const err = error as ErrorWithStatus;

  if (err.status === 429 || err.statusCode === 429) {
    return true;
  }

  const message = err.message || "";
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
        globalThis.console.log(
          `Rate limit hit, waiting ${waitTime / 1000} seconds before retry ${retryCount + 1}/${maxRetries + 1}`,
        );
      } else {
        // Standard exponential backoff
        waitTime = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
        globalThis.console.log(
          `Error, retry ${retryCount + 1}/${maxRetries + 1}: ${(error as Error).message}. Waiting ${waitTime / 1000}s.`,
        );
      }

      // Call onRetry callback if provided
      if (onRetry && typeof onRetry === "function") {
        await onRetry(retryCount, error as Error);
      }

      await new Promise<void>((resolve) =>
        globalThis.setTimeout(resolve, waitTime),
      );
      retryCount++;
    }
  }

  throw lastError;
}

export function parseAIJSON(rawContent: string): any {
  // Basic cleaning
  let cleaned = rawContent.trim()
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '');

  // Extract JSON boundaries
  const start = Math.min(
      cleaned.indexOf('{') !== -1 ? cleaned.indexOf('{') : Infinity,
      cleaned.indexOf('[') !== -1 ? cleaned.indexOf('[') : Infinity
  );

  if (start !== Infinity) {
    cleaned = cleaned.substring(start);
    const end = Math.max(
        cleaned.lastIndexOf('}'),
        cleaned.lastIndexOf(']')
    );
    if (end !== -1) {
      cleaned = cleaned.substring(0, end + 1);
    }
  }

  // Try standard parse first (fastest)
  try {
    const repaired = jsonrepair(rawContent);
    return JSON.parse(repaired);
  } catch {
    // Repair and parse
    const repaired = jsonrepair(rawContent);
    return JSON.parse(repaired);
  }
}