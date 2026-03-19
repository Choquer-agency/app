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
  // CRM fields
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  mrr: number;
  country: "CA" | "US";
  accountSpecialist: string;
  seoHoursAllocated: number;
  addressLine1: string;
  addressLine2: string;
  city: string;
  provinceState: string;
  postalCode: string;
  clientStatus: "new" | "active" | "offboarding";
  offboardingDate: string | null;
  industry: string;
  tags: string[];
  lastContactDate: string | null;
  nextReviewDate: string | null;
  socialLinkedin: string;
  socialFacebook: string;
  socialInstagram: string;
  socialX: string;
}

// Input for creating/updating a client via admin UI
export interface CreateClientInput {
  name: string;
  notionPageUrl: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  seRankingsProjectId?: string;
  calLink: string;
  active: boolean;
  // CRM fields (all optional for backward compat)
  websiteUrl?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  mrr?: number;
  country?: "CA" | "US";
  accountSpecialist?: string;
  seoHoursAllocated?: number;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  provinceState?: string;
  postalCode?: string;
  clientStatus?: "new" | "active" | "offboarding";
  offboardingDate?: string;
  industry?: string;
  tags?: string[];
  lastContactDate?: string;
  nextReviewDate?: string;
  socialLinkedin?: string;
  socialFacebook?: string;
  socialInstagram?: string;
  socialX?: string;
}

// Package categories
export type PackageCategory = "seo" | "retainer" | "google_ads" | "blog" | "website" | "other";

// Billing frequency
export type BillingFrequency = "one_time" | "weekly" | "bi_weekly" | "monthly" | "quarterly" | "annually";

// Package (service offering)
export interface Package {
  id: number;
  name: string;
  description: string;
  defaultPrice: number;
  category: PackageCategory;
  billingFrequency: BillingFrequency;
  hoursIncluded: number | null;
  includedServices: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePackageInput {
  name: string;
  description?: string;
  defaultPrice: number;
  category?: PackageCategory;
  billingFrequency?: BillingFrequency;
  hoursIncluded?: number | null;
  includedServices?: string[];
  active?: boolean;
}

// Client-package assignment
export interface ClientPackage {
  id: number;
  clientId: number;
  packageId: number;
  customPrice: number | null;
  customHours: number | null;
  signupDate: string;
  contractEndDate: string | null;
  active: boolean;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
  // Joined fields for display
  packageName?: string;
  packageDefaultPrice?: number;
  packageCategory?: PackageCategory;
  packageHoursIncluded?: number | null;
}

// Client note / activity entry
export interface ClientNote {
  id: number;
  clientId: number;
  author: string;
  noteType: "note" | "call" | "email" | "meeting" | "status_change" | "package_change" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// Team member
export interface TeamMember {
  id: number;
  name: string;
  email: string;
  role: string;
  calLink: string;
  profilePicUrl: string;
  color: string;
  startDate: string | null;
  birthday: string | null;
  active: boolean;
  createdAt?: string;
}

// Client approval requests
export interface ApprovalLink {
  url: string;
  label: string;
}

export interface Approval {
  id: number;
  clientSlug: string;
  title: string;
  description: string | null;
  links: ApprovalLink[];
  status: "pending" | "approved" | "rejected" | "dismissed";
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
}

// Quarterly goals (from enrichment pipeline)
export interface QuarterlyGoal {
  id: string;
  goal: string;
  icon: string;
  targetMetric: string;
  progress: number; // 0-100
  quarter: string;
  targetMetricType?: string;
  targetValue?: number;
  currentValue?: number;
  verified?: boolean; // true if progress is backed by live analytics data
}

// Work log entry (from enrichment pipeline)
export interface WorkLogEntry {
  id: string;
  task: string;
  category: string[];
  subtasks: string | Array<{ text: string; completed: boolean; link?: string; linkLabel?: string }>;
  deliverableLinks: string[];
  monthlySummary: string;
  month: string; // ISO date string
  isPlan: boolean;
  impact?: string;
  completed?: boolean;
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
    | "timerange_toggle"
    | "approval_action";
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
