/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activityLog from "../activityLog.js";
import type * as apiConnections from "../apiConnections.js";
import type * as approvals from "../approvals.js";
import type * as blockerEscalations from "../blockerEscalations.js";
import type * as bulletin from "../bulletin.js";
import type * as changelog from "../changelog.js";
import type * as clientNotes from "../clientNotes.js";
import type * as clientPackages from "../clientPackages.js";
import type * as clients from "../clients.js";
import type * as commitments from "../commitments.js";
import type * as connectionLogs from "../connectionLogs.js";
import type * as convergeProfiles from "../convergeProfiles.js";
import type * as convergeTransactions from "../convergeTransactions.js";
import type * as destinations from "../destinations.js";
import type * as enrichedContent from "../enrichedContent.js";
import type * as http from "../http.js";
import type * as identifiedCompanies from "../identifiedCompanies.js";
import type * as ipLookupCache from "../ipLookupCache.js";
import type * as leadLogs from "../leadLogs.js";
import type * as leads from "../leads.js";
import type * as leadsMeta from "../leadsMeta.js";
import type * as mcpAuditLog from "../mcpAuditLog.js";
import type * as mcpTokens from "../mcpTokens.js";
import type * as meetingBriefings from "../meetingBriefings.js";
import type * as meetingNotes from "../meetingNotes.js";
import type * as meetingQuestionTemplates from "../meetingQuestionTemplates.js";
import type * as metaConfig from "../metaConfig.js";
import type * as metaConfigNode from "../metaConfigNode.js";
import type * as migration from "../migration.js";
import type * as monthlySnapshots from "../monthlySnapshots.js";
import type * as notificationPreferences from "../notificationPreferences.js";
import type * as notifications from "../notifications.js";
import type * as packages from "../packages.js";
import type * as paymentIssues from "../paymentIssues.js";
import type * as projectGroups from "../projectGroups.js";
import type * as projectMembers from "../projectMembers.js";
import type * as projectTemplateRoles from "../projectTemplateRoles.js";
import type * as projects from "../projects.js";
import type * as recurringTickets from "../recurringTickets.js";
import type * as savedViews from "../savedViews.js";
import type * as seoStrategyMonths from "../seoStrategyMonths.js";
import type * as serviceBoardEntries from "../serviceBoardEntries.js";
import type * as sitePageViews from "../sitePageViews.js";
import type * as siteVisitors from "../siteVisitors.js";
import type * as slackConversations from "../slackConversations.js";
import type * as slackMessages from "../slackMessages.js";
import type * as syncJobs from "../syncJobs.js";
import type * as syncRuns from "../syncRuns.js";
import type * as teamMembers from "../teamMembers.js";
import type * as ticketActivity from "../ticketActivity.js";
import type * as ticketAssignees from "../ticketAssignees.js";
import type * as ticketAttachments from "../ticketAttachments.js";
import type * as ticketComments from "../ticketComments.js";
import type * as ticketDependencies from "../ticketDependencies.js";
import type * as ticketTemplateRoleAssignments from "../ticketTemplateRoleAssignments.js";
import type * as tickets from "../tickets.js";
import type * as timeEntries from "../timeEntries.js";
import type * as timesheetBreaks from "../timesheetBreaks.js";
import type * as timesheetChangeRequests from "../timesheetChangeRequests.js";
import type * as timesheetEntries from "../timesheetEntries.js";
import type * as timesheetSettings from "../timesheetSettings.js";
import type * as trackedSites from "../trackedSites.js";
import type * as vacationRequests from "../vacationRequests.js";
import type * as visitors from "../visitors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityLog: typeof activityLog;
  apiConnections: typeof apiConnections;
  approvals: typeof approvals;
  blockerEscalations: typeof blockerEscalations;
  bulletin: typeof bulletin;
  changelog: typeof changelog;
  clientNotes: typeof clientNotes;
  clientPackages: typeof clientPackages;
  clients: typeof clients;
  commitments: typeof commitments;
  connectionLogs: typeof connectionLogs;
  convergeProfiles: typeof convergeProfiles;
  convergeTransactions: typeof convergeTransactions;
  destinations: typeof destinations;
  enrichedContent: typeof enrichedContent;
  http: typeof http;
  identifiedCompanies: typeof identifiedCompanies;
  ipLookupCache: typeof ipLookupCache;
  leadLogs: typeof leadLogs;
  leads: typeof leads;
  leadsMeta: typeof leadsMeta;
  mcpAuditLog: typeof mcpAuditLog;
  mcpTokens: typeof mcpTokens;
  meetingBriefings: typeof meetingBriefings;
  meetingNotes: typeof meetingNotes;
  meetingQuestionTemplates: typeof meetingQuestionTemplates;
  metaConfig: typeof metaConfig;
  metaConfigNode: typeof metaConfigNode;
  migration: typeof migration;
  monthlySnapshots: typeof monthlySnapshots;
  notificationPreferences: typeof notificationPreferences;
  notifications: typeof notifications;
  packages: typeof packages;
  paymentIssues: typeof paymentIssues;
  projectGroups: typeof projectGroups;
  projectMembers: typeof projectMembers;
  projectTemplateRoles: typeof projectTemplateRoles;
  projects: typeof projects;
  recurringTickets: typeof recurringTickets;
  savedViews: typeof savedViews;
  seoStrategyMonths: typeof seoStrategyMonths;
  serviceBoardEntries: typeof serviceBoardEntries;
  sitePageViews: typeof sitePageViews;
  siteVisitors: typeof siteVisitors;
  slackConversations: typeof slackConversations;
  slackMessages: typeof slackMessages;
  syncJobs: typeof syncJobs;
  syncRuns: typeof syncRuns;
  teamMembers: typeof teamMembers;
  ticketActivity: typeof ticketActivity;
  ticketAssignees: typeof ticketAssignees;
  ticketAttachments: typeof ticketAttachments;
  ticketComments: typeof ticketComments;
  ticketDependencies: typeof ticketDependencies;
  ticketTemplateRoleAssignments: typeof ticketTemplateRoleAssignments;
  tickets: typeof tickets;
  timeEntries: typeof timeEntries;
  timesheetBreaks: typeof timesheetBreaks;
  timesheetChangeRequests: typeof timesheetChangeRequests;
  timesheetEntries: typeof timesheetEntries;
  timesheetSettings: typeof timesheetSettings;
  trackedSites: typeof trackedSites;
  vacationRequests: typeof vacationRequests;
  visitors: typeof visitors;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
