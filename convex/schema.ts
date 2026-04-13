import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // === COUNTERS (for sequential ticket numbers CHQ-XXX) ===
  counters: defineTable({
    name: v.string(),
    value: v.number(),
  }).index("by_name", ["name"]),

  // === CORE CRM ===
  clients: defineTable({
    name: v.string(),
    slug: v.string(),
    active: v.boolean(),
    // Integration IDs
    ga4PropertyId: v.optional(v.string()),
    gscSiteUrl: v.optional(v.string()),
    seRankingsProjectId: v.optional(v.string()),
    googleAdsCustomerId: v.optional(v.string()),
    youtubeChannelId: v.optional(v.string()),
    gbpLocationName: v.optional(v.string()), // e.g. "locations/1234567890"
    calLink: v.optional(v.string()),
    notionPageUrl: v.optional(v.string()),
    notionPageId: v.optional(v.string()),
    // CRM contact info
    websiteUrl: v.optional(v.string()),
    contactName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    industry: v.optional(v.string()),
    // Contract & billing
    contractStartDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    mrr: v.optional(v.number()),
    country: v.optional(v.string()),
    seoHoursAllocated: v.optional(v.number()),
    accountSpecialist: v.optional(v.string()),
    // Address
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    city: v.optional(v.string()),
    provinceState: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    // Status
    clientStatus: v.optional(v.string()), // "new" | "active" | "offboarding" | "inactive"
    offboardingDate: v.optional(v.string()),
    lastContactDate: v.optional(v.string()),
    nextReviewDate: v.optional(v.string()),
    // Social
    socialLinkedin: v.optional(v.string()),
    socialFacebook: v.optional(v.string()),
    socialInstagram: v.optional(v.string()),
    socialX: v.optional(v.string()),
    // Tags
    tags: v.optional(v.array(v.string())),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["active"])
    .index("by_status", ["clientStatus"])
    .index("by_country", ["country"]),

  // === LEADS ===
  leads: defineTable({
    company: v.string(),
    contactName: v.optional(v.string()),
    contactRole: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    website: v.optional(v.string()),
    status: v.string(), // "new" | "contacted" | "responded" | "meeting_scheduled" | "proposal_sent" | "won" | "lost"
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
  }).index("by_status", ["status"]),

  packages: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    defaultPrice: v.number(),
    category: v.optional(v.string()),
    billingFrequency: v.optional(v.string()),
    hoursIncluded: v.optional(v.number()),
    includedServices: v.optional(v.array(v.string())),
    setupFee: v.optional(v.number()),
    active: v.boolean(),
  }).index("by_active", ["active"]),

  clientPackages: defineTable({
    clientId: v.id("clients"),
    packageId: v.id("packages"),
    customPrice: v.optional(v.number()),
    customHours: v.optional(v.number()),
    applySetupFee: v.optional(v.boolean()),
    customSetupFee: v.optional(v.number()),
    signupDate: v.optional(v.string()),
    contractEndDate: v.optional(v.string()),
    active: v.boolean(),
    notes: v.optional(v.string()),
    isOneTime: v.optional(v.boolean()),
    paidDate: v.optional(v.string()),
    canceledAt: v.optional(v.string()),
    effectiveEndDate: v.optional(v.string()),
    cancellationFee: v.optional(v.number()),
    canceledBy: v.optional(v.string()),
  })
    .index("by_client", ["clientId"])
    .index("by_package", ["packageId"])
    .index("by_active", ["active"]),

  clientNotes: defineTable({
    clientId: v.id("clients"),
    author: v.string(),
    noteType: v.optional(v.string()),
    content: v.string(),
    metadata: v.optional(v.any()),
  }).index("by_client", ["clientId"]),

  // === CONVERGE PAYMENT MONITORING ===
  convergeProfiles: defineTable({
    clientId: v.id("clients"),
    recurringId: v.string(), // ssl_recurring_id from Converge
    label: v.optional(v.string()), // e.g. "SEO Monthly"
    currency: v.string(), // "USD" | "CAD" — determines which terminal/PIN to use
    lastPolledAt: v.optional(v.string()),
    lastStatus: v.optional(v.string()), // "Active" | "Suspended" | "Completed" | "Expired"
    cardLastFour: v.optional(v.string()),
    cardExpiryMonth: v.optional(v.number()), // 1-12
    cardExpiryYear: v.optional(v.number()), // 4-digit year
    cardExpiryNotifiedAt: v.optional(v.string()), // ISO date, prevents duplicate emails
    amount: v.optional(v.number()),
    billingCycle: v.optional(v.string()), // "MONTHLY" etc.
    nextPaymentDate: v.optional(v.string()),
    paymentsMade: v.optional(v.number()),
    active: v.boolean(),
  })
    .index("by_client", ["clientId"])
    .index("by_active", ["active"])
    .index("by_lastStatus", ["lastStatus"]),

  convergeTransactions: defineTable({
    txnId: v.string(), // unique Converge transaction ID
    terminal: v.string(), // "USD" | "CAD"
    status: v.string(), // "approved" | "declined"
    resultMessage: v.string(),
    transStatus: v.string(),
    amount: v.number(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    company: v.optional(v.string()),
    description: v.optional(v.string()),
    txnType: v.optional(v.string()), // "SALE" | "RETURN"
    refundedAmount: v.optional(v.number()),
    cardType: v.optional(v.string()),
    cardLastFour: v.optional(v.string()),
    cardExpiryMonth: v.optional(v.number()),
    cardExpiryYear: v.optional(v.number()),
    recurringId: v.optional(v.string()),
    txnTime: v.optional(v.string()),
    settleTime: v.optional(v.string()),
    approvalCode: v.optional(v.string()),
    clientName: v.optional(v.string()), // enriched from linked profiles
  })
    .index("by_txnId", ["txnId"])
    .index("by_txnTime", ["txnTime"])
    .index("by_status", ["status"])
    .index("by_recurringId", ["recurringId"]),

  paymentIssues: defineTable({
    clientId: v.id("clients"),
    convergeProfileId: v.optional(v.id("convergeProfiles")),
    status: v.string(), // "open" | "escalated" | "resolved"
    failureCount: v.number(),
    convergeStatus: v.optional(v.string()),
    firstFailedAt: v.string(),
    lastFailedAt: v.string(),
    escalatedAt: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.id("teamMembers")),
    resolutionNote: v.optional(v.string()),
    lastClientEmailAt: v.optional(v.string()),
    emailCount: v.optional(v.number()),
    ticketId: v.optional(v.id("tickets")),
  })
    .index("by_client", ["clientId"])
    .index("by_status", ["status"])
    .index("by_convergeProfile", ["convergeProfileId"]),

  // === TEAM ===
  teamMembers: defineTable({
    name: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
    calLink: v.optional(v.string()),
    profilePicUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    startDate: v.optional(v.string()),
    birthday: v.optional(v.string()),
    active: v.boolean(),
    employeeStatus: v.optional(v.string()), // "active" | "maternity_leave" | "leave" | "terminated" | "past_employee"
    // Auth
    passwordHash: v.optional(v.string()),
    roleLevel: v.optional(v.string()), // "owner" | "c_suite" | "bookkeeper" | "employee" | "intern"
    lastLogin: v.optional(v.string()),
    // Slack
    slackUserId: v.optional(v.string()),
    // Wages & availability
    availableHoursPerWeek: v.optional(v.number()),
    hourlyRate: v.optional(v.number()),
    salary: v.optional(v.number()),
    payType: v.optional(v.string()), // "hourly" | "salary"
    // Vacation & sick balance
    vacationDaysTotal: v.optional(v.number()),
    vacationDaysUsed: v.optional(v.number()),
    sickDaysTotal: v.optional(v.number()), // annual sick day allocation
    // Tags
    tags: v.optional(v.array(v.string())),
    // Clock-in bypass — when true, member can start ticket timers without clocking in
    bypassClockIn: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("by_active", ["active"]),

  // === TICKETS ===
  tickets: defineTable({
    ticketNumber: v.string(), // CHQ-XXX format
    title: v.string(),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()), // "plain" | "html"
    clientId: v.optional(v.id("clients")),
    projectId: v.optional(v.id("projects")),
    parentTicketId: v.optional(v.id("tickets")),
    status: v.string(), // "needs_attention" | "in_progress" | "complete" | etc.
    priority: v.optional(v.string()), // "low" | "normal" | "high" | "urgent"
    ticketGroup: v.optional(v.string()),
    groupId: v.optional(v.id("projectGroups")),
    templateRoleId: v.optional(v.id("projectTemplateRoles")),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    dueTime: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    createdById: v.optional(v.id("teamMembers")),
    archived: v.optional(v.boolean()),
    isPersonal: v.optional(v.boolean()),
    isMeeting: v.optional(v.boolean()),
    isEmail: v.optional(v.boolean()),
    assignAllRoles: v.optional(v.boolean()),
    dayOffsetStart: v.optional(v.number()),
    dayOffsetDue: v.optional(v.number()),
    serviceCategory: v.optional(v.string()), // "seo" | "google_ads" | "retainer"
    closedAt: v.optional(v.string()),
  })
    .index("by_client", ["clientId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_archived", ["archived"])
    .index("by_parent", ["parentTicketId"])
    .index("by_number", ["ticketNumber"])
    .index("by_service_category", ["serviceCategory"])
    .index("by_project_archived", ["projectId", "archived"]),

  ticketAssignees: defineTable({
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_member", ["teamMemberId"]),

  ticketComments: defineTable({
    ticketId: v.id("tickets"),
    authorType: v.optional(v.string()), // "team" | "client"
    authorId: v.optional(v.id("teamMembers")),
    authorName: v.string(),
    authorEmail: v.optional(v.string()),
    content: v.string(),
  }).index("by_ticket", ["ticketId"]),

  ticketAttachments: defineTable({
    ticketId: v.id("tickets"),
    uploadedById: v.optional(v.id("teamMembers")),
    uploadedByName: v.optional(v.string()),
    fileName: v.string(),
    fileUrl: v.string(),
    fileSize: v.optional(v.number()),
    fileType: v.optional(v.string()),
  }).index("by_ticket", ["ticketId"]),

  ticketActivity: defineTable({
    ticketId: v.id("tickets"),
    actorId: v.optional(v.id("teamMembers")),
    actorName: v.string(),
    actionType: v.string(),
    fieldName: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_ticket", ["ticketId"]),

  ticketDependencies: defineTable({
    ticketId: v.id("tickets"),
    dependsOnTicketId: v.id("tickets"),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_depends_on", ["dependsOnTicketId"]),

  ticketCommitments: defineTable({
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
    committedDate: v.string(),
    committedById: v.optional(v.id("teamMembers")),
    status: v.optional(v.string()), // "active" | "met" | "missed"
    resolvedAt: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_member", ["teamMemberId"])
    .index("by_status", ["status"]),

  // Junction: ticket ↔ template roles (for template projects)
  ticketTemplateRoleAssignments: defineTable({
    ticketId: v.id("tickets"),
    templateRoleId: v.id("projectTemplateRoles"),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_role", ["templateRoleId"]),

  // === PROJECTS ===
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    clientId: v.optional(v.id("clients")),
    isTemplate: v.optional(v.boolean()),
    status: v.optional(v.string()), // "active" | "completed" | "on_hold"
    archived: v.optional(v.boolean()),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    createdById: v.optional(v.id("teamMembers")),
  })
    .index("by_client", ["clientId"])
    .index("by_template", ["isTemplate"])
    .index("by_archived", ["archived"])
    .index("by_status", ["status"]),

  projectGroups: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  }).index("by_project", ["projectId"]),

  projectTemplateRoles: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    sortOrder: v.optional(v.number()),
  }).index("by_project", ["projectId"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    teamMemberId: v.id("teamMembers"),
  })
    .index("by_project", ["projectId"])
    .index("by_member", ["teamMemberId"]),

  // === TIME TRACKING ===
  timeEntries: defineTable({
    ticketId: v.id("tickets"),
    teamMemberId: v.id("teamMembers"),
    startTime: v.string(), // ISO timestamp
    endTime: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    isManual: v.optional(v.boolean()),
    note: v.optional(v.string()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_member", ["teamMemberId"])
    .index("by_start", ["startTime"]),

  // === RECURRING TICKET TEMPLATES ===
  recurringTicketTemplates: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    descriptionFormat: v.optional(v.string()),
    clientId: v.id("clients"),
    projectId: v.optional(v.id("projects")),
    priority: v.optional(v.string()),
    ticketGroup: v.optional(v.string()),
    recurrenceRule: v.string(), // "weekly" | "biweekly" | "monthly" | "quarterly"
    recurrenceDay: v.optional(v.number()),
    nextCreateAt: v.string(),
    active: v.boolean(),
    createdById: v.optional(v.id("teamMembers")),
  })
    .index("by_client", ["clientId"])
    .index("by_active", ["active"])
    .index("by_next", ["nextCreateAt"]),

  recurringTemplateAssignees: defineTable({
    templateId: v.id("recurringTicketTemplates"),
    teamMemberId: v.id("teamMembers"),
  })
    .index("by_template", ["templateId"])
    .index("by_member", ["teamMemberId"]),

  // === NOTIFICATIONS ===
  notifications: defineTable({
    recipientId: v.id("teamMembers"),
    ticketId: v.optional(v.id("tickets")),
    type: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
    isRead: v.boolean(),
  })
    .index("by_recipient", ["recipientId"])
    .index("by_recipient_unread", ["recipientId", "isRead"]),

  // === NOTIFICATION PREFERENCES ===
  notificationPreferences: defineTable({
    teamMemberId: v.id("teamMembers"),

    // Ticket notifications
    ticket_assigned: v.optional(v.boolean()),
    ticket_status_stuck: v.optional(v.boolean()),
    ticket_status_qa_ready: v.optional(v.boolean()),
    ticket_status_needs_attention: v.optional(v.boolean()),
    ticket_status_change: v.optional(v.boolean()),
    ticket_created: v.optional(v.boolean()),
    ticket_comment: v.optional(v.boolean()),
    ticket_mention: v.optional(v.boolean()),
    ticket_due_soon: v.optional(v.boolean()),
    ticket_overdue: v.optional(v.boolean()),
    ticket_due_date_changed: v.optional(v.boolean()),
    ticket_closed: v.optional(v.boolean()),

    // Timesheet & HR notifications
    vacation_requested: v.optional(v.boolean()),
    vacation_resolved: v.optional(v.boolean()),
    time_adjustment_requested: v.optional(v.boolean()),
    time_adjustment_resolved: v.optional(v.boolean()),
    team_announcement: v.optional(v.boolean()),

    // Operational notifications
    hour_cap_warning: v.optional(v.boolean()),
    hour_cap_exceeded: v.optional(v.boolean()),
    runaway_timer: v.optional(v.boolean()),
    package_changed: v.optional(v.boolean()),
  }).index("by_teamMemberId", ["teamMemberId"]),

  // === SAVED VIEWS ===
  savedViews: defineTable({
    teamMemberId: v.id("teamMembers"),
    name: v.string(),
    filters: v.any(), // JSONB equivalent
    isDefault: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  }).index("by_member", ["teamMemberId"]),

  // === ANALYTICS ===
  activityLog: defineTable({
    clientSlug: v.string(),
    eventType: v.string(),
    eventDetail: v.optional(v.any()),
    sessionId: v.optional(v.string()),
    deviceType: v.optional(v.string()),
    referrer: v.optional(v.string()),
    visitorId: v.optional(v.id("visitors")),
  })
    .index("by_client", ["clientSlug"])
    .index("by_session", ["sessionId"])
    .index("by_visitor", ["visitorId"]),

  visitors: defineTable({
    clientSlug: v.string(),
    visitorName: v.string(),
  }).index("by_client_name", ["clientSlug", "visitorName"]),

  visitorDevices: defineTable({
    visitorId: v.id("visitors"),
    deviceId: v.string(),
    deviceType: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    firstSeen: v.optional(v.string()),
    lastSeen: v.optional(v.string()),
  })
    .index("by_device", ["deviceId"])
    .index("by_visitor", ["visitorId"]),

  monthlySnapshots: defineTable({
    clientSlug: v.string(),
    month: v.string(), // "YYYY-MM-DD" first of month
    gscData: v.optional(v.any()),
    ga4Data: v.optional(v.any()),
    keywordData: v.optional(v.any()),
    kpiSummary: v.optional(v.any()),
  }).index("by_client_month", ["clientSlug", "month"]),

  // === CONTENT ===
  enrichedContent: defineTable({
    clientSlug: v.string(),
    month: v.string(),
    rawContent: v.optional(v.string()),
    enrichedData: v.optional(v.any()),
  }).index("by_client_month", ["clientSlug", "month"]),

  approvals: defineTable({
    clientSlug: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    links: v.optional(v.any()),
    status: v.string(), // "pending" | "approved" | "rejected" | "dismissed"
    feedback: v.optional(v.string()),
    contentHash: v.optional(v.string()),
  })
    .index("by_client", ["clientSlug"])
    .index("by_status", ["status"])
    .index("by_client_hash", ["clientSlug", "contentHash"]),

  // === BULLETIN ===
  personalNotes: defineTable({
    teamMemberId: v.id("teamMembers"),
    content: v.string(),
  }).index("by_member", ["teamMemberId"]),

  announcements: defineTable({
    authorId: v.id("teamMembers"),
    title: v.string(),
    content: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
    source: v.optional(v.string()), // "manual" | "auto"
    announcementType: v.optional(v.string()), // "general" | "birthday" | "anniversary" | "time_off"
    expiresAt: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  }),

  announcementReactions: defineTable({
    announcementId: v.id("announcements"),
    teamMemberId: v.id("teamMembers"),
    emoji: v.string(),
  }).index("by_announcement", ["announcementId"]),

  weeklyQuotes: defineTable({
    quote: v.string(),
    author: v.optional(v.string()),
    weekStart: v.string(), // DATE
    selected: v.optional(v.boolean()),
  }).index("by_week", ["weekStart"]),

  calendarEvents: defineTable({
    title: v.string(),
    eventDate: v.string(), // DATE
    eventType: v.optional(v.string()), // "holiday" | "event" | "custom"
    recurrence: v.optional(v.string()), // "none" | "weekly" | "monthly" | "quarterly" | "yearly"
  }).index("by_date", ["eventDate"]),

  // === SERVICE BOARD ===
  serviceBoardEntries: defineTable({
    clientId: v.id("clients"),
    clientPackageId: v.id("clientPackages"),
    category: v.string(), // "seo" | "google_ads" | "retainer"
    month: v.string(), // "YYYY-MM-DD" first of month
    status: v.string(), // "needs_attention" | "in_progress" | "report_ready" | "email_sent"
    specialistId: v.optional(v.id("teamMembers")),
    monthlyEmailSentAt: v.optional(v.string()),
    quarterlyEmailSentAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    generatedEmail: v.optional(v.string()),
  })
    .index("by_client", ["clientId"])
    .index("by_category_month", ["category", "month"])
    .index("by_package_month", ["clientPackageId", "month"]),

  // === SLACK ===
  slackMessages: defineTable({
    teamMemberId: v.id("teamMembers"),
    messageType: v.string(), // "eod_checkin" | "eod_reply" | "team_dm" | "weekly_summary"
    messageText: v.string(),
    slackTs: v.optional(v.string()),
    channelId: v.optional(v.string()),
    data: v.optional(v.any()), // e.g. { ticketIds: [...] } for EOD check-ins
  })
    .index("by_member", ["teamMemberId"])
    .index("by_slackTs", ["slackTs"]),

  slackConversations: defineTable({
    threadTs: v.string(),
    channelId: v.string(),
    intent: v.string(),
    state: v.string(),
    data: v.any(),
    userId: v.id("teamMembers"),
    expiresAt: v.optional(v.string()),
    updatedAt: v.optional(v.string()),
  })
    .index("by_threadTs", ["threadTs"])
    .index("by_userId", ["userId"]),

  blockerEscalations: defineTable({
    ticketId: v.id("tickets"),
    reportedById: v.id("teamMembers"),
    blockedById: v.optional(v.id("teamMembers")),
    blockerDescription: v.string(),
    acknowledged: v.boolean(),
    acknowledgedAt: v.optional(v.string()),
    escalatedToOwner: v.boolean(),
    escalatedAt: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
  })
    .index("by_ticket", ["ticketId"])
    .index("by_acknowledged", ["acknowledged"]),

  // === MEETINGS ===
  meetingNotes: defineTable({
    teamMemberId: v.id("teamMembers"),
    createdById: v.id("teamMembers"),
    transcript: v.optional(v.string()),
    summary: v.optional(v.string()),
    rawExtraction: v.optional(v.any()),
    meetingDate: v.string(), // DATE
    source: v.optional(v.string()), // "manual"
    interactionType: v.optional(v.string()), // "team_meeting" | "client_meeting" | "client_email" | "client_phone_call" | "general_notes"
    clientId: v.optional(v.id("clients")),
  }).index("by_member", ["teamMemberId"])
    .index("by_client", ["clientId"]),

  // === TIMESHEET (Payroll clock in/out — separate from ticket time tracking) ===
  timesheetEntries: defineTable({
    teamMemberId: v.id("teamMembers"),
    date: v.string(), // "YYYY-MM-DD"
    clockInTime: v.string(), // ISO timestamp
    clockOutTime: v.optional(v.string()), // ISO timestamp, null = still clocked in
    totalBreakMinutes: v.optional(v.number()),
    workedMinutes: v.optional(v.number()), // computed: clock duration minus breaks
    isSickDay: v.optional(v.boolean()),
    isHalfSickDay: v.optional(v.boolean()),
    isVacation: v.optional(v.boolean()),
    note: v.optional(v.string()),
    issues: v.optional(v.array(v.string())), // "MISSING_CLOCK_OUT" | "LONG_SHIFT_NO_BREAK" | "OPEN_BREAK" | "OVERTIME_WARNING"
    pendingApproval: v.optional(v.boolean()),
    sickHoursUsed: v.optional(v.number()),
    changeRequest: v.optional(v.any()),
  })
    .index("by_teamMemberId", ["teamMemberId"])
    .index("by_date", ["date"])
    .index("by_teamMemberId_and_date", ["teamMemberId", "date"]),

  timesheetBreaks: defineTable({
    timesheetEntryId: v.id("timesheetEntries"),
    startTime: v.string(), // ISO timestamp
    endTime: v.optional(v.string()), // ISO timestamp, null = break in progress
    breakType: v.optional(v.string()), // "unpaid"
    durationMinutes: v.optional(v.number()),
  }).index("by_timesheetEntryId", ["timesheetEntryId"]),

  vacationRequests: defineTable({
    teamMemberId: v.id("teamMembers"),
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(), // "YYYY-MM-DD"
    totalDays: v.number(),
    reason: v.optional(v.string()),
    status: v.string(), // "pending" | "approved" | "denied"
    reviewedById: v.optional(v.id("teamMembers")),
    reviewedAt: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
  })
    .index("by_teamMemberId", ["teamMemberId"])
    .index("by_status", ["status"])
    .index("by_startDate_and_endDate", ["startDate", "endDate"]),

  timesheetChangeRequests: defineTable({
    timesheetEntryId: v.id("timesheetEntries"),
    teamMemberId: v.id("teamMembers"),
    originalClockIn: v.string(),
    originalClockOut: v.optional(v.string()),
    proposedClockIn: v.string(),
    proposedClockOut: v.optional(v.string()),
    reason: v.string(),
    status: v.string(), // "pending" | "approved" | "denied"
    reviewedById: v.optional(v.id("teamMembers")),
    reviewedAt: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    minutesDelta: v.optional(v.number()), // positive = gained, negative = lost
  })
    .index("by_timesheetEntryId", ["timesheetEntryId"])
    .index("by_teamMemberId", ["teamMemberId"])
    .index("by_status", ["status"]),

  timesheetSettings: defineTable({
    key: v.string(), // singleton: "global"
    halfDaySickCutoffTime: v.optional(v.string()), // default "12:00"
    overtimeThresholdMinutes: v.optional(v.number()), // default 480 (8hrs)
    longShiftBreakThresholdMinutes: v.optional(v.number()), // default 300 (5hrs)
    defaultVacationDaysPerYear: v.optional(v.number()), // default 10
    bookkeeperEmail: v.optional(v.string()),
    companyLogoUrl: v.optional(v.string()),
    standardWorkDayHours: v.optional(v.number()), // default 8
    sickHoursTotal: v.optional(v.number()), // per employee per year
  }).index("by_key", ["key"]),

  changelog: defineTable({
    title: v.string(),
    description: v.string(),
    category: v.string(), // "feature" | "improvement" | "fix" | "design" | "moved"
    icon: v.optional(v.string()), // emoji or small visual cue shown left of the entry
    imageUrl: v.optional(v.string()),
    authorName: v.optional(v.string()),
    visibility: v.optional(v.string()), // "team" (default, everyone) | "internal" (owner/c_suite only)
  }),

  apiConnections: defineTable({
    platform: v.string(), // "google_ads" | "meta_ads" | "gsc" | "gmb" | "instagram" | "linkedin_ads" | "linkedin_pages" | "google_merchant" | "pagespeed" | "airtable" | "intercom" | "mailerlite" | "mailersend" | "notion" | "slack" | "stripe"
    scope: v.string(), // "org" | "client"
    clientId: v.optional(v.id("clients")),
    authType: v.string(), // "api_key" | "oauth2" | "service_account"
    encryptedCreds: v.string(),
    credsIv: v.string(),
    oauthAccountId: v.optional(v.string()),
    oauthAccountName: v.optional(v.string()),
    oauthExpiresAt: v.optional(v.string()),
    refreshTokenCiphertext: v.optional(v.string()),
    refreshTokenIv: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()), // epoch ms for the access token
    availableAccounts: v.optional(v.array(v.object({
      id: v.string(),
      name: v.string(),
      kind: v.optional(v.string()), // e.g. "ga4_property", "ads_customer", "yt_channel", "gbp_location"
    }))),
    status: v.string(), // "active" | "expired" | "error" | "disconnected"
    lastVerifiedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
    displayName: v.optional(v.string()),
    addedById: v.optional(v.id("teamMembers")),
  })
    .index("by_platform_scope", ["platform", "scope"])
    .index("by_client", ["clientId"])
    .index("by_status", ["status"]),

  connectionLogs: defineTable({
    connectionId: v.id("apiConnections"),
    event: v.string(), // "created" | "verified" | "refreshed" | "error" | "disconnected"
    detail: v.optional(v.string()),
    actorId: v.optional(v.id("teamMembers")),
  })
    .index("by_connection", ["connectionId"]),

  mcpAuditLog: defineTable({
    actor: v.string(), // "mcp" | "slack" | "cron" | team member id, etc.
    detail: v.string(), // JSON-stringified payload: { tool, clientId, platform, metrics, ... }
    teamMemberId: v.optional(v.id("teamMembers")),
    tool: v.optional(v.string()),
    success: v.optional(v.boolean()),
    durationMs: v.optional(v.number()),
  })
    .index("by_teamMember", ["teamMemberId"])
    .index("by_tool", ["tool"]),

  destinations: defineTable({
    type: v.string(), // "sheets" | "bigquery" | "notion"
    name: v.string(), // human label e.g. "Penni Cart Reporting Sheet"
    createdById: v.optional(v.id("teamMembers")),
    // Type-specific config JSON-stringified and AES-encrypted
    encryptedConfig: v.string(),
    configIv: v.string(),
    connectionId: v.id("apiConnections"), // OAuth/API connection we write through
    status: v.string(), // "active" | "error" | "disabled"
    lastTestedAt: v.optional(v.string()),
    lastError: v.optional(v.string()),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"]),

  syncJobs: defineTable({
    name: v.string(),
    clientId: v.id("clients"),
    sourcePlatform: v.string(), // "ga4" | "gsc" | "google_ads" | "youtube" | "gbp" | "pagespeed"
    destinationId: v.id("destinations"),
    metrics: v.array(v.string()),
    dimensions: v.array(v.string()),
    dateRangePreset: v.string(),
    filters: v.optional(
      v.array(
        v.object({
          dimension: v.string(),
          op: v.string(),
          value: v.string(),
        })
      )
    ),
    rowLimit: v.optional(v.number()),
    frequency: v.string(), // "hourly" | "daily" | "weekly"
    dayOfWeek: v.optional(v.number()),
    hourOfDay: v.optional(v.number()),
    nextRunAt: v.number(),
    lastRunAt: v.optional(v.number()),
    active: v.boolean(),
    createdById: v.id("teamMembers"),
    createdAt: v.string(),
  })
    .index("by_nextRun", ["active", "nextRunAt"])
    .index("by_client", ["clientId"])
    .index("by_destination", ["destinationId"]),

  syncRuns: defineTable({
    syncJobId: v.id("syncJobs"),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    status: v.string(), // "running" | "success" | "error"
    rowsWritten: v.optional(v.number()),
    rowsRead: v.optional(v.number()),
    error: v.optional(v.string()),
    triggeredBy: v.string(), // "schedule" | "manual" | "mcp"
    triggeredById: v.optional(v.id("teamMembers")),
  })
    .index("by_job", ["syncJobId", "startedAt"])
    .index("by_status", ["status"]),

  mcpTokens: defineTable({
    teamMemberId: v.id("teamMembers"),
    tokenHash: v.string(), // SHA-256 hex of the plaintext token (for auth lookup)
    encryptedToken: v.optional(v.string()), // AES-encrypted plaintext token (so UI can redisplay it)
    tokenIv: v.optional(v.string()),
    label: v.optional(v.string()),
    createdAt: v.string(),
    lastUsedAt: v.optional(v.string()),
    revokedAt: v.optional(v.string()),
  })
    .index("by_hash", ["tokenHash"])
    .index("by_teamMember", ["teamMemberId"]),

  // === WEBSITE VISITOR IDENTIFICATION (Leadfeeder alternative) ===
  trackedSites: defineTable({
    name: v.string(), // "Choquer Agency" or client name
    domain: v.string(), // "choqueragency.com"
    siteKey: v.string(), // UUID tracking ID embedded in snippet
    clientId: v.optional(v.id("clients")), // link to client (for future multi-site)
    active: v.boolean(),
    excludedIps: v.optional(v.array(v.string())), // office/VPN IPs to filter
    consentMode: v.optional(v.boolean()), // require consent before tracking
  })
    .index("by_siteKey", ["siteKey"])
    .index("by_domain", ["domain"])
    .index("by_client", ["clientId"]),

  siteVisitors: defineTable({
    siteId: v.id("trackedSites"),
    fingerprint: v.string(), // hash of IP + UA for dedup
    ipHash: v.string(), // SHA-256 of raw IP
    firstSeenAt: v.string(), // ISO timestamp
    lastSeenAt: v.string(),
    visitCount: v.number(),
    companyId: v.optional(v.id("identifiedCompanies")),
    device: v.optional(v.string()), // "desktop" | "mobile" | "tablet"
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    country: v.optional(v.string()),
    region: v.optional(v.string()),
    city: v.optional(v.string()),
    intentLevel: v.string(), // "new" | "returning" | "high_intent"
    lastAlertedAt: v.optional(v.string()), // prevents alert spam
  })
    .index("by_site", ["siteId"])
    .index("by_fingerprint", ["siteId", "fingerprint"])
    .index("by_company", ["companyId"])
    .index("by_lastSeen", ["siteId", "lastSeenAt"])
    .index("by_intent", ["siteId", "intentLevel"]),

  sitePageViews: defineTable({
    siteId: v.id("trackedSites"),
    visitorId: v.id("siteVisitors"),
    url: v.string(),
    path: v.string(),
    title: v.optional(v.string()),
    referrer: v.optional(v.string()),
    utmSource: v.optional(v.string()),
    utmMedium: v.optional(v.string()),
    utmCampaign: v.optional(v.string()),
    sessionId: v.string(),
    durationSeconds: v.optional(v.number()),
    timestamp: v.string(), // ISO timestamp
  })
    .index("by_visitor", ["visitorId"])
    .index("by_site_timestamp", ["siteId", "timestamp"])
    .index("by_session", ["sessionId"]),

  identifiedCompanies: defineTable({
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    employeeCount: v.optional(v.string()), // "1-10", "11-50", etc.
    city: v.optional(v.string()),
    region: v.optional(v.string()),
    country: v.optional(v.string()),
    description: v.optional(v.string()),
    linkedinUrl: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    source: v.string(), // "ipinfo"
    lastEnrichedAt: v.string(),
    leadId: v.optional(v.id("leads")), // link to CRM lead if promoted
  })
    .index("by_domain", ["domain"])
    .index("by_name", ["name"]),

  ipLookupCache: defineTable({
    ipHash: v.string(), // SHA-256 of IP
    companyId: v.optional(v.id("identifiedCompanies")),
    raw: v.optional(v.any()), // raw API response
    isIsp: v.boolean(), // true = consumer ISP, skip enrichment
    lookedUpAt: v.string(), // ISO timestamp
    // Short-lived raw IP used only by the enrichment cron to batch-call IPinfo.
    // Populated by /api/t when real-time enrichment is skipped; purged after cron runs
    // or once rawIpExpiresAt passes (24h TTL).
    rawIp: v.optional(v.string()),
    rawIpExpiresAt: v.optional(v.number()),
  })
    .index("by_ipHash", ["ipHash"])
    .index("by_rawIp", ["rawIp"]),
});
