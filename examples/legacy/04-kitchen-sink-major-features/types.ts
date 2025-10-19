/**
 * Local types for the example
 */

export interface SkipStats {
	skipped: number;
	cached: number;
	lowQuality: number;
}

export interface QualityData {
	quality_score?: number;
	is_spam?: boolean;
	reason?: string;
}

export interface SentimentData {
	sentiment?: string;
	score?: number;
	confidence?: number;
}

export interface GroupingResult {
	positive?: number[];
	negative?: number[];
	neutral?: number[];
	summary?: {
		positive_count?: number;
		negative_count?: number;
		neutral_count?: number;
	};
}
