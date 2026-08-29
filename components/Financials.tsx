"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type FinancialSummaryRow = {
  month_start: string;
  dispatched_orders: number | string | null;
  units_sold: number | string | null;
  product_sales: number | string | null;
  shipping_collected: number | string | null;
  materials_purchased: number | string | null;
  materials_issued: number | string | null;
  cod_return_units: number | string | null;
  cod_return_value: number | string | null;
  net_product_sales: number | string | null;
  payroll: number | string | null;
  epf_etf: number | string | null;
  advertising: number | string | null;
  electricity: number | string | null;
  courier_shipping: number | string | null;
  bank_payment_fees: number | string | null;
  vehicle_transport: number | string | null;
  maintenance: number | string | null;
  income_tax: number | string | null;
  other_taxes_levies: number | string | null;
  other_regular_expenses: number | string | null;
  exceptional_expenses: number | string | null;
  is_complete: boolean | null;
};

type DailySalesRow = {
  day_no: number;
  current_month_daily_sales: number | string | null;
  current_month_daily_returns: number | string | null;
  current_month_daily_net_sales: number | string | null;
  current_month_cumulative_sales: number | string | null;
  previous_month_daily_sales: number | string | null;
  previous_month_daily_returns: number | string | null;
  previous_month_daily_net_sales: number | string | null;
  previous_month_cumulative_sales: number | string | null;
  target_cumulative: number | string | null;
};

type MonthlyFinancialRow = {
  id: number | string;
  month_start: string;
  payroll: number | string;
  epf_etf: number | string;
  advertising: number | string;
  electricity: number | string;
  courier_shipping: number | string;
  bank_payment_fees: number | string;
  vehicle_transport: number | string;
  maintenance: number | string;
  income_tax: number | string;
  other_taxes_levies: number | string;
  other_regular_expenses: number | string;
  notes: string | null;
  is_complete: boolean;
};

type ExceptionalExpense = {
  id: number | string;
  monthly_financial_id: number | string;
  description: string;
  amount: number | string;
  expense_date: string | null;
};

type ExpenseKey =
  | "payroll"
  | "epf_etf"
  | "advertising"
  | "electricity"
  | "bank_payment_fees"
  | "vehicle_transport"
  | "maintenance"
  | "income_tax"
  | "other_taxes_levies"
  | "other_regular_expenses";

type Props = {
  formatRs: (value: number) => string;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

const EXPENSE_FIELDS: Array<{ key: ExpenseKey; label: string; hint?: string }> = [
  { key: "payroll", label: "Payroll" },
  { key: "epf_etf", label: "EPF / ETF" },
  { key: "advertising", label: "Advertising" },
  { key: "electricity", label: "Electricity" },
  { key: "bank_payment_fees", label: "Bank / Payment Fees" },
  { key: "vehicle_transport", label: "Vehicle / Transport" },
  { key: "maintenance", label: "Maintenance" },
  { key: "income_tax", label: "Income Tax" },
  { key: "other_taxes_levies", label: "Other Taxes / Levies" },
  { key: "other_regular_expenses", label: "Other Regular Expenses" },
];

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthKeyInColombo(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "2000";
  const month = parts.find((p) => p.type === "month")?.value || "01";
  return `${year}-${month}-01`;
}

function monthLabel(monthStart: string) {
  const [year, month] = monthStart.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function lastTwelveMonths() {
  const current = monthKeyInColombo();
  const [year, month] = current.split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  });
}

function colomboDayInfo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === "year")?.value || 2000);
  const month = Number(parts.find((p) => p.type === "month")?.value || 1);
  const day = Number(parts.find((p) => p.type === "day")?.value || 1);
  return { year, month, day, daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function calculate(row?: Partial<FinancialSummaryRow> | null) {
  const productSales = num(row?.product_sales);
  const codReturnValue = num(row?.cod_return_value);
  const netProductSales = num(row?.net_product_sales) || Math.max(0, productSales - codReturnValue);
  const materialsIssued = num(row?.materials_issued);
  const regularExpenses =
    num(row?.payroll) +
    num(row?.epf_etf) +
    num(row?.advertising) +
    num(row?.electricity) +
    num(row?.bank_payment_fees) +
    num(row?.vehicle_transport) +
    num(row?.maintenance) +
    num(row?.other_regular_expenses);
  const exceptional = num(row?.exceptional_expenses);
  const taxes = num(row?.income_tax) + num(row?.other_taxes_levies);
  const grossProfit = netProductSales - materialsIssued;
  const operatingProfit = grossProfit - regularExpenses;
  const profitBeforeTax = operatingProfit - exceptional;
  const netProfit = profitBeforeTax - taxes;
  const netMargin = netProductSales > 0 ? (netProfit / netProductSales) * 100 : 0;

  return {
    productSales,
    codReturnValue,
    netProductSales,
    materialsIssued,
    regularExpenses,
    grossProfit,
    operatingProfit,
    profitBeforeTax,
    netProfit,
    netMargin,
  };
}

function StatusBadge({ complete, current }: { complete: boolean; current: boolean }) {
  if (current) {
    return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">CURRENT</span>;
  }
  if (complete) {
    return <span className="rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">COMPLETE</span>;
  }
  return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">INCOMPLETE</span>;
}

export default function Financials({ formatRs, showSuccess, showError }: Props) {
  const [summaryRows, setSummaryRows] = useState<FinancialSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [financial, setFinancial] = useState<MonthlyFinancialRow | null>(null);
  const [exceptional, setExceptional] = useState<ExceptionalExpense[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newExceptionalDescription, setNewExceptionalDescription] = useState("");
  const [newExceptionalAmount, setNewExceptionalAmount] = useState("");
  const [addingExceptional, setAddingExceptional] = useState(false);
  const [isEditingMonth, setIsEditingMonth] = useState(true);
  const [editingExceptionalId, setEditingExceptionalId] = useState<number | string | null>(null);
  const [editingExceptionalDescription, setEditingExceptionalDescription] = useState("");
  const [editingExceptionalAmount, setEditingExceptionalAmount] = useState("");
  const [dailySalesRows, setDailySalesRows] = useState<DailySalesRow[]>([]);
  const [dailySalesLoading, setDailySalesLoading] = useState(true);
  const [salesTarget, setSalesTarget] = useState(8000000);
  const [marginTarget, setMarginTarget] = useState(25);

  const currentMonth = monthKeyInColombo();
  const monthKeys = useMemo(() => lastTwelveMonths(), []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const oldest = monthKeys[monthKeys.length - 1];
    const { data, error } = await supabase
      .from("monthly_financial_summary")
      .select("*")
      .gte("month_start", oldest)
      .order("month_start", { ascending: false });

    if (error) {
      showError("Financials load failed: " + error.message);
      setLoading(false);
      return;
    }

    setSummaryRows((data || []) as FinancialSummaryRow[]);
    setLoading(false);
  }, [monthKeys, showError]);

  const loadDailySales = useCallback(async () => {
    setDailySalesLoading(true);
    const { data, error } = await supabase.rpc("get_financial_daily_sales_comparison", {
      p_target: Math.round(salesTarget),
    });

    if (error) {
      showError("Daily sales chart failed: " + error.message);
      setDailySalesLoading(false);
      return;
    }

    setDailySalesRows((data || []) as DailySalesRow[]);
    setDailySalesLoading(false);
  }, [salesTarget, showError]);

  useEffect(() => {
    const savedSalesTarget = Number(window.localStorage.getItem("hamaki_financial_sales_target") || 8000000);
    const savedMarginTarget = Number(window.localStorage.getItem("hamaki_financial_margin_target") || 25);
    if (Number.isFinite(savedSalesTarget) && savedSalesTarget > 0) setSalesTarget(savedSalesTarget);
    if (Number.isFinite(savedMarginTarget) && savedMarginTarget > 0) setMarginTarget(savedMarginTarget);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("hamaki_financial_sales_target", String(Math.round(salesTarget)));
  }, [salesTarget]);

  useEffect(() => {
    window.localStorage.setItem("hamaki_financial_margin_target", String(marginTarget));
  }, [marginTarget]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadDailySales();
  }, [loadDailySales]);

  const summaryByMonth = useMemo(() => {
    const map = new Map<string, FinancialSummaryRow>();
    for (const row of summaryRows) map.set(row.month_start, row);
    return map;
  }, [summaryRows]);

  async function ensureFinancialRecord(monthStart: string) {
    const { data: existing, error: fetchError } = await supabase
      .from("monthly_financials")
      .select("*")
      .eq("month_start", monthStart)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (existing) return existing as MonthlyFinancialRow;

    const { data: created, error: insertError } = await supabase
      .from("monthly_financials")
      .insert({ month_start: monthStart })
      .select("*")
      .single();

    if (insertError) throw insertError;
    return created as MonthlyFinancialRow;
  }

  async function openMonth(monthStart: string) {
    try {
      setSelectedMonth(monthStart);
      setDetailLoading(true);
      const row = await ensureFinancialRecord(monthStart);
      setFinancial(row);
      setIsEditingMonth(!Boolean(row.is_complete));
      setEditingExceptionalId(null);
      setEditingExceptionalDescription("");
      setEditingExceptionalAmount("");

      const { data: exceptionalRows, error } = await supabase
        .from("monthly_exceptional_expenses")
        .select("id, monthly_financial_id, description, amount, expense_date")
        .eq("monthly_financial_id", row.id)
        .order("expense_date", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });

      if (error) throw error;
      setExceptional((exceptionalRows || []) as ExceptionalExpense[]);
    } catch (err: any) {
      showError("Could not open month: " + (err?.message || "Unknown error"));
    } finally {
      setDetailLoading(false);
    }
  }

  function changeExpense(key: ExpenseKey, value: string) {
    if (!financial) return;
    setFinancial({ ...financial, [key]: value });
  }

  async function saveFinancials() {
    if (!financial || !selectedMonth) return;
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        payroll: Math.round(num(financial.payroll)),
        epf_etf: Math.round(num(financial.epf_etf)),
        advertising: Math.round(num(financial.advertising)),
        electricity: Math.round(num(financial.electricity)),
        bank_payment_fees: Math.round(num(financial.bank_payment_fees)),
        vehicle_transport: Math.round(num(financial.vehicle_transport)),
        maintenance: Math.round(num(financial.maintenance)),
        income_tax: Math.round(num(financial.income_tax)),
        other_taxes_levies: Math.round(num(financial.other_taxes_levies)),
        other_regular_expenses: Math.round(num(financial.other_regular_expenses)),
        notes: financial.notes?.trim() || null,
        is_complete: selectedMonth === currentMonth ? false : Boolean(financial.is_complete),
      };

      const { data, error } = await supabase
        .from("monthly_financials")
        .update(payload)
        .eq("id", financial.id)
        .select("*")
        .single();

      if (error) throw error;
      setFinancial(data as MonthlyFinancialRow);
      setIsEditingMonth(!Boolean((data as MonthlyFinancialRow).is_complete));
      await loadSummary();
      showSuccess(`${monthLabel(selectedMonth)} financials saved`);
    } catch (err: any) {
      showError("Save failed: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function addExceptionalExpense() {
    if (!financial || !selectedMonth) return;
    const description = newExceptionalDescription.trim();
    const amount = Math.round(num(newExceptionalAmount));
    if (!description || amount <= 0) {
      showError("Enter an exceptional expense description and amount");
      return;
    }

    try {
      setAddingExceptional(true);
      const { data, error } = await supabase
        .from("monthly_exceptional_expenses")
        .insert({
          monthly_financial_id: financial.id,
          description,
          amount,
          expense_date: selectedMonth,
        })
        .select("id, monthly_financial_id, description, amount, expense_date")
        .single();

      if (error) throw error;
      setExceptional((prev) => [...prev, data as ExceptionalExpense]);
      setNewExceptionalDescription("");
      setNewExceptionalAmount("");
      await loadSummary();
      showSuccess("Exceptional expense added");
    } catch (err: any) {
      showError("Could not add expense: " + (err?.message || "Unknown error"));
    } finally {
      setAddingExceptional(false);
    }
  }

  async function deleteExceptionalExpense(id: number | string) {
    try {
      const { error } = await supabase.from("monthly_exceptional_expenses").delete().eq("id", id);
      if (error) throw error;
      setExceptional((prev) => prev.filter((item) => String(item.id) !== String(id)));
      await loadSummary();
      showSuccess("Exceptional expense removed");
    } catch (err: any) {
      showError("Could not remove expense: " + (err?.message || "Unknown error"));
    }
  }


  function startExceptionalEdit(item: ExceptionalExpense) {
    setEditingExceptionalId(item.id);
    setEditingExceptionalDescription(item.description);
    setEditingExceptionalAmount(String(Math.round(num(item.amount))));
  }

  function cancelExceptionalEdit() {
    setEditingExceptionalId(null);
    setEditingExceptionalDescription("");
    setEditingExceptionalAmount("");
  }

  async function saveExceptionalEdit() {
    if (editingExceptionalId === null) return;

    const description = editingExceptionalDescription.trim();
    const amount = Math.round(num(editingExceptionalAmount));

    if (!description || amount <= 0) {
      showError("Enter an exceptional expense description and amount");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("monthly_exceptional_expenses")
        .update({ description, amount })
        .eq("id", editingExceptionalId)
        .select("id, monthly_financial_id, description, amount, expense_date")
        .single();

      if (error) throw error;

      setExceptional((prev) =>
        prev.map((item) => (String(item.id) === String(editingExceptionalId) ? (data as ExceptionalExpense) : item))
      );
      cancelExceptionalEdit();
      await loadSummary();
      showSuccess("Exceptional expense updated");
    } catch (err: any) {
      showError("Could not update expense: " + (err?.message || "Unknown error"));
    }
  }

  function wholeRs(value: number) {
    return `Rs. ${Math.round(num(value)).toLocaleString("en-LK")}`;
  }

  function wholeNumber(value: unknown) {
    return Math.round(num(value)).toLocaleString("en-LK");
  }

  function expenseInputValue(value: number | string | null | undefined) {
    if (value === "") return "";
    return String(Math.round(num(value)));
  }

  const currentSummary = summaryByMonth.get(currentMonth);
  const completedPriorRows = useMemo(() => {
    return summaryRows
      .filter((row) => row.month_start < currentMonth && (Boolean(row.is_complete) || num(row.product_sales) > 0))
      .sort((a, b) => b.month_start.localeCompare(a.month_start))
      .slice(0, 2);
  }, [summaryRows, currentMonth]);

  const control = useMemo(() => {
    const { day: elapsedDays, daysInMonth } = colomboDayInfo();
    const remainingDays = Math.max(0, daysInMonth - elapsedDays);
    const currentCalc = calculate(currentSummary);
    const currentNetSales = currentCalc.netProductSales;
    const projectedSales = elapsedDays > 0 ? (currentNetSales / elapsedDays) * daysInMonth : currentNetSales;

    const priorMaterialRatios = completedPriorRows
      .map((row) => {
        const calc = calculate(row);
        return calc.netProductSales > 0 ? num(row.materials_issued) / calc.netProductSales : 0;
      })
      .filter((value) => value > 0);
    const benchmarkMaterialRatio = average(priorMaterialRatios);
    const paceProjectedMaterial = elapsedDays > 0 ? (num(currentSummary?.materials_issued) / elapsedDays) * daysInMonth : 0;
    const benchmarkProjectedMaterial = projectedSales * benchmarkMaterialRatio;
    const projectedMaterial = benchmarkMaterialRatio > 0
      ? (paceProjectedMaterial + benchmarkProjectedMaterial) / 2
      : paceProjectedMaterial;

    const regularKeys: ExpenseKey[] = [
      "payroll",
      "epf_etf",
      "advertising",
      "electricity",
      "bank_payment_fees",
      "vehicle_transport",
      "maintenance",
      "other_regular_expenses",
    ];

    const forecastRegularExpenses = regularKeys.reduce((sum, key) => {
      const actual = num(currentSummary?.[key]);
      if (actual > 0) return sum + actual;
      const history = completedPriorRows.map((row) => num(row[key])).filter((value) => value > 0);
      return sum + average(history);
    }, 0);

    const currentExceptional = num(currentSummary?.exceptional_expenses);
    const currentTaxes = num(currentSummary?.income_tax) + num(currentSummary?.other_taxes_levies);
    const projectedGrossProfit = projectedSales - projectedMaterial;
    const projectedNetProfit = projectedGrossProfit - forecastRegularExpenses - currentExceptional - currentTaxes;
    const projectedMargin = projectedSales > 0 ? (projectedNetProfit / projectedSales) * 100 : 0;

    const actualPurchases = num(currentSummary?.materials_purchased);
    const projectedPurchases = elapsedDays > 0 ? (actualPurchases / elapsedDays) * daysInMonth : actualPurchases;
    const operatingCashProxy = projectedSales - projectedPurchases - forecastRegularExpenses - currentExceptional - currentTaxes;

    const requiredDailySales = remainingDays > 0 ? Math.max(0, salesTarget - currentNetSales) / remainingDays : 0;
    const salesProgress = salesTarget > 0 ? (currentNetSales / salesTarget) * 100 : 0;
    const projectedMaterialRatio = projectedSales > 0 ? projectedMaterial / projectedSales : 0;
    const currentReturnRate = num(currentSummary?.units_sold) > 0
      ? (num(currentSummary?.cod_return_units) / num(currentSummary?.units_sold)) * 100
      : 0;
    const adSpendForecast = (() => {
      const actual = num(currentSummary?.advertising);
      if (actual > 0) return actual;
      return average(completedPriorRows.map((row) => num(row.advertising)).filter((value) => value > 0));
    })();
    const adEfficiency = adSpendForecast > 0 ? projectedSales / adSpendForecast : 0;

    const salesStatus = projectedSales >= salesTarget ? 0 : projectedSales >= salesTarget * 0.9375 ? 1 : projectedSales >= salesTarget * 0.8125 ? 2 : 3;
    const marginStatus = projectedMargin >= marginTarget ? 0 : projectedMargin >= 20 ? 1 : projectedMargin >= 10 ? 2 : 3;
    const overallLevel = Math.max(salesStatus, marginStatus);
    const levels = [
      { label: "HEALTHY", bg: "bg-green-50", text: "text-green-700", border: "border-green-200" },
      { label: "WATCH", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
      { label: "ACTION", bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
      { label: "CRITICAL", bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    ];

    const actions: string[] = [];
    if (projectedSales < salesTarget) {
      actions.push(`Projected sales are ${wholeRs(salesTarget - projectedSales)} below target. ${remainingDays > 0 ? `Required average for the remaining ${remainingDays} day${remainingDays === 1 ? "" : "s"}: ${wholeRs(requiredDailySales)}/day.` : ""}`);
    }
    if (benchmarkMaterialRatio > 0 && projectedMaterialRatio > benchmarkMaterialRatio + 0.03) {
      actions.push(`Material consumption is running high at about ${Math.round(projectedMaterialRatio * 100)}% of sales versus a recent benchmark of ${Math.round(benchmarkMaterialRatio * 100)}%.`);
    }
    if (projectedMargin < marginTarget) {
      actions.push(`Projected margin is ${Math.round(projectedMargin)}%, below the ${marginTarget}% target. Review controllable spending and sales mix.`);
    }
    if (currentReturnRate > 6) actions.push(`COD return rate is ${currentReturnRate.toFixed(1)}%. Review return causes and courier/customer confirmation quality.`);
    if (adEfficiency > 0 && adEfficiency < 4) actions.push(`Projected net-sales-to-ad-spend efficiency is only ${adEfficiency.toFixed(1)}x. Avoid increasing ad spend blindly.`);
    if (!actions.length) actions.push("Sales and projected margin are currently on track. Keep monitoring daily sales, material usage and returns.");

    return {
      elapsedDays, daysInMonth, remainingDays, currentNetSales, projectedSales, benchmarkMaterialRatio,
      projectedMaterial, projectedMaterialRatio, forecastRegularExpenses, projectedNetProfit, projectedMargin,
      projectedPurchases, operatingCashProxy, requiredDailySales, salesProgress, currentReturnRate, adEfficiency,
      status: levels[overallLevel], actions,
    };
  }, [currentSummary, completedPriorRows, salesTarget, marginTarget]);

  const selectedSummary = selectedMonth ? summaryByMonth.get(selectedMonth) : undefined;
  const exceptionalTotal = exceptional.reduce((sum, item) => sum + num(item.amount), 0);
  const liveRow = selectedMonth
    ? ({
        ...(selectedSummary || { month_start: selectedMonth }),
        ...(financial || {}),
        exceptional_expenses: exceptionalTotal,
      } as FinancialSummaryRow)
    : null;
  const liveCalc = calculate(liveRow);

  if (selectedMonth) {
    const isCurrent = selectedMonth === currentMonth;
    return (
      <div className="soft-card mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button className="secondary-btn mb-4" onClick={() => setSelectedMonth(null)}>
              ← Back to 12 months
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[26px] font-extrabold tracking-[-0.02em] text-[var(--text)]">
                {monthLabel(selectedMonth)}
              </h2>
              <StatusBadge complete={Boolean(financial?.is_complete)} current={isCurrent} />
            </div>
            <p className="mt-1 text-[13px] text-[var(--muted)]">
              Operational figures are automatic. Enter only the missing monthly expenses.
            </p>
          </div>
        </div>

        {detailLoading ? (
          <div className="mt-6 rounded-[16px] border border-[#d7dee8] bg-white p-5 text-[var(--muted)]">Loading month...</div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Net Product Sales" value={wholeRs(liveCalc.netProductSales)} />
              <MetricCard label="Material Cost Issued" value={wholeRs(num(selectedSummary?.materials_issued))} />
              <MetricCard label="Operating Profit" value={wholeRs(liveCalc.operatingProfit)} />
              <MetricCard label="Net Profit" value={wholeRs(liveCalc.netProfit)} emphasis />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-[18px] font-bold">Automatic ERP Data</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">READ ONLY</span>
                </div>
                <div className="divide-y divide-[#e8edf3]">
                  <SummaryLine label="Dispatched Orders" value={wholeNumber(selectedSummary?.dispatched_orders)} />
                  <SummaryLine label="Units Sold" value={wholeNumber(selectedSummary?.units_sold)} />
                  <SummaryLine label="Product Sales" value={wholeRs(num(selectedSummary?.product_sales))} />
                  <SummaryLine label="COD Returned Units" value={wholeNumber(selectedSummary?.cod_return_units)} />
                  <SummaryLine label="COD Return Value" value={`− ${wholeRs(num(selectedSummary?.cod_return_value))}`} />
                  <SummaryLine label="Net Product Sales" value={wholeRs(liveCalc.netProductSales)} strong />
                  <SummaryLine label="Materials Issued / Consumed" value={wholeRs(num(selectedSummary?.materials_issued))} />
                  <SummaryLine label="Materials Purchased" value={wholeRs(num(selectedSummary?.materials_purchased))} />
                </div>
              </section>

              <section className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
                <h3 className="mb-4 text-[18px] font-bold">Profit Summary</h3>
                <div className="divide-y divide-[#e8edf3]">
                  <SummaryLine label="Gross Profit" value={wholeRs(liveCalc.grossProfit)} strong />
                  <SummaryLine label="Regular Expenses" value={`− ${wholeRs(liveCalc.regularExpenses)}`} />
                  <SummaryLine label="Profit Before Exceptional Expenses" value={wholeRs(liveCalc.operatingProfit)} strong />
                  <SummaryLine label="Exceptional Expenses" value={`− ${wholeRs(exceptionalTotal)}`} />
                  <SummaryLine label="Profit Before Tax" value={wholeRs(liveCalc.profitBeforeTax)} strong />
                  <SummaryLine label="Net Profit" value={wholeRs(liveCalc.netProfit)} emphasis />
                  <SummaryLine label="Net Margin" value={`${Math.round(liveCalc.netMargin)}%`} strong />
                </div>
              </section>
            </div>

            <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
              <div className="mb-5">
                <h3 className="text-[18px] font-bold">Monthly Expenses</h3>
                <p className="mt-1 text-[13px] text-[var(--muted)]">Enter totals for this month. Amounts are in LKR.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {EXPENSE_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="soft-label text-[13px] font-semibold">{field.label}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      disabled={!isEditingMonth}
                      className="soft-input mt-1"
                      value={expenseInputValue(financial?.[field.key])}
                      onFocus={(e) => {
                        if (Number(e.currentTarget.value) === 0) changeExpense(field.key, "");
                      }}
                      onBlur={(e) => {
                        if (!e.currentTarget.value.trim()) changeExpense(field.key, "0");
                      }}
                      onChange={(e) => changeExpense(field.key, e.target.value)}
                    />
                    {field.hint && <div className="mt-1 text-[11px] text-[var(--muted)]">{field.hint}</div>}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="soft-label text-[13px] font-semibold">Monthly Notes</label>
                <textarea
                  className="soft-input mt-1 min-h-[90px] resize-y"
                  disabled={!isEditingMonth}
                  placeholder="Optional notes for this month"
                  value={financial?.notes || ""}
                  onChange={(e) => financial && setFinancial({ ...financial, notes: e.target.value })}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5ebf2] pt-5">
                <label className={`flex items-center gap-2 text-[13px] font-semibold ${isCurrent ? "text-slate-400" : "text-[var(--text)]"}`}>
                  <input
                    type="checkbox"
                    disabled={isCurrent || !isEditingMonth}
                    checked={!isCurrent && Boolean(financial?.is_complete)}
                    onChange={(e) => financial && setFinancial({ ...financial, is_complete: e.target.checked })}
                  />
                  Mark month complete
                </label>
                <div className="flex flex-wrap gap-2">
                  {!isEditingMonth ? (
                    <button className="secondary-btn min-w-[130px]" onClick={() => setIsEditingMonth(true)}>
                      Edit Month
                    </button>
                  ) : (
                    <>
                      {Boolean(financial?.is_complete) && (
                        <button
                          className="secondary-btn min-w-[110px]"
                          disabled={saving}
                          onClick={() => void openMonth(selectedMonth)}
                        >
                          Cancel
                        </button>
                      )}
                      <button className="primary-btn min-w-[150px]" disabled={saving} onClick={() => void saveFinancials()}>
                        {saving ? "Saving..." : Boolean(financial?.is_complete) ? "Save Changes" : "Save Expenses"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {isCurrent && <div className="mt-2 text-[11px] text-[var(--muted)]">The current month stays incomplete until the month has ended.</div>}
            </section>

            <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h3 className="text-[18px] font-bold">Exceptional Expenses</h3>
                <p className="mt-1 text-[13px] text-[var(--muted)]">Add unusual one-off costs separately so normal business performance stays clear.</p>
              </div>

              {exceptional.length > 0 ? (
                <div className="mb-5 overflow-x-auto rounded-[14px] border border-[#e5ebf2]">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th className="num">Amount</th>
                        <th className="center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptional.map((item) => (
                        <tr key={String(item.id)}>
                          {String(editingExceptionalId) === String(item.id) ? (
                            <>
                              <td>
                                <input
                                  className="soft-input"
                                  value={editingExceptionalDescription}
                                  onChange={(e) => setEditingExceptionalDescription(e.target.value)}
                                />
                              </td>
                              <td className="num">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="soft-input text-right"
                                  value={editingExceptionalAmount}
                                  onChange={(e) => setEditingExceptionalAmount(e.target.value)}
                                />
                              </td>
                              <td className="center">
                                <div className="flex justify-center gap-3">
                                  <button className="text-[12px] font-bold text-blue-700 hover:underline" onClick={() => void saveExceptionalEdit()}>
                                    Save
                                  </button>
                                  <button className="text-[12px] font-bold text-slate-500 hover:underline" onClick={cancelExceptionalEdit}>
                                    Cancel
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="font-semibold">{item.description}</td>
                              <td className="num">{wholeRs(num(item.amount))}</td>
                              <td className="center">
                                <div className="flex justify-center gap-3">
                                  <button className="text-[12px] font-bold text-blue-700 hover:underline" onClick={() => startExceptionalEdit(item)}>
                                    Edit
                                  </button>
                                  <button className="text-[12px] font-bold text-red-600 hover:underline" onClick={() => void deleteExceptionalExpense(item.id)}>
                                    Remove
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mb-5 rounded-[14px] bg-[#f8fafc] p-4 text-[13px] text-[var(--muted)]">No exceptional expenses added for this month.</div>
              )}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
                <input
                  className="soft-input"
                  placeholder="e.g. Sewing machine repair"
                  value={newExceptionalDescription}
                  onChange={(e) => setNewExceptionalDescription(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="soft-input"
                  placeholder="Amount"
                  value={newExceptionalAmount}
                  onChange={(e) => setNewExceptionalAmount(e.target.value)}
                />
                <button className="primary-btn whitespace-nowrap" disabled={addingExceptional} onClick={() => void addExceptionalExpense()}>
                  {addingExceptional ? "Adding..." : "+ Add Expense"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="soft-card mt-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em] text-[var(--text)]">Financials</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Last 12 months of Hamaki sales, production cost, expenses and profit.</p>
        </div>
        <button
          className="secondary-btn"
          disabled={loading || dailySalesLoading}
          onClick={() => { void loadSummary(); void loadDailySales(); }}
        >
          {loading || dailySalesLoading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <section className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[20px] font-extrabold text-[var(--text)]">Current Month Control</h3>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${control.status.bg} ${control.status.text} ${control.status.border}`}>
                {control.status.label}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[var(--muted)]">Live net-sales progress and month-end forecast. COD returns are deducted on the day they are received.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
              Sales target
              <input
                type="number"
                min="1"
                step="100000"
                className="soft-input mt-1 w-[155px]"
                value={salesTarget}
                onChange={(e) => setSalesTarget(Math.max(1, Math.round(num(e.target.value))))}
              />
            </label>
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
              Margin target %
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                className="soft-input mt-1 w-[120px]"
                value={marginTarget}
                onChange={(e) => setMarginTarget(Math.max(1, Math.min(100, num(e.target.value))))}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_0.8fr]">
          <div className="rounded-[16px] border border-[#d7dee8] bg-[#f8fafc] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                  {monthLabel(currentMonth)} · Day {control.elapsedDays} of {control.daysInMonth}
                </div>
                <div className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-[var(--text)]">
                  Target chase
                </div>
                <div className="mt-1 text-[13px] text-[var(--muted)]">
                  {control.elapsedDays} days completed · {control.remainingDays} days remaining
                </div>
              </div>

              <span className={`rounded-full border px-3 py-1 text-[11px] font-extrabold ${control.status.bg} ${control.status.text} ${control.status.border}`}>
                {control.status.label}
              </span>
            </div>

            <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e5ebf2]">
              <div
                className="h-full rounded-full bg-green-600 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, control.salesProgress))}%` }}
              />
            </div>

            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px]">
              <span className="font-bold text-green-700">{wholeRs(control.currentNetSales)} sales</span>
              <span className="font-semibold text-[var(--muted)]">{wholeRs(salesTarget)} target</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Days completed</div>
                <div className="mt-1 text-[21px] font-extrabold text-[var(--text)]">{control.elapsedDays}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Days remaining</div>
                <div className="mt-1 text-[21px] font-extrabold text-[var(--text)]">{control.remainingDays}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Target gap</div>
                <div className="mt-1 text-[21px] font-extrabold text-orange-700">
                  {wholeRs(Math.max(0, salesTarget - control.currentNetSales))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Progress</div>
                <div className="mt-1 text-[21px] font-extrabold text-[var(--text)]">{Math.round(control.salesProgress)}%</div>
              </div>
            </div>
          </div>

          <div className={`rounded-[16px] border p-5 ${
            control.requiredDailySales > (control.currentNetSales / Math.max(1, control.elapsedDays)) * 2
              ? "border-orange-200 bg-orange-50"
              : "border-[#d7dee8] bg-white"
          }`}>
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              Required sales to hit target
            </div>

            {control.remainingDays > 0 ? (
              <>
                <div className="mt-2 text-[32px] font-extrabold tracking-[-0.03em] text-[var(--text)]">
                  {wholeRs(control.requiredDailySales)}
                  <span className="ml-1 text-[16px] font-bold text-[var(--muted)]">/day</span>
                </div>
                <div className="mt-2 text-[13px] leading-5 text-[var(--muted)]">
                  Need {wholeRs(Math.max(0, salesTarget - control.currentNetSales))} more across the remaining {control.remainingDays} day{control.remainingDays === 1 ? "" : "s"}.
                </div>
                <div className="mt-4 border-t border-[#e5ebf2] pt-4">
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-[var(--muted)]">Current average/day</span>
                    <span className="font-bold text-[var(--text)]">
                      {wholeRs(control.currentNetSales / Math.max(1, control.elapsedDays))}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-[var(--muted)]">Target average/day</span>
                    <span className="font-bold text-[var(--text)]">
                      {wholeRs(salesTarget / Math.max(1, control.daysInMonth))}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-2 text-[24px] font-extrabold text-[var(--text)]">
                Month complete
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          <SalesProgressChart rows={dailySalesRows} target={salesTarget} loading={dailySalesLoading} formatRs={wholeRs} />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <ControlCard label="Net Sales MTD" value={wholeRs(control.currentNetSales)} sub={`${Math.round(control.salesProgress)}% of target`} />
          <ControlCard label="Projected Sales" value={wholeRs(control.projectedSales)} sub={`Target ${wholeRs(salesTarget)}`} />
          <ControlCard label="Projected Material" value={wholeRs(control.projectedMaterial)} sub={`~${Math.round(control.projectedMaterialRatio * 100)}% of sales`} />
          <ControlCard label="Forecast Expenses" value={wholeRs(control.forecastRegularExpenses)} sub="Actual entered + recent 2-month average" />
          <ControlCard label="Projected Net Profit" value={wholeRs(control.projectedNetProfit)} sub={`${Math.round(control.projectedMargin)}% projected margin`} emphasis={control.projectedMargin >= marginTarget} />
          <ControlCard label="Operating Cash Proxy" value={wholeRs(control.operatingCashProxy)} sub="Sales − projected purchases − expenses" />
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[14px] border border-[#e5ebf2] bg-[#f8fafc] p-4">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.07em] text-[var(--muted)]">Target actions</div>
            <ul className="mt-3 space-y-2 text-[13px] leading-5 text-[var(--text)]">
              {control.actions.map((action, index) => <li key={index}>• {action}</li>)}
            </ul>
          </div>
          <div className="rounded-[14px] border border-[#e5ebf2] bg-white p-4">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.07em] text-[var(--muted)]">Forecast basis</div>
            <div className="mt-3 space-y-2 text-[12px] leading-5 text-[var(--muted)]">
              <div><b className="text-[var(--text)]">Material benchmark:</b> {control.benchmarkMaterialRatio > 0 ? `${Math.round(control.benchmarkMaterialRatio * 100)}% of net sales` : "Not enough history"} from the previous two operating months.</div>
              <div><b className="text-[var(--text)]">Expense forecast:</b> uses current entered values; missing recurring categories use the previous two months' average.</div>
              <div><b className="text-[var(--text)]">Cash proxy:</b> management estimate only. Net sales are not the same as bank/courier cash receipts, and purchase dates are not necessarily payment dates.</div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-6 overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
        <table className="erp-table min-w-[1080px]">
          <thead>
            <tr>
              <th>Month</th>
              <th className="num">Units Sold</th>
              <th className="num">Net Sales</th>
              <th className="num">Material Cost</th>
              <th className="num">Regular Expenses</th>
              <th className="num">Exceptional</th>
              <th className="num">Net Profit</th>
              <th className="num">Margin</th>
              <th className="center">Status</th>
            </tr>
          </thead>
          <tbody>
            {monthKeys.map((month) => {
              const row = summaryByMonth.get(month);
              const calc = calculate(row);
              const hasOperationalData = Boolean(row && (num(row.product_sales) > 0 || num(row.materials_issued) > 0 || num(row.materials_purchased) > 0));
              const isCurrent = month === currentMonth;
              return (
                <tr key={month} className="cursor-pointer transition hover:bg-[#f8fbff]" onClick={() => void openMonth(month)}>
                  <td>
                    <div className="font-bold text-[var(--text)]">{monthLabel(month)}</div>
                    {isCurrent && <div className="mt-0.5 text-[11px] text-blue-600">Month to date</div>}
                    {!hasOperationalData && <div className="mt-0.5 text-[11px] text-[var(--muted)]">No operational data</div>}
                  </td>
                  <td className="num font-semibold">{hasOperationalData ? wholeNumber(row?.units_sold) : "—"}</td>
                  <td className="num font-semibold">{hasOperationalData ? wholeRs(calc.netProductSales) : "—"}</td>
                  <td className="num">{hasOperationalData ? wholeRs(num(row?.materials_issued)) : "—"}</td>
                  <td className="num">{row ? wholeRs(calc.regularExpenses) : "—"}</td>
                  <td className="num">{row ? wholeRs(num(row.exceptional_expenses)) : "—"}</td>
                  <td className={`num font-bold ${calc.netProfit < 0 ? "text-red-600" : "text-green-700"}`}>
                    {hasOperationalData ? wholeRs(calc.netProfit) : "—"}
                  </td>
                  <td className="num font-semibold">{hasOperationalData ? `${Math.round(calc.netMargin)}%` : "—"}</td>
                  <td className="center"><StatusBadge complete={Boolean(row?.is_complete)} current={isCurrent} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-[14px] bg-[#f8fafc] p-4 text-[12px] leading-5 text-[var(--muted)]">
        Sales are based on dispatched orders after extras and discounts. COD returns are deducted when returned stock is received. Shipping is excluded from profit. Material cost uses raw materials issued to production, while purchases are tracked separately until issued.
      </div>
    </div>
  );
}

function ControlCard({ label, value, sub, emphasis = false }: { label: string; value: string; sub: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-[15px] border p-4 ${emphasis ? "border-green-200 bg-green-50" : "border-[#d7dee8] bg-white"}`}>
      <div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-[18px] font-extrabold ${emphasis ? "text-green-700" : "text-[var(--text)]"}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{sub}</div>
    </div>
  );
}

function SalesProgressChart({ rows, target, loading, formatRs }: { rows: DailySalesRow[]; target: number; loading: boolean; formatRs: (value: number) => string }) {
  const width = 1000;
  const height = 330;
  const left = 72;
  const right = 24;
  const top = 24;
  const bottom = 46;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  if (loading) return <div className="flex h-[300px] items-center justify-center rounded-[14px] bg-[#f8fafc] text-[13px] text-[var(--muted)]">Loading daily sales…</div>;
  if (!rows.length) return <div className="flex h-[300px] items-center justify-center rounded-[14px] bg-[#f8fafc] text-[13px] text-[var(--muted)]">No daily sales data available.</div>;

  const maxDay = Math.max(...rows.map((row) => Number(row.day_no || 0)), 1);
  const values = rows.flatMap((row) => [num(row.current_month_cumulative_sales), num(row.previous_month_cumulative_sales), num(row.target_cumulative)]);
  const maxValue = Math.max(target, ...values, 1) * 1.08;
  const x = (day: number) => left + ((day - 1) / Math.max(1, maxDay - 1)) * plotWidth;
  const y = (value: number) => top + plotHeight - (value / maxValue) * plotHeight;

  const pathFor = (key: keyof DailySalesRow) => {
    const valid = rows.filter((row) => row[key] !== null && row[key] !== undefined);
    return valid.map((row, index) => `${index === 0 ? "M" : "L"}${x(Number(row.day_no)).toFixed(1)},${y(num(row[key])).toFixed(1)}`).join(" ");
  };

  const yTicks = Array.from({ length: 5 }, (_, index) => (maxValue * index) / 4);
  const xTicks = Array.from(new Set([1, 5, 10, 15, 20, 25, maxDay].filter((day) => day <= maxDay)));
  const currentLast = [...rows].reverse().find((row) => row.current_month_cumulative_sales !== null && row.current_month_cumulative_sales !== undefined);
  const previousLast = rows[rows.length - 1];

  return (
    <div className="rounded-[16px] border border-[#e5ebf2] bg-[#fbfdff] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[15px] font-extrabold text-[var(--text)]">Cumulative Net Sales Progress</div>
          <div className="mt-0.5 text-[11px] text-[var(--muted)]">Current month vs previous month at the same day, after COD returns.</div>
        </div>
        <div className="flex flex-wrap gap-4 text-[11px] font-bold">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-[#16a34a]" />Current month</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-[#2563eb]" />Previous month</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-full bg-[#f97316]" />Target pace</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px] w-full" role="img" aria-label="Cumulative daily net sales chart">
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="#e5ebf2" strokeWidth="1" />
              <text x={left - 10} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick >= 1000000 ? `${(tick / 1000000).toFixed(1)}M` : `${Math.round(tick / 1000)}k`}</text>
            </g>
          ))}
          {xTicks.map((day) => (
            <text key={day} x={x(day)} y={height - 16} textAnchor="middle" fontSize="11" fill="#64748b">{day}</text>
          ))}
          <text x={width / 2} y={height - 2} textAnchor="middle" fontSize="11" fill="#64748b">Day of month</text>

          <path d={pathFor("target_cumulative")} fill="none" stroke="#f97316" strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor("previous_month_cumulative_sales")} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathFor("current_month_cumulative_sales")} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

          {rows.map((row) => {
            if (row.current_month_cumulative_sales === null || row.current_month_cumulative_sales === undefined) return null;
            return (
              <circle key={`c-${row.day_no}`} cx={x(Number(row.day_no))} cy={y(num(row.current_month_cumulative_sales))} r="4" fill="#16a34a">
                <title>{`Day ${row.day_no}: Sales ${formatRs(num(row.current_month_daily_sales))}, COD returns ${formatRs(num(row.current_month_daily_returns))}, Daily net ${formatRs(num(row.current_month_daily_net_sales))}, Cumulative ${formatRs(num(row.current_month_cumulative_sales))}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
        <div className="rounded-[10px] bg-green-50 px-3 py-2 font-semibold text-green-700">Current: {formatRs(num(currentLast?.current_month_cumulative_sales))}</div>
        <div className="rounded-[10px] bg-blue-50 px-3 py-2 font-semibold text-blue-700">Previous month: {formatRs(num(previousLast?.previous_month_cumulative_sales))}</div>
        <div className="rounded-[10px] bg-orange-50 px-3 py-2 font-semibold text-orange-700">Target: {formatRs(target)}</div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`rounded-[16px] border p-4 ${emphasis ? "border-green-200 bg-green-50" : "border-[#d7dee8] bg-white"}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div>
      <div className={`mt-2 text-[20px] font-extrabold ${emphasis ? "text-green-700" : "text-[var(--text)]"}`}>{value}</div>
    </div>
  );
}

function SummaryLine({ label, value, strong = false, emphasis = false }: { label: string; value: string; strong?: boolean; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className={`text-[13px] ${strong || emphasis ? "font-bold text-[var(--text)]" : "text-[var(--muted)]"}`}>{label}</span>
      <span className={`text-right text-[14px] ${emphasis ? "text-[18px] font-extrabold text-green-700" : strong ? "font-bold" : "font-semibold"}`}>{value}</span>
    </div>
  );
}
