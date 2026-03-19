// Types for the AI enrichment pipeline

export interface SubtaskItem {
  text: string;
  completed: boolean;
  link?: string;
  linkLabel?: string;
}

export interface EnrichedTask {
  task: string;
  category: string[];
  subtasks: string | SubtaskItem[];
  deliverableLinks: string[];
  impact?: string;
  completed?: boolean;
}

export interface EnrichedGoal {
  goal: string;
  icon: string;
  targetMetric: string;
  progress: number;
  deadline: string;
  targetMetricType?: string;
  targetValue?: number;
}

export interface EnrichedMonth {
  monthLabel: string;
  summary: string;
  tasks: EnrichedTask[];
  leads?: number;
  metrics?: {
    sessions?: number;
    impressions?: number;
    notableWins?: string[];
  };
}

export interface DetectedMetric {
  claim: string;          // e.g. "10% traffic increase on /blog"
  metricType: string;     // "traffic" | "ranking" | "clicks" | "impressions" | "conversion"
  pageUrl?: string;       // if specific page mentioned
  keyword?: string;       // if specific keyword mentioned
  value?: string;         // "10%"
  direction?: string;     // "increase" | "decrease"
}

export interface AnalyticsEnrichment {
  entityType: "page" | "keyword" | "metric";
  entity: string;         // the URL, keyword, or metric claim
  data: {
    clicks?: number;
    impressions?: number;
    sessions?: number;
    position?: number;
    change?: number;
    changePercent?: number;
    timeSeries?: Array<{ date: string; value: number }>;
  };
}

export interface EnrichedContent {
  currentMonth: {
    label: string;
    summary: string;
    strategy: string;
    tasks: EnrichedTask[];
    isComplete: boolean;
    leads?: number;
    taskCompletion?: { completed: number; total: number };
  };
  goals: EnrichedGoal[];
  pastMonths: EnrichedMonth[];
  upcomingMonths: EnrichedMonth[];
  detectedEntities: {
    pages: string[];
    keywords: string[];
    metrics: DetectedMetric[];
  };
  approvals: Array<{ title: string; description: string; links: Array<{ url: string; label: string }> }>;
  analyticsEnrichments: AnalyticsEnrichment[];
  processedAt: string;
  rawContentHash: string;
}

// What Claude returns (before analytics enrichment)
export interface ClaudeStructuredOutput {
  currentMonth: {
    label: string;
    summary: string;
    strategy: string;
    tasks: EnrichedTask[];
    isComplete: boolean;
    leads?: number;
  };
  goals: EnrichedGoal[];
  pastMonths: EnrichedMonth[];
  upcomingMonths: EnrichedMonth[];
  detectedEntities: {
    pages: string[];
    keywords: string[];
    metrics: DetectedMetric[];
  };
  approvals: Array<{ title: string; description: string; links: Array<{ url: string; label: string }> }>;
}
