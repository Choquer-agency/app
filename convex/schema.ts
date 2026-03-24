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
    // Tags
    tags: v.optional(v.array(v.string())),
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
    messageType: v.string(), // "eod_checkin" | "weekly_summary"
    messageText: v.string(),
    slackTs: v.optional(v.string()),
  }).index("by_member", ["teamMemberId"]),

  // === MEETINGS ===
  meetingNotes: defineTable({
    teamMemberId: v.id("teamMembers"),
    createdById: v.id("teamMembers"),
    transcript: v.optional(v.string()),
    summary: v.optional(v.string()),
    rawExtraction: v.optional(v.any()),
    meetingDate: v.string(), // DATE
    source: v.optional(v.string()), // "manual"
  }).index("by_member", ["teamMemberId"]),
});
