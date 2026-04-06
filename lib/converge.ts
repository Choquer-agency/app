import { XMLParser, XMLBuilder } from "fast-xml-parser";

const CONVERGE_API_URL =
  process.env.CONVERGE_API_URL ||
  "https://api.convergepay.com/VirtualMerchant/processxml.do";

const parser = new XMLParser();

export type ConvergeCurrency = "USD" | "CAD";

function getPinForCurrency(currency: ConvergeCurrency): string {
  if (currency === "CAD") {
    const pin = process.env.CONVERGE_PIN_CAD;
    if (!pin) throw new Error("CONVERGE_PIN_CAD not configured");
    return pin;
  }
  const pin = process.env.CONVERGE_PIN_USD;
  if (!pin) throw new Error("CONVERGE_PIN_USD not configured");
  return pin;
}

function getBaseCredentials() {
  const accountId = process.env.CONVERGE_MERCHANT_ID;
  const userId = process.env.CONVERGE_USER_ID;
  if (!accountId || !userId) {
    throw new Error("Converge credentials not configured (CONVERGE_MERCHANT_ID, CONVERGE_USER_ID)");
  }
  return { accountId, userId };
}

async function callConverge(
  fields: Record<string, string>,
  currency: ConvergeCurrency = "USD"
): Promise<Record<string, string>> {
  const base = getBaseCredentials();
  const pin = getPinForCurrency(currency);

  const xmlObj = {
    txn: {
      ssl_merchant_id: base.accountId,
      ssl_user_id: base.userId,
      ssl_pin: pin,
      ...fields,
    },
  };
  const builder = new XMLBuilder();
  const xmlBody = builder.build(xmlObj);

  const res = await fetch(CONVERGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `xmldata=${encodeURIComponent(xmlBody)}`,
  });

  if (!res.ok) {
    throw new Error(`Converge API error: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const parsed = parser.parse(text);
  // Converge wraps responses in <txn> root element
  return parsed.txn || parsed;
}

// --- Types ---

export interface ConvergeRecurringProfile {
  recurringId: string;
  status: string; // "Active" | "Suspended" | "Completed" | "Expired"
  cardLastFour: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  amount: number | null;
  billingCycle: string | null;
  nextPaymentDate: string | null;
  paymentsMade: number | null;
}

export interface ConvergeTransaction {
  txnId: string;
  terminal: ConvergeCurrency;
  status: "approved" | "declined" | "refund";
  resultMessage: string;
  transStatus: string; // STL = settled, PND = pending, etc.
  txnType: string; // "SALE" | "RETURN" etc.
  amount: number;
  refundedAmount: number;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  description: string | null;
  cardType: string | null;
  cardLastFour: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  recurringId: string | null;
  txnTime: string | null;
  settleTime: string | null;
  approvalCode: string | null;
}

export interface ConvergeStoredCard {
  token: string;
  cardLastFour: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  cardType: string | null;
  firstName: string | null;
  lastName: string | null;
}

// --- Parse helpers ---

function parseExpiry(expStr: string | undefined): { month: number; year: number } | null {
  if (!expStr) return null;
  const s = String(expStr).replace(/\D/g, "");
  if (s.length === 4) {
    // MMYY format
    const month = parseInt(s.substring(0, 2), 10);
    const year = 2000 + parseInt(s.substring(2, 4), 10);
    if (month >= 1 && month <= 12) return { month, year };
  }
  return null;
}

function parseCardLastFour(cardNumber: string | undefined): string | null {
  if (!cardNumber) return null;
  const digits = String(cardNumber).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

// --- Public API ---

export async function getRecurringProfile(
  recurringId: string,
  currency: ConvergeCurrency = "USD"
): Promise<ConvergeRecurringProfile> {
  const data = await callConverge(
    {
      ssl_transaction_type: "recurringquery",
      ssl_recurring_id: recurringId,
    },
    currency
  );

  const expiry = parseExpiry(data.ssl_exp_date);

  return {
    recurringId,
    status: data.ssl_recurring_status || "Unknown",
    cardLastFour: parseCardLastFour(data.ssl_card_number),
    cardExpiryMonth: expiry?.month ?? null,
    cardExpiryYear: expiry?.year ?? null,
    amount: data.ssl_amount ? parseFloat(data.ssl_amount) : null,
    billingCycle: data.ssl_billing_cycle || null,
    nextPaymentDate: data.ssl_next_payment_date || null,
    paymentsMade: data.ssl_payments_made ? parseInt(data.ssl_payments_made, 10) : null,
  };
}

export async function getStoredToken(
  token: string,
  currency: ConvergeCurrency = "USD"
): Promise<ConvergeStoredCard> {
  const data = await callConverge(
    {
      ssl_transaction_type: "ccgettoken",
      ssl_token: token,
    },
    currency
  );

  const expiry = parseExpiry(data.ssl_exp_date);

  return {
    token,
    cardLastFour: parseCardLastFour(data.ssl_card_number),
    cardExpiryMonth: expiry?.month ?? null,
    cardExpiryYear: expiry?.year ?? null,
    cardType: data.ssl_card_type || null,
    firstName: data.ssl_first_name || null,
    lastName: data.ssl_last_name || null,
  };
}

// --- Transaction queries ---

async function callConvergeRaw(
  fields: Record<string, string>,
  currency: ConvergeCurrency = "USD"
): Promise<string> {
  const base = getBaseCredentials();
  const pin = getPinForCurrency(currency);

  let xmlFields = `<ssl_merchant_id>${base.accountId}</ssl_merchant_id><ssl_user_id>${base.userId}</ssl_user_id><ssl_pin>${pin}</ssl_pin>`;
  for (const [k, v] of Object.entries(fields)) {
    xmlFields += `<${k}>${v}</${k}>`;
  }
  const xml = `<txn>${xmlFields}</txn>`;

  const res = await fetch(CONVERGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `xmldata=${encodeURIComponent(xml)}`,
  });

  if (!res.ok) {
    throw new Error(`Converge API error: ${res.status} ${res.statusText}`);
  }

  return await res.text();
}

function parseTxnList(rawXml: string, currency: ConvergeCurrency): ConvergeTransaction[] {
  // Parse with isArray hint so single txn still returns array
  const listParser = new XMLParser({ isArray: (name) => name === "txn" });
  const parsed = listParser.parse(rawXml);
  const txns = parsed?.txnlist?.txn || [];
  if (!Array.isArray(txns)) return [];

  return txns.map((t: any) => {
    const expiry = parseExpiry(String(t.ssl_exp_date || ""));
    const txnType = String(t.ssl_transaction_type || "SALE").toUpperCase();
    const isReturn = txnType === "RETURN";
    const isApproved = String(t.ssl_result_message || "").toUpperCase() === "APPROVAL";
    const refundedAmount = parseFloat(t.ssl_refunded_amount || "0") || 0;

    let status: "approved" | "declined" | "refund";
    if (isReturn) {
      status = "refund";
    } else if (isApproved) {
      status = "approved";
    } else {
      status = "declined";
    }

    return {
      txnId: String(t.ssl_txn_id || ""),
      terminal: currency,
      status,
      resultMessage: String(t.ssl_result_message || t.ssl_description || ""),
      transStatus: String(t.ssl_trans_status || ""),
      txnType,
      amount: parseFloat(t.ssl_amount) || 0,
      refundedAmount,
      firstName: t.ssl_first_name ? String(t.ssl_first_name) : null,
      lastName: t.ssl_last_name ? String(t.ssl_last_name) : null,
      company: t.ssl_company ? String(t.ssl_company) : null,
      description: t.ssl_description ? String(t.ssl_description) : null,
      cardType: t.ssl_card_short_description ? String(t.ssl_card_short_description) : null,
      cardLastFour: parseCardLastFour(String(t.ssl_card_number || "")),
      cardExpiryMonth: expiry?.month ?? null,
      cardExpiryYear: expiry?.year ?? null,
      recurringId: t.ssl_recurring_id ? String(t.ssl_recurring_id) : null,
      txnTime: t.ssl_txn_time ? String(t.ssl_txn_time) : null,
      settleTime: t.ssl_settle_time ? String(t.ssl_settle_time) : null,
      approvalCode: t.ssl_approval_code ? String(t.ssl_approval_code) : null,
    };
  });
}

export async function getTransactions(
  startDate: string, // MM/DD/YYYY format for Converge
  endDate?: string,
): Promise<ConvergeTransaction[]> {
  const allTxns: ConvergeTransaction[] = [];

  for (const currency of ["USD", "CAD"] as ConvergeCurrency[]) {
    try {
      const fields: Record<string, string> = {
        ssl_transaction_type: "txnquery",
        ssl_search_start_date: startDate,
      };
      if (endDate) fields.ssl_search_end_date = endDate;

      const raw = await callConvergeRaw(fields, currency);

      // Check for error
      if (raw.includes("<errorCode>")) continue;

      const txns = parseTxnList(raw, currency);
      allTxns.push(...txns);
    } catch (err) {
      console.error(`[converge] Error fetching ${currency} transactions:`, err);
    }
  }

  // Sort by time descending (most recent first)
  allTxns.sort((a, b) => {
    const ta = a.txnTime ? new Date(a.txnTime).getTime() : 0;
    const tb = b.txnTime ? new Date(b.txnTime).getTime() : 0;
    return tb - ta;
  });

  return allTxns;
}
