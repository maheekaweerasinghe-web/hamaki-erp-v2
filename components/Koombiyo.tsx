"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type LookupRow = {
  order_id: string;
  order_no: string;
  order_date: string | null;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  address: string | null;
  city: string | null;
  product_summary: string | null;
  balance: number | null;
  hamaki_status: string | null;
  dispatched_at: string | null;
  koombiyo_waybill_id: string | null;
  koombiyo_status: string | null;
  koombiyo_status_updated_at: string | null;
};

type Overview = {
  labels_created: number;
  awaiting_dispatch_scan: number;
  dispatched_today: number;
  total_koombiyo_orders: number;
};

type Props = {
  currentUserId: string;
  formatDateTime: (value?: string | null) => string;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};

export default function Koombiyo({
  currentUserId,
  formatDateTime,
  showSuccess,
  showError,
  showInfo,
}: Props) {
  const [subTab, setSubTab] = useState<"overview" | "status">("overview");
  const [overview, setOverview] = useState<Overview>({
    labels_created: 0,
    awaiting_dispatch_scan: 0,
    dispatched_today: 0,
    total_koombiyo_orders: 0,
  });

  const [scanValue, setScanValue] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<any>(null);
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [scannerLive, setScannerLive] = useState<any>(null);
  const [scannerLiveLoading, setScannerLiveLoading] = useState(false);
  const scanRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveResult, setLiveResult] = useState<any>(null);

  useEffect(() => {
    void loadOverview();
    void loadRecentScans();
  }, []);

  useEffect(() => {
    if (subTab !== "overview") return;
    const t = window.setTimeout(() => {
      scanRef.current?.focus();
      scanRef.current?.select();
    }, 100);
    return () => window.clearTimeout(t);
  }, [subTab]);

  async function loadOverview() {
    const { data, error } = await supabase.rpc("get_koombiyo_overview");
    if (error) {
      console.error("Koombiyo overview error:", error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setOverview({
      labels_created: Number(row?.labels_created || 0),
      awaiting_dispatch_scan: Number(row?.awaiting_dispatch_scan || 0),
      dispatched_today: Number(row?.dispatched_today || 0),
      total_koombiyo_orders: Number(row?.total_koombiyo_orders || 0),
    });
  }

  async function loadRecentScans() {
    const { data, error } = await supabase.rpc("get_recent_dispatch_scans", { p_limit: 10 });
    if (!error) setRecentScans(data || []);
  }


  async function loadScannerLiveStatus(waybillId: string) {
    if (!waybillId) {
      setScannerLive(null);
      return;
    }

    try {
      setScannerLiveLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch("/api/koombiyo/order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ waybill_id: waybillId }),
      });

      const result = await response.json();

      if (response.ok) {
        setScannerLive({
          waybill_id: waybillId,
          details: result?.details || null,
          timeline: result?.timeline || [],
        });
      } else {
        setScannerLive({
          waybill_id: waybillId,
          error: result?.message || "Live status unavailable",
        });
      }
    } catch (err: any) {
      setScannerLive({
        waybill_id: waybillId,
        error: err?.message || "Live status unavailable",
      });
    } finally {
      setScannerLiveLoading(false);
    }
  }

  async function handleScan() {
    const waybill = scanValue.trim();
    if (!waybill || scanning) return;

    try {
      setScanning(true);

      const { data, error } = await supabase.rpc("dispatch_order_by_waybill", {
        p_waybill_id: waybill,
        p_action_by_user_id: currentUserId,
      });

      if (error) {
        showError("Dispatch scan failed: " + error.message);
        setLastScan({ result: "ERROR", waybill_id: waybill, message: error.message });
        return;
      }

      const result = Array.isArray(data) ? data[0] : data;
      setLastScan({ ...result, waybill_id: waybill });

      if (result?.result === "DISPATCHED") {
        showSuccess(`Dispatched ✅ ${result.order_no}`);
      } else if (result?.result === "ALREADY_DISPATCHED") {
        showInfo(`Already dispatched: ${result.order_no}`);
      } else if (result?.result === "NOT_FOUND") {
        showError(`Waybill not found: ${waybill}`);
      } else {
        showError(`Cannot dispatch parcel. Status: ${result?.current_status || "unknown"}`);
      }

      await Promise.all([loadOverview(), loadRecentScans()]);

      if (result?.order_no && waybill) {
        void loadScannerLiveStatus(waybill);
      }
    } catch (err: any) {
      showError("Dispatch scan failed: " + (err?.message || "Unknown error"));
    } finally {
      setScanValue("");
      setScanning(false);
      window.setTimeout(() => scanRef.current?.focus(), 50);
    }
  }

  async function searchOrders() {
    const q = query.trim();
    if (!q) {
      setRows([]);
      setLiveResult(null);
      return;
    }

    try {
      setSearching(true);
      setLiveResult(null);

      const { data, error } = await supabase.rpc("get_koombiyo_order_lookup", {
        p_query: q,
        p_limit: 50,
      });

      if (error) {
        showError("Order lookup failed: " + error.message);
        return;
      }

      setRows((data || []) as LookupRow[]);
    } finally {
      setSearching(false);
    }
  }

  async function fetchLive(row: LookupRow) {
    if (!row.koombiyo_waybill_id) {
      showError("This Hamaki order does not have a Koombiyo waybill yet.");
      return;
    }

    try {
      setLiveLoading(true);
      setLiveResult(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        showError("No active session");
        return;
      }

      const response = await fetch("/api/koombiyo/order-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ waybill_id: row.koombiyo_waybill_id }),
      });

      const result = await response.json();

      if (!response.ok) {
        showError(result?.message || "Koombiyo live status failed");
        return;
      }

      setLiveResult({
        hamaki: row,
        koombiyo: result.details,
        timeline: result.timeline || [],
      });
    } catch (err: any) {
      showError("Koombiyo live status failed: " + (err?.message || "Unknown error"));
    } finally {
      setLiveLoading(false);
    }
  }

  return (
    <div className="soft-card mt-4 p-5">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[var(--text)]">Koombiyo</h2>
          <div className="mt-1 text-sm text-[var(--muted)]">
            Courier operations, physical dispatch verification and customer order tracking.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className={subTab === "overview" ? "primary-btn" : "secondary-btn"}
            onClick={() => setSubTab("overview")}
          >
            Overview
          </button>
          <button
            className={subTab === "status" ? "primary-btn" : "secondary-btn"}
            onClick={() => setSubTab("status")}
          >
            Order Status
          </button>
        </div>
      </div>

      {subTab === "overview" && (
        <div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
              <div className="text-sm text-[var(--muted)]">Koombiyo Orders</div>
              <div className="mt-2 text-[28px] font-extrabold">{overview.total_koombiyo_orders}</div>
            </div>
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
              <div className="text-sm text-[var(--muted)]">Labels Created Today</div>
              <div className="mt-2 text-[28px] font-extrabold">{overview.labels_created}</div>
            </div>
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
              <div className="text-sm text-[var(--muted)]">Awaiting Dispatch Scan</div>
              <div className="mt-2 text-[28px] font-extrabold">{overview.awaiting_dispatch_scan}</div>
            </div>
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
              <div className="text-sm text-[var(--muted)]">Dispatched Today</div>
              <div className="mt-2 text-[28px] font-extrabold">{overview.dispatched_today}</div>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-[#cbd5e1] bg-white p-5">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.15fr_.85fr]">
              <div>
                <div className="text-[19px] font-extrabold">Dispatch Scanner</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Scan the Koombiyo barcode after the packed parcel is physically ready to leave.
                </div>

                <div className="mt-4">
                  <label className="soft-label">Waybill Barcode</label>
                  <input
                    ref={scanRef}
                    className="soft-input h-[52px] text-center text-[24px] font-extrabold"
                    value={scanValue}
                    onChange={(e) => setScanValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleScan();
                      }
                    }}
                    placeholder="Scanner ready..."
                    autoComplete="off"
                    disabled={scanning}
                  />
                </div>

                {lastScan && (
                  <div
                    className={`mt-4 rounded-[16px] border p-4 ${
                      lastScan.result === "DISPATCHED"
                        ? "border-[#86efac] bg-[#f0fdf4]"
                        : lastScan.result === "ALREADY_DISPATCHED"
                          ? "border-[#fde68a] bg-[#fffbeb]"
                          : "border-[#fecaca] bg-[#fef2f2]"
                    }`}
                  >
                    <div className="text-[21px] font-extrabold">
                      {lastScan.result === "DISPATCHED"
                        ? "✓ DISPATCHED"
                        : lastScan.result === "ALREADY_DISPATCHED"
                          ? "⚠ ALREADY DISPATCHED"
                          : "✕ CHECK PARCEL"}
                    </div>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div><b>Waybill:</b> {lastScan.waybill_id || "-"}</div>
                      <div><b>Order:</b> {lastScan.order_no || "-"}</div>
                      <div><b>Customer:</b> {lastScan.customer_name || "-"}</div>
                      <div><b>Hamaki Status:</b> {lastScan.current_status || lastScan.result}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-full rounded-[16px] border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <div className="text-[19px] font-extrabold">Live Status</div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Latest Koombiyo status for the parcel just scanned.
                </div>

                {scannerLiveLoading ? (
                  <div className="mt-5 text-sm text-[var(--muted)]">Loading live status...</div>
                ) : scannerLive ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="text-xs text-[var(--muted)]">Waybill</div>
                      <div className="font-bold">{scannerLive.waybill_id}</div>
                    </div>

                    {scannerLive.error ? (
                      <div className="rounded-[12px] border border-[#fde68a] bg-[#fffbeb] p-3 text-sm">
                        {scannerLive.error}
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-xs text-[var(--muted)]">Koombiyo Status</div>
                          <div className="text-[18px] font-extrabold">
                            {scannerLive.details?.order_details?.order_status || "-"}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-[var(--muted)]">Destination</div>
                            <div className="font-semibold">
                              {scannerLive.details?.branch_details?.destination_branch || "-"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-[var(--muted)]">COD</div>
                            <div className="font-semibold">
                              {scannerLive.details?.order_details?.collected_cod || "-"}
                            </div>
                          </div>
                        </div>

                        {Array.isArray(scannerLive.timeline) && scannerLive.timeline[0] ? (
                          <div className="rounded-[12px] border border-[#e2e8f0] bg-white p-3">
                            <div className="text-xs font-bold text-[var(--muted)]">Latest Update</div>
                            <div className="mt-1 font-bold">
                              {scannerLive.timeline[0]?.order_status ||
                                scannerLive.timeline[0]?.status ||
                                scannerLive.timeline[0]?.status_name ||
                                "Status update"}
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted)]">
                              {[
                                scannerLive.timeline[0]?.branch_name,
                                scannerLive.timeline[0]?.reason,
                                scannerLive.timeline[0]?.remarks,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "-"}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 rounded-[12px] border border-dashed border-[#cbd5e1] bg-white p-4 text-sm text-[var(--muted)]">
                    Scan a parcel to show its live Koombiyo status here.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-[#e2e8f0] pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[19px] font-extrabold">Recent Scans</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    Latest physical dispatch verification activity.
                  </div>
                </div>
              </div>

              {recentScans.length === 0 ? (
                <div className="rounded-[14px] border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm text-[var(--muted)]">
                  No dispatch scans yet.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[14px] border border-[#e5e7eb]">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Order</th>
                        <th>Customer</th>
                        <th>Waybill</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentScans.map((scan: any, index: number) => (
                        <tr key={`${scan.scanned_at}-${index}`}>
                          <td>{formatDateTime(scan.scanned_at)}</td>
                          <td className="font-bold">{scan.order_no || "-"}</td>
                          <td>{scan.customer_name || "-"}</td>
                          <td>{scan.waybill_id}</td>
                          <td className="font-bold">{scan.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === "status" && (
        <div>
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className="soft-label">Phone / Hamaki Order No / Koombiyo Waybill</label>
              <input
                className="soft-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchOrders();
                }}
                placeholder="e.g. 0771234567, S1-260905-0050 or 457824873"
              />
            </div>
            <button className="primary-btn" onClick={() => void searchOrders()} disabled={searching}>
              {searching ? "Searching..." : "Search"}
            </button>
          </div>

          {rows.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>City</th>
                    <th>Products</th>
                    <th>Hamaki</th>
                    <th>Waybill</th>
                    <th>Koombiyo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.order_id}>
                      <td className="font-bold">{row.order_no}</td>
                      <td>{row.customer_name || "-"}</td>
                      <td>{row.phone_primary || row.phone_secondary || "-"}</td>
                      <td>{row.city || "-"}</td>
                      <td>{row.product_summary || "-"}</td>
                      <td>{row.hamaki_status || "-"}</td>
                      <td>{row.koombiyo_waybill_id || "-"}</td>
                      <td>{row.koombiyo_status || "-"}</td>
                      <td>
                        <button
                          className="secondary-btn"
                          disabled={!row.koombiyo_waybill_id || liveLoading}
                          onClick={() => void fetchLive(row)}
                        >
                          Live Status
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {liveLoading && (
            <div className="mt-5 rounded-[16px] border border-[#d7dee8] bg-white p-4">
              Loading live Koombiyo status...
            </div>
          )}

          {liveResult && !liveLoading && (
            <div className="mt-5 rounded-[16px] border border-[#d7dee8] bg-white p-5">
              <div className="text-[20px] font-bold">
                {liveResult.hamaki.order_no} · {liveResult.hamaki.customer_name || "-"}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div><b>Waybill:</b> {liveResult.hamaki.koombiyo_waybill_id}</div>
                <div><b>Live Status:</b> {liveResult.koombiyo?.order_details?.order_status || "-"}</div>
                <div><b>Collected COD:</b> {liveResult.koombiyo?.order_details?.collected_cod || "-"}</div>
                <div><b>Destination:</b> {liveResult.koombiyo?.branch_details?.destination_branch || "-"}</div>
                <div><b>Weight:</b> {liveResult.koombiyo?.order_details?.weight || "-"}</div>
                <div><b>Notification:</b> {liveResult.koombiyo?.order_details?.notification || "-"}</div>
              </div>

              <div className="mt-6 text-[18px] font-bold">Timeline</div>

              {Array.isArray(liveResult.timeline) && liveResult.timeline.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {liveResult.timeline.map((event: any, index: number) => (
                    <div
                      key={`${event?.status_date || "event"}-${index}`}
                      className="rounded-[12px] border border-[#e5e7eb] bg-[#f8fafc] p-3"
                    >
                      <div className="font-bold">
                        {event?.order_status || event?.status || event?.status_name || "Status update"}
                      </div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {[event?.branch_name, event?.reason, event?.remarks].filter(Boolean).join(" · ") || "-"}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {formatDateTime(event?.status_date || event?.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-[var(--muted)]">No timeline returned.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
