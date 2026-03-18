// Client configuration (stored in Postgres)
export interface ClientConfig {
  id: number;
  name: string;
  slug: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  seRankingsProjectId: string;
  calLink: string;
  notionPageUrl: string;
  notionPageId: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Input for creating/updating a client via admin UI
export interface CreateClientInput {
  name: string;
  notionPageUrl: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  calLink: string;
  active: boolean;
}

// Quarterly goals from Notion
export interface QuarterlyGoal {
  id: string;
  goal: string;
  icon: string;
  targetMetric: string;
  progress: number; // 0-100
  quarter: string;
}

// Work log entry from Notion
export interface WorkLogEntry {
  id: string;
  task: string;
  category: string[];
  subtasks: string;
  deliverableLinks: string[];
  monthlySummary: string;
  month: string; // ISO date string
  isPlan: boolean;
}

// KPI card data
export interface KPIData {
  label: string;
  value: number;
  previousValue: number;
  changePercent: number;
  format: "number" | "decimal" | "percent";
}

// Time series data point
export interface TimeSeriesPoint {
  date: string;
  clicks?: number;
  impressions?: number;
  sessions?: number;
  organicSessions?: number;
  users?: number;
}

// Top page data
export interface TopPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// Keyword ranking
export interface KeywordRanking {
  id: string;
  keyword: string;
  currentPosition: number;
  previousPosition: number;
  change: number;
  searchVolume: number;
  positionHistory?: number[];
}

// GSC performance summary
export interface GSCPerformance {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

// GA4 session summary
export interface GA4Sessions {
  totalSessions: number;
  organicSessions: number;
  users: number;
  newUsers: number;
}

// Activity tracking event
export interface TrackingEvent {
  clientSlug: string;
  eventType:
    | "page_view"
    | "section_view"
    | "accordion_open"
    | "chart_interact"
    | "link_click"
    | "copy_event"
    | "time_on_page"
    | "cta_click"
    | "keyword_sort"
    | "timerange_toggle";
  eventDetail?: Record<string, unknown>;
  sessionId: string;
  deviceType: "mobile" | "desktop" | "tablet";
  referrer?: string;
  visitorId?: number;
  deviceId?: string;
}

// Visitor identification
export interface Visitor {
  id: number;
  clientSlug: string;
  visitorName: string;
  createdAt: string;
}

export interface VisitorDevice {
  id: number;
  visitorId: number;
  deviceId: string;
  deviceType: string;
  userAgent: string;
  firstSeen: string;
  lastSeen: string;
}

export interface VisitorIdentification {
  visitorId: number;
  visitorName: string;
  deviceId: string;
}

// Monthly snapshot for historical data
export interface MonthlySnapshot {
  clientSlug: string;
  month: string; // ISO date string (first of month)
  gscData: {
    performance: GSCPerformance;
    timeSeries: TimeSeriesPoint[];
    topPages: TopPage[];
  };
  ga4Data: {
    sessions: GA4Sessions;
    timeSeries: TimeSeriesPoint[];
  };
  keywordData: KeywordRanking[];
  kpiSummary: KPIData[];
}

// Date range options — matches Search Console defaults
export type DateRange = "7d" | "28d" | "3m" | "6m" | "12m";

// Admin activity summary
export interface ClientEngagement {
  clientSlug: string;
  clientName: string;
  lastVisit: string | null;
  visitCount7d: number;
  visitCount30d: number;
  avgTimeOnPage: number; // seconds
  ctaClicks: number;
  isChurnRisk: boolean;
}
