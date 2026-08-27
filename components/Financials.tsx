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

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

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
        <button className="secondary-btn" disabled={loading} onClick={() => void loadSummary()}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mt-6 overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
        <table className="erp-table min-w-[980px]">
          <thead>
            <tr>
              <th>Month</th>
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
