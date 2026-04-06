const mid = process.env.CONVERGE_MERCHANT_ID;
const uid = process.env.CONVERGE_USER_ID;
const pinUSD = process.env.CONVERGE_PIN_USD;
const pinCAD = process.env.CONVERGE_PIN_CAD;

const url = "https://api.convergepay.com/VirtualMerchant/processxml.do";

async function callConverge(pin: string, txnType: string, extra: Record<string, string> = {}) {
  let fields = `<ssl_merchant_id>${mid}</ssl_merchant_id><ssl_user_id>${uid}</ssl_user_id><ssl_pin>${pin}</ssl_pin><ssl_transaction_type>${txnType}</ssl_transaction_type>`;
  for (const [k, v] of Object.entries(extra)) {
    fields += `<${k}>${v}</${k}>`;
  }
  const xml = `<txn>${fields}</txn>`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "xmldata=" + encodeURIComponent(xml),
  });
  return await res.text();
}

async function main() {
  console.log("Account:", mid);
  console.log("User:", uid);
  console.log("PIN USD:", pinUSD ? pinUSD.substring(0, 6) + "..." : "MISSING");
  console.log("PIN CAD:", pinCAD ? pinCAD.substring(0, 6) + "..." : "MISSING");
  console.log("");

  if (!mid || !uid || !pinUSD) {
    console.log("Missing credentials!");
    return;
  }

  // Test 1: ccgetrecurring on USD terminal
  console.log("=== Test: ccgetrecurring (USD, ID=1) ===");
  console.log(await callConverge(pinUSD, "ccgetrecurring", { ssl_recurring_id: "1" }));
  console.log("");

  // Test 2: txnquery on USD terminal
  console.log("=== Test: txnquery (USD) ===");
  console.log(await callConverge(pinUSD, "txnquery", { ssl_txn_id: "1" }));
  console.log("");

  // Test 3: ccgetrecurring on CAD terminal
  if (pinCAD) {
    console.log("=== Test: ccgetrecurring (CAD, ID=1) ===");
    console.log(await callConverge(pinCAD, "ccgetrecurring", { ssl_recurring_id: "1" }));
    console.log("");
  }

  // Test 4: Try ccrecurringquery (alternative name)
  console.log("=== Test: ccrecurringquery (USD) ===");
  console.log(await callConverge(pinUSD, "ccrecurringquery", { ssl_recurring_id: "1" }));
}

main();
