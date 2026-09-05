"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import KoombiyoCityPicker from "@/components/KoombiyoCityPicker";

type Product = {
  id: string;
  sku: string;
  product_type: string;
  material: string;
  color: string;
  size: string;
  selling_price: number;
};

type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  sales_code: string;
  is_active: boolean;
};

type PendingRow = {
  order_id: string;
  order_date: string;
  created_at: string;
  order_no: string;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  address: string | null;
  city: string | null;
  product_summary: string | null;
  balance: number;
  koombiyo_waybill_id: string | null;
  koombiyo_city_id: string | null;
  koombiyo_city_name: string | null;
  koombiyo_district_id: string | null;
  koombiyo_district_name: string | null;
  koombiyo_order_created_at: string | null;
};

type EditItem = {
  product_id: string;
  sku_snapshot: string;
  product_type_snapshot: string;
  material_snapshot: string;
  color_snapshot: string;
  size_snapshot: string;
  qty: number;
  unit_price: number;
  extra_addon: string;
  extra_price: number;
  discount: number;
  line_total: number;
};

type District = { district_id: string; district_name: string };
type City = { city_id: string; city_name: string; postal_code?: string | null };

type EditState = {
  order_id: string;
  order_no: string;
  order_date: string;
  customer_id: string | null;
  customer_name_snapshot: string;
  phone_primary: string;
  phone_secondary: string;
  address_snapshot: string;
  city_snapshot: string;
  retail_wholesale: string;
  sale_platform: string;
  transaction_type: string;
  sales_user_id: string;
  delivery_charge: number;
  advance: number;
  items: EditItem[];
  koombiyo_district_id: string;
  koombiyo_district_name: string;
  koombiyo_city_id: string;
  koombiyo_city_name: string;
  koombiyo_postal_code: string;
};

type Props = {
  currentUser: AppUser;
  products: Product[];
  formatDateTime: (value?: string | null) => string;
  formatRs: (value: number) => string;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};

function n(value: unknown) {
  const x = Number(value || 0);
  return Number.isFinite(x) ? x : 0;
}

function lineTotal(item: EditItem) {
  return n(item.qty) * n(item.unit_price) + n(item.extra_price) - n(item.discount);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function code128Svg(value: string, height = 54) {
  const patterns = [
    "212222","222122","222221","121223","121322","131222","122213","122312",
    "132212","221213","221312","231212","112232","122132","122231","113222",
    "123122","123221","223211","221132","221231","213212","223112","312131",
    "311222","321122","321221","312212","322112","322211","212123","212321",
    "232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121",
    "313121","211331","231131","213113","213311","213131","311123","311321",
    "331121","312113","312311","332111","314111","221411","431111","111224",
    "111422","121124","121421","141122","141221","112214","112412","122114",
    "122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112",
    "421211","212141","214121","412121","111143","111341","131141","114113",
    "114311","411113","411311","113141","114131","311141","411131","211412",
    "211214","211232","2331112"
  ];

  const text = String(value || "");
  const values = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return 0;
    return code - 32;
  });

  let checksum = 104;
  values.forEach((v, i) => {
    checksum += v * (i + 1);
  });
  checksum %= 103;

  const sequence = [104, ...values, checksum, 106];
  const quiet = 10;
  const moduleWidth = 1.45;

  let modules = quiet * 2;
  for (const code of sequence) {
    const pattern = patterns[code];
    for (const d of pattern) modules += Number(d);
  }

  let x = quiet;
  const rects: string[] = [];

  for (const code of sequence) {
    const pattern = patterns[code];
    let bar = true;

    for (const d of pattern) {
      const w = Number(d);
      if (bar) {
        rects.push(
          `<rect x="${x * moduleWidth}" y="0" width="${w * moduleWidth}" height="${height}" fill="#000"/>`
        );
      }
      x += w;
      bar = !bar;
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${modules * moduleWidth} ${height}"
      preserveAspectRatio="none"
      aria-label="Barcode ${escapeHtml(text)}">
      ${rects.join("")}
    </svg>
  `;
}

function shippingLabelHtml(order: any) {
  const items = Array.isArray(order.items) ? order.items : [];

  const description =
    items.length > 0
      ? items
          .map((item: any) =>
            [
              item.product_type_snapshot,
              item.material_snapshot,
              item.color_snapshot,
              item.size_snapshot,
              `x${Number(item.qty || 0).toString()}`,
            ]
              .filter(Boolean)
              .join(" ")
          )
          .join(", ")
      : String(order.product_summary || "");

  const pieces =
    items.length > 0
      ? items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0)
      : "";

  const waybill = String(order.koombiyo_waybill_id || "");
  const phone = String(order.phone_primary || order.phone_secondary || "");
  const address = [
    String(order.address_snapshot || order.address || "").trim(),
    String(order.koombiyo_city_name || order.city_snapshot || order.city || "").trim(),
  ]
    .filter(Boolean)
    .join(", ");

  const date = String(order.order_date || "").slice(0, 10);
  const cod = Number(order.balance || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `
    <section class="shipping-label">
      <div class="brand">
        <div class="brand-main">HAMAKI</div>
        <div class="brand-sub">APPAREL (PVT) LTD</div>
      </div>

      <div class="from-row">
        <div class="field-title">FROM :</div>
        <div class="from-details">
          <strong>HAMAKI APPAREL</strong>
          <span>771171771</span>
        </div>
      </div>

      <div class="barcode-top">
        ${code128Svg(waybill, 58)}
        <div class="barcode-number">${escapeHtml(waybill)}</div>
      </div>

      <div class="waybill-row">
        <span class="field-title">WAYBILL NO :</span>
        <strong>${escapeHtml(waybill)}</strong>
      </div>

      <div class="to-row">
        <div class="field-title">TO :</div>
        <div class="to-details">
          <strong>${escapeHtml(order.customer_name_snapshot || order.customer_name || "-")}</strong>
          <div>${escapeHtml(address || "-")}</div>
        </div>
      </div>

      <div class="single-row">
        <span class="field-title">PHONE :</span>
        <strong>${escapeHtml(phone || "-")}</strong>
      </div>

      <div class="description-row">
        <span class="field-title">DESCRIPTION :</span>
        <span>${escapeHtml(description || "-")}</span>
      </div>

      <div class="details-grid">
        <div class="left-details">
          <div class="detail-line">
            <span class="field-title">ORDER NO :</span>
            <strong>${escapeHtml(order.order_no || "-")}</strong>
          </div>
          <div class="detail-line">
            <span class="field-title">WEIGHT :</span>
            <strong>1.00 kg</strong>
          </div>
          <div class="detail-line">
            <span class="field-title">PIECES :</span>
            <strong>${escapeHtml(pieces || "-")}</strong>
          </div>
        </div>

        <div class="cod-box">
          <div class="field-title">COD AMOUNT :</div>
          <div class="cod-value">Rs. ${escapeHtml(cod)}</div>
        </div>
      </div>

      <div class="note-row">
        <span class="field-title">NOTE :</span>
      </div>

      <div class="bottom-row">
        <div class="date-box">
          <strong>Date :</strong>
          <span>${escapeHtml(date || "-")}</span>
        </div>

        <div class="barcode-bottom">
          ${code128Svg(waybill, 42)}
        </div>
      </div>

      <div class="inquiry">For Inquiry : 0117 886 786</div>
    </section>
  `;
}

export default function PendingOrdersV2({
  currentUser,
  products,
  formatDateTime,
  formatRs,
  showSuccess,
  showError,
  showInfo,
}: Props) {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actingId, setActingId] = useState("");
  const [bulkActing, setBulkActing] = useState(false);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => void loadPending(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  async function getSessionToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error("No active session");
    return session.access_token;
  }

  async function loadPending(search = "") {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc("get_pending_orders_koombiyo", {
        p_query: search.trim() || null,
        p_limit: 200,
      });

      if (error) {
        showError("Pending orders load failed: " + error.message);
        return;
      }

      setRows((data || []) as PendingRow[]);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(orderId: string) {
    setSelectedIds((prev) =>
      prev.includes(orderId) ? prev.filter((x) => x !== orderId) : [...prev, orderId]
    );
  }

  function toggleAll() {
    if (rows.length && rows.every((r) => selectedIds.includes(r.order_id))) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map((r) => r.order_id));
    }
  }

  async function loadDistricts() {
    if (districts.length) return;

    try {
      setLocationsLoading(true);
      const token = await getSessionToken();

      const res = await fetch("/api/koombiyo/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result?.message || "Could not load districts");
      setDistricts(result?.districts || []);
    } finally {
      setLocationsLoading(false);
    }
  }

  async function loadCities(districtId: string) {
    setCities([]);
    if (!districtId) return;

    try {
      setLocationsLoading(true);
      const token = await getSessionToken();

      const res = await fetch("/api/koombiyo/locations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ district_id: districtId }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result?.message || "Could not load cities");
      setCities(result?.cities || []);
    } finally {
      setLocationsLoading(false);
    }
  }

  async function openEdit(orderId: string) {
    try {
      setEditLoading(true);
      await loadDistricts();

      const { data, error } = await supabase.rpc("get_pending_order_details", {
        p_order_id: orderId,
      });

      if (error) {
        showError("Order load failed: " + error.message);
        return;
      }

      const d: any = data || {};
      const items = Array.isArray(d.items)
        ? d.items.map((x: any) => ({
            product_id: String(x.product_id || ""),
            sku_snapshot: String(x.sku_snapshot || ""),
            product_type_snapshot: String(x.product_type_snapshot || ""),
            material_snapshot: String(x.material_snapshot || ""),
            color_snapshot: String(x.color_snapshot || ""),
            size_snapshot: String(x.size_snapshot || ""),
            qty: n(x.qty),
            unit_price: n(x.unit_price),
            extra_addon: String(x.extra_addon || ""),
            extra_price: n(x.extra_price),
            discount: n(x.discount),
            line_total: n(x.line_total),
          }))
        : [];

      const next: EditState = {
        order_id: String(d.order_id || ""),
        order_no: String(d.order_no || ""),
        order_date: String(d.order_date || "").slice(0, 10),
        customer_id: d.customer_id || null,
        customer_name_snapshot: String(d.customer_name_snapshot || ""),
        phone_primary: String(d.phone_primary || ""),
        phone_secondary: String(d.phone_secondary || ""),
        address_snapshot: String(d.address_snapshot || ""),
        city_snapshot: String(d.city_snapshot || ""),
        retail_wholesale: String(d.retail_wholesale || "Retail"),
        sale_platform: String(d.sale_platform || "Facebook"),
        transaction_type: String(d.transaction_type || "COD"),
        sales_user_id: String(d.sales_user_id || currentUser.id),
        delivery_charge: n(d.delivery_charge),
        advance: n(d.advance),
        items,
        koombiyo_district_id: String(d.koombiyo_district_id || ""),
        koombiyo_district_name: String(d.koombiyo_district_name || ""),
        koombiyo_city_id: String(d.koombiyo_city_id || ""),
        koombiyo_city_name: String(d.koombiyo_city_name || ""),
        koombiyo_postal_code: "",
      };

      setEdit(next);

      if (next.koombiyo_district_id) {
        await loadCities(next.koombiyo_district_id);
      }
    } catch (err: any) {
      showError("Order load failed: " + (err?.message || "Unknown error"));
    } finally {
      setEditLoading(false);
    }
  }

  function updateItem(index: number, patch: Partial<EditItem>) {
    setEdit((prev) => {
      if (!prev) return prev;
      const items = [...prev.items];
      const merged = { ...items[index], ...patch };
      merged.line_total = lineTotal(merged);
      items[index] = merged;
      return { ...prev, items };
    });
  }

  function changeItemProduct(index: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;

    updateItem(index, {
      product_id: p.id,
      sku_snapshot: p.sku,
      product_type_snapshot: p.product_type,
      material_snapshot: p.material,
      color_snapshot: p.color,
      size_snapshot: p.size,
      unit_price: n(p.selling_price),
    });
  }

  function addEditItem() {
    const p = products[0];
    if (!p) {
      showError("No active products available");
      return;
    }

    setEdit((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            product_id: p.id,
            sku_snapshot: p.sku,
            product_type_snapshot: p.product_type,
            material_snapshot: p.material,
            color_snapshot: p.color,
            size_snapshot: p.size,
            qty: 1,
            unit_price: n(p.selling_price),
            extra_addon: "",
            extra_price: 0,
            discount: 0,
            line_total: n(p.selling_price),
          },
        ],
      };
    });
  }

  const editTotals = useMemo(() => {
    if (!edit) return { subtotal: 0, total: 0, balance: 0 };
    const subtotal = edit.items.reduce((sum, item) => sum + lineTotal(item), 0);
    const total = subtotal + n(edit.delivery_charge);
    const balance = total - n(edit.advance);
    return { subtotal, total, balance };
  }, [edit]);

  async function saveEdit() {
    if (!edit) return;

    if (!edit.customer_name_snapshot.trim()) {
      showError("Customer name is required");
      return;
    }
    if (!edit.phone_primary.trim() && !edit.phone_secondary.trim()) {
      showError("At least one phone number is required");
      return;
    }
    if (!edit.address_snapshot.trim()) {
      showError("Address is required");
      return;
    }
    if (!edit.items.length) {
      showError("Order must contain at least one item");
      return;
    }

    try {
      setEditSaving(true);

      const items = edit.items.map((item) => ({
        product_id: item.product_id,
        sku_snapshot: item.sku_snapshot,
        product_type_snapshot: item.product_type_snapshot,
        material_snapshot: item.material_snapshot,
        color_snapshot: item.color_snapshot,
        size_snapshot: item.size_snapshot,
        qty: n(item.qty),
        unit_price: n(item.unit_price),
        extra_addon: item.extra_addon || null,
        extra_price: n(item.extra_price),
        discount: n(item.discount),
        line_total: lineTotal(item),
      }));

      const { error: updateError } = await supabase.rpc("update_pending_order_with_items", {
        p_order_id: edit.order_id,
        p_order_date: `${edit.order_date}T00:00:00+05:30`,
        p_customer_id: edit.customer_id,
        p_customer_name_snapshot: edit.customer_name_snapshot.trim(),
        p_phone_primary: edit.phone_primary.trim() || null,
        p_phone_secondary: edit.phone_secondary.trim() || null,
        p_address_snapshot: edit.address_snapshot.trim(),
        p_city_snapshot: edit.koombiyo_city_name || edit.city_snapshot || null,
        p_retail_wholesale: edit.retail_wholesale,
        p_sale_platform: edit.sale_platform,
        p_transaction_type: edit.transaction_type,
        p_sales_user_id: edit.sales_user_id,
        p_subtotal: editTotals.subtotal,
        p_delivery_charge: n(edit.delivery_charge),
        p_discount_total: edit.items.reduce((sum, x) => sum + n(x.discount), 0),
        p_extra_total: edit.items.reduce((sum, x) => sum + n(x.extra_price), 0),
        p_order_total: editTotals.total,
        p_advance: n(edit.advance),
        p_balance: editTotals.balance,
        p_action_by_user_id: currentUser.id,
        p_items: items,
      });

      if (updateError) throw new Error(updateError.message);

      const { error: locError } = await supabase.rpc("set_pending_order_koombiyo_location", {
        p_order_id: edit.order_id,
        p_district_id: edit.koombiyo_district_id || null,
        p_district_name: edit.koombiyo_district_name || null,
        p_city_id: edit.koombiyo_city_id || null,
        p_city_name: edit.koombiyo_city_name || null,
      });

      if (locError) throw new Error(locError.message);

      showSuccess(`Order ${edit.order_no} updated ✅`);
      setEdit(null);
      await loadPending(query);
    } catch (err: any) {
      showError("Order update failed: " + (err?.message || "Unknown error"));
    } finally {
      setEditSaving(false);
    }
  }

  async function createShipment(row: PendingRow) {
    if (row.koombiyo_waybill_id) {
      showInfo(`Koombiyo already created: ${row.koombiyo_waybill_id}`);
      return;
    }

    if (!row.koombiyo_district_id || !row.koombiyo_city_id) {
      showInfo("Select the Koombiyo district and city first.");
      await openEdit(row.order_id);
      return;
    }

    try {
      setActingId(row.order_id);
      showInfo(`Creating Koombiyo shipment for ${row.order_no}...`);

      const token = await getSessionToken();
      const res = await fetch("/api/koombiyo/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ order_id: row.order_id }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result?.message || "Koombiyo shipment creation failed");
      }

      showSuccess(`Koombiyo created ✅ ${result.waybill_id}`);
      await loadPending(query);
    } catch (err: any) {
      showError("Koombiyo creation failed: " + (err?.message || "Unknown error"));
    } finally {
      setActingId("");
    }
  }

  async function createSelectedShipments() {
    const selected = rows.filter((r) => selectedIds.includes(r.order_id));
    if (!selected.length) {
      showError("No orders selected");
      return;
    }

    const missingLocation = selected.filter(
      (r) => !r.koombiyo_waybill_id && (!r.koombiyo_district_id || !r.koombiyo_city_id)
    );

    if (missingLocation.length) {
      showError(
        `${missingLocation.length} selected order(s) need Koombiyo district/city before shipment creation.`
      );
      return;
    }

    try {
      setBulkActing(true);
      let success = 0;
      let failed = 0;

      for (const row of selected) {
        if (row.koombiyo_waybill_id) continue;

        try {
          const token = await getSessionToken();
          const res = await fetch("/api/koombiyo/create-order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ order_id: row.order_id }),
          });

          if (res.ok) success += 1;
          else failed += 1;
        } catch {
          failed += 1;
        }
      }

      if (failed) {
        showError(`Koombiyo: ${success} created, ${failed} failed. Check rows before retrying.`);
      } else {
        showSuccess(`Koombiyo created for ${success} order(s) ✅`);
      }

      await loadPending(query);
    } finally {
      setBulkActing(false);
    }
  }

  async function printShippingLabels(orderRows: PendingRow[]) {
    const printable = orderRows.filter((row) => row.koombiyo_waybill_id);

    if (!printable.length) {
      showError("No Koombiyo labels selected");
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      showError("Browser blocked the print window. Allow pop-ups for the ERP and try again.");
      return;
    }

    printWindow.document.write(
      "<p style='font-family:Arial,sans-serif;padding:20px'>Preparing Hamaki shipping labels...</p>"
    );

    try {
      const details = await Promise.all(
        printable.map(async (row) => {
          const { data, error } = await supabase.rpc("get_pending_order_details", {
            p_order_id: row.order_id,
          });

          if (error) {
            console.error("Label detail load failed:", row.order_no, error.message);
            return {
              ...row,
              customer_name_snapshot: row.customer_name,
              address_snapshot: row.address,
              city_snapshot: row.city,
              items: [],
            };
          }

          return {
            ...(data || {}),
            koombiyo_waybill_id:
              (data as any)?.koombiyo_waybill_id || row.koombiyo_waybill_id,
            product_summary: row.product_summary,
          };
        })
      );

      const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Hamaki Shipping Labels</title>
  <style>
    @page {
      size: 100mm 150mm;
      margin: 0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
    }

    body {
      width: 100%;
    }

    .shipping-label {
      width: 100mm;
      height: 150mm;
      padding: 3.2mm;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
      background: #fff;
    }

    .shipping-label:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .shipping-label > * {
      border-left: 0.35mm solid #000;
      border-right: 0.35mm solid #000;
      flex-shrink: 0;
    }

    .brand {
      height: 11mm;
      flex: 0 0 11mm;
      border-top: 0.5mm solid #000;
      border-bottom: 0.35mm solid #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
      padding-top: 0.5mm;
    }

    .brand-main {
      font-size: 6.1mm;
      font-weight: 900;
      letter-spacing: 0.6mm;
    }

    .brand-sub {
      margin-top: 0.6mm;
      font-size: 3.1mm;
      font-weight: 700;
      letter-spacing: 0.2mm;
    }

    .field-title {
      font-weight: 800;
      white-space: nowrap;
    }

    .from-row {
      height: 8.5mm;
      flex: 0 0 8.5mm;
      border-bottom: 0.35mm solid #000;
      display: grid;
      grid-template-columns: 23mm 1fr;
      align-items: stretch;
      font-size: 3.6mm;
    }

    .from-row > .field-title {
      display: flex;
      align-items: center;
      padding-left: 3mm;
      border-right: 0.35mm solid #000;
    }

    .from-details {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-left: 4mm;
      gap: 0.8mm;
      font-size: 3.2mm;
    }

    .barcode-top {
      height: 18mm;
      flex: 0 0 18mm;
      border-bottom: 0.35mm solid #000;
      padding: 2mm 14mm 1mm;
      text-align: center;
    }

    .barcode-top svg {
      width: 100%;
      height: 11mm;
      display: block;
    }

    .barcode-number {
      margin-top: 0.7mm;
      font-size: 3.9mm;
      font-weight: 900;
      letter-spacing: 0.4mm;
    }

    .waybill-row,
    .single-row {
      height: 7mm;
      flex: 0 0 7mm;
      border-bottom: 0.35mm solid #000;
      display: flex;
      align-items: center;
      gap: 4mm;
      padding: 1.3mm 3mm;
      font-size: 3.8mm;
    }

    .to-row {
      height: 23mm;
      flex: 0 0 23mm;
      border-bottom: 0.35mm solid #000;
      display: grid;
      grid-template-columns: 14mm 1fr;
      align-items: start;
      padding: 1.6mm 3mm;
      font-size: 3.35mm;
      overflow: hidden;
    }

    .to-row > .field-title {
      padding-top: 0.2mm;
    }

    .to-details {
      padding-left: 0;
      line-height: 1.22;
      overflow: hidden;
    }

    .to-details strong {
      display: block;
      margin-bottom: 0.8mm;
      font-size: 3.8mm;
      line-height: 1.15;
    }

    .to-details div {
      max-height: 15.5mm;
      overflow: hidden;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
    }

    .description-row {
      height: 19mm;
      flex: 0 0 19mm;
      border-bottom: 0.35mm solid #000;
      display: grid;
      grid-template-columns: 28mm 1fr;
      align-items: start;
      gap: 2mm;
      padding: 2mm 3mm;
      font-size: 3.15mm;
      line-height: 1.28;
      overflow: hidden;
    }

    .description-row > span:last-child {
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      max-height: 16mm;
      overflow: hidden;
    }

    .details-grid {
      height: 22mm;
      flex: 0 0 22mm;
      border-bottom: 0.35mm solid #000;
      display: grid;
      grid-template-columns: 60% 40%;
    }

    .left-details {
      border-right: 0.35mm solid #000;
    }

    .detail-line {
      height: 7.33mm;
      border-bottom: 0.3mm solid #000;
      display: grid;
      grid-template-columns: 27mm 1fr;
      align-items: center;
      padding: 0 3mm;
      font-size: 3.6mm;
    }

    .detail-line:last-child {
      border-bottom: 0;
    }

    .cod-box {
      padding: 2.5mm 3mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .cod-box .field-title {
      font-size: 3.4mm;
    }

    .cod-value {
      margin-top: 2.5mm;
      font-size: 5.5mm;
      font-weight: 900;
      white-space: nowrap;
    }

    .note-row {
      height: 6mm;
      flex: 0 0 6mm;
      border-bottom: 0.35mm solid #000;
      padding: 2mm 3mm;
      font-size: 3.5mm;
    }

    .bottom-row {
      height: 12mm;
      flex: 0 0 12mm;
      border-bottom: 0.35mm solid #000;
      display: grid;
      grid-template-columns: 44% 56%;
    }

    .date-box {
      border-right: 0.35mm solid #000;
      display: flex;
      align-items: center;
      gap: 2mm;
      padding: 2mm 3mm;
      font-size: 3.4mm;
    }

    .barcode-bottom {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2.5mm 5mm;
    }

    .barcode-bottom svg {
      width: 100%;
      height: 7.5mm;
      display: block;
    }

    .inquiry {
      height: 6mm;
      flex: 0 0 6mm;
      border-bottom: 0.5mm solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3.7mm;
      font-weight: 900;
      letter-spacing: 0.1mm;
    }

    @media screen {
      body {
        background: #d9dde3;
        padding: 10px;
      }

      .shipping-label {
        margin: 0 auto 20px;
        background: white;
        box-shadow: 0 2px 10px rgba(0,0,0,.2);
      }
    }

    @media print {
      body {
        background: #fff;
        padding: 0;
      }

      .shipping-label {
        margin: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  ${details.map((order) => shippingLabelHtml(order)).join("")}

  <script>
    window.addEventListener("load", function () {
      setTimeout(function () {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();

      showSuccess(`${printable.length} Hamaki shipping label(s) ready ✅`);
    } catch (err: any) {
      printWindow.close();
      showError("Label generation failed: " + (err?.message || "Unknown error"));
    }
  }

  async function cancelOrder(row: PendingRow) {
    const hasKoombiyo = Boolean(row.koombiyo_waybill_id);

    const confirmation = hasKoombiyo
      ? `Cancel Koombiyo shipment ${row.koombiyo_waybill_id} for ${row.order_no}?\n\nThis will only succeed while Koombiyo still allows the shipment to be deleted. If successful, Hamaki will cancel the order and return its items to stock.`
      : `Cancel ${row.order_no}? Stock will be returned.`;

    if (!window.confirm(confirmation)) return;

    try {
      setActingId(row.order_id);

      if (hasKoombiyo) {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          throw new Error("No active session");
        }

        const res = await fetch("/api/koombiyo/cancel-order", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ order_id: row.order_id }),
        });

        const result = await res.json();

        if (!res.ok) {
          throw new Error(
            result?.message ||
              "Koombiyo no longer allows this shipment to be cancelled."
          );
        }

        showSuccess(
          `Koombiyo shipment cancelled ✅ ${row.order_no} · Stock returned`
        );
      } else {
        const { error } = await supabase.rpc("update_order_status", {
          p_order_id: row.order_id,
          p_new_status: "CANCELLED",
          p_action_by_user_id: currentUser.id,
        });

        if (error) throw new Error(error.message);

        showSuccess(`Order ${row.order_no} cancelled ✅ Stock returned`);
      }

      await loadPending(query);
    } catch (err: any) {
      showError("Cancel failed: " + (err?.message || "Unknown error"));
    } finally {
      setActingId("");
    }
  }

  const selectedRows = rows.filter((r) => selectedIds.includes(r.order_id));
  const selectedWaybills = selectedRows
    .map((r) => r.koombiyo_waybill_id || "")
    .filter(Boolean);

  return (
    <>
      <div className="soft-card mt-4 p-5">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[22px] font-bold text-[var(--text)]">Pending Orders</h2>
            <div className="mt-1 text-sm text-[var(--muted)]">
              Edit first, create Koombiyo shipment, print label, then physically dispatch by barcode scan.
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-2 md:w-auto md:items-end">
            <div className="min-w-[280px] flex-1 md:flex-none">
              <label className="soft-label">Search</label>
              <input
                className="soft-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Phone or order no"
              />
            </div>

            <button className="secondary-btn" onClick={() => void loadPending(query)}>
              Refresh
            </button>

            <button
              className="primary-btn"
              onClick={() => void createSelectedShipments()}
              disabled={bulkActing || selectedIds.length === 0}
            >
              {bulkActing ? "Creating..." : `Create Koombiyo (${selectedIds.length})`}
            </button>

            <button
              className="secondary-btn"
              onClick={() => void printShippingLabels(selectedRows.filter((row) => row.koombiyo_waybill_id))}
              disabled={selectedWaybills.length === 0}
            >
              Print Selected ({selectedWaybills.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[var(--muted)]">
            Loading pending orders...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[var(--muted)]">
            No pending orders found
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="center">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && rows.every((r) => selectedIds.includes(r.order_id))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>Date</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Products</th>
                  <th className="num">Balance</th>
                  <th>Koombiyo</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const locked = Boolean(row.koombiyo_waybill_id);
                  const locationReady = Boolean(row.koombiyo_district_id && row.koombiyo_city_id);

                  return (
                    <tr key={row.order_id}>
                      <td className="center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.order_id)}
                          onChange={() => toggle(row.order_id)}
                        />
                      </td>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td className="font-bold">{row.order_no}</td>
                      <td>{row.customer_name || "-"}</td>
                      <td>
                        <div>{row.phone_primary || "-"}</div>
                        {row.phone_secondary ? (
                          <div className="text-xs text-[var(--muted)]">{row.phone_secondary}</div>
                        ) : null}
                      </td>
                      <td>{row.address || "-"}</td>
                      <td>{row.koombiyo_city_name || row.city || "-"}</td>
                      <td>{row.product_summary || "-"}</td>
                      <td className="num">{formatRs(n(row.balance))}</td>
                      <td>
                        {locked ? (
                          <div>
                            <div className="font-bold text-[#166534]">LABEL READY ✓</div>
                            <div className="text-xs text-[var(--muted)]">{row.koombiyo_waybill_id}</div>
                          </div>
                        ) : locationReady ? (
                          <span className="font-bold text-[#166534]">Location Ready ✓</span>
                        ) : (
                          <span className="font-bold text-[#b45309]">Location needed</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-col gap-2">
                          <button
                            className="secondary-btn h-10 w-[145px] whitespace-nowrap text-[13px]"
                            disabled={locked || actingId === row.order_id}
                            onClick={() => void openEdit(row.order_id)}
                            title={locked ? "Editing is locked after Koombiyo waybill creation" : "Edit order"}
                          >
                            {locked ? "Edit 🔒" : "Edit"}
                          </button>

                          {!locked ? (
                            <button
                              className="primary-btn h-10 w-[145px] whitespace-nowrap text-[13px]"
                              disabled={actingId === row.order_id || bulkActing}
                              onClick={() => void createShipment(row)}
                            >
                              {actingId === row.order_id ? "Creating..." : "Create Koombiyo"}
                            </button>
                          ) : (
                            <button
                              className="secondary-btn h-10 w-[145px] whitespace-nowrap text-[13px]"
                              onClick={() => void printShippingLabels([row])}
                            >
                              Print Label
                            </button>
                          )}

                          <button
                            className="h-10 w-[145px] whitespace-nowrap rounded-[10px] bg-[#fee2e2] px-3 text-[13px] font-bold text-[#b91c1c]"
                            disabled={actingId === row.order_id || bulkActing}
                            onClick={() => void cancelOrder(row)}
                            title={
                              locked
                                ? "Cancel the Koombiyo shipment while it is still deletable"
                                : "Cancel order"
                            }
                          >
                            {actingId === row.order_id
                              ? "Cancelling..."
                              : locked
                                ? "Cancel Shipment"
                                : "Cancel"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(editLoading || edit) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-[1180px] overflow-y-auto rounded-[20px] bg-white p-5 shadow-2xl">
            {editLoading && !edit ? (
              <div className="p-6 text-center">Loading order...</div>
            ) : edit ? (
              <>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[22px] font-extrabold">Edit Pending Order</h3>
                    <div className="mt-1 text-sm text-[var(--muted)]">{edit.order_no}</div>
                    <div className="mt-1 text-xs font-bold text-[#b45309]">
                      Editing will be permanently locked after the Koombiyo waybill is created.
                    </div>
                  </div>
                  <button className="secondary-btn" onClick={() => setEdit(null)} disabled={editSaving}>
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <label className="soft-label">Date</label>
                    <input
                      type="date"
                      className="soft-input"
                      value={edit.order_date}
                      onChange={(e) => setEdit({ ...edit, order_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="soft-label">Customer Name</label>
                    <input
                      className="soft-input"
                      value={edit.customer_name_snapshot}
                      onChange={(e) => setEdit({ ...edit, customer_name_snapshot: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="soft-label">Phone 01</label>
                    <input
                      className="soft-input"
                      value={edit.phone_primary}
                      onChange={(e) => setEdit({ ...edit, phone_primary: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="soft-label">Phone 02</label>
                    <input
                      className="soft-input"
                      value={edit.phone_secondary}
                      onChange={(e) => setEdit({ ...edit, phone_secondary: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="soft-label">Address</label>
                  <input
                    className="soft-input"
                    value={edit.address_snapshot}
                    onChange={(e) => setEdit({ ...edit, address_snapshot: e.target.value })}
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <div>
                    <label className="soft-label">City (Koombiyo)</label>
                    <KoombiyoCityPicker
                      cityId={edit.koombiyo_city_id}
                      cityName={edit.koombiyo_city_name}
                      districtId={edit.koombiyo_district_id}
                      districtName={edit.koombiyo_district_name}
                      disabled={locationsLoading}
                      onChange={(location) => {
                        if (!location) {
                          setEdit({
                            ...edit,
                            koombiyo_city_id: "",
                            koombiyo_city_name: "",
                            koombiyo_district_id: "",
                            koombiyo_district_name: "",
                            koombiyo_postal_code: "",
                          });
                          return;
                        }

                        setEdit({
                          ...edit,
                          koombiyo_city_id: location.city_id,
                          koombiyo_city_name: location.city_name,
                          koombiyo_district_id: location.district_id,
                          koombiyo_district_name: location.district_name,
                          koombiyo_postal_code: String(location.postal_code || ""),
                          city_snapshot: location.city_name,
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="soft-label">District (Koombiyo)</label>
                    <input
                      className="soft-input bg-[#f8fafc]"
                      value={edit.koombiyo_district_name}
                      placeholder="Auto selected"
                      readOnly
                      tabIndex={-1}
                    />
                  </div>

                  <div>
                    <label className="soft-label">Retail / Wholesale</label>
                    <select
                      className="soft-input"
                      value={edit.retail_wholesale}
                      onChange={(e) => setEdit({ ...edit, retail_wholesale: e.target.value })}
                    >
                      <option value="Retail">Retail</option>
                      <option value="Wholesale">Wholesale</option>
                    </select>
                  </div>

                  <div>
                    <label className="soft-label">Transaction Type</label>
                    <select
                      className="soft-input"
                      value={edit.transaction_type}
                      onChange={(e) => setEdit({ ...edit, transaction_type: e.target.value })}
                    >
                      <option value="COD">COD</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Card">Card</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <h4 className="text-[18px] font-bold">Items</h4>
                  <button className="secondary-btn" onClick={addEditItem}>+ Add Item</button>
                </div>

                <div className="mt-3 overflow-x-auto rounded-[14px] border border-[#d7dee8]">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Extra Addon</th>
                        <th>Extra Price</th>
                        <th>Discount</th>
                        <th className="num">Line Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {edit.items.map((item, index) => (
                        <tr key={`${item.product_id}-${index}`}>
                          <td>
                            <select
                              className="soft-input min-w-[300px]"
                              value={item.product_id}
                              onChange={(e) => changeItemProduct(index, e.target.value)}
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.sku} · {p.product_type} · {p.material} · {p.color} · {p.size}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="soft-input min-w-[90px]"
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(e) => updateItem(index, { qty: n(e.target.value) })}
                            />
                          </td>
                          <td>
                            <input
                              className="soft-input min-w-[110px]"
                              inputMode="decimal"
                              value={item.unit_price}
                              onChange={(e) => updateItem(index, { unit_price: n(e.target.value) })}
                            />
                          </td>
                          <td>
                            <input
                              className="soft-input min-w-[150px]"
                              value={item.extra_addon}
                              onChange={(e) => updateItem(index, { extra_addon: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="soft-input min-w-[100px]"
                              inputMode="decimal"
                              value={item.extra_price}
                              onChange={(e) => updateItem(index, { extra_price: n(e.target.value) })}
                            />
                          </td>
                          <td>
                            <input
                              className="soft-input min-w-[100px]"
                              inputMode="decimal"
                              value={item.discount}
                              onChange={(e) => updateItem(index, { discount: n(e.target.value) })}
                            />
                          </td>
                          <td className="num font-bold">{formatRs(lineTotal(item))}</td>
                          <td>
                            <button
                              className="rounded-[10px] bg-[#fee2e2] px-3 py-2 text-sm font-bold text-[#b91c1c]"
                              onClick={() =>
                                setEdit({
                                  ...edit,
                                  items: edit.items.filter((_, i) => i !== index),
                                })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
                  <div>
                    <label className="soft-label">Delivery Charge</label>
                    <input
                      className="soft-input"
                      inputMode="decimal"
                      value={edit.delivery_charge}
                      onChange={(e) => setEdit({ ...edit, delivery_charge: n(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="soft-label">Advance</label>
                    <input
                      className="soft-input"
                      inputMode="decimal"
                      value={edit.advance}
                      onChange={(e) => setEdit({ ...edit, advance: n(e.target.value) })}
                    />
                  </div>
                  <div className="rounded-[14px] border border-[#d7dee8] p-3">
                    <div className="text-xs text-[var(--muted)]">Subtotal</div>
                    <div className="font-bold">{formatRs(editTotals.subtotal)}</div>
                  </div>
                  <div className="rounded-[14px] border border-[#d7dee8] p-3">
                    <div className="text-xs text-[var(--muted)]">Order Total</div>
                    <div className="font-bold">{formatRs(editTotals.total)}</div>
                  </div>
                  <div className="rounded-[14px] bg-[#17377d] p-3 text-white">
                    <div className="text-xs text-white/80">Balance / COD</div>
                    <div className="text-[18px] font-extrabold">{formatRs(editTotals.balance)}</div>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button className="secondary-btn" onClick={() => setEdit(null)} disabled={editSaving}>
                    Cancel
                  </button>
                  <button className="primary-btn" onClick={() => void saveEdit()} disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
