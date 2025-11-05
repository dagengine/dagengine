/**
 * Type definitions for review analysis
 */

import type { DimensionResult } from "@dagengine/core";

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface SpamCheckResult {
  is_spam: boolean;
  confidence: number;
  reason: string;
}

export interface SentimentResult {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
}

export interface CategoryResult {
  category: "pricing" | "support" | "features" | "ux" | "performance" | "other";
}

export interface ReviewWithAnalysis {
  sentiment: string;
  category: string;
  content: string;
}

export interface CategoryGroup {
  name: string;
  reviews: string[];
  count: number;
  avg_sentiment: "positive" | "negative" | "neutral";
}

export interface GroupingResult {
  categories: CategoryGroup[];
}

export interface CategoryAnalysis {
  category: string;
  key_insight: string;
  recommendation: string;
  impact: "high" | "medium" | "low";
  top_quote: string;
}

export interface ExecutiveSummary {
  summary: string;
  top_priorities: string[];
  estimated_impact: string;
}

// ============================================================================
// DEPENDENCY TYPES
// ============================================================================

export interface SectionDependencies {
  filter_spam?: DimensionResult<SpamCheckResult>;
}

export interface GlobalGroupingDependencies {
  sentiment?: DimensionResult<{
    sections: Array<DimensionResult<SentimentResult>>;
    aggregated: boolean;
    totalSections: number;
  }>;
  categorize?: DimensionResult<{
    sections: Array<DimensionResult<CategoryResult>>;
    aggregated: boolean;
    totalSections: number;
  }>;
}

export interface GlobalSummaryDependencies {
  analyze_category?: DimensionResult<{
    sections: Array<DimensionResult<CategoryAnalysis>>;
    aggregated: boolean;
    totalSections: number;
  }>;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if data is a valid SpamCheckResult
 */
export function isSpamCheckResult(data: unknown): data is SpamCheckResult {
  return (
    typeof data === "object" &&
    data !== null &&
    "is_spam" in data &&
    typeof (data as SpamCheckResult).is_spam === "boolean" &&
    "confidence" in data &&
    typeof (data as SpamCheckResult).confidence === "number" &&
    "reason" in data &&
    typeof (data as SpamCheckResult).reason === "string"
  );
}

/**
 * Check if data is a valid GroupingResult
 */
export function isGroupingResult(data: unknown): data is GroupingResult {
  if (
    typeof data !== "object" ||
    data === null ||
    !("categories" in data) ||
    !Array.isArray((data as GroupingResult).categories)
  ) {
    return false;
  }

  const categories = (data as GroupingResult).categories;

  // Check that each category has the required structure
  return categories.every(
    (cat) =>
      typeof cat === "object" &&
      cat !== null &&
      "name" in cat &&
      typeof cat.name === "string" &&
      "reviews" in cat &&
      Array.isArray(cat.reviews) &&
      "count" in cat &&
      typeof cat.count === "number" &&
      "avg_sentiment" in cat &&
      typeof cat.avg_sentiment === "string",
  );
}

/**
 * Check if data is a valid CategoryAnalysis
 */
export function isCategoryAnalysis(data: unknown): data is CategoryAnalysis {
  return (
    typeof data === "object" &&
    data !== null &&
    "category" in data &&
    typeof (data as CategoryAnalysis).category === "string" &&
    "key_insight" in data &&
    typeof (data as CategoryAnalysis).key_insight === "string" &&
    "recommendation" in data &&
    typeof (data as CategoryAnalysis).recommendation === "string" &&
    "impact" in data &&
    ["high", "medium", "low"].includes((data as CategoryAnalysis).impact) &&
    "top_quote" in data &&
    typeof (data as CategoryAnalysis).top_quote === "string"
  );
}

/**
 * Check if data is a valid ExecutiveSummary
 */
export function isExecutiveSummary(data: unknown): data is ExecutiveSummary {
  return (
    typeof data === "object" &&
    data !== null &&
    "summary" in data &&
    typeof (data as ExecutiveSummary).summary === "string" &&
    "top_priorities" in data &&
    Array.isArray((data as ExecutiveSummary).top_priorities) &&
    "estimated_impact" in data &&
    typeof (data as ExecutiveSummary).estimated_impact === "string"
  );
}