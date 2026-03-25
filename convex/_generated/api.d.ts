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
import type * as approvals from "../approvals.js";
import type * as bulletin from "../bulletin.js";
import type * as clientNotes from "../clientNotes.js";
import type * as clientPackages from "../clientPackages.js";
import type * as clients from "../clients.js";
import type * as commitments from "../commitments.js";
import type * as enrichedContent from "../enrichedContent.js";
import type * as leads from "../leads.js";
import type * as meetingNotes from "../meetingNotes.js";
import type * as migration from "../migration.js";
import type * as monthlySnapshots from "../monthlySnapshots.js";
import type * as notifications from "../notifications.js";
import type * as packages from "../packages.js";
import type * as projectGroups from "../projectGroups.js";
import type * as projectMembers from "../projectMembers.js";
import type * as projectTemplateRoles from "../projectTemplateRoles.js";
import type * as projects from "../projects.js";
import type * as recurringTickets from "../recurringTickets.js";
import type * as savedViews from "../savedViews.js";
import type * as serviceBoardEntries from "../serviceBoardEntries.js";
import type * as slackMessages from "../slackMessages.js";
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
import type * as vacationRequests from "../vacationRequests.js";
import type * as visitors from "../visitors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activityLog: typeof activityLog;
  approvals: typeof approvals;
  bulletin: typeof bulletin;
  clientNotes: typeof clientNotes;
  clientPackages: typeof clientPackages;
  clients: typeof clients;
  commitments: typeof commitments;
  enrichedContent: typeof enrichedContent;
  leads: typeof leads;
  meetingNotes: typeof meetingNotes;
  migration: typeof migration;
  monthlySnapshots: typeof monthlySnapshots;
  notifications: typeof notifications;
  packages: typeof packages;
  projectGroups: typeof projectGroups;
  projectMembers: typeof projectMembers;
  projectTemplateRoles: typeof projectTemplateRoles;
  projects: typeof projects;
  recurringTickets: typeof recurringTickets;
  savedViews: typeof savedViews;
  serviceBoardEntries: typeof serviceBoardEntries;
  slackMessages: typeof slackMessages;
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
