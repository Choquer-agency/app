"use client";

import { useState, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface Props {
  webhookUrl: string;
}

const SECRET_PLACEHOLDER = "••••••••••••••••••••••••";

export default function MetaAdsSettings({ webhookUrl }: Props) {
  const status = useQuery(api.metaConfig.getStatus);
  const saveConfig = useAction(api.metaConfigNode.save);
  const sendTestEvent = useAction(api.metaConfigNode.sendTestEvent);

  const [pixelId, setPixelId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; fbTraceId?: string; testMode?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  // Seed form fields from loaded config. Don't overwrite secrets if user has typed.
  useEffect(() => {
    if (!status) return;
    setPixelId(status.pixelId ?? "");
    setVerifyToken(status.verifyToken ?? "");
    setTestEventCode(status.testEventCode ?? "");
    setEnabled(status.enabled);
  }, [status]);

  function generateVerifyToken() {
    // 32-char hex random string is easy to paste into Meta's webhook config.
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    setVerifyToken(Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join(""));
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveConfig({
        pixelId: pixelId.trim() || undefined,
        verifyToken: verifyToken.trim() || undefined,
        testEventCode: testEventCode.trim() || undefined,
        enabled,
        // undefined = leave as-is; "" = clear; "x" = set/overwrite
        accessToken: accessToken === "" ? undefined : accessToken,
        appSecret: appSecret === "" ? undefined : appSecret,
        pageAccessToken: pageAccessToken === "" ? undefined : pageAccessToken,
      });
      setSaveMsg({ type: "success", text: "Saved" });
      // Clear secret fields after save so they don't sit in the DOM
      setAccessToken("");
      setAppSecret("");
      setPageAccessToken("");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg({ type: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await sendTestEvent({});
      if (result.success) {
        setTestResult({
          success: true,
          message: result.testMode
            ? "Sent as test event — check Events Manager → Test Events."
            : "Sent live — check Events Manager → Overview.",
          fbTraceId: result.fbTraceId,
          testMode: result.testMode,
        });
      } else {
        setTestResult({ success: false, message: result.error ?? "Send failed" });
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  function copyWebhookUrl() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const loading = status === undefined;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {!loading && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.configured && status.enabled && status.hasAccessToken && status.pixelId
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : status.configured
              ? "bg-yellow-50 border-yellow-200 text-yellow-800"
              : "bg-gray-50 border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          {status.configured && status.enabled && status.hasAccessToken && status.pixelId
            ? "Meta Ads integration is live. Events will send automatically when leads are qualified or converted."
            : status.configured
            ? "Config partially complete. Fill in remaining fields and enable the integration to start sending events."
            : "Not configured yet. Fill in your Pixel ID and access tokens below to activate Meta Ads tracking."}
        </div>
      )}

      {/* Webhook URL for Meta setup */}
      <div className="rounded-lg border border-[var(--border)] bg-white p-4">
        <div className="text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
          Webhook URL
        </div>
        <p className="text-xs text-[var(--muted)] mb-2">
          Paste this into the Webhooks section of your Meta App when subscribing to{" "}
          <span className="font-mono text-[11px]">leadgen</span> events.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 text-xs bg-gray-50 border border-[var(--border)] rounded font-mono break-all">
            {webhookUrl || "(NEXT_PUBLIC_CONVEX_SITE_URL not set)"}
          </code>
          <button
            onClick={copyWebhookUrl}
            disabled={!webhookUrl}
            className="px-3 py-2 text-xs font-medium border border-[var(--border)] rounded hover:bg-gray-50 transition disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* Configuration form */}
      <div className="rounded-lg border border-[var(--border)] bg-white p-5 space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wide">
              Enabled
            </label>
            <button
              onClick={() => setEnabled((e) => !e)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                enabled ? "bg-emerald-500" : "bg-gray-300"
              }`}
              aria-pressed={enabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  enabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            When off, events are silently skipped. Useful for pausing without clearing credentials.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
            Pixel ID
          </label>
          <p className="text-[11px] text-[var(--muted)] mb-1.5">
            From Events Manager → Settings. A ~15-digit number.
          </p>
          <input
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
            placeholder="1234567890123456"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
            Conversions API Access Token
          </label>
          <p className="text-[11px] text-[var(--muted)] mb-1.5">
            Events Manager → Settings → Conversions API → Generate access token.
            {status?.hasAccessToken && " A token is saved. Leave blank to keep it; paste a new one to replace."}
          </p>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
            placeholder={status?.hasAccessToken ? SECRET_PLACEHOLDER : "EAAxxxxxxxx..."}
          />
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Lead Ads Webhook</h3>
          <p className="text-[11px] text-[var(--muted)] mb-4">
            Only needed if you're running Meta Lead Ads forms. The webhook automatically imports leads into the CRM.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
                App Secret
              </label>
              <p className="text-[11px] text-[var(--muted)] mb-1.5">
                From your Meta App → Settings → Basic → App Secret. Used to verify that webhook requests come from Meta.
                {status?.hasAppSecret && " A secret is saved. Leave blank to keep it."}
              </p>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
                placeholder={status?.hasAppSecret ? SECRET_PLACEHOLDER : "32-char hex"}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
                Page Access Token
              </label>
              <p className="text-[11px] text-[var(--muted)] mb-1.5">
                Long-lived token with <span className="font-mono text-[10px]">leads_retrieval</span> permission for the Facebook page running the ads.
                {status?.hasPageAccessToken && " A token is saved. Leave blank to keep it."}
              </p>
              <input
                type="password"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
                placeholder={status?.hasPageAccessToken ? SECRET_PLACEHOLDER : "EAAxxxxxxxx..."}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wide">
                  Verify Token
                </label>
                <button
                  type="button"
                  onClick={generateVerifyToken}
                  className="text-[11px] text-[var(--accent)] hover:underline"
                >
                  Generate random
                </button>
              </div>
              <p className="text-[11px] text-[var(--muted)] mb-1.5">
                A string you choose — Meta echoes it back when setting up the webhook. Paste the same value on both sides.
              </p>
              <input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
                placeholder="any-random-string"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--border)] pt-5">
          <label className="block text-xs font-semibold text-[var(--foreground)] mb-1 uppercase tracking-wide">
            Test Event Code <span className="text-[var(--muted)] normal-case">(optional)</span>
          </label>
          <p className="text-[11px] text-[var(--muted)] mb-1.5">
            If set, events route to Events Manager → Test Events instead of going live. Clear this once verified to send real events.
          </p>
          <input
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)] font-mono"
            placeholder="TEST12345"
          />
        </div>
      </div>

      {/* Save + Test actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--accent)] rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !status?.hasAccessToken || !status?.pixelId}
          title={!status?.hasAccessToken || !status?.pixelId ? "Save Pixel ID + Access Token first" : undefined}
          className="px-4 py-2 text-sm font-medium border border-[var(--border)] rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
        >
          {testing ? "Sending..." : "Send Test Event"}
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
            {saveMsg.text}
          </span>
        )}
      </div>

      {testResult && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            testResult.success
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="font-semibold mb-0.5">
            {testResult.success ? "Test sent" : "Test failed"}
          </div>
          <div className="text-xs">{testResult.message}</div>
          {testResult.fbTraceId && (
            <div className="text-[11px] font-mono mt-1 opacity-70">trace: {testResult.fbTraceId}</div>
          )}
        </div>
      )}

      {status?.configured && (
        <p className="text-[11px] text-[var(--muted)]">
          Last updated{" "}
          {status.updatedAt
            ? new Date(status.updatedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "—"}
        </p>
      )}
    </div>
  );
}
