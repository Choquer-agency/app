// Client configuration
export interface ClientConfig {
  id: string;
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
  clientStatus: "new" | "active" | "offboarding" | "inactive";
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
  clientStatus?: "new" | "active" | "offboarding" | "inactive";
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
export type PackageCategory = "seo" | "retainer" | "google_ads" | "social_media_ads" | "blog" | "website" | "other";

// Billing frequency
export type BillingFrequency = "one_time" | "weekly" | "bi_weekly" | "monthly" | "quarterly" | "annually";

// Package (service offering)
export interface Package {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  category: PackageCategory;
  billingFrequency: BillingFrequency;
  hoursIncluded: number | null;
  includedServices: string[];
  setupFee: number;
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
  setupFee?: number;
  active?: boolean;
}

// Client-package assignment
export interface ClientPackage {
  id: string;
  clientId: string;
  packageId: string;
  customPrice: number | null;
  customHours: number | null;
  applySetupFee: boolean;
  customSetupFee: number | null;
  signupDate: string;
  contractEndDate: string | null;
  active: boolean;
  notes: string;
  isOneTime?: boolean;
  paidDate?: string | null;
  canceledAt?: string | null;
  effectiveEndDate?: string | null;
  cancellationFee?: number | null;
  canceledBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  // Joined fields for display
  packageName?: string;
  packageDefaultPrice?: number;
  packageCategory?: PackageCategory;
  packageHoursIncluded?: number | null;
  packageSetupFee?: number;
  packageBillingFrequency?: BillingFrequency;
}

// Client note / activity entry
export interface ClientNote {
  id: string;
  clientId: string;
  author: string;
  noteType: "note" | "call" | "email" | "meeting" | "status_change" | "package_change" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// Team member
export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  calLink: string;
  profilePicUrl: string;
  color: string;
  startDate: string | null;
  birthday: string | null;
  active: boolean;
  employeeStatus?: string; // "active" | "maternity_leave" | "leave" | "terminated" | "past_employee"
  roleLevel: import("@/lib/permissions").RoleLevel;
  lastLogin: string | null;
  slackUserId: string;
  availableHoursPerWeek: number;
  hourlyRate: number | null;
  salary: number | null;
  payType: "hourly" | "salary";
  sickDaysTotal?: number;
  vacationDaysTotal?: number;
  vacationDaysUsed?: number;
  tags: string[];
  bypassClockIn?: boolean;
  createdAt?: string;
}

// === Task Management Types ===

export type TicketStatus =
  | "needs_attention"
  | "stuck"
  | "in_progress"
  | "qa_ready"
  | "client_review"
  | "approved_go_live"
  | "closed";

export type TicketStage = "not_done" | "in_review" | "done";

/** Statuses where the employee's work is not yet done — only these can be "overdue" */
const NOT_DONE_STATUSES: Set<string> = new Set(["needs_attention", "stuck", "in_progress"]);

/** Whether a ticket in this status can be considered overdue */
export function isOverdueEligible(status: string): boolean {
  return NOT_DONE_STATUSES.has(status);
}

export type TicketPriority = "low" | "normal" | "high" | "urgent";

export interface Ticket {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  descriptionFormat: "plain" | "tiptap";
  clientId: string | null;
  projectId: string | null;
  parentTicketId: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  ticketGroup: string;
  groupId: string | null;
  templateRoleId: string | null;
  startDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  sortOrder: number;
  createdById: string | null;
  archived: boolean;
  isPersonal: boolean;
  isMeeting: boolean;
  isEmail: boolean;
  assignAllRoles: boolean;
  dayOffsetStart: number | null;
  dayOffsetDue: number | null;
  serviceCategory: ServiceBoardCategory | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields (populated on detail queries)
  clientName?: string;
  createdByName?: string;
  projectName?: string;
  assignees?: TicketAssignee[];
  subTicketCount?: number;
  commentCount?: number;
  groupName?: string;
  templateRoleName?: string;
}

export interface TicketAssignee {
  id: string;
  ticketId: string;
  teamMemberId: string;
  assignedAt: string;
  // Joined from team_members
  memberName?: string;
  memberEmail?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
}

export interface CreateTicketInput {
  title: string;
  description?: string;
  descriptionFormat?: "plain" | "tiptap";
  clientId?: string | null;
  projectId?: string | null;
  parentTicketId?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
  ticketGroup?: string;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  sortOrder?: number;
  assigneeIds?: string[];
  isPersonal?: boolean;
  isMeeting?: boolean;
  isEmail?: boolean;
  assignAllRoles?: boolean;
  dayOffsetStart?: number | null;
  dayOffsetDue?: number | null;
  groupId?: string | null;
  templateRoleId?: string | null;
  serviceCategory?: ServiceBoardCategory | null;
}

export interface TicketFilters {
  clientId?: string;
  projectId?: string;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assigneeId?: string;
  createdById?: string;
  parentTicketId?: string | null;
  archived?: boolean;
  isPersonal?: boolean;
  startDateActive?: boolean; // true = only show tickets where start_date <= today or start_date is null
  serviceCategory?: ServiceBoardCategory | null; // filter by service category; null = exclude service tickets
  search?: string;
  groupBy?: "status" | "priority" | "assignee" | "client" | "group";
  limit?: number;
  offset?: number;
}

export interface SavedView {
  id: string;
  teamMemberId: string;
  name: string;
  filters: TicketFilters;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSavedViewInput {
  name: string;
  filters: TicketFilters;
  isDefault?: boolean;
}

// Ticket activity log entry
export interface TicketActivity {
  id: string;
  ticketId: string;
  actorId: string | null;
  actorName: string;
  actionType: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// === Comment Types ===

export interface TicketComment {
  id: string;
  ticketId: string;
  authorType: "team" | "client";
  authorId: string | null;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// === Attachment Types ===

export interface TicketAttachment {
  id: string;
  ticketId: string;
  uploadedById: string | null;
  uploadedByName: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

// === Time Tracking Types ===

export interface TimeEntry {
  id: string;
  ticketId: string;
  teamMemberId: string;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  isManual: boolean;
  note: string;
  createdAt: string;
  // Joined fields
  memberName?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
  ticketNumber?: string;
  ticketTitle?: string;
  clientId?: string | null;
  clientName?: string | null;
}

export interface RunningTimer {
  entryId: string;
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  startTime: string;
  clientName: string | null;
  serviceCategory: string | null;
  clientId: string | null;
}

export interface ClientHoursSummary {
  clientId: string;
  clientName: string;
  month: string;
  loggedHours: number;
  includedHours: number; // total available = monthlyRetainerHours + oneTimeBalanceHours
  percentUsed: number;
  status: "ok" | "warning" | "exceeded";
  byTicket: Array<{
    ticketId: string;
    ticketNumber: string;
    ticketTitle: string;
    hours: number;
  }>;
  // Package pool breakdown
  monthlyRetainerHours: number; // from recurring packages only (resets each month)
  oneTimeBalanceHours: number; // remaining one-time top-up hours (before this month's usage)
  oneTimeUsedThisMonth: number; // one-time hours consumed this month
  monthlyUnused: number; // unused monthly retainer hours (for profitability)
}

export interface TeamTimeReportEntry {
  teamMemberId: string;
  memberName: string;
  memberColor: string;
  totalSeconds: number;
  byClient: Array<{
    clientId: string | null;
    clientName: string | null;
    seconds: number;
  }>;
}

// === Notification Types ===

export type NotificationType =
  | "assigned"
  | "status_change"
  | "comment"
  | "mention"
  | "due_soon"
  | "overdue"
  | "hour_cap_warning"
  | "hour_cap_exceeded"
  | "runaway_timer"
  | "ticket_created"
  | "due_date_changed"
  | "ticket_closed"
  | "vacation_requested"
  | "vacation_resolved"
  | "time_adjustment_requested"
  | "time_adjustment_resolved"
  | "team_announcement"
  | "package_changed";

export interface Notification {
  id: string;
  recipientId: string;
  ticketId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

// === Project Types ===

export type ProjectStatus = "active" | "completed" | "on_hold";

export interface Project {
  id: string;
  name: string;
  description: string;
  clientId: string | null;
  isTemplate: boolean;
  status: ProjectStatus;
  archived: boolean;
  startDate: string | null;
  dueDate: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  clientName?: string;
  ticketCount?: number;
  completedTicketCount?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  clientId?: string | null;
  isTemplate?: boolean;
  status?: ProjectStatus;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface ProjectGroup {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ProjectTemplateRole {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface DateCascadePreview {
  ticketId: string;
  ticketNumber: string;
  ticketTitle: string;
  field: "startDate" | "dueDate";
  oldDate: string;
  newDate: string;
  weekendAdjusted: boolean;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  teamMemberId: string;
  addedAt: string;
  // Joined fields
  memberName?: string;
  memberEmail?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
}

export type CommitmentStatus = "active" | "met" | "missed";

export interface TicketCommitment {
  id: string;
  ticketId: string;
  teamMemberId: string;
  committedDate: string;
  committedAt: string;
  committedById: string | null;
  status: CommitmentStatus;
  resolvedAt: string | null;
  notes: string;
  // Joined
  memberName?: string;
  committedByName?: string;
}

export interface ReliabilityScore {
  teamMemberId: string;
  memberName: string;
  totalCommitments: number;
  commitmentsMet: number;
  commitmentsMissed: number;
  score: number; // 0-100
}

export interface TicketDependency {
  id: string;
  ticketId: string;
  dependsOnTicketId: string;
  // Joined fields
  dependsOnTicketNumber?: string;
  dependsOnTicketTitle?: string;
  dependsOnTicketStatus?: TicketStatus;
}

// Client approval requests
export interface ApprovalLink {
  url: string;
  label: string;
}

export interface Approval {
  id: string;
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
  visitorId?: string;
  deviceId?: string;
}

// Visitor identification
export interface Visitor {
  id: string;
  clientSlug: string;
  visitorName: string;
  createdAt: string;
}

export interface VisitorDevice {
  id: string;
  visitorId: string;
  deviceId: string;
  deviceType: string;
  userAgent: string;
  firstSeen: string;
  lastSeen: string;
}

export interface VisitorIdentification {
  visitorId: string;
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

// === Recurring Ticket Template Types ===

export type RecurrenceRule = "weekly" | "biweekly" | "monthly" | "quarterly";

export interface RecurringTicketTemplate {
  id: string;
  title: string;
  description: string;
  descriptionFormat: "plain" | "tiptap";
  clientId: string;
  projectId: string | null;
  priority: TicketPriority;
  ticketGroup: string;
  recurrenceRule: RecurrenceRule;
  recurrenceDay: number;
  nextCreateAt: string;
  active: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  clientName?: string;
  projectName?: string;
  createdByName?: string;
  assignees?: RecurringTemplateAssignee[];
}

export interface RecurringTemplateAssignee {
  id: string;
  templateId: string;
  teamMemberId: string;
  memberName?: string;
  memberEmail?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
}

// === Bulletin Types ===

export type AnnouncementType = "general" | "birthday" | "anniversary" | "time_off";

export interface Announcement {
  id: string;
  authorId: string;
  authorName: string;
  authorPic: string;
  title: string;
  content: string;
  pinned: boolean;
  source: string;
  announcementType: AnnouncementType;
  imageUrl: string;
  createdAt: string;
  reactions: Array<{ emoji: string; memberName: string; memberId: string }>;
}

export interface WeeklyQuote {
  id: string;
  quote: string;
  author: string;
  weekStart: string;
  selected: boolean;
}

export interface BulletinBirthday {
  name: string;
  profilePicUrl: string;
  daysUntil: number;
  display: string;
}

export interface BulletinAnniversary {
  name: string;
  profilePicUrl: string;
  daysUntil: number;
  years: number;
  display: string;
}

export interface BulletinProject {
  id: string;
  clientName: string;
  projectName: string;
  status: ProjectStatus;
  ticketCount: number;
  completedTicketCount: number;
}

export interface CalendarEntry {
  date: string;
  title: string;
  type: string;
}

export interface BulletinData {
  personalNote: string;
  weeklyQuote: { quote: string; author: string } | null;
  announcements: Announcement[];
  projects: BulletinProject[];
  calendar: CalendarEntry[];
  changelog: ChangelogEntry[];
}

export type ChangelogCategory = "feature" | "improvement" | "fix" | "design" | "moved";

export type ChangelogVisibility = "team" | "internal";

export interface ChangelogEntry {
  id: string;
  title: string;
  description: string;
  category: ChangelogCategory;
  icon?: string;
  imageUrl?: string;
  authorName?: string;
  visibility?: ChangelogVisibility;
  createdAt: string;
}

// === API Connections Types ===

export type ConnectionPlatform =
  | "google_ads" | "meta_ads" | "gmb" | "gsc" | "instagram"
  | "linkedin_ads" | "linkedin_pages" | "google_merchant" | "pagespeed"
  | "youtube" | "google_oauth"
  | "airtable" | "intercom" | "mailerlite" | "mailersend" | "notion" | "slack" | "stripe"
  | "ipinfo";

export type ConnectionScope = "org" | "client";
export type ConnectionAuthType = "api_key" | "oauth2" | "service_account";
export type ConnectionStatus = "active" | "expired" | "error" | "disconnected";

export interface ApiConnection {
  id: string;
  platform: ConnectionPlatform;
  scope: ConnectionScope;
  clientId?: string;
  authType: ConnectionAuthType;
  oauthAccountId?: string;
  oauthAccountName?: string;
  oauthExpiresAt?: string;
  status: ConnectionStatus;
  lastVerifiedAt?: string;
  lastError?: string;
  displayName?: string;
  addedById?: string;
  createdAt: string;
}

export interface PlatformConfig {
  platform: ConnectionPlatform;
  name: string;
  description: string;
  scope: ConnectionScope;
  authType: ConnectionAuthType;
  docsUrl: string;
  icon: string;
  color: string;
}

// === Service Board Types ===

export type ServiceBoardStatus = "needs_attention" | "in_progress" | "report_ready" | "email_sent";

export type ServiceBoardCategory = "seo" | "google_ads" | "retainer";

export interface ServiceBoardEntry {
  id: string;
  clientId: string;
  clientPackageId: string;
  category: ServiceBoardCategory;
  month: string; // ISO date for first of month
  status: ServiceBoardStatus;
  specialistId: string | null;
  monthlyEmailSentAt: string | null;
  quarterlyEmailSentAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Joined fields
  clientName?: string;
  clientSlug?: string;
  clientNotionPageUrl?: string;
  packageName?: string;
  includedHours?: number;
  specialistName?: string;
  specialistColor?: string;
  specialistProfilePicUrl?: string;
  generatedEmail?: string;
  commentCount?: number;
  // Computed
  loggedHours?: number;
  percentUsed?: number;
  hourStatus?: "ok" | "warning" | "exceeded";
}

export interface ServiceHoursSummary {
  clientId: string;
  category: ServiceBoardCategory;
  month: string;
  loggedHours: number;
  includedHours: number;
  percentUsed: number;
  status: "ok" | "warning" | "exceeded";
  byTicket: Array<{
    ticketId: string;
    ticketNumber: string;
    ticketTitle: string;
    hours: number;
  }>;
}

export interface CreateRecurringTemplateInput {
  title: string;
  description?: string;
  descriptionFormat?: "plain" | "tiptap";
  clientId: string;
  projectId?: string | null;
  priority?: TicketPriority;
  ticketGroup?: string;
  recurrenceRule: RecurrenceRule;
  recurrenceDay: number;
  nextCreateAt: string;
  active?: boolean;
  assigneeIds?: string[];
}

// === Timesheet Types (Payroll clock in/out) ===

export type TimesheetIssueType =
  | "MISSING_CLOCK_OUT"
  | "LONG_SHIFT_NO_BREAK"
  | "OPEN_BREAK"
  | "OVERTIME_WARNING";

export interface TimesheetEntry {
  id: string;
  teamMemberId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string | null;
  totalBreakMinutes: number;
  workedMinutes: number | null;
  isSickDay: boolean;
  isHalfSickDay: boolean;
  isVacation: boolean;
  note: string;
  issues: TimesheetIssueType[];
  pendingApproval?: boolean;
  sickHoursUsed?: number;
  changeRequest?: {
    clockIn?: string | null;
    clockOut?: string | null;
    breaks?: TimesheetBreak[];
    adminNotes?: string;
    isSickDay?: boolean;
    isVacationDay?: boolean;
    pendingApproval?: boolean;
  } | null;
  createdAt: string;
  // Joined fields
  memberName?: string;
  memberColor?: string;
  memberProfilePicUrl?: string;
  breaks?: TimesheetBreak[];
}

export interface TimesheetBreak {
  id: string;
  timesheetEntryId: string;
  startTime: string;
  endTime: string | null;
  breakType: string;
  durationMinutes: number | null;
}

export type VacationRequestStatus = "pending" | "approved" | "denied";

export interface VacationRequest {
  id: string;
  teamMemberId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: VacationRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  // Joined fields
  memberName?: string;
  reviewedByName?: string;
}

export interface TimesheetChangeRequest {
  id: string;
  timesheetEntryId: string;
  teamMemberId: string;
  originalClockIn: string;
  originalClockOut: string | null;
  proposedClockIn: string;
  proposedClockOut: string | null;
  reason: string;
  status: VacationRequestStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  minutesDelta: number | null;
  createdAt: string;
  // Joined fields
  memberName?: string;
}

export interface PayrollReportEntry {
  teamMemberId: string;
  memberName: string;
  payType: "hourly" | "salary";
  hourlyRate: number | null;
  totalWorkedMinutes: number;
  totalWorkedDecimalHours: number;
  sickDays: number;
  halfSickDays: number;
  vacationDays: number;
  overtimeDays: number;
  issueCount: number;
}
