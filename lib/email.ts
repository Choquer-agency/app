import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "");
  }
  return _resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@choquer.agency";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.choquer.agency";

// ── Email Templates ──

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #FAF9F5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    ${content}
    <div style="text-align: center; color: #9CA3AF; font-size: 12px; margin-top: 32px;">
      <p style="margin: 0;">Sent from Choquer Agency</p>
      <p style="margin: 8px 0 0;">This is an automated notification.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Send Functions ──

export async function sendBookkeeperReport(data: {
  bookkeeperEmail: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  employees: Array<{
    name: string;
    hours: string;
    decimalHours: string;
    sickHours: string;
    vacationDays: number;
  }>;
}) {
  const rows = data.employees
    .map(
      (emp) => `
    <tr style="border-bottom: 1px solid #F6F5F1;">
      <td style="padding: 12px 16px; font-weight: 500; color: #263926;">${emp.name}</td>
      <td style="padding: 12px 16px; text-align: right; color: #484848;">${emp.sickHours || "—"}</td>
      <td style="padding: 12px 16px; text-align: right; color: #484848;">${emp.vacationDays}</td>
      <td style="padding: 12px 16px; text-align: right; font-family: monospace; color: #263926;">${emp.hours}</td>
      <td style="padding: 12px 16px; text-align: right; font-family: monospace; color: #263926;">${emp.decimalHours}</td>
    </tr>`
    )
    .join("");

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 40px;">
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Timesheet Report</h1>
      <p style="margin: 8px 0 0; color: #6B6B6B; font-size: 16px;">${data.companyName}</p>
    </div>
    <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 10px; border: 1px solid #F6F5F1;">
      <p style="margin: 0; color: #6B6B6B; font-size: 14px; font-weight: 600; text-transform: uppercase;">Pay period</p>
      <p style="margin: 8px 0 0; color: #263926; font-size: 20px; font-weight: 600;">${data.periodStart} to ${data.periodEnd}</p>
    </div>
    <div style="background: white; border-radius: 16px; overflow: hidden; border: 1px solid #F6F5F1; margin-bottom: 24px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #F0EEE6; border-bottom: 1px solid #F6F5F1;">
            <th style="padding: 16px; text-align: left; font-size: 11px; font-weight: 700; color: #6B6B6B; text-transform: uppercase;">Employee</th>
            <th style="padding: 16px; text-align: right; font-size: 11px; font-weight: 700; color: #6B6B6B; text-transform: uppercase;">Sick</th>
            <th style="padding: 16px; text-align: right; font-size: 11px; font-weight: 700; color: #6B6B6B; text-transform: uppercase;">Vacation</th>
            <th style="padding: 16px; text-align: right; font-size: 11px; font-weight: 700; color: #6B6B6B; text-transform: uppercase;">Hours</th>
            <th style="padding: 16px; text-align: right; font-size: 11px; font-weight: 700; color: #6B6B6B; text-transform: uppercase;">Decimal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.bookkeeperEmail,
    subject: `Timesheet Report: ${data.periodStart} - ${data.periodEnd}`,
    html,
  });
}

export async function sendMissingClockoutAlert(data: {
  employeeEmail: string;
  employeeName: string;
  date: string;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #FEF3C7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">⚠️</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Action required</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;">Hi ${data.employeeName},</p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        It looks like you didn't clock out on <strong>${data.date}</strong>.
      </p>
      <p style="margin: 0 0 24px; color: #484848; line-height: 1.6;">
        Please update your timecard so we can process your hours correctly.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${APP_URL}/admin/timesheet" style="display: inline-block; background: #2CA01C; color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">Fix my timecard</a>
      </div>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.employeeEmail,
    subject: `Action Required: Missing clock out on ${data.date}`,
    html,
  });
}

export async function sendChangeRequestNotification(data: {
  adminEmail: string;
  adminName: string;
  employeeName: string;
  date: string;
  requestSummary: string;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Time Adjustment Request</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.adminName},</p>
      <p style="margin: 0 0 24px; color: #484848; line-height: 1.6; font-size: 15px;">
        <strong>${data.employeeName}</strong> requested a time adjustment for <strong>${data.date}</strong>:
      </p>
      <div style="background: #F0EEE6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0; color: #263926; font-size: 15px; line-height: 1.6;">${data.requestSummary}</p>
      </div>
      <div style="text-align: center;">
        <a href="${APP_URL}/admin/timesheet" style="display: inline-block; background: #2CA01C; color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px;">Review Request</a>
      </div>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.adminEmail,
    subject: `Time Adjustment Request: ${data.employeeName} - ${data.date}`,
    html,
  });
}

export async function sendChangeApproval(data: {
  employeeEmail: string;
  employeeName: string;
  date: string;
  status: "approved" | "denied";
  adminNotes?: string;
}) {
  const isApproved = data.status === "approved";
  const emoji = isApproved ? "✅" : "❌";
  const bgColor = isApproved ? "#ECFDF5" : "#FEF2F2";
  const statusText = isApproved ? "approved" : "rejected";
  const statusColor = isApproved ? "#065F46" : "#991B1B";

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Timecard Update</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.employeeName},</p>
      <div style="background: ${bgColor}; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 16px; color: ${statusColor};">
          ${emoji} Your time adjustment for <strong>${data.date}</strong> has been <strong>${statusText}</strong>.
        </p>
      </div>
      ${data.adminNotes ? `<p style="margin: 0; color: #6B6B6B; font-size: 14px;"><strong>Note:</strong> ${data.adminNotes}</p>` : ""}
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.employeeEmail,
    subject: `Timecard ${isApproved ? "Approved" : "Update"}: ${data.date}`,
    html,
  });
}

export async function sendVacationRequestNotification(data: {
  adminEmail: string;
  adminName: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Vacation Request</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.adminName},</p>
      <p style="margin: 0 0 24px; color: #484848; line-height: 1.6;">
        <strong>${data.employeeName}</strong> has requested <strong>${data.totalDays} day${data.totalDays !== 1 ? "s" : ""}</strong> off.
      </p>
      <div style="background: #F0EEE6; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="margin: 0 0 8px; color: #263926; font-size: 15px;"><strong>Dates:</strong> ${data.startDate} to ${data.endDate}</p>
        ${data.reason ? `<p style="margin: 0; color: #6B6B6B; font-size: 14px;"><strong>Reason:</strong> ${data.reason}</p>` : ""}
      </div>
      <div style="text-align: center;">
        <a href="${APP_URL}/admin/timesheet" style="display: inline-block; background: #2CA01C; color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px;">Review Request</a>
      </div>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.adminEmail,
    subject: `Vacation Request: ${data.employeeName} (${data.totalDays} day${data.totalDays !== 1 ? "s" : ""})`,
    html,
  });
}

export async function sendVacationApproval(data: {
  employeeEmail: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  status: "approved" | "denied";
  reviewNote?: string;
}) {
  const isApproved = data.status === "approved";
  const emoji = isApproved ? "✅" : "❌";
  const bgColor = isApproved ? "#ECFDF5" : "#FEF2F2";
  const statusText = isApproved ? "approved" : "denied";
  const statusColor = isApproved ? "#065F46" : "#991B1B";

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Vacation ${isApproved ? "Approved" : "Update"}</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.employeeName},</p>
      <div style="background: ${bgColor}; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 16px; color: ${statusColor};">
          ${emoji} Your vacation request for <strong>${data.startDate} to ${data.endDate}</strong> has been <strong>${statusText}</strong>.
        </p>
      </div>
      ${data.reviewNote ? `<p style="margin: 0; color: #6B6B6B; font-size: 14px;"><strong>Note:</strong> ${data.reviewNote}</p>` : ""}
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.employeeEmail,
    subject: `Vacation ${isApproved ? "Approved" : "Update"}: ${data.startDate} - ${data.endDate}`,
    html,
  });
}

export async function sendPartialSickNotification(data: {
  adminEmail: string;
  adminName: string;
  employeeName: string;
  date: string;
  sickHours: number;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Partial Sick Day Request</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.adminName},</p>
      <p style="margin: 0 0 24px; color: #484848; line-height: 1.6;">
        <strong>${data.employeeName}</strong> worked a partial day on <strong>${data.date}</strong> and is requesting <strong>${data.sickHours}h</strong> of sick time.
      </p>
      <div style="text-align: center;">
        <a href="${APP_URL}/admin/timesheet" style="display: inline-block; background: #2CA01C; color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px;">Review Request</a>
      </div>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.adminEmail,
    subject: `Partial Sick Day: ${data.employeeName} - ${data.date} (${data.sickHours}h)`,
    html,
  });
}

export async function sendPartialSickApproval(data: {
  employeeEmail: string;
  employeeName: string;
  date: string;
  sickHours: number;
  status: "approved" | "denied";
  reviewNote?: string;
}) {
  const isApproved = data.status === "approved";
  const emoji = isApproved ? "✅" : "❌";
  const bgColor = isApproved ? "#ECFDF5" : "#FEF2F2";
  const statusText = isApproved ? "approved" : "denied";
  const statusColor = isApproved ? "#065F46" : "#991B1B";

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="margin: 0; font-size: 24px; color: #263926; font-weight: 700;">Sick Day ${isApproved ? "Approved" : "Update"}</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 16px;">Hi ${data.employeeName},</p>
      <div style="background: ${bgColor}; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <p style="margin: 0; font-size: 16px; color: ${statusColor};">
          ${emoji} Your partial sick day request for <strong>${data.date}</strong> (${data.sickHours}h) has been <strong>${statusText}</strong>.
        </p>
      </div>
      ${data.reviewNote ? `<p style="margin: 0; color: #6B6B6B; font-size: 14px;"><strong>Note:</strong> ${data.reviewNote}</p>` : ""}
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.employeeEmail,
    subject: `Sick Day ${isApproved ? "Approved" : "Update"}: ${data.date}`,
    html,
  });
}
