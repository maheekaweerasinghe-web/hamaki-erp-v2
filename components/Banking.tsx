"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  formatRs: (value: number) => string;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
};

type BankAccount = {
  id: string;
  account_name: string;
  bank_name: string | null;
  account_type: "CURRENT" | "SAVINGS" | "CASH" | "CARD" | "OTHER";
  usage_tag: "HAMAKI" | "TEESUPP" | "MIXED" | "PERSONAL" | "OTHER";
  is_virtual: boolean;
  opening_date: string;
  opening_balance: number | string;
  notes: string | null;
  is_active: boolean;
  book_balance: number | string;
  last_reconciliation_date: string | null;
  last_actual_balance: number | string | null;
  last_difference: number | string | null;
};

type Vendor = { id: string; vendor_code: string; vendor_name: string; status: string };
type SupplierPayable = {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  opening_payable: number | string;
  purchases_since_start: number | string;
  payments_since_start: number | string;
  outstanding: number | string;
};

type Txn = {
  id: string;
  txn_date: string;
  account_id: string;
  direction: "IN" | "OUT";
  amount: number | string;
  business: "HAMAKI" | "TEESUPP" | "PERSONAL" | "OTHER";
  category: string;
  vendor_id: string | null;
  cod_cleared_amount: number | string | null;
  reference: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  source: string;
  created_at: string;
};

type Dashboard = {
  system_start_date: string | null;
  total_book_cash: number | string;
  cod_receivable: number | string;
  supplier_payable: number | string;
  latest_reconciliation_difference_abs: number | string;
  cod_source_table: string | null;
  cod_source_detected: boolean;
};

type Settings = {
  id: number;
  system_start_date: string | null;
  opening_cod_receivable: number | string;
  opening_cod_note: string | null;
};

const categories = [
  ["COD_SETTLEMENT", "COD settlement"],
  ["HAMAKI_BANK_TRANSFER_RECEIPT", "Hamaki bank-transfer receipts"],
  ["HAMAKI_CASH_RECEIPT", "Hamaki cash receipt"],
  ["TEESUPP_RECEIPTS", "Teesupp daily receipts"],
  ["SUPPLIER_PAYMENT", "Supplier payment"],
  ["META_ADS", "Meta ads"],
  ["PAYROLL", "Payroll"],
  ["EPF_ETF", "EPF / ETF"],
  ["ELECTRICITY", "Electricity"],
  ["COURIER_EXPENSE", "Courier expense"],
  ["BANK_FEE", "Bank fee"],
  ["TAX", "Tax"],
  ["LOAN_PAYMENT", "Loan payment"],
  ["OTHER_EXPENSE", "Other expense"],
  ["OTHER_INCOME", "Other income"],
  ["OWNER_CONTRIBUTION", "Owner contribution"],
  ["OWNER_WITHDRAWAL", "Owner withdrawal"],
] as const;

const categoryLabel = new Map<string, string>(categories as unknown as [string, string][]);
const n = (v: unknown) => { const x = Number(v ?? 0); return Number.isFinite(x) ? x : 0; };
const todayLK = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const wholeRs = (v: unknown) => `Rs. ${Math.round(n(v)).toLocaleString("en-LK")}`;
const badge = (ok: boolean) => ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700";

export default function Banking({ formatRs: _formatRs, showSuccess, showError }: Props) {
  const [view, setView] = useState<"overview" | "transactions" | "suppliers" | "setup">("overview");
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [supplierRows, setSupplierRows] = useState<SupplierPayable[]>([]);
  const [transactions, setTransactions] = useState<Txn[]>([]);

  const [fromDate, setFromDate] = useState(`${todayLK().slice(0, 8)}01`);
  const [toDate, setToDate] = useState(todayLK());
  const [filterAccount, setFilterAccount] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDirection, setFilterDirection] = useState("");

  const [txnDate, setTxnDate] = useState(todayLK());
  const [txnAccount, setTxnAccount] = useState("");
  const [txnDirection, setTxnDirection] = useState<"IN" | "OUT">("IN");
  const [txnBusiness, setTxnBusiness] = useState<"HAMAKI" | "TEESUPP" | "PERSONAL" | "OTHER">("HAMAKI");
  const [txnCategory, setTxnCategory] = useState("COD_SETTLEMENT");
  const [txnAmount, setTxnAmount] = useState("");
  const [txnCodCleared, setTxnCodCleared] = useState("");
  const [txnVendor, setTxnVendor] = useState("");
  const [txnReference, setTxnReference] = useState("");
  const [txnNotes, setTxnNotes] = useState("");
  const [savingTxn, setSavingTxn] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Txn | null>(null);

  const [transferDate, setTransferDate] = useState(todayLK());
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferBusiness, setTransferBusiness] = useState("HAMAKI");

  const [reconAccount, setReconAccount] = useState("");
  const [reconDate, setReconDate] = useState(todayLK());
  const [actualBalance, setActualBalance] = useState("");

  const [codK, setCodK] = useState("");
  const [codT, setCodT] = useState("");
  const [codOther, setCodOther] = useState("");
  const [codNote, setCodNote] = useState("");

  const [newAccountName, setNewAccountName] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newAccountType, setNewAccountType] = useState("CURRENT");
  const [newUsage, setNewUsage] = useState("HAMAKI");
  const [newOpeningDate, setNewOpeningDate] = useState("2026-09-01");
  const [newOpeningBalance, setNewOpeningBalance] = useState("");
  const [newVirtual, setNewVirtual] = useState(false);

  const [setupStart, setSetupStart] = useState("2026-09-01");
  const [setupCodOpening, setSetupCodOpening] = useState("");
  const [setupCodNote, setSetupCodNote] = useState("");
  const [openingVendor, setOpeningVendor] = useState("");
  const [openingVendorAmount, setOpeningVendorAmount] = useState("");

  const activeAccounts = useMemo(() => accounts.filter(a => a.is_active), [accounts]);
  const selectedRecon = accounts.find(a => a.id === reconAccount);

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s, a, v, p] = await Promise.all([
        supabase.rpc("get_banking_dashboard"),
        supabase.from("banking_settings").select("*").eq("id", 1).single(),
        supabase.from("v_bank_account_position").select("*").order("is_active", { ascending: false }).order("account_name"),
        supabase.from("rm_vendors").select("id,vendor_code,vendor_name,status").order("vendor_name"),
        supabase.from("v_supplier_payables").select("*").order("outstanding", { ascending: false }),
      ]);
      if (d.error) throw d.error;
      if (s.error) throw s.error;
      if (a.error) throw a.error;
      if (v.error) throw v.error;
      if (p.error) throw p.error;
      setDashboard((d.data || {}) as Dashboard);
      setSettings(s.data as Settings);
      setAccounts((a.data || []) as BankAccount[]);
      setVendors((v.data || []) as Vendor[]);
      setSupplierRows((p.data || []) as SupplierPayable[]);
      if (s.data) {
        setSetupStart(s.data.system_start_date || "2026-09-01");
        setSetupCodOpening(String(Math.round(n(s.data.opening_cod_receivable)) || ""));
        setSetupCodNote(s.data.opening_cod_note || "");
      }
    } catch (e: any) { showError(e?.message || "Banking load failed"); }
    finally { setLoading(false); }
  }, [showError]);

  const loadTransactions = useCallback(async () => {
    let q = supabase.from("bank_transactions")
      .select("id,txn_date,account_id,direction,amount,business,category,vendor_id,cod_cleared_amount,reference,notes,transfer_group_id,source,created_at")
      .is("voided_at", null)
      .gte("txn_date", fromDate)
      .lte("txn_date", toDate)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (filterAccount) q = q.eq("account_id", filterAccount);
    if (filterBusiness) q = q.eq("business", filterBusiness);
    if (filterCategory) q = q.eq("category", filterCategory);
    if (filterDirection) q = q.eq("direction", filterDirection);
    const { data, error } = await q;
    if (error) return showError(error.message);
    setTransactions((data || []) as Txn[]);
  }, [fromDate, toDate, filterAccount, filterBusiness, filterCategory, filterDirection, showError]);

  useEffect(() => { void loadCore(); }, [loadCore]);
  useEffect(() => { if (view === "transactions") void loadTransactions(); }, [view, loadTransactions]);

  function resetTxn() {
    setEditingTxn(null); setTxnDate(todayLK()); setTxnAccount(""); setTxnDirection("IN"); setTxnBusiness("HAMAKI");
    setTxnCategory("COD_SETTLEMENT"); setTxnAmount(""); setTxnCodCleared(""); setTxnVendor(""); setTxnReference(""); setTxnNotes("");
  }

  function startEdit(row: Txn) {
    if (row.category === "TRANSFER") return showError("Transfers are linked entries. Void and re-enter the transfer instead.");
    setEditingTxn(row); setTxnDate(row.txn_date); setTxnAccount(row.account_id); setTxnDirection(row.direction); setTxnBusiness(row.business);
    setTxnCategory(row.category); setTxnAmount(String(Math.round(n(row.amount)))); setTxnCodCleared(row.cod_cleared_amount == null ? "" : String(Math.round(n(row.cod_cleared_amount))));
    setTxnVendor(row.vendor_id || ""); setTxnReference(row.reference || ""); setTxnNotes(row.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveTransaction() {
    if (!txnAccount || n(txnAmount) <= 0) return showError("Select an account and enter an amount.");
    if (txnCategory === "SUPPLIER_PAYMENT" && !txnVendor) return showError("Select the supplier for a supplier payment.");
    if (txnCategory === "COD_SETTLEMENT" && txnDirection !== "IN") return showError("COD settlement must be Money In.");
    setSavingTxn(true);
    try {
      const payload = {
        txn_date: txnDate, account_id: txnAccount, direction: txnDirection, amount: n(txnAmount), business: txnBusiness,
        category: txnCategory, vendor_id: txnVendor || null,
        cod_cleared_amount: txnCategory === "COD_SETTLEMENT" ? (txnCodCleared ? n(txnCodCleared) : n(txnAmount)) : null,
        reference: txnReference.trim() || null, notes: txnNotes.trim() || null,
      };
      if (editingTxn) {
        const { error } = await supabase.rpc("update_bank_transaction", {
          p_id: editingTxn.id, p_txn_date: payload.txn_date, p_account_id: payload.account_id, p_direction: payload.direction,
          p_amount: payload.amount, p_business: payload.business, p_category: payload.category, p_vendor_id: payload.vendor_id,
          p_cod_cleared_amount: payload.cod_cleared_amount, p_reference: payload.reference, p_notes: payload.notes,
        });
        if (error) throw error;
        showSuccess("Bank transaction updated ✅");
      } else {
        const { error } = await supabase.from("bank_transactions").insert(payload);
        if (error) throw error;
        showSuccess("Bank transaction recorded ✅");
      }
      resetTxn(); await Promise.all([loadCore(), loadTransactions()]);
    } catch (e: any) { showError(e?.message || "Could not save transaction"); }
    finally { setSavingTxn(false); }
  }

  async function voidTransaction(row: Txn) {
    const reason = window.prompt(row.category === "TRANSFER" ? "Reason for voiding this transfer (both sides will be voided):" : "Reason for voiding this transaction:");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("void_bank_transaction", { p_id: row.id, p_reason: reason.trim() });
    if (error) return showError(error.message);
    showSuccess(row.category === "TRANSFER" ? "Transfer voided on both accounts ✅" : "Transaction voided ✅");
    await Promise.all([loadCore(), loadTransactions()]);
  }

  async function saveTransfer() {
    if (!transferFrom || !transferTo || n(transferAmount) <= 0) return showError("Enter both accounts and transfer amount.");
    const { error } = await supabase.rpc("create_bank_transfer", {
      p_txn_date: transferDate, p_from_account: transferFrom, p_to_account: transferTo, p_amount: n(transferAmount),
      p_business: transferBusiness, p_reference: null, p_notes: null,
    });
    if (error) return showError(error.message);
    setTransferAmount(""); showSuccess("Transfer recorded on both accounts ✅"); await Promise.all([loadCore(), loadTransactions()]);
  }

  async function reconcile() {
    if (!reconAccount || actualBalance === "") return showError("Select account and enter actual bank balance.");
    const { data, error } = await supabase.rpc("reconcile_bank_account", { p_account_id: reconAccount, p_date: reconDate, p_actual_balance: n(actualBalance), p_notes: null });
    if (error) return showError(error.message);
    const diff = n(Array.isArray(data) ? data[0]?.difference : data?.difference);
    showSuccess(`Reconciliation saved. Difference: ${wholeRs(diff)} ${Math.abs(diff) < 0.5 ? "✅" : ""}`); setActualBalance(""); await loadCore();
  }

  async function saveCodCheck() {
    const expected = n(dashboard?.cod_receivable);
    const { error } = await supabase.from("cod_external_checks").insert({
      check_date: todayLK(), koombiyo_amount: n(codK), trans_express_amount: n(codT), other_amount: n(codOther),
      erp_expected_amount: expected, notes: codNote.trim() || null,
    });
    if (error) return showError(error.message);
    showSuccess("COD external check saved ✅"); setCodK(""); setCodT(""); setCodOther(""); setCodNote("");
  }

  async function saveSettings() {
    const { error } = await supabase.from("banking_settings").update({
      system_start_date: setupStart || null, opening_cod_receivable: n(setupCodOpening), opening_cod_note: setupCodNote.trim() || null, updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) return showError(error.message);
    showSuccess("Banking start settings saved ✅"); await loadCore();
  }

  async function addAccount() {
    if (!newAccountName.trim() || !newOpeningDate || newOpeningBalance === "") return showError("Account name, opening date and balance are required.");
    const { error } = await supabase.from("bank_accounts").insert({
      account_name: newAccountName.trim(), bank_name: newBankName.trim() || null, account_type: newAccountType, usage_tag: newUsage,
      is_virtual: newVirtual, opening_date: newOpeningDate, opening_balance: n(newOpeningBalance),
    });
    if (error) return showError(error.message);
    setNewAccountName(""); setNewBankName(""); setNewOpeningBalance(""); setNewVirtual(false); showSuccess("Account added ✅"); await loadCore();
  }

  async function toggleAccount(a: BankAccount) {
    const { error } = await supabase.from("bank_accounts").update({ is_active: !a.is_active, closed_at: a.is_active ? todayLK() : null, updated_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return showError(error.message);
    showSuccess(a.is_active ? "Account marked inactive ✅" : "Account reactivated ✅"); await loadCore();
  }

  async function saveSupplierOpening() {
    if (!openingVendor || n(openingVendorAmount) < 0 || !settings?.system_start_date) return showError("Set the system start date, select vendor and enter opening payable.");
    const { error } = await supabase.from("supplier_opening_payables").upsert({
      vendor_id: openingVendor, opening_date: settings.system_start_date, opening_amount: n(openingVendorAmount),
    }, { onConflict: "vendor_id,opening_date" });
    if (error) return showError(error.message);
    setOpeningVendorAmount(""); showSuccess("Opening supplier payable saved ✅"); await loadCore();
  }

  const accountName = (id: string) => accounts.find(a => a.id === id)?.account_name || "Unknown account";
  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.vendor_name || "";

  if (loading && !dashboard) return <div className="soft-card mt-4 p-6 text-[var(--muted)]">Loading Banking & Reconciliation…</div>;

  return (
    <div className="soft-card mt-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em] text-[var(--text)]">Banking & Reconciliation</h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Where the money is, what is still receivable/payable, and whether the books tally with the real bank.</p>
        </div>
        <button className="secondary-btn" onClick={() => void loadCore()}>Refresh</button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {([['overview','Overview'],['transactions','Transactions'],['suppliers','Supplier Payables'],['setup','Setup & Accounts']] as const).map(([k,label]) => (
          <button key={k} className={view===k ? "primary-btn" : "secondary-btn"} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {!settings?.system_start_date && (
        <div className="mt-5 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-[13px] font-semibold text-amber-800">Banking is not started yet. Go to Setup & Accounts and set the cut-off date before entering live movements.</div>
      )}

      {view === "overview" && <>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total book cash" value={wholeRs(dashboard?.total_book_cash)} sub="Across active bank/cash accounts" />
          <Metric label="COD receivable" value={wholeRs(dashboard?.cod_receivable)} sub="Opening + dispatched COD value − returns − settlements" emphasis />
          <Metric label="Supplier payable" value={wholeRs(dashboard?.supplier_payable)} sub="Opening debt + purchases − payments" />
          <Metric label="Latest bank differences" value={wholeRs(dashboard?.latest_reconciliation_difference_abs)} sub="Absolute differences on latest checks" danger={n(dashboard?.latest_reconciliation_difference_abs) > 0.5} />
        </div>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[18px] font-bold">Bank accounts</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Book balance starts from each verified opening balance.</p></div><span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${badge(Boolean(dashboard?.cod_source_detected))}`}>COD order source {dashboard?.cod_source_detected ? `connected${dashboard.cod_source_table ? ` • ${dashboard.cod_source_table}` : ''}` : "not detected"}</span></div>
          <div className="mt-4 overflow-x-auto"><table className="erp-table min-w-[980px]"><thead><tr><th>Account</th><th>Use</th><th className="num">Opening</th><th className="num">Book balance</th><th className="num">Last actual</th><th className="num">Difference</th><th>Last check</th></tr></thead><tbody>
            {activeAccounts.map(a => <tr key={a.id}><td><div className="font-bold">{a.account_name}</div><div className="text-[11px] text-[var(--muted)]">{a.bank_name || a.account_type}</div></td><td>{a.usage_tag}</td><td className="num">{wholeRs(a.opening_balance)}</td><td className="num font-bold">{wholeRs(a.book_balance)}</td><td className="num">{a.last_actual_balance == null ? '—' : wholeRs(a.last_actual_balance)}</td><td className={`num font-bold ${Math.abs(n(a.last_difference)) < .5 ? 'text-green-700' : 'text-red-600'}`}>{a.last_difference == null ? '—' : wholeRs(a.last_difference)}</td><td>{a.last_reconciliation_date || 'Not reconciled'}</td></tr>)}
          </tbody></table></div>
        </section>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <h3 className="text-[18px] font-bold">Reconcile a bank account</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Enter what the bank app/statement actually shows. ERP calculates the book balance automatically.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><select className="soft-input" value={reconAccount} onChange={e=>setReconAccount(e.target.value)}><option value="">Select account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select><input className="soft-input" type="date" value={reconDate} onChange={e=>setReconDate(e.target.value)}/><input className="soft-input" type="number" step="1" placeholder="Actual balance" value={actualBalance} onChange={e=>setActualBalance(e.target.value)}/><button className="primary-btn" onClick={()=>void reconcile()}>Check & Save</button></div>
            {selectedRecon && <div className="mt-3 rounded-[14px] bg-[#f8fafc] p-3 text-[12px] text-[var(--muted)]">Current book balance: <b className="text-[var(--text)]">{wholeRs(selectedRecon.book_balance)}</b>. The saved reconciliation uses the selected date, not today's balance.</div>}
          </section>

          <section className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <h3 className="text-[18px] font-bold">COD external check</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Optional control: compare ERP combined COD receivable with what you can account for at Koombiyo + Trans Express.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2"><input className="soft-input" type="number" step="1" placeholder="Koombiyo owes" value={codK} onChange={e=>setCodK(e.target.value)}/><input className="soft-input" type="number" step="1" placeholder="Trans Express owes" value={codT} onChange={e=>setCodT(e.target.value)}/><input className="soft-input" type="number" step="1" placeholder="Other / adjustment" value={codOther} onChange={e=>setCodOther(e.target.value)}/><input className="soft-input" placeholder="Note (optional)" value={codNote} onChange={e=>setCodNote(e.target.value)}/></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-[#f8fafc] p-3"><span className="text-[12px] text-[var(--muted)]">ERP expected COD: <b className="text-[var(--text)]">{wholeRs(dashboard?.cod_receivable)}</b> • External total now: <b className="text-[var(--text)]">{wholeRs(n(codK)+n(codT)+n(codOther))}</b></span><button className="primary-btn" onClick={()=>void saveCodCheck()}>Save COD Check</button></div>
          </section>
        </div>
      </>}

      {view === "transactions" && <>
        <section className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-[18px] font-bold">{editingTxn ? "Edit transaction" : "Record bank / cash movement"}</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Record one real bank movement, not every COD customer order. Teesupp can be a daily total. COD value excludes delivery and advance already paid.</p></div>{editingTxn && <button className="secondary-btn" onClick={resetTxn}>Cancel edit</button>}</div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input className="soft-input" type="date" value={txnDate} onChange={e=>setTxnDate(e.target.value)}/>
            <select className="soft-input" value={txnAccount} onChange={e=>setTxnAccount(e.target.value)}><option value="">Bank / cash account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select>
            <select className="soft-input" value={txnDirection} onChange={e=>setTxnDirection(e.target.value as 'IN'|'OUT')}><option value="IN">Money In</option><option value="OUT">Money Out</option></select>
            <select className="soft-input" value={txnBusiness} onChange={e=>setTxnBusiness(e.target.value as any)}><option>HAMAKI</option><option>TEESUPP</option><option>PERSONAL</option><option>OTHER</option></select>
            <select className="soft-input" value={txnCategory} onChange={e=>setTxnCategory(e.target.value)}>{categories.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
            <input className="soft-input" type="number" step="1" placeholder="Bank amount" value={txnAmount} onChange={e=>setTxnAmount(e.target.value)}/>
            {txnCategory === 'COD_SETTLEMENT' && <input className="soft-input" type="number" step="1" placeholder="COD cleared (blank = bank amount)" value={txnCodCleared} onChange={e=>setTxnCodCleared(e.target.value)}/>} 
            {txnCategory === 'SUPPLIER_PAYMENT' && <select className="soft-input" value={txnVendor} onChange={e=>setTxnVendor(e.target.value)}><option value="">Select supplier</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select>}
            <input className="soft-input" placeholder="Reference" value={txnReference} onChange={e=>setTxnReference(e.target.value)}/><input className="soft-input" placeholder="Notes" value={txnNotes} onChange={e=>setTxnNotes(e.target.value)}/>
          </div>
          {txnCategory === 'COD_SETTLEMENT' && <div className="mt-3 rounded-[14px] bg-blue-50 p-3 text-[12px] text-blue-800">COD cleared is the receivable settled, excluding delivery charge and any advance already paid. If courier clears Rs. 500,000 of COD but only deposits Rs. 470,000 after deductions, enter <b>Bank amount 470,000</b> and <b>COD cleared 500,000</b>.</div>}
          <div className="mt-4"><button className="primary-btn" disabled={savingTxn} onClick={()=>void saveTransaction()}>{savingTxn ? 'Saving…' : editingTxn ? 'Save Changes' : '+ Record Transaction'}</button></div>
        </section>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <h3 className="text-[18px] font-bold">Transfer between own accounts</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Creates linked OUT + IN entries. Net business cash does not change.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5"><input className="soft-input" type="date" value={transferDate} onChange={e=>setTransferDate(e.target.value)}/><select className="soft-input" value={transferFrom} onChange={e=>setTransferFrom(e.target.value)}><option value="">From account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select><select className="soft-input" value={transferTo} onChange={e=>setTransferTo(e.target.value)}><option value="">To account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select><input className="soft-input" type="number" step="1" placeholder="Amount" value={transferAmount} onChange={e=>setTransferAmount(e.target.value)}/><button className="primary-btn" onClick={()=>void saveTransfer()}>Record Transfer</button></div>
        </section>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-[18px] font-bold">Transaction history</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Filter any date range and trace every recorded movement.</p></div><button className="secondary-btn" onClick={()=>void loadTransactions()}>Apply Filters</button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6"><input className="soft-input" type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/><input className="soft-input" type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/><select className="soft-input" value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}><option value="">All accounts</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select><select className="soft-input" value={filterBusiness} onChange={e=>setFilterBusiness(e.target.value)}><option value="">All businesses</option><option>HAMAKI</option><option>TEESUPP</option><option>PERSONAL</option><option>OTHER</option></select><select className="soft-input" value={filterDirection} onChange={e=>setFilterDirection(e.target.value)}><option value="">In + Out</option><option value="IN">Money In</option><option value="OUT">Money Out</option></select><select className="soft-input" value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}><option value="">All categories</option><option value="TRANSFER">Own-account transfer</option>{categories.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
          <div className="mt-4 overflow-x-auto"><table className="erp-table min-w-[1200px]"><thead><tr><th>Date</th><th>Account</th><th>Business</th><th>Category</th><th>Reference</th><th>Supplier</th><th className="num">In</th><th className="num">Out</th><th className="num">COD cleared</th><th className="center">Action</th></tr></thead><tbody>{transactions.map(r=><tr key={r.id}><td>{r.txn_date}</td><td className="font-semibold">{accountName(r.account_id)}</td><td>{r.business}</td><td>{r.category==='TRANSFER'?'Own-account transfer':(categoryLabel.get(r.category)||r.category)}</td><td>{r.reference||'—'}</td><td>{vendorName(r.vendor_id)||'—'}</td><td className="num font-semibold text-green-700">{r.direction==='IN'?wholeRs(r.amount):'—'}</td><td className="num font-semibold text-red-600">{r.direction==='OUT'?wholeRs(r.amount):'—'}</td><td className="num">{r.category==='COD_SETTLEMENT'?wholeRs(r.cod_cleared_amount ?? r.amount):'—'}</td><td className="center"><div className="flex justify-center gap-3">{r.category!=='TRANSFER'&&<button className="text-[12px] font-bold text-blue-700 hover:underline" onClick={()=>startEdit(r)}>Edit</button>}<button className="text-[12px] font-bold text-red-600 hover:underline" onClick={()=>void voidTransaction(r)}>Void</button></div></td></tr>)}</tbody></table>{!transactions.length&&<div className="p-5 text-center text-[13px] text-[var(--muted)]">No transactions in this filter.</div>}</div>
        </section>
      </>}

      {view === "suppliers" && <>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"><Metric label="Opening supplier debt" value={wholeRs(supplierRows.reduce((s,r)=>s+n(r.opening_payable),0))} sub="Outstanding at cut-off"/><Metric label="Purchases since start" value={wholeRs(supplierRows.reduce((s,r)=>s+n(r.purchases_since_start),0))} sub="Automatic from RM purchases"/><Metric label="Current supplier payable" value={wholeRs(supplierRows.reduce((s,r)=>s+Math.max(0,n(r.outstanding)),0))} sub="What Hamaki still owes" emphasis/></div>
        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm"><h3 className="text-[18px] font-bold">Vendor balances</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Full raw-material purchase values are automatic. Only actual payments are recorded in Banking.</p><div className="mt-4 overflow-x-auto"><table className="erp-table min-w-[900px]"><thead><tr><th>Vendor</th><th className="num">Opening payable</th><th className="num">Purchases</th><th className="num">Paid</th><th className="num">Outstanding</th></tr></thead><tbody>{supplierRows.map(r=><tr key={r.vendor_id}><td><div className="font-bold">{r.vendor_name}</div><div className="text-[11px] text-[var(--muted)]">{r.vendor_code}</div></td><td className="num">{wholeRs(r.opening_payable)}</td><td className="num">{wholeRs(r.purchases_since_start)}</td><td className="num">{wholeRs(r.payments_since_start)}</td><td className={`num font-extrabold ${n(r.outstanding)>0?'text-amber-700':'text-green-700'}`}>{wholeRs(r.outstanding)}</td></tr>)}</tbody></table></div></section>
      </>}

      {view === "setup" && <>
        <section className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm"><h3 className="text-[18px] font-bold">System cut-off & opening COD</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Set the date from which the new Banking system becomes authoritative. Old months do not need to be reconstructed.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="soft-input" type="date" value={setupStart} onChange={e=>setSetupStart(e.target.value)}/><input className="soft-input" type="number" step="1" placeholder="Opening combined COD receivable" value={setupCodOpening} onChange={e=>setSetupCodOpening(e.target.value)}/><input className="soft-input" placeholder="Opening COD note" value={setupCodNote} onChange={e=>setSetupCodNote(e.target.value)}/><button className="primary-btn" onClick={()=>void saveSettings()}>Save Start Position</button></div></section>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm"><h3 className="text-[18px] font-bold">Add bank / cash account</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Accounts are dynamic. Add future banks here instead of changing code.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input className="soft-input" placeholder="Account name" value={newAccountName} onChange={e=>setNewAccountName(e.target.value)}/><input className="soft-input" placeholder="Bank name" value={newBankName} onChange={e=>setNewBankName(e.target.value)}/><select className="soft-input" value={newAccountType} onChange={e=>setNewAccountType(e.target.value)}><option>CURRENT</option><option>SAVINGS</option><option>CASH</option><option>CARD</option><option>OTHER</option></select><select className="soft-input" value={newUsage} onChange={e=>setNewUsage(e.target.value)}><option>HAMAKI</option><option>TEESUPP</option><option>MIXED</option><option>PERSONAL</option><option>OTHER</option></select><input className="soft-input" type="date" value={newOpeningDate} onChange={e=>setNewOpeningDate(e.target.value)}/><input className="soft-input" type="number" step="1" placeholder="Verified opening balance" value={newOpeningBalance} onChange={e=>setNewOpeningBalance(e.target.value)}/><label className="flex items-center gap-2 rounded-[12px] border border-[#d7dee8] px-3 text-[13px]"><input type="checkbox" checked={newVirtual} onChange={e=>setNewVirtual(e.target.checked)}/> Virtual account (e.g. Cash on Hand)</label><button className="primary-btn" onClick={()=>void addAccount()}>+ Add Account</button></div></section>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm"><h3 className="text-[18px] font-bold">Opening supplier payables</h3><p className="mt-1 text-[12px] text-[var(--muted)]">Enter only what was already owed at the cut-off. New RM purchases are picked up automatically.</p><div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]"><select className="soft-input" value={openingVendor} onChange={e=>setOpeningVendor(e.target.value)}><option value="">Select vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select><input className="soft-input" type="number" step="1" placeholder="Opening amount owed" value={openingVendorAmount} onChange={e=>setOpeningVendorAmount(e.target.value)}/><button className="primary-btn" onClick={()=>void saveSupplierOpening()}>Save Opening Payable</button></div></section>

        <section className="mt-5 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm"><h3 className="text-[18px] font-bold">Manage accounts</h3><div className="mt-4 overflow-x-auto"><table className="erp-table min-w-[900px]"><thead><tr><th>Account</th><th>Type</th><th>Use</th><th>Opening date</th><th className="num">Opening balance</th><th>Status</th><th className="center">Action</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td className="font-bold">{a.account_name}</td><td>{a.account_type}</td><td>{a.usage_tag}</td><td>{a.opening_date}</td><td className="num">{wholeRs(a.opening_balance)}</td><td>{a.is_active?'Active':'Inactive'}</td><td className="center"><button className={`text-[12px] font-bold hover:underline ${a.is_active?'text-red-600':'text-green-700'}`} onClick={()=>void toggleAccount(a)}>{a.is_active?'Make inactive':'Reactivate'}</button></td></tr>)}</tbody></table></div></section>
      </>}
    </div>
  );
}

function Metric({ label, value, sub, emphasis=false, danger=false }: { label:string; value:string; sub:string; emphasis?:boolean; danger?:boolean }) {
  return <div className={`rounded-[16px] border p-4 ${danger?'border-red-200 bg-red-50':emphasis?'border-green-200 bg-green-50':'border-[#d7dee8] bg-white'}`}><div className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div><div className={`mt-2 text-[20px] font-extrabold ${danger?'text-red-700':emphasis?'text-green-700':'text-[var(--text)]'}`}>{value}</div><div className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{sub}</div></div>;
}
