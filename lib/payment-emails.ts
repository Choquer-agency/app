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

// --- Client-facing emails ---

export async function sendPaymentFailedEmail(data: {
  contactEmail: string;
  contactName: string;
  failureCount: number;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #FEF3C7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">⚠️</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Payment could not be processed</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;">Hey ${data.contactName},</p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        We attempted to process your monthly payment, but the charge was declined by your card provider.
      </p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        <strong>No action is needed right now.</strong> Our system will automatically retry the charge tomorrow. If there's an issue with your card (expired, insufficient funds, etc.), please update your payment information at your earliest convenience.
      </p>
      <p style="margin: 0; color: #484848; line-height: 1.6;">
        If you have any questions, just reply to this email or reach out to your account specialist.
      </p>
      <p style="margin: 24px 0 0; color: #263926;">Cheers,<br/>Choquer Agency</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.contactEmail,
    subject: "Your payment could not be processed",
    html,
  });
}

export async function sendPaymentSuspendedEmail(data: {
  contactEmail: string;
  contactName: string;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #FEE2E2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">🚨</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Your recurring payment has been suspended</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;">Hey ${data.contactName},</p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        After multiple attempts, we were unable to process your monthly payment. As a result, your recurring payment has been temporarily suspended.
      </p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        <strong>Please contact us as soon as possible</strong> so we can update your payment information and get everything back on track. You can reply to this email or reach out to your account specialist directly.
      </p>
      <p style="margin: 0; color: #484848; line-height: 1.6;">
        We want to make sure there's no interruption to your services — the sooner we hear from you, the better.
      </p>
      <p style="margin: 24px 0 0; color: #263926;">Cheers,<br/>Choquer Agency</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.contactEmail,
    subject: "Action needed: Your recurring payment has been suspended",
    html,
  });
}

export async function sendPaymentReminderEmail(data: {
  contactEmail: string;
  contactName: string;
  daysSinceFailure: number;
}) {
  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #FEF3C7; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">📋</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Friendly reminder: Payment update needed</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;">Hey ${data.contactName},</p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        Just following up — your recurring payment is still on hold and we haven't received updated payment information yet. It's been ${data.daysSinceFailure} days since the original payment issue.
      </p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        Please reply to this email or contact your account specialist so we can update your card on file and resume your services without interruption.
      </p>
      <p style="margin: 24px 0 0; color: #263926;">Cheers,<br/>Choquer Agency</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.contactEmail,
    subject: "Reminder: We need your updated payment information",
    html,
  });
}

export async function sendCardExpiryWarningEmail(data: {
  contactEmail: string;
  contactName: string;
  expiryMonth: number;
  expiryYear: number;
}) {
  const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const expiryLabel = `${monthNames[data.expiryMonth]} ${data.expiryYear}`;

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #DBEAFE; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">💳</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">Your card on file expires soon</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;">Hey ${data.contactName},</p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        The credit card we have on file for your account expires in <strong>${expiryLabel}</strong>.
      </p>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        To avoid any interruption to your services, please reach out to us with your updated card information before it expires. You can reply to this email or contact your account specialist directly.
      </p>
      <p style="margin: 0; color: #484848; line-height: 1.6;">
        If you've already updated your card, no worries — you can disregard this message.
      </p>
      <p style="margin: 24px 0 0; color: #263926;">Cheers,<br/>Choquer Agency</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.contactEmail,
    subject: `Heads up: Your card on file expires ${expiryLabel}`,
    html,
  });
}

// --- Internal CEO email ---

export async function sendPaymentEscalationEmail(data: {
  ceoEmail: string;
  clientName: string;
  mrr: number | null;
  amount: number | null;
  profileLabel?: string;
}) {
  const mrrDisplay = data.mrr ? `$${data.mrr.toLocaleString()}` : "Unknown";
  const amountDisplay = data.amount ? `$${data.amount.toLocaleString()}` : "Unknown";

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #FEE2E2; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">🚨</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #DC2626; font-weight: 700;">PAYMENT FAILURE ALERT</h1>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 2px solid #FCA5A5;">
      <p style="margin: 0 0 16px; color: #263926; font-size: 18px;"><strong>${data.clientName}</strong> — payment suspended by Converge</p>
      <div style="background: #FEF2F2; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6B6B6B; font-size: 14px;">Recurring Amount</td>
            <td style="padding: 8px 0; text-align: right; color: #263926; font-weight: 600; font-size: 16px;">${amountDisplay}/mo</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B6B6B; font-size: 14px;">Client MRR</td>
            <td style="padding: 8px 0; text-align: right; color: #263926; font-weight: 600; font-size: 16px;">${mrrDisplay}/mo</td>
          </tr>
          ${data.profileLabel ? `<tr><td style="padding: 8px 0; color: #6B6B6B; font-size: 14px;">Profile</td><td style="padding: 8px 0; text-align: right; color: #263926; font-size: 14px;">${data.profileLabel}</td></tr>` : ""}
        </table>
      </div>
      <p style="margin: 0 0 16px; color: #484848; line-height: 1.6;">
        Converge has exhausted all retry attempts and suspended the recurring payment. An urgent ticket has been created.
      </p>
      <p style="margin: 0 0 16px; color: #DC2626; font-weight: 600;">
        Update this client's card before the end of the month to avoid losing another month of revenue.
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${APP_URL}/admin/crm" style="display: inline-block; background: #DC2626; color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 600; font-size: 16px;">View in CRM</a>
      </div>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.ceoEmail,
    subject: `🚨 PAYMENT ALERT: ${data.clientName} — Converge suspended`,
    html,
  });
}

// --- Accountant notification for new clients ---

export async function sendNewClientAccountantEmail(data: {
  accountantEmail: string;
  clientName: string;
  contactName?: string;
  contactEmail?: string;
  packageName?: string;
  amount: number;
  currency: string;
  billingFrequency: string;
  country: string;
  addedBy: string;
}) {
  const freqLabel =
    data.billingFrequency === "monthly"
      ? "Monthly"
      : data.billingFrequency === "annually"
        ? "Annually"
        : data.billingFrequency || "Monthly";

  const html = baseTemplate(`
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 64px; height: 64px; background: #DBEAFE; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <span style="font-size: 32px;">🆕</span>
      </div>
      <h1 style="margin: 0; font-size: 28px; color: #263926; font-weight: 700;">New Client Setup</h1>
      <p style="margin: 8px 0 0; color: #6B6B6B; font-size: 16px;">Please set up invoicing in QuickBooks</p>
    </div>
    <div style="background: white; border-radius: 16px; padding: 32px; margin-bottom: 24px; border: 1px solid #F6F5F1;">
      <div style="background: #F0F9FF; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Company</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-weight: 700; font-size: 18px;">${data.clientName}</td>
          </tr>
          <tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Package</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-weight: 600; font-size: 14px;">${data.packageName || "Custom"}</td>
          </tr>
          <tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Amount</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-weight: 700; font-size: 18px;">$${data.amount.toLocaleString()} ${data.currency}</td>
          </tr>
          <tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Billing Frequency</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-size: 14px;">${freqLabel}</td>
          </tr>
          <tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Country</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-size: 14px;">${data.country}</td>
          </tr>
          ${data.contactName ? `<tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Contact Name</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-size: 14px;">${data.contactName}</td>
          </tr>` : ""}
          ${data.contactEmail ? `<tr style="border-top: 1px solid #E0F2FE;">
            <td style="padding: 10px 0; color: #6B6B6B; font-size: 14px;">Contact Email</td>
            <td style="padding: 10px 0; text-align: right; color: #263926; font-size: 14px;"><a href="mailto:${data.contactEmail}" style="color: #2563EB;">${data.contactEmail}</a></td>
          </tr>` : ""}
        </table>
      </div>
      <p style="margin: 0; color: #484848; line-height: 1.6; font-size: 14px;">
        Please create the recurring invoice in QuickBooks for this client. The first payment has already been processed through Converge.
      </p>
      <p style="margin: 16px 0 0; color: #9CA3AF; font-size: 12px;">Added by ${data.addedBy}</p>
    </div>
  `);

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: data.accountantEmail,
    subject: `New Client: ${data.clientName} — $${data.amount.toLocaleString()} ${data.currency}/${freqLabel.toLowerCase()}`,
    html,
  });
}
