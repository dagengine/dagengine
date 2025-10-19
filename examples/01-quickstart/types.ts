/**
 * Type definitions for review analysis
 */

import type { DimensionResult } from "../../src/index.js";

// ============================================================================
// Result Types
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
// Dependency Types
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