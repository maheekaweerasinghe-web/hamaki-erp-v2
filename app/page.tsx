"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Product = {
  id: string;
  sku: string;
  product_type: string;
  material: string;
  color: string;
  size: string;
  selling_price: number;
};

type CartItem = {
  product_id: string;
  sku: string;
  product_type: string;
  material: string;
  color: string;
  size: string;
  name: string;
  qty: number;
  unit_price: number;
  extra_addon: string;
  extra_price: number;
  discount: number;
  line_total: number;
};

type TabKey =
  | "sales"
  | "rm"
  | "inventory"
  | "rmBalance"
  | "pending"
  | "dispatchedToday"
  | "dispatched7"
  | "stock"
  | "dashboard";

type PendingOrderRow = {
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
  sales_person: string | null;
  sales_code: string | null;
};

type DispatchedTodayRow = {
  order_id: string;
  dispatched_at: string;
  order_no: string;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  address: string | null;
  city: string | null;
  product_summary: string | null;
  balance: number;
};

type AppUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  sales_code: string;
  is_active: boolean;
  auth_user_id?: string | null;
};

type AuthMode = "signin" | "ready";

const ROLE_TABS: Record<string, TabKey[]> = {
  ADMIN: [
    "sales",
    "rm",
    "inventory",
    "rmBalance",
    "pending",
    "dispatchedToday",
    "dispatched7",
    "stock",
    "dashboard",
  ],
  SALES: [
    "sales",
    "pending",
    "dispatchedToday",
    "dispatched7",
    "dashboard",
  ],
  ACCOUNTANT: [
    "rm",
    "inventory",
    "rmBalance",
    "pending",
    "dispatchedToday",
    "dispatched7",
    "stock",
    "dashboard",
  ],
};

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}

type RMMaterial = {
  id: string;
  material_code: string;
  material_name: string;
  variant: string | null;
  unit: string | null;
  category: string | null;
  reorder_level: number;
  status: string;
};

type RMVendor = {
  id: string;
  vendor_code: string;
  vendor_name: string;
  phone: string | null;
  notes: string | null;
  status: string;
};

type RMBalanceRow = {
  rm_material_id: string;
  material_code: string;
  material_name: string;
  variant: string | null;
  unit: string | null;
  reorder_level: number;
  total_in: number;
  total_out: number;
  stock_on_hand: number;
  weighted_avg_cost: number;
  stock_value: number;
  status: string;
};

type RMMovementRow = {
  id: string;
  movement_date: string;
  movement_type: "PURCHASE" | "ISSUE";
  qty_in: number;
  qty_out: number;
  unit: string | null;
  unit_cost: number;
  line_value: number;
  note: string | null;
  created_at: string;
  material_code: string;
  material_name: string;
  variant: string | null;
  vendor_name: string | null;
};

export default function Home() {
  function formatRs(value: number) {
    return "Rs. " + value.toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function todayDisplay() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear());
    return `${day}/${month}/${year}`;
  }

  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");

  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
const [authMode, setAuthMode] = useState<AuthMode>("signin");
const [authEmail, setAuthEmail] = useState("");
const [authPassword, setAuthPassword] = useState("");
const [authLoading, setAuthLoading] = useState(true);
const [authSubmitting, setAuthSubmitting] = useState(false);

  const [saleDate, setSaleDate] = useState(todayDisplay());
  const [customerName, setCustomerName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [retailWholesale, setRetailWholesale] = useState("Retail");
  const [salePlatform, setSalePlatform] = useState("Facebook");
  const [transactionType, setTransactionType] = useState("COD");

  const [pendingDupMsg, setPendingDupMsg] = useState("");
  const [recentDispatchDupMsg, setRecentDispatchDupMsg] = useState("");

  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [extraAddon, setExtraAddon] = useState("");
  const [extraPrice, setExtraPrice] = useState("0");
  const [discount, setDiscount] = useState("0");

  const [deliveryCharge, setDeliveryCharge] = useState("0");
  const [advance, setAdvance] = useState("0");

  const [cart, setCart] = useState<CartItem[]>([]);
const [message, setMessage] = useState("");
const [toastType, setToastType] = useState<"success" | "error" | "info">("info");

useEffect(() => {
  if (!message) return;

  const t = setTimeout(() => {
    setMessage("");
  }, toastType === "error" ? 12000 : 3500);

  return () => clearTimeout(t);
}, [message, toastType]);

  const [orderNo, setOrderNo] = useState("");
  const [loadingOrderNo, setLoadingOrderNo] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [bulkActing, setBulkActing] = useState(false);

  const [actingOrderId, setActingOrderId] = useState("");

  const [dispatchedTodaySearchPhone, setDispatchedTodaySearchPhone] = useState("");
  const [dispatchedTodayRows, setDispatchedTodayRows] = useState<DispatchedTodayRow[]>([]);
  const [dispatchedTodayLoading, setDispatchedTodayLoading] = useState(false);

  const [dispatched7SearchPhone, setDispatched7SearchPhone] = useState("");
  const [dispatched7Rows, setDispatched7Rows] = useState<DispatchedTodayRow[]>([]);
  const [dispatched7Loading, setDispatched7Loading] = useState(false);

  const [stockQuery, setStockQuery] = useState("");
const [stockRows, setStockRows] = useState<any[]>([]);
const [stockLoading, setStockLoading] = useState(false);

const [stockStats, setStockStats] = useState({
  total_skus: 0,
  negative_count: 0,
  low_count: 0,
  potential_value: 0,
});

  const [rmMaterials, setRmMaterials] = useState<RMMaterial[]>([]);
  const [rmVendors, setRmVendors] = useState<RMVendor[]>([]);
  const [rmBalanceRows, setRmBalanceRows] = useState<RMBalanceRow[]>([]);
  const [rmRecentRows, setRmRecentRows] = useState<RMMovementRow[]>([]);

  const [rmDate, setRmDate] = useState(todayDisplay());
  const [rmType, setRmType] = useState<"PURCHASE" | "ISSUE">("PURCHASE");
  const [rmSearch, setRmSearch] = useState("");
  const [selectedRmMaterialId, setSelectedRmMaterialId] = useState("");
  const [selectedRmVendorId, setSelectedRmVendorId] = useState("");
  const [rmUnitCost, setRmUnitCost] = useState("0");
  const [rmQty, setRmQty] = useState("");
  const [rmNote, setRmNote] = useState("");

  const [newRmMaterialName, setNewRmMaterialName] = useState("");
  const [newRmVariant, setNewRmVariant] = useState("");
  const [newRmUnit, setNewRmUnit] = useState("");
  const [newRmCategory, setNewRmCategory] = useState("");

  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorPhone, setNewVendorPhone] = useState("");
  const [newVendorNotes, setNewVendorNotes] = useState("");

  const [rmLoading, setRmLoading] = useState(false);
  const [rmSubmitting, setRmSubmitting] = useState(false);
  const [rmRegisteringMaterial, setRmRegisteringMaterial] = useState(false);
  const [rmRegisteringVendor, setRmRegisteringVendor] = useState(false);

  const [rmBalanceSearch, setRmBalanceSearch] = useState("");
  const [rmBalanceStatus, setRmBalanceStatus] = useState("All");
  const [rmBalanceSortBy, setRmBalanceSortBy] = useState("Status");
  const [rmBalanceDirection, setRmBalanceDirection] = useState("Asc");

  const [inventoryDate, setInventoryDate] = useState(todayDisplay());
  const [inventoryDirection, setInventoryDirection] = useState<"IN" | "OUT">("IN");
  const [inventorySearch, setInventorySearch] = useState("");
  const [selectedInventoryProductId, setSelectedInventoryProductId] = useState("");
  const [inventoryQty, setInventoryQty] = useState("0");
  const [inventorySellPrice, setInventorySellPrice] = useState("0");
  const [inventoryReason, setInventoryReason] = useState("Production");
  const [inventoryNote, setInventoryNote] = useState("");
  const [inventorySubmitting, setInventorySubmitting] = useState(false);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  const [dashboardData, setDashboardData] = useState<any>({});
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const [newProductSku, setNewProductSku] = useState("");
  const [newProductType, setNewProductType] = useState("");
  const [newProductMaterial, setNewProductMaterial] = useState("");
  const [newProductColor, setNewProductColor] = useState("");
  const [newProductSize, setNewProductSize] = useState("");
  const [newProductCostPrice, setNewProductCostPrice] = useState("0");
  const [newProductSellingPrice, setNewProductSellingPrice] = useState("0");
  const [registeringProduct, setRegisteringProduct] = useState(false);

  const [activeTab, setActiveTab] = useState<TabKey>("sales");
  const roleKey = normalizeRole(currentUser?.role);
const allowedTabs = ROLE_TABS[roleKey] || [];

  useEffect(() => {
  setMessage("");
}, [activeTab]);

useEffect(() => {
  if (!currentUser) return;
  if (!allowedTabs.length) return;

  if (!allowedTabs.includes(activeTab)) {
    setActiveTab(allowedTabs[0]);
  }
}, [currentUser, activeTab, allowedTabs]);

  const [pendingSearchPhone, setPendingSearchPhone] = useState("");
  const [pendingOrders, setPendingOrders] = useState<PendingOrderRow[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);

  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const qtyRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
  if (!currentUser) return;

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, sku, product_type, material, color, size, selling_price")
      .eq("is_active", true)
      .order("sku", { ascending: true });

    if (error) {
      console.log("PRODUCT LOAD ERROR:", error);
      setMessage("Error loading products");
      return;
    }

    console.log("PRODUCTS LOADED:", data);

    const rows = (data || []) as Product[];
    setProducts(rows);
    setFilteredProducts(rows.slice(0, 50));
  }

  loadProducts();
}, [currentUser]);

  useEffect(() => {
  let isMounted = true;

  async function bootstrapAuth() {
    try {
      setAuthLoading(true);
      setLoadingUser(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        if (isMounted) {
          setMessage("Auth session error: " + sessionError.message);
          setCurrentUser(null);
          setAuthMode("signin");
        }
        return;
      }

      const sessionUser = session?.user;
      if (!sessionUser?.id) {
        if (isMounted) {
          setCurrentUser(null);
          setAuthMode("signin");
        }
        return;
      }

      const { data, error } = await supabase
        .from("users")
        .select("id, email, full_name, role, sales_code, is_active, auth_user_id")
        .eq("auth_user_id", sessionUser.id)
        .eq("is_active", true)
        .single();

      if (error) {
        if (isMounted) {
          setMessage("Error loading user: " + error.message);
          setCurrentUser(null);
          setAuthMode("signin");
        }
        return;
      }

      const user = data as AppUser;
      if (isMounted) {
        setCurrentUser(user);
        setAuthMode("ready");
      }

      if (user?.sales_code) {
        await fetchNextOrderNo(user.sales_code);
      }
    } finally {
      if (isMounted) {
        setAuthLoading(false);
        setLoadingUser(false);
      }
    }
  }

  void bootstrapAuth();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    void bootstrapAuth();
  });

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);

  useEffect(() => {
  const hasAnyPhone = String(phone1 || "").trim() || String(phone2 || "").trim();

  if (!hasAnyPhone) {
    setPendingDupMsg("");
    setRecentDispatchDupMsg("");
    return;
  }

  const t = setTimeout(() => {
    void checkDuplicateWarnings(phone1, phone2);
  }, 300);

  return () => clearTimeout(t);
}, [phone1, phone2]);
  
  useEffect(() => {
    const q = search.trim().toLowerCase();

    if (!q) {
      setFilteredProducts(products.slice(0, 50));
      return;
    }

    const words = q.split(/\s+/).filter(Boolean);

    const filtered = products.filter((p) => {
      const text =
        `${p.sku} ${p.product_type} ${p.material} ${p.color} ${p.size}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });

    setFilteredProducts(filtered.slice(0, 50));
  }, [search, products]);

  useEffect(() => {
    const selected = products.find((p) => p.id === selectedProductId);
    if (selected) {
      setPrice(String(Number(selected.selling_price || 0)));
    } else {
      setPrice("");
    }
  }, [selectedProductId, products]);

  useEffect(() => {
  if (activeTab !== "dispatchedToday") return;

  const t = setTimeout(() => {
    void fetchDispatchedOrdersToday(dispatchedTodaySearchPhone);
  }, 250);

  return () => clearTimeout(t);
}, [activeTab, dispatchedTodaySearchPhone]);

  useEffect(() => {
  if (activeTab !== "pending") return;

  const t = setTimeout(() => {
    void fetchPendingOrders(pendingSearchPhone);
  }, 250);

  return () => clearTimeout(t);
}, [activeTab, pendingSearchPhone]);

useEffect(() => {
  if (activeTab !== "dispatched7") return;

  const t = setTimeout(() => {
    void fetchDispatchedOrdersLast7Days(dispatched7SearchPhone);
  }, 250);

  return () => clearTimeout(t);
}, [activeTab, dispatched7SearchPhone]);


useEffect(() => {
  if (activeTab !== "stock") return;

  fetchStockStats();

  const t = setTimeout(() => {
    fetchStock(stockQuery);
  }, 300);

  return () => clearTimeout(t);
}, [activeTab, stockQuery]);

useEffect(() => {
  if (activeTab !== "dashboard") return;
  void loadDashboard();
}, [activeTab]);

useEffect(() => {
  if (activeTab !== "rm") return;
  void loadRMTabData();
}, [activeTab]);

  useEffect(() => {
    const t = setTimeout(() => {
      productSearchRef.current?.focus();
    }, 150);

    return () => clearTimeout(t);
  }, []);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const qtyNum = Number(qty || 0);
  const priceNum = Number(price || 0);
  const extraPriceNum = Number(extraPrice || 0);
  const discountNum = Number(discount || 0);
  const deliveryChargeNum = Number(deliveryCharge || 0);
  const advanceNum = Number(advance || 0);

  const subtotal = cart.reduce((sum, item) => sum + item.line_total, 0);
  const orderTotal = subtotal + deliveryChargeNum;
  const balance = orderTotal - advanceNum;

    const filteredRmMaterials = useMemo(() => {
    const q = rmSearch.trim().toLowerCase();

    if (!q) return rmMaterials.slice(0, 200);

    const words = q.split(/\s+/).filter(Boolean);

    return rmMaterials.filter((m) => {
      const text = `${m.material_code} ${m.material_name} ${m.variant || ""} ${m.unit || ""} ${m.category || ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    }).slice(0, 200);
  }, [rmSearch, rmMaterials]);

  const selectedRmMaterial = useMemo(
    () => rmMaterials.find((m) => m.id === selectedRmMaterialId) || null,
    [rmMaterials, selectedRmMaterialId]
  );

  const selectedRmVendor = useMemo(
    () => rmVendors.find((v) => v.id === selectedRmVendorId) || null,
    [rmVendors, selectedRmVendorId]
  );

  const selectedRmBalance = useMemo(
    () => rmBalanceRows.find((r) => r.rm_material_id === selectedRmMaterialId) || null,
    [rmBalanceRows, selectedRmMaterialId]
  );

  const rmQtyNum = Number(rmQty || 0);
  const rmUnitCostNum = Number(rmUnitCost || 0);
  const rmTotal = rmQtyNum * rmUnitCostNum;

    const filteredInventoryProducts = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();

    if (!q) return products.slice(0, 100);

    const words = q.split(/\s+/).filter(Boolean);

    return products.filter((p) => {
      const text =
        `${p.sku} ${p.product_type} ${p.material} ${p.color} ${p.size}`.toLowerCase();
      return words.every((w) => text.includes(w));
    }).slice(0, 100);
  }, [inventorySearch, products]);

  const selectedInventoryProduct = useMemo(
    () => products.find((p) => p.id === selectedInventoryProductId) || null,
    [products, selectedInventoryProductId]
  );

  const inventoryQtyNum = Number(inventoryQty || 0);
  const inventorySellPriceNum = Number(inventorySellPrice || 0);
  const inventoryProductionValue =
    inventoryDirection === "IN"
      ? Number((inventoryQtyNum * inventorySellPriceNum).toFixed(2))
      : 0;

    const rmBalanceSummary = useMemo(() => {
    const totalMaterials = rmBalanceRows.length;
    const outOfStock = rmBalanceRows.filter((r) => Number(r.stock_on_hand || 0) <= 0).length;
    const lowStock = rmBalanceRows.filter(
      (r) =>
        Number(r.stock_on_hand || 0) > 0 &&
        Number(r.reorder_level || 0) > 0 &&
        Number(r.stock_on_hand || 0) <= Number(r.reorder_level || 0)
    ).length;
    const totalStockValue = rmBalanceRows.reduce(
      (sum, r) => sum + Number(r.stock_value || 0),
      0
    );

    return {
      totalMaterials,
      outOfStock,
      lowStock,
      totalStockValue,
    };
  }, [rmBalanceRows]);

  const filteredSortedRMBalanceRows = useMemo(() => {
    let rows = [...rmBalanceRows];

    const q = rmBalanceSearch.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      rows = rows.filter((r) => {
        const text = `${r.material_code} ${r.material_name} ${r.variant || ""} ${r.unit || ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      });
    }

    if (rmBalanceStatus === "Out") {
      rows = rows.filter((r) => Number(r.stock_on_hand || 0) <= 0);
    }

    if (rmBalanceStatus === "Low") {
      rows = rows.filter(
        (r) =>
          Number(r.stock_on_hand || 0) > 0 &&
          Number(r.reorder_level || 0) > 0 &&
          Number(r.stock_on_hand || 0) <= Number(r.reorder_level || 0)
      );
    }

    if (rmBalanceStatus === "OK") {
      rows = rows.filter((r) => {
        const stock = Number(r.stock_on_hand || 0);
        const reorder = Number(r.reorder_level || 0);
        return stock > 0 && (reorder <= 0 || stock > reorder);
      });
    }

    const dir = rmBalanceDirection === "Asc" ? 1 : -1;

    rows.sort((a, b) => {
      const aStock = Number(a.stock_on_hand || 0);
      const bStock = Number(b.stock_on_hand || 0);
      const aReorder = Number(a.reorder_level || 0);
      const bReorder = Number(b.reorder_level || 0);

      const aStatus =
        aStock <= 0 ? 0 : aReorder > 0 && aStock <= aReorder ? 1 : 2;
      const bStatus =
        bStock <= 0 ? 0 : bReorder > 0 && bStock <= bReorder ? 1 : 2;

      switch (rmBalanceSortBy) {
        case "Material ID":
          return a.material_code.localeCompare(b.material_code) * dir;
        case "Material Name":
          return a.material_name.localeCompare(b.material_name) * dir;
        case "Stock":
          return (aStock - bStock) * dir;
        case "Avg Cost":
          return (Number(a.weighted_avg_cost || 0) - Number(b.weighted_avg_cost || 0)) * dir;
        case "Stock Value":
          return (Number(a.stock_value || 0) - Number(b.stock_value || 0)) * dir;
        case "Status":
        default:
          return (aStatus - bStatus) * dir;
      }
    });

    return rows;
  }, [
    rmBalanceRows,
    rmBalanceSearch,
    rmBalanceStatus,
    rmBalanceSortBy,
    rmBalanceDirection,
  ]);

  useEffect(() => {
  if (!selectedRmMaterialId) {
    setRmUnitCost("0");
    return;
  }

  if (rmType === "ISSUE") {
    const wac = Number(selectedRmBalance?.weighted_avg_cost || 0);
    setRmUnitCost(String(wac));
  } else if (rmType === "PURCHASE") {
    setRmUnitCost("0");
  }
}, [rmType, selectedRmMaterialId, selectedRmBalance]);
useEffect(() => {
  if (!selectedRmMaterialId) return;

  const selectedStillExists = filteredRmMaterials.some(
    (m) => m.id === selectedRmMaterialId
  );

  if (!selectedStillExists) {
    setSelectedRmMaterialId("");
  }
}, [filteredRmMaterials, selectedRmMaterialId]);

useEffect(() => {
  if (activeTab !== "rmBalance") return;
  void fetchRMBalanceRows();
}, [activeTab]);

useEffect(() => {
  if (inventoryDirection === "IN") {
    setInventoryReason("Production");
  } else {
    setInventoryReason("Stock Balance");
  }
}, [inventoryDirection]);

useEffect(() => {
  if (!selectedInventoryProductId) {
    if (inventoryDirection === "IN") setInventorySellPrice("0");
    return;
  }

  if (inventoryDirection === "IN" && selectedInventoryProduct) {
    setInventorySellPrice(String(Number(selectedInventoryProduct.selling_price || 0)));
  }
}, [selectedInventoryProductId, selectedInventoryProduct, inventoryDirection]);

useEffect(() => {
  if (activeTab !== "inventory") return;
  void loadRecentInventoryMovements();
}, [activeTab]);

async function loadRecentInventoryMovements() {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(`
      id,
      movement_date,
      direction,
      qty,
      reference_type,
      reference_no,
      note,
      products (
        sku,
        product_type,
        material,
        color,
        size
      )
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    setMessage("Recent inventory movements load failed: " + error.message);
    return;
  }

  setRecentMovements(data || []);
}

  async function fetchNextOrderNo(salesCode?: string) {
    const code = (salesCode || currentUser?.sales_code || "").trim();

    if (!code) {
      setMessage("Sales code not found");
      return null;
    }

    try {
      setLoadingOrderNo(true);

      const { data, error } = await supabase.rpc("get_next_order_no", {
        p_sales_code: code,
      });

      if (error) {
        setMessage("Error generating order number: " + error.message);
        return null;
      }

      const newOrderNo = String(data || "");
      setOrderNo(newOrderNo);
      return newOrderNo;
    } catch (err: any) {
      setMessage("Error generating order number: " + (err?.message || "Unknown error"));
      return null;
    } finally {
      setLoadingOrderNo(false);
    }
  }

  function pickProductById(id: string) {
    setSelectedProductId(id);

    const picked = products.find((p) => p.id === id);
    if (picked) {
      setSearch(
        `${picked.sku} • ${picked.product_type} • ${picked.material} • ${picked.color} • ${picked.size}`
      );
      setFilteredProducts([picked]);
    }
  }

  function selectFirstFilteredProduct() {
    if (!filteredProducts.length) {
      setMessage("No matching product found");
      return;
    }

    pickProductById(filteredProducts[0].id);

    setTimeout(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 0);
  }

  function resetItemEntry() {
    setSelectedProductId("");
    setSearch("");
    setFilteredProducts(products.slice(0, 50));
    setQty("1");
    setPrice("");
    setExtraAddon("");
    setExtraPrice("0");
    setDiscount("0");
  }

  function addToCart() {
    if (!selectedProduct) {
      setMessage("Please select a product");
      return;
    }

    if (qtyNum <= 0) {
      setMessage("Quantity must be more than 0");
      return;
    }

    const lineTotal = qtyNum * priceNum + extraPriceNum - discountNum;

    const item: CartItem = {
  product_id: selectedProduct.id,
  sku: selectedProduct.sku,
  product_type: selectedProduct.product_type,
  material: selectedProduct.material,
  color: selectedProduct.color,
  size: selectedProduct.size,
  name: `${selectedProduct.product_type} • ${selectedProduct.material} • ${selectedProduct.color} • ${selectedProduct.size}`,
  qty: qtyNum,
  unit_price: priceNum,
  extra_addon: extraAddon,
  extra_price: extraPriceNum,
  discount: discountNum,
  line_total: Number(lineTotal || 0),
};

    setCart((prev) => [...prev, item]);
    resetItemEntry();
    

    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 0);
  }

  function removeCartItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
    
  }

  function clearCartOnly() {
    resetItemEntry();
    setCart([]);

    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 0);
  }

  async function clearSale() {
    setSaleDate(todayDisplay());
    setCustomerName("");
    setPhone1("");
    setPhone2("");
    setAddress("");
    setCity("");
    setRetailWholesale("Retail");
    setSalePlatform("Facebook");
    setTransactionType("COD");
    setDeliveryCharge("0");
    setAdvance("0");
    setCart([]);
    resetItemEntry();
    setPendingDupMsg("");
    setRecentDispatchDupMsg("");

    setMessage("Sale cleared ✅");

    if (currentUser?.sales_code) {
      await fetchNextOrderNo(currentUser.sales_code);
    }

    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 0);
  }

  function toOrderDateISO(input: string) {
  const value = String(input || "").trim();

  // Supports yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00+05:30`;
  }

  // Supports dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [dd, mm, yyyy] = value.split("/");
    return `${yyyy}-${mm}-${dd}T00:00:00+05:30`;
  }

  // fallback = today in Sri Lanka offset style
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T00:00:00+05:30`;
}

async function checkDuplicateWarnings(phoneA?: string, phoneB?: string) {
  const p1 = String(phoneA || "").trim();
  const p2 = String(phoneB || "").trim();

  if (!p1 && !p2) {
    setPendingDupMsg("");
    setRecentDispatchDupMsg("");
    return;
  }

  const { data, error } = await supabase.rpc("check_order_duplicate_warnings", {
    p_phone_primary: p1 || null,
    p_phone_secondary: p2 || null,
  });

  if (error) {
    console.error("Duplicate check error:", error.message);
    setPendingDupMsg("");
    setRecentDispatchDupMsg("");
    return;
  }

  const pendingOrderNo = data?.pending_order_no || "";
  const recentDispatchOrderNo = data?.recent_dispatch_order_no || "";
  const recentDispatchedAt = data?.recent_dispatched_at || "";

  if (pendingOrderNo) {
    setPendingDupMsg(`Duplicate pending order: ${pendingOrderNo}`);
  } else {
    setPendingDupMsg("");
  }

  if (recentDispatchOrderNo && recentDispatchedAt) {
    const dispatchedDate = new Date(recentDispatchedAt);
    const now = new Date();
    const diffMs = now.getTime() - dispatchedDate.getTime();
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    setRecentDispatchDupMsg(
      `Duplicate dispatched order ${diffDays} day${diffDays === 1 ? "" : "s"} ago: ${recentDispatchOrderNo}`
    );
  } else {
    setRecentDispatchDupMsg("");
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchPendingOrders(phoneQuery = "") {
  try {
    setPendingLoading(true);

    const { data, error } = await supabase.rpc("get_pending_orders", {
      p_phone_query: phoneQuery.trim() || null,
      p_limit: 200,
    });

    if (error) {
      setMessage("Pending orders load failed: " + error.message);
      return;
    }

    setPendingOrders((data || []) as PendingOrderRow[]);
    setSelectedPendingIds([]);
  } catch (err: any) {
    setMessage("Pending orders load failed: " + (err?.message || "Unknown error"));
  } finally {
    setPendingLoading(false);
  }
}

async function fetchStock(query = "") {
  try {
    setStockLoading(true);

    const { data, error } = await supabase.rpc("search_stock", {
      p_query: query.trim() || null,
      p_limit: 200,
    });

    if (error) {
      setMessage("Stock load failed: " + error.message);
      return;
    }

    setStockRows(data || []);
  } finally {
    setStockLoading(false);
  }
}

async function fetchStockStats() {
  const { data, error } = await supabase.rpc("get_stock_dashboard");

  if (!error && data && data.length > 0) {
    setStockStats(data[0]);
  }
}

async function fetchRMMaterials() {
  const { data, error } = await supabase
    .from("rm_materials")
    .select("id, material_code, material_name, variant, unit, category, reorder_level, status")
    .eq("status", "ACTIVE")
    .order("material_code", { ascending: true });

  if (error) {
    setMessage("RM materials load failed: " + error.message);
    return;
  }

  setRmMaterials((data || []) as RMMaterial[]);
}

async function fetchRMVendors() {
  const { data, error } = await supabase
    .from("rm_vendors")
    .select("id, vendor_code, vendor_name, phone, notes, status")
    .eq("status", "ACTIVE")
    .order("vendor_code", { ascending: true });

  if (error) {
    setMessage("RM vendors load failed: " + error.message);
    return;
  }

  setRmVendors((data || []) as RMVendor[]);
}

async function fetchRMBalanceRows() {
  const { data, error } = await supabase
    .from("v_rm_balance")
    .select("*")
    .order("material_code", { ascending: true });

  if (error) {
    setMessage("RM balance load failed: " + error.message);
    return;
  }

  setRmBalanceRows((data || []) as RMBalanceRow[]);
}

async function fetchRMRecentRows() {
  const { data, error } = await supabase
    .from("rm_movements")
    .select(`
      id,
      movement_date,
      movement_type,
      qty_in,
      qty_out,
      unit,
      unit_cost,
      line_value,
      note,
      created_at,
      rm_materials!inner(material_code, material_name, variant),
      rm_vendors(vendor_name)
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    setMessage("Recent RM movements load failed: " + error.message);
    return;
  }

  const rows: RMMovementRow[] = (data || []).map((row: any) => ({
    id: row.id,
    movement_date: row.movement_date,
    movement_type: row.movement_type,
    qty_in: Number(row.qty_in || 0),
    qty_out: Number(row.qty_out || 0),
    unit: row.unit,
    unit_cost: Number(row.unit_cost || 0),
    line_value: Number(row.line_value || 0),
    note: row.note,
    created_at: row.created_at,
    material_code: row.rm_materials?.material_code || "",
    material_name: row.rm_materials?.material_name || "",
    variant: row.rm_materials?.variant || "",
    vendor_name: row.rm_vendors?.vendor_name || null,
  }));

  setRmRecentRows(rows);
}

async function loadDashboard() {
  setDashboardLoading(true);

  try {
    const { data, error } = await supabase.rpc("get_dashboard_data");

    if (error) {
      showError("Dashboard load failed: " + error.message);
      return;
    }

    const parsed =
      typeof data === "string"
        ? JSON.parse(data)
        : data;

    console.log("DASHBOARD RPC PARSED:", parsed);
    console.log("DASHBOARD SALESPERSON:", parsed?.salesperson);

    setDashboardData(parsed || {});
    showSuccess("Dashboard loaded ✅");
  } catch (err: any) {
    showError("Dashboard load failed: " + (err?.message || "Unknown error"));
  } finally {
    setDashboardLoading(false);
  }
}

async function loadRMTabData() {
  try {
    setRmLoading(true);
    await Promise.all([
      fetchRMMaterials(),
      fetchRMVendors(),
      fetchRMBalanceRows(),
      fetchRMRecentRows(),
    ]);
  } finally {
    setRmLoading(false);
  }
}

function resetRMForm() {
  setRmDate(todayDisplay());
  setRmType("PURCHASE");
  setRmSearch("");
  setSelectedRmMaterialId("");
  setSelectedRmVendorId("");
  setRmUnitCost("0");
  setRmQty("");
  setRmNote("");
}

async function handleSubmitRM() {
  if (!currentUser?.id) {
    setMessage("Current user not found");
    return;
  }

  if (!selectedRmMaterial) {
    setMessage("Please select a raw material");
    return;
  }

  if (rmQtyNum <= 0) {
    setMessage("Qty must be more than 0");
    return;
  }

  if (rmType === "PURCHASE" && rmUnitCostNum <= 0) {
    setMessage("Unit cost must be more than 0 for purchase");
    return;
  }

  try {
    setRmSubmitting(true);
    showInfo("Saving RM entry...");

    const payload = {
      movement_date: toOrderDateISO(rmDate),
      movement_type: rmType,
      rm_material_id: selectedRmMaterial.id,
      vendor_id: selectedRmVendorId || null,
      qty_in: rmType === "PURCHASE" ? Number(rmQtyNum.toFixed(2)) : 0,
      qty_out: rmType === "ISSUE" ? Number(rmQtyNum.toFixed(2)) : 0,
      unit: selectedRmMaterial.unit || null,
      unit_cost: Number(rmUnitCostNum.toFixed(2)),
      line_value: Number(rmTotal.toFixed(2)),
      note: rmNote || null,
      entered_by_user_id: currentUser.id,
    };

    const { error } = await supabase.from("rm_movements").insert(payload);

    if (error) {
      showError("RM save failed: " + error.message);
      return;
    }

    showSuccess("RM entry saved ✅");
    resetRMForm();
    await loadRMTabData();
  } catch (err: any) {
    showError("RM save failed: " + (err?.message || "Unknown error"));
  } finally {
    setRmSubmitting(false);
  }
}

async function handleRegisterRMMaterial() {
  if (!newRmMaterialName.trim()) {
    setMessage("Material name is required");
    return;
  }

  try {
    setRmRegisteringMaterial(true);
    setMessage("Registering material...");

    const { data: lastRows, error: lastError } = await supabase
      .from("rm_materials")
      .select("material_code")
      .order("material_code", { ascending: false })
      .limit(1);

    if (lastError) {
      setMessage("Material register failed: " + lastError.message);
      return;
    }

    let nextNum = 1;
    const lastCode = lastRows?.[0]?.material_code || "";
    const match = String(lastCode).match(/^RM(\d+)$/i);
    if (match) nextNum = Number(match[1]) + 1;

    const nextCode = `RM${String(nextNum).padStart(4, "0")}`;

    const { error } = await supabase.from("rm_materials").insert({
      material_code: nextCode,
      material_name: newRmMaterialName.trim(),
      variant: newRmVariant.trim() || null,
      unit: newRmUnit.trim() || null,
      category: newRmCategory.trim() || null,
      reorder_level: 0,
      status: "ACTIVE",
    });

    if (error) {
      setMessage("Material register failed: " + error.message);
      return;
    }

    setMessage(`Material registered ✅ ${nextCode}`);
    setNewRmMaterialName("");
    setNewRmVariant("");
    setNewRmUnit("");
    setNewRmCategory("");
    await fetchRMMaterials();
  } catch (err: any) {
    setMessage("Material register failed: " + (err?.message || "Unknown error"));
  } finally {
    setRmRegisteringMaterial(false);
  }
}

async function handleRegisterRMVendor() {
  if (!newVendorName.trim()) {
    setMessage("Vendor name is required");
    return;
  }

  try {
    setRmRegisteringVendor(true);
    setMessage("Registering vendor...");

    const { data: lastRows, error: lastError } = await supabase
      .from("rm_vendors")
      .select("vendor_code")
      .order("vendor_code", { ascending: false })
      .limit(1);

    if (lastError) {
      setMessage("Vendor register failed: " + lastError.message);
      return;
    }

    let nextNum = 1;
    const lastCode = lastRows?.[0]?.vendor_code || "";
    const match = String(lastCode).match(/^V(\d+)$/i);
    if (match) nextNum = Number(match[1]) + 1;

    const nextCode = `V${String(nextNum).padStart(3, "0")}`;

    const { error } = await supabase.from("rm_vendors").insert({
      vendor_code: nextCode,
      vendor_name: newVendorName.trim(),
      phone: newVendorPhone.trim() || null,
      notes: newVendorNotes.trim() || null,
      status: "ACTIVE",
    });

    if (error) {
      setMessage("Vendor register failed: " + error.message);
      return;
    }

    setMessage(`Vendor registered ✅ ${nextCode}`);
    setNewVendorName("");
    setNewVendorPhone("");
    setNewVendorNotes("");
    await fetchRMVendors();
  } catch (err: any) {
    setMessage("Vendor register failed: " + (err?.message || "Unknown error"));
  } finally {
    setRmRegisteringVendor(false);
  }
}

function resetInventoryForm() {
  setInventoryDate(todayDisplay());
  setInventoryDirection("IN");
  setInventorySearch("");
  setSelectedInventoryProductId("");
  setInventoryQty("0");
  setInventorySellPrice("0");
  setInventoryReason("Production");
  setInventoryNote("");
}

function resetNewProductForm() {
  setNewProductSku("");
  setNewProductType("");
  setNewProductMaterial("");
  setNewProductColor("");
  setNewProductSize("");
  setNewProductCostPrice("0");
  setNewProductSellingPrice("0");
}

async function handleSubmitInventory() {
  if (!currentUser?.id) {
    setMessage("Current user not found");
    return;
  }

  if (!selectedInventoryProduct) {
    setMessage("Please select a product");
    return;
  }

  if (inventoryQtyNum <= 0) {
    setMessage("Qty must be more than 0");
    return;
  }

  if (inventoryDirection === "IN" && inventorySellPriceNum <= 0) {
    setMessage("Sell price must be more than 0 for IN");
    return;
  }

  if (inventoryReason === "Other" && !inventoryNote.trim()) {
    setMessage("Note is required when reason is Other");
    return;
  }

  try {
    setInventorySubmitting(true);
    showInfo("Saving inventory entry...");

    const payload = {
      movement_date: toOrderDateISO(inventoryDate),
      product_id: selectedInventoryProduct.id,
      direction: inventoryDirection,
      qty: Number(inventoryQtyNum.toFixed(2)),
      sell_price_at_time:
        inventoryDirection === "IN"
          ? Number(inventorySellPriceNum.toFixed(2))
          : null,
      production_value:
        inventoryDirection === "IN"
          ? Number(inventoryProductionValue.toFixed(2))
          : null,
      reference_type: inventoryReason,
      reference_id: null,
      reference_no: null,
      note: inventoryNote.trim() || null,
      entered_by_user_id: currentUser.id,
    };

    const { error } = await supabase.from("stock_movements").insert(payload);

    if (error) {
      showError("Inventory save failed: " + error.message);
      return;
    }

    showSuccess("Inventory entry saved ✅");
    resetInventoryForm();
    await loadProductsForInventoryRefresh();
    await loadRecentInventoryMovements();
  } catch (err: any) {
    showError("Inventory save failed: " + (err?.message || "Unknown error"));
  } finally {
    setInventorySubmitting(false);
  }
}

async function handleRegisterProduct() {
  if (!newProductSku.trim()) {
    setMessage("SKU is required");
    return;
  }

  if (!newProductType.trim()) {
    setMessage("Product type is required");
    return;
  }

  if (!newProductMaterial.trim()) {
    setMessage("Material is required");
    return;
  }

  if (!newProductColor.trim()) {
    setMessage("Color is required");
    return;
  }

  if (!newProductSize.trim()) {
    setMessage("Size is required");
    return;
  }

  if (Number(newProductSellingPrice || 0) < 0) {
    setMessage("Selling price is invalid");
    return;
  }

  try {
    setRegisteringProduct(true);
    setMessage("Registering product...");

    const payload = {
      sku: newProductSku.trim(),
      product_type: newProductType.trim(),
      material: newProductMaterial.trim(),
      color: newProductColor.trim(),
      size: newProductSize.trim(),
      cost_price: Number(newProductCostPrice || 0),
      selling_price: Number(newProductSellingPrice || 0),
      is_active: true,
    };

    const { data, error } = await supabase
      .from("products")
      .insert(payload)
      .select("id, sku, product_type, material, color, size, selling_price")
      .single();

    if (error) {
      setMessage("Product register failed: " + error.message);
      return;
    }

    setMessage(`Product registered ✅ ${payload.sku}`);
    resetNewProductForm();
    await loadProductsForInventoryRefresh();

    if (data?.id) {
      setSelectedInventoryProductId(data.id);
      setInventorySearch(
        `${data.sku} • ${data.product_type} • ${data.material} • ${data.color} • ${data.size}`
      );
      setInventorySellPrice(String(Number(data.selling_price || 0)));
    }
  } catch (err: any) {
    setMessage("Product register failed: " + (err?.message || "Unknown error"));
  } finally {
    setRegisteringProduct(false);
  }
}

async function loadProductsForInventoryRefresh() {
  const { data, error } = await supabase
    .from("products")
    .select("id, sku, product_type, material, color, size, selling_price")
    .eq("is_active", true)
    .order("sku", { ascending: true });

  if (!error) {
    setProducts((data || []) as Product[]);
    setFilteredProducts((data || []).slice(0, 50) as Product[]);
  }
}

async function handlePendingOrderAction(
  orderId: string,
  newStatus: "DISPATCHED" | "CANCELLED"
) {
  if (!currentUser?.id) {
    setMessage("Current user not found");
    return;
  }

  try {
    setActingOrderId(orderId);
    setMessage(`${newStatus === "DISPATCHED" ? "Dispatching" : "Cancelling"} order...`);

    const { error } = await supabase.rpc("update_order_status", {
      p_order_id: orderId,
      p_new_status: newStatus,
      p_action_by_user_id: currentUser.id,
    });

    if (error) {
      setMessage("Order action failed: " + error.message);
      return;
    }

    setMessage(
      newStatus === "DISPATCHED"
        ? "Order marked as dispatched ✅"
        : "Order cancelled ✅"
    );

    await fetchPendingOrders(pendingSearchPhone);
  } catch (err: any) {
    setMessage("Order action failed: " + (err?.message || "Unknown error"));
  } finally {
    setActingOrderId("");
  }
}

function togglePendingSelection(orderId: string) {
  setSelectedPendingIds((prev) =>
    prev.includes(orderId)
      ? prev.filter((id) => id !== orderId)
      : [...prev, orderId]
  );
}

function showSuccess(msg: string) {
  setToastType("success");
  setMessage(msg);
}

function showError(msg: string) {
  setToastType("error");
  setMessage(msg);
}

function showInfo(msg: string) {
  setToastType("info");
  setMessage(msg);
}

function toggleSelectAllPending() {
  const visibleIds = pendingOrders.map((row) => row.order_id);

  if (
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedPendingIds.includes(id))
  ) {
    setSelectedPendingIds([]);
  } else {
    setSelectedPendingIds(visibleIds);
  }
}

async function handleBulkPendingAction(
  newStatus: "DISPATCHED" | "CANCELLED"
) {
  if (!currentUser?.id) {
    setMessage("Current user not found");
    return;
  }

  if (!selectedPendingIds.length) {
    setMessage("No pending orders selected");
    return;
  }

  try {
    setBulkActing(true);
    setMessage(
      `${newStatus === "DISPATCHED" ? "Dispatching" : "Cancelling"} selected orders...`
    );

    const { data, error } = await supabase.rpc("bulk_update_order_status", {
      p_order_ids: selectedPendingIds,
      p_new_status: newStatus,
      p_action_by_user_id: currentUser.id,
    });

    if (error) {
      setMessage("Bulk action failed: " + error.message);
      return;
    }

    const updatedCount = Array.isArray(data)
      ? Number(data[0]?.updated_count || 0)
      : Number((data as any)?.updated_count || 0);

    setMessage(
      `${
        newStatus === "DISPATCHED" ? "Dispatched" : "Cancelled"
      } ${updatedCount} order(s) ✅`
    );

    setSelectedPendingIds([]);
    await fetchPendingOrders(pendingSearchPhone);
  } catch (err: any) {
    setMessage("Bulk action failed: " + (err?.message || "Unknown error"));
  } finally {
    setBulkActing(false);
  }
}

async function fetchDispatchedOrdersToday(phoneQuery = "") {
  try {
    setDispatchedTodayLoading(true);

    const { data, error } = await supabase.rpc("get_dispatched_orders_today", {
      p_phone_query: phoneQuery.trim() || null,
      p_limit: 200,
    });

    if (error) {
      setMessage("Dispatched today load failed: " + error.message);
      return;
    }

    setDispatchedTodayRows((data || []) as DispatchedTodayRow[]);
  } catch (err: any) {
    setMessage("Dispatched today load failed: " + (err?.message || "Unknown error"));
  } finally {
    setDispatchedTodayLoading(false);
  }
}
async function fetchDispatchedOrdersLast7Days(phoneQuery = "") {
  try {
    setDispatched7Loading(true);

    const { data, error } = await supabase.rpc("get_dispatched_orders_last_7_days", {
      p_phone_query: phoneQuery.trim() || null,
      p_limit: 500,
    });

    if (error) {
      setMessage("Dispatched 7 days load failed: " + error.message);
      return;
    }

    setDispatched7Rows((data || []) as DispatchedTodayRow[]);
  } catch (err: any) {
    setMessage("Dispatched 7 days load failed: " + (err?.message || "Unknown error"));
  } finally {
    setDispatched7Loading(false);
  }
}

  async function handleSubmitOrder() {
  if (!cart.length) {
    setMessage("Cart is empty");
    return;
  }

  if (!currentUser?.id) {
    setMessage("Current user not found");
    return;
  }

  if (!currentUser?.sales_code) {
    setMessage("Sales code not found");
    return;
  }

  if (!orderNo) {
    setMessage("Order number not ready");
    return;
  }

  if (submitting) return;

  try {
    setSubmitting(true);
    showInfo(`Saving order ${orderNo}...`);

    const baseSubtotal = cart.reduce(
      (sum, item) => sum + item.qty * item.unit_price,
      0
    );

    const extraTotal = cart.reduce(
      (sum, item) => sum + Number(item.extra_price || 0),
      0
    );

    const discountTotal = cart.reduce(
      (sum, item) => sum + Number(item.discount || 0),
      0
    );

    const itemsNetTotal = cart.reduce(
      (sum, item) => sum + Number(item.line_total || 0),
      0
    );

    const delivery = Number(deliveryCharge || 0);
    const adv = Number(advance || 0);
    const finalOrderTotal = itemsNetTotal + delivery;
    const finalBalance = finalOrderTotal - adv;

    const itemPayloads = cart.map((item) => ({
      product_id: item.product_id,
      sku_snapshot: item.sku,
      product_type_snapshot: item.product_type,
      material_snapshot: item.material,
      color_snapshot: item.color,
      size_snapshot: item.size,
      qty: Number(item.qty.toFixed(2)),
      unit_price: Number(item.unit_price.toFixed(2)),
      extra_addon: item.extra_addon || "",
      extra_price: Number(item.extra_price.toFixed(2)),
      discount: Number(item.discount.toFixed(2)),
      line_total: Number(item.line_total.toFixed(2)),
    }));

    const { data, error } = await supabase.rpc("create_order_with_items", {
      p_order_no: orderNo,
      p_order_date: toOrderDateISO(saleDate),
      p_customer_id: null,
      p_customer_name_snapshot: customerName || null,
      p_phone_primary: phone1 || null,
      p_phone_secondary: phone2 || null,
      p_address_snapshot: address || null,
      p_city_snapshot: city || null,
      p_retail_wholesale: retailWholesale || null,
      p_sale_platform: salePlatform || null,
      p_transaction_type: transactionType || null,
      p_sales_user_id: currentUser.id,
      p_subtotal: Number(baseSubtotal.toFixed(2)),
      p_delivery_charge: Number(delivery.toFixed(2)),
      p_discount_total: Number(discountTotal.toFixed(2)),
      p_extra_total: Number(extraTotal.toFixed(2)),
      p_order_total: Number(finalOrderTotal.toFixed(2)),
      p_advance: Number(adv.toFixed(2)),
      p_balance: Number(finalBalance.toFixed(2)),
      p_status: "PENDING",
      p_created_by_user_id: currentUser.id,
      p_action_by_user_id: currentUser.id,
      p_items: itemPayloads,
    });

    if (error) {
      showError("Order save failed: " + error.message);
      return;
    }

    const saved = Array.isArray(data) ? data[0] : data;
    const savedOrderNo = saved?.order_no || orderNo;

    showSuccess(`Order saved successfully ✅ ${savedOrderNo}`);

    setSaleDate(todayDisplay());
    setCustomerName("");
    setPhone1("");
    setPhone2("");
    setAddress("");
    setCity("");
    setRetailWholesale("Retail");
    setSalePlatform("Facebook");
    setTransactionType("COD");
    setDeliveryCharge("0");
    setAdvance("0");
    setCart([]);
    resetItemEntry();

    await fetchNextOrderNo(currentUser.sales_code);

    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 0);
  } catch (err: any) {
    showError("Submit failed: " + (err?.message || "Unknown error"));
  } finally {
    setSubmitting(false);
  }
}

  function handleZeroFocus(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) {
    if (value === "0") setter("");
  }

  function handleZeroBlur(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) {
    if (value.trim() === "") setter("0");
  }
  async function handleSignIn() {
  if (!authEmail.trim() || !authPassword.trim()) {
    setMessage("Email and password are required");
    return;
  }

  try {
    setAuthSubmitting(true);
    

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    });

    if (error) {
      setMessage("Sign in failed: " + error.message);
      return;
    }

    setAuthPassword("");
    
  } catch (err: any) {
    setMessage("Sign in failed: " + (err?.message || "Unknown error"));
  } finally {
    setAuthSubmitting(false);
  }
}

async function handleSignOut() {
  try {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthMode("signin");
    setAuthEmail("");
    setAuthPassword("");
    
  } catch (err: any) {
    setMessage("Sign out failed: " + (err?.message || "Unknown error"));
  }
}

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      {message && (
  <div className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2">
    <div
      className={`min-w-[280px] max-w-[420px] rounded-[16px] px-4 py-3 text-[15px] font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.18)] ${
        toastType === "success"
          ? "bg-green-600 text-white"
          : toastType === "error"
          ? "bg-red-600 text-white"
          : "bg-[var(--brand)] text-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span>{message}</span>
        <button
          className="text-white/80 hover:text-white"
          onClick={() => setMessage("")}
        >
          ✕
        </button>
      </div>
    </div>
  </div>
)}
      <header className="bg-[var(--brand-dark)] px-5 py-4 text-white shadow-md">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between">
          <h1 className="text-[20px] font-bold tracking-[0.2px] text-white">
            Hamaki ERP Portal
          </h1>
          <div className="rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white">
            {currentUser ? `${currentUser.email} • ${currentUser.role}` : "Not signed in"}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1380px] p-5">
        {authLoading ? (
    <div className="soft-card p-6">
      <div className="text-[18px] font-bold text-[var(--text)]">
        Checking login...
      </div>
    </div>
  ) : authMode === "signin" || !currentUser ? (
    <div className="flex min-h-[70vh] items-center justify-center">
  <div className="w-full max-w-[520px] rounded-[28px] border border-[#d7dee8] bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">

    <div className="mb-8 text-center">
      <h2 className="text-[34px] font-extrabold tracking-[-0.02em] text-[var(--text)]">
        Team HAMAKI Login
      </h2>
      <div className="mt-2 text-[14px] font-medium text-[var(--muted)]">
        Hamaki Apperal (pvt) Ltd.
      </div>
    </div>

    <div className="grid grid-cols-1 gap-4">
      <input
        className="soft-input h-[54px] text-[16px]"
        placeholder="Email"
        value={authEmail}
        onChange={(e) => setAuthEmail(e.target.value)}
      />

      <input
        type="password"
        className="soft-input h-[54px] text-[16px]"
        placeholder="Password"
        value={authPassword}
        onChange={(e) => setAuthPassword(e.target.value)}
      />

      <button
        className="mt-2 h-[54px] rounded-[16px] bg-[var(--brand)] text-[16px] font-bold text-white shadow-[0_10px_24px_rgba(37,59,148,0.28)] transition hover:opacity-95 disabled:opacity-60"
        onClick={handleSignIn}
        disabled={authSubmitting}
      >
        {authSubmitting ? "Signing In..." : "Sign In"}
      </button>
    </div>

  </div>
</div>
  ) : (
  <>

  <div className="soft-card p-4">
  <div className="flex flex-wrap gap-3">
    {(currentUser?.role === "ADMIN" || currentUser?.role === "SALES") && (
      <button
        className={`nav-pill ${activeTab === "sales" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("sales")}
      >
        Sales Entry
      </button>
    )}

    {(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "rm" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("rm")}
      >
        RM Entry
      </button>
    )}

    {(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "inventory" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("inventory")}
      >
        Inventory Entry
      </button>
    )}

    {(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "stock" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("stock")}
      >
        Stock Lookup
      </button>
    )}

    {(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "rmBalance" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("rmBalance")}
      >
        RM Balance
      </button>
    )}

    {(currentUser?.role === "ADMIN" ||
      currentUser?.role === "SALES" ||
      currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "pending" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("pending")}
      >
        Pending Orders
      </button>
    )}

    {(currentUser?.role === "ADMIN" ||
      currentUser?.role === "SALES" ||
      currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "dispatchedToday" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("dispatchedToday")}
      >
        Dispatched Today
      </button>
    )}

    {(currentUser?.role === "ADMIN" ||
      currentUser?.role === "SALES" ||
      currentUser?.role === "ACCOUNTANT") && (
      <button
        className={`nav-pill ${activeTab === "dispatched7" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("dispatched7")}
      >
        Last 7 Days
      </button>
    )}

    {["ADMIN", "SALES", "ACCOUNTANT", "MARKETING"].includes(currentUser?.role || "") && (
      <button
        className={`nav-pill ${activeTab === "dashboard" ? "nav-pill-active" : "nav-pill-idle"}`}
        onClick={() => setActiveTab("dashboard")}
      >
        Dashboard
      </button>
    )}

    <div className="ml-auto">
      <button className="secondary-btn" onClick={() => void handleSignOut()}>
        Sign Out
      </button>
    </div>
  </div>
</div>


<div className="mt-4 text-[16px] font-bold text-[var(--success)]">
  {loadingUser ? "Loading user..." : (message || "Ready ✅")}
</div>
 

{(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && activeTab === "rm" && (
  <div className="soft-card mt-4 p-5">
    <h2 className="mb-6 text-[22px] font-bold text-[var(--text)]">RM Entry</h2>

    {rmLoading ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        Loading RM data...
      </div>
    ) : (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="soft-label">Date</label>
            <input
              className="soft-input"
              value={rmDate}
              onChange={(e) => setRmDate(e.target.value)}
            />
          </div>

          <div>
            <label className="soft-label">Type</label>
            <select
              className="soft-input"
              value={rmType}
              onChange={(e) => setRmType(e.target.value as "PURCHASE" | "ISSUE")}
            >
              <option value="PURCHASE">PURCHASE</option>
              <option value="ISSUE">ISSUE</option>
            </select>
          </div>

          <div>
            <label className="soft-label">Search Material</label>
            <input
              className="soft-input"
              value={rmSearch}
              onChange={(e) => setRmSearch(e.target.value)}
              placeholder="type: elastic, lace, zipper..."
            />
          </div>

          <div>
            <label className="soft-label">Select Material</label>
            <select
  className="soft-input"
  value={selectedRmMaterialId}
  onChange={(e) => {
    const id = e.target.value;
    setSelectedRmMaterialId(id);
  }}
  size={selectedRmMaterialId ? 1 : (rmSearch.trim() ? Math.min(filteredRmMaterials.length + 1, 6) : 1)}
>
  <option value="">
    {rmSearch.trim() && filteredRmMaterials.length === 0
      ? "No matching materials"
      : "Select material"}
  </option>

  {filteredRmMaterials.map((m) => (
    <option key={m.id} value={m.id}>
      {m.material_code} • {m.material_name}{m.variant ? ` • ${m.variant}` : ""}{m.unit ? ` • ${m.unit}` : ""}
    </option>
  ))}
</select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="soft-label">Variant</label>
            <input
              className="soft-input"
              value={selectedRmMaterial?.variant || ""}
              readOnly
            />
          </div>

          <div>
            <label className="soft-label">Unit</label>
            <input
              className="soft-input"
              value={selectedRmMaterial?.unit || ""}
              readOnly
            />
          </div>

          <div>
            <label className="soft-label">Vendor</label>
            <select
              className="soft-input"
              value={selectedRmVendorId}
              onChange={(e) => setSelectedRmVendorId(e.target.value)}
            >
              <option value="">(none)</option>
              {rmVendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendor_code} • {v.vendor_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="soft-label">
              Unit Cost {rmType === "PURCHASE" ? "(PURCHASE only)" : "(auto WAC)"}
            </label>
            <input
              className="soft-input"
              value={rmUnitCost}
              onChange={(e) => setRmUnitCost(e.target.value)}
              readOnly={rmType === "ISSUE"}
            />
          </div>

          <div>
            <label className="soft-label">Qty</label>
            <input
              className="soft-input"
              value={rmQty}
              onChange={(e) => setRmQty(e.target.value)}
              placeholder="0"
            />
          </div>

          <div>
            <label className="soft-label">Total</label>
            <input
              className="soft-input"
              value={formatRs(Number(rmTotal || 0))}
              readOnly
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
          <div>
            <label className="soft-label">Note/Invoice</label>
            <input
              className="soft-input"
              value={rmNote}
              onChange={(e) => setRmNote(e.target.value)}
              placeholder="Invoice / Stock Adjustment / Note"
            />
          </div>

          <div className="flex items-end">
            <button
              className="primary-btn w-full"
              onClick={() => void handleSubmitRM()}
              disabled={rmSubmitting}
            >
              {rmSubmitting ? "Saving..." : "Submit RM"}
            </button>
          </div>
        </div>

        <div className="my-6 h-px bg-[#d7dee8]" />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 items-start">
          <div className="pr-4 md:border-r md:border-gray-200">
            <h3 className="mb-4 text-[18px] font-bold">Quick Add New Material</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="soft-label">Material Name</label>
                <input
                  className="soft-input"
                  value={newRmMaterialName}
                  onChange={(e) => setNewRmMaterialName(e.target.value)}
                />
              </div>

              <div>
                <label className="soft-label">Variant</label>
                <input
                  className="soft-input"
                  value={newRmVariant}
                  onChange={(e) => setNewRmVariant(e.target.value)}
                />
              </div>

              <div>
                <label className="soft-label">Unit</label>
                <input
                  className="soft-input"
                  value={newRmUnit}
                  onChange={(e) => setNewRmUnit(e.target.value)}
                  placeholder="Roll / Pcs / Meter"
                />
              </div>

              <div>
                <label className="soft-label">Category</label>
                <input
                  className="soft-input"
                  value={newRmCategory}
                  onChange={(e) => setNewRmCategory(e.target.value)}
                  placeholder="Mesh / Elastic / Lace..."
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                className="secondary-btn"
                onClick={() => void handleRegisterRMMaterial()}
                disabled={rmRegisteringMaterial}
              >
                {rmRegisteringMaterial ? "Registering..." : "Register Material"}
              </button>
            </div>
          </div>

          <div className="pl-4">
            <h3 className="mb-4 text-[18px] font-bold">Quick Add New Vendor</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="soft-label">Vendor Name</label>
                <input
                  className="soft-input"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                />
              </div>

              <div>
                <label className="soft-label">Phone</label>
                <input
                  className="soft-input"
                  value={newVendorPhone}
                  onChange={(e) => setNewVendorPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="soft-label">Notes</label>
              <input
                className="soft-input"
                value={newVendorNotes}
                onChange={(e) => setNewVendorNotes(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <button
                className="secondary-btn"
                onClick={() => void handleRegisterRMVendor()}
                disabled={rmRegisteringVendor}
              >
                {rmRegisteringVendor ? "Registering..." : "Register Vendor"}
              </button>
            </div>
          </div>
        </div>

        <div className="my-6 h-px bg-[#d7dee8]" />

        <div>
          <h3 className="mb-4 text-[18px] font-bold">Last 20 RM Movements</h3>

          {rmRecentRows.length === 0 ? (
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
              No RM movements yet
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Material</th>
                    <th>Vendor</th>
                    <th className="num">Qty</th>
                    <th>Unit</th>
                    <th className="num">Cost</th>
                    <th className="num">Value</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rmRecentRows.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.movement_date)}</td>
                      <td>
  {row.movement_type === "PURCHASE" && (
    <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">
      PURCHASE
    </span>
  )}

  {row.movement_type === "ISSUE" && (
    <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">
      ISSUE
    </span>
  )}
</td>
                      <td>
                        {row.material_code} • {row.material_name}
                        {row.variant ? ` • ${row.variant}` : ""}
                      </td>
                      <td>{row.vendor_name || "-"}</td>
                      <td className="num">
                        <span className={
  row.movement_type === "PURCHASE"
    ? "text-green-600 font-semibold"
    : "text-red-600 font-semibold"
}>
  {row.movement_type === "PURCHASE"
    ? Number(row.qty_in || 0)
    : Number(row.qty_out || 0)}
</span>
                      </td>
                      <td>{row.unit || "-"}</td>
                      <td className="num">{formatRs(Number(row.unit_cost || 0))}</td>
                      <td className="num">{formatRs(Number(row.line_value || 0))}</td>
                      <td>{row.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </>
    )}
  </div>
)}

{(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && activeTab === "rmBalance" && (
  <div className="soft-card mt-4 p-5">
    <h2 className="mb-6 text-[22px] font-bold text-[var(--text)]">RM Balance</h2>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
        <div className="text-sm font-semibold text-[var(--muted)]">Total Materials</div>
        <div className="mt-2 text-[20px] font-bold">{rmBalanceSummary.totalMaterials}</div>
      </div>

      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
        <div className="text-sm font-semibold text-[var(--muted)]">Out of Stock</div>
        <div className="mt-2 text-[20px] font-bold text-red-600">{rmBalanceSummary.outOfStock}</div>
      </div>

      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
        <div className="text-sm font-semibold text-[var(--muted)]">Low Stock</div>
        <div className="mt-2 text-[20px] font-bold text-orange-500">{rmBalanceSummary.lowStock}</div>
      </div>

      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4">
        <div className="text-sm font-semibold text-[var(--muted)]">Total Stock Value</div>
        <div className="mt-2 text-[20px] font-bold">{formatRs(rmBalanceSummary.totalStockValue)}</div>
      </div>
    </div>

    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr]">
      <div>
        <label className="soft-label">Search Material</label>
        <input
          className="soft-input"
          value={rmBalanceSearch}
          onChange={(e) => setRmBalanceSearch(e.target.value)}
          placeholder="Search material ID, name, variant, unit..."
        />
      </div>

      <div>
        <label className="soft-label">Status</label>
        <select
          className="soft-input"
          value={rmBalanceStatus}
          onChange={(e) => setRmBalanceStatus(e.target.value)}
        >
          <option>All</option>
          <option>Out</option>
          <option>Low</option>
          <option>OK</option>
        </select>
      </div>

      <div>
        <label className="soft-label">Sort By</label>
        <select
          className="soft-input"
          value={rmBalanceSortBy}
          onChange={(e) => setRmBalanceSortBy(e.target.value)}
        >
          <option>Status</option>
          <option>Material ID</option>
          <option>Material Name</option>
          <option>Stock</option>
          <option>Avg Cost</option>
          <option>Stock Value</option>
        </select>
      </div>

      <div>
        <label className="soft-label">Direction</label>
        <select
          className="soft-input"
          value={rmBalanceDirection}
          onChange={(e) => setRmBalanceDirection(e.target.value)}
        >
          <option>Asc</option>
          <option>Desc</option>
        </select>
      </div>
    </div>

    <div className="mt-6 overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
      <table className="erp-table">
        <thead>
          <tr>
            <th>Material ID</th>
            <th>Material Name</th>
            <th>Variant</th>
            <th>Unit</th>
            <th className="num">Total In</th>
            <th className="num">Total Out</th>
            <th className="num">Stock</th>
            <th className="num">Reorder Level</th>
            <th className="num">Avg Cost</th>
            <th className="num">Stock Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredSortedRMBalanceRows.map((row) => {
            const stock = Number(row.stock_on_hand || 0);
            const reorder = Number(row.reorder_level || 0);
            const status =
              stock <= 0 ? "OUT" : reorder > 0 && stock <= reorder ? "LOW" : "OK";

            return (
              <tr key={row.rm_material_id}>
                <td>{row.material_code}</td>
                <td>{row.material_name}</td>
                <td>{row.variant || "-"}</td>
                <td>{row.unit || "-"}</td>
                <td className="num">{Number(row.total_in || 0)}</td>
                <td className="num">{Number(row.total_out || 0)}</td>
                <td className={`num font-bold ${status === "OUT" ? "text-red-600" : status === "LOW" ? "text-orange-500" : ""}`}>
                  {stock}
                </td>
                <td className="num">{reorder}</td>
                <td className="num">{formatRs(Number(row.weighted_avg_cost || 0))}</td>
                <td className="num">{formatRs(Number(row.stock_value || 0))}</td>
                <td>
                  {status === "OUT" && (
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">
                      OUT
                    </span>
                  )}
                  {status === "LOW" && (
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-orange-100 text-orange-700">
                      LOW
                    </span>
                  )}
                  {status === "OK" && (
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">
                      OK
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
)}

{(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && activeTab === "inventory" && (
  <div className="soft-card mt-4 p-5">
    <h2 className="mb-6 text-[22px] font-bold text-[var(--text)]">Inventory Entry</h2>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="soft-label">Date</label>
        <input
          className="soft-input"
          value={inventoryDate}
          onChange={(e) => setInventoryDate(e.target.value)}
        />
      </div>

      <div>
        <label
          className={`soft-label font-semibold ${
            inventoryDirection === "IN" ? "text-green-700" : "text-red-700"
          }`}
        >
          Direction
        </label>
        <select
          className="soft-input font-semibold"
          value={inventoryDirection}
          onChange={(e) => setInventoryDirection(e.target.value as "IN" | "OUT")}
        >
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
        </select>
      </div>
    </div>

    <div className="mt-4">
      <label className="soft-label">Product search</label>
      <input
        className="soft-input"
        value={inventorySearch}
        onChange={(e) => {
          setInventorySearch(e.target.value);
          setSelectedInventoryProductId("");
        }}
        placeholder="type sku or words..."
      />
    </div>

    <div className="mt-2">
      <select
        className="listbox-soft"
        size={inventorySearch.trim() ? Math.min(filteredInventoryProducts.length || 1, 8) : 8}
        value={selectedInventoryProductId}
        onChange={(e) => {
          const id = e.target.value;
          setSelectedInventoryProductId(id);

          const picked = filteredInventoryProducts.find((p) => p.id === id);
          if (picked) {
            setInventorySearch(
              `${picked.sku} • ${picked.product_type} • ${picked.material} • ${picked.color} • ${picked.size}`
            );
            if (inventoryDirection === "IN") {
              setInventorySellPrice(String(Number(picked.selling_price || 0)));
            }
          }
        }}
      >
        {filteredInventoryProducts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.sku} • {p.product_type} • {p.material} • {p.color} • {p.size}
          </option>
        ))}
      </select>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      <div>
        <label className="soft-label">Qty</label>
        <input
          className="soft-input"
          value={inventoryQty}
          onChange={(e) => setInventoryQty(e.target.value.replace(/[^\d.]/g, ""))}
          placeholder="0"
        />
      </div>

      <div>
        <label className="soft-label">
          Sell Price At Time {inventoryDirection === "IN" ? "" : "(IN only)"}
        </label>
        <input
          className={`soft-input ${
            inventoryDirection === "OUT" ? "bg-[#f8fafc] text-slate-400" : ""
          }`}
          value={inventoryDirection === "IN" ? inventorySellPrice : ""}
          onChange={(e) =>
            setInventorySellPrice(e.target.value.replace(/[^\d.]/g, ""))
          }
          placeholder={inventoryDirection === "IN" ? "0" : "Not used for OUT"}
          disabled={inventoryDirection === "OUT"}
        />
      </div>

      <div>
        <label
          className={`soft-label font-semibold ${
            inventoryDirection === "IN" ? "text-green-700" : "text-red-700"
          }`}
        >
          Reason
        </label>
        <select
          className="soft-input font-semibold"
          value={inventoryReason}
          onChange={(e) => setInventoryReason(e.target.value)}
        >
          {inventoryDirection === "IN" ? (
            <>
              <option>Production</option>
              <option>Return COD</option>
              <option>Other</option>
            </>
          ) : (
            <>
              <option>Stock Balance</option>
              <option>Item Defect</option>
              <option>Other</option>
            </>
          )}
        </select>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px]">
      <div>
        <label className="soft-label">Note</label>
        <input
          className="soft-input"
          value={inventoryNote}
          onChange={(e) => setInventoryNote(e.target.value)}
          placeholder={
            inventoryReason === "Other"
              ? "Note required for Other"
              : "Optional note"
          }
        />
      </div>

      <div className="flex items-end">
        <button
          className="primary-btn w-full"
          onClick={() => void handleSubmitInventory()}
          disabled={inventorySubmitting}
        >
          {inventorySubmitting ? "Saving..." : "Submit Inventory"}
        </button>
      </div>
    </div>

    <div className="my-6 h-px bg-[#d7dee8]" />

    <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5">
      <h3 className="mb-4 text-[18px] font-bold">Register New Product</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className="soft-label">SKU</label>
          <input
            className="soft-input"
            value={newProductSku}
            onChange={(e) => setNewProductSku(e.target.value)}
          />
        </div>

        <div>
          <label className="soft-label">Product Type</label>
          <input
            className="soft-input"
            value={newProductType}
            onChange={(e) => setNewProductType(e.target.value)}
          />
        </div>

        <div>
          <label className="soft-label">Material</label>
          <input
            className="soft-input"
            value={newProductMaterial}
            onChange={(e) => setNewProductMaterial(e.target.value)}
          />
        </div>

        <div>
          <label className="soft-label">Color</label>
          <input
            className="soft-input"
            value={newProductColor}
            onChange={(e) => setNewProductColor(e.target.value)}
          />
        </div>

        <div>
          <label className="soft-label">Size</label>
          <input
            className="soft-input"
            value={newProductSize}
            onChange={(e) => setNewProductSize(e.target.value)}
          />
        </div>

        <div>
          <label className="soft-label">Cost Price</label>
          <input
            className="soft-input"
            value={newProductCostPrice}
            onChange={(e) => setNewProductCostPrice(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>

        <div>
          <label className="soft-label">Selling Price</label>
          <input
            className="soft-input"
            value={newProductSellingPrice}
            onChange={(e) => setNewProductSellingPrice(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
      </div>

      <div className="mt-4">
        <button
          className="secondary-btn"
          onClick={() => void handleRegisterProduct()}
          disabled={registeringProduct}
        >
          {registeringProduct ? "Registering..." : "Register Product"}
        </button>
      </div>
    </div>
    <div className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5">
  <h3 className="mb-4 text-[18px] font-bold text-[var(--text)]">
    Last 20 Inventory Movements
  </h3>

  {recentMovements.length === 0 ? (
    <div className="rounded-[14px] border border-[#d7dee8] bg-[#f8fafc] p-4 text-[15px] text-[#6b7280]">
      No inventory movements yet
    </div>
  ) : (
    <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
      <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
        <thead>
          <tr className="bg-[#f8fafc] text-left">
            <th className="px-4 py-3 font-bold">Date</th>
            <th className="px-4 py-3 font-bold">Product</th>
            <th className="px-4 py-3 font-bold text-center">Type</th>
            <th className="px-4 py-3 font-bold text-right">Qty</th>
            <th className="px-4 py-3 font-bold">Source</th>
            <th className="px-4 py-3 font-bold">Ref</th>
            <th className="px-4 py-3 font-bold">Note</th>
          </tr>
        </thead>

        <tbody>
          {recentMovements.map((row) => (
            <tr key={row.id} className="border-t border-[#e5ebf2]">
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDateTime(row.movement_date)}
              </td>

              <td className="px-4 py-3 min-w-[320px]">
                <span className="font-semibold">{row.products?.sku}</span>
                {" • "}
                {row.products?.product_type}
                {" • "}
                {row.products?.material}
                {" • "}
                {row.products?.color}
                {" • "}
                {row.products?.size}
              </td>

              <td className="px-4 py-3 text-center">
                {row.direction === "IN" ? (
                  <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                    IN
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                    OUT
                  </span>
                )}
              </td>

              <td className="px-4 py-3 text-right font-semibold">
                {Number(row.qty || 0)}
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {row.reference_type || "-"}
              </td>

              <td className="px-4 py-3 whitespace-nowrap">
                {row.reference_no || "-"}
              </td>

              <td className="px-4 py-3 min-w-[220px]">
                {row.note || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
  </div>
)}

{["ADMIN", "SALES", "ACCOUNTANT", "MARKETING"].includes(currentUser?.role || "") && activeTab === "dashboard" && (
  <div className="soft-card mt-4 p-5">
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h2 className="text-[22px] font-bold text-[var(--text)]">Dashboard</h2>
        <div className="mt-1 text-sm text-[var(--muted)]">
          Sales, cancellations, platform performance and top products
        </div>
      </div>
    </div>

    {dashboardLoading ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        Loading dashboard...
      </div>
    ) : (
      <>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--muted)]">Today Sales</div>
            <div className="mt-3 text-[34px] font-extrabold leading-none text-[var(--text)]">
              {formatRs(Number(dashboardData?.summary?.today_sales || 0))}
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">
              Orders: <span className="font-semibold text-[var(--text)]">{Number(dashboardData?.summary?.today_orders || 0)}</span>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--muted)]">MTD Sales</div>
            <div className="mt-3 text-[34px] font-extrabold leading-none text-[var(--text)]">
              {formatRs(Number(dashboardData?.mtd?.sales || 0))}
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">
              Orders: <span className="font-semibold text-[var(--text)]">{Number(dashboardData?.mtd?.orders || 0)}</span>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--muted)]">MTD Cancelled</div>
            <div className="mt-3 text-[34px] font-extrabold leading-none text-red-600">
              {Number(dashboardData?.mtd?.cancelled || 0)}
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">
              Cancelled orders this month
            </div>
          </div>

          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-[var(--muted)]">MTD Cancel Rate</div>
            <div className="mt-3 text-[34px] font-extrabold leading-none text-orange-500">
              {(
                ((Number(dashboardData?.mtd?.cancelled || 0) /
                  Math.max(Number(dashboardData?.mtd?.orders || 0), 1)) *
                  100) || 0
              ).toFixed(1)}
              %
            </div>
            <div className="mt-3 text-sm text-[var(--muted)]">
              Cancelled / total orders
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[var(--text)]">Last 5 Days Performance</h3>
              <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                newest first
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
                <thead>
                  <tr className="bg-[#f8fafc] text-left">
                    <th className="px-4 py-3 font-bold">Date</th>
                    <th className="px-4 py-3 font-bold text-right">Orders</th>
                    <th className="px-4 py-3 font-bold text-right">Sales</th>
                    <th className="px-4 py-3 font-bold text-right">Cancelled</th>
                    <th className="px-4 py-3 font-bold text-right">Net Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboardData?.last5days || []).map((row: any, i: number) => (
                    <tr key={i} className="border-t border-[#e5ebf2]">
                      <td className="px-4 py-3 whitespace-nowrap">{row.day}</td>
                      <td className="px-4 py-3 text-right">{Number(row.orders || 0)}</td>
                      <td className="px-4 py-3 text-right">{formatRs(Number(row.sales || 0))}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">
                        {Number(row.cancelled || 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {formatRs(Number(row.net_sales || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-bold text-[var(--text)]">MTD by Platform</h3>
              <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                highest sales first
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
                <thead>
                  <tr className="bg-[#f8fafc] text-left">
                    <th className="px-4 py-3 font-bold">Platform</th>
                    <th className="px-4 py-3 font-bold text-right">Orders</th>
                    <th className="px-4 py-3 font-bold text-right">Sales</th>
                    <th className="px-4 py-3 font-bold text-right">Cancelled</th>
                    <th className="px-4 py-3 font-bold text-right">Cancel %</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboardData?.platform || []).map((row: any, i: number) => (
                    <tr key={i} className="border-t border-[#e5ebf2]">
                      <td className="px-4 py-3 font-semibold">{row.sale_platform}</td>
                      <td className="px-4 py-3 text-right">{Number(row.orders || 0)}</td>
                      <td className="px-4 py-3 text-right">{formatRs(Number(row.sales || 0))}</td>
                      <td className="px-4 py-3 text-right text-red-600 font-semibold">
                        {Number(row.cancelled || 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {Number(row.cancel_rate || 0).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[18px] font-bold text-[var(--text)]">
              Sales Team Performance (MTD)
            </h3>
            <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              by sales person
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
              <thead>
                <tr className="bg-[#f8fafc] text-left">
                  <th className="px-4 py-3 font-bold">Sales Person</th>
                  <th className="px-4 py-3 font-bold text-right">Orders</th>
                  <th className="px-4 py-3 font-bold text-right">Sales</th>
                  <th className="px-4 py-3 font-bold text-right">Cancelled</th>
                  <th className="px-4 py-3 font-bold text-right">Cancel %</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.salesperson || []).map((row: any, i: number) => (
                  <tr key={i} className="border-t border-[#e5ebf2]">
                    <td className="px-4 py-3 font-semibold">
  {row.sales_person || row.sales_code || "Unknown"}
</td>
                    <td className="px-4 py-3 text-right">{Number(row.orders || 0)}</td>
                    <td className="px-4 py-3 text-right">{formatRs(Number(row.sales || 0))}</td>
                    <td className="px-4 py-3 text-right text-red-600 font-semibold">
                      {Number(row.cancelled || 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {Number(row.cancel_rate || 0).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded-[18px] border border-[#d7dee8] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[18px] font-bold text-[var(--text)]">
              Best Selling Products (MTD)
            </h3>
            <span className="rounded-full bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
              top 10 products
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
              <thead>
                <tr className="bg-[#f8fafc] text-left">
                  <th className="px-4 py-3 font-bold">SKU</th>
                  <th className="px-4 py-3 font-bold">Product</th>
                  <th className="px-4 py-3 font-bold text-right">Units Sold</th>
                  <th className="px-4 py-3 font-bold text-right">Sales Value</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.top_products || []).map((row: any, i: number) => (
  <tr key={i} className="border-t border-[#e5ebf2]">
    <td className="px-4 py-3 font-semibold">
      {row.sku || "-"}
    </td>
    <td className="px-4 py-3">
      {row.product || "-"}
    </td>
    <td className="px-4 py-3 text-right font-bold">
      {Number(row.units_sold || 0)}
    </td>
    <td className="px-4 py-3 text-right font-bold">
      {formatRs(Number(row.sales_value || 0))}
    </td>
  </tr>
))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )}
  </div>
)}


        {(currentUser?.role === "ADMIN" || currentUser?.role === "SALES") && activeTab === "sales" && (
  <div className="soft-card mt-4 p-5">
          <h2 className="mb-6 text-[22px] font-bold text-[var(--text)]">Sales Entry</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
  <div>
    <label className="soft-label">Date</label>
    <input
      className="soft-input"
      value={saleDate}
      onChange={(e) => setSaleDate(e.target.value)}
    />
  </div>

  <div>
    <label className="soft-label">Customer Name</label>
    <input
      className="soft-input"
      value={customerName}
      onChange={(e) => setCustomerName(e.target.value)}
      placeholder="Customer name"
    />
  </div>

  <div>
    <label className="soft-label">Phone 01</label>
    <input
      className="soft-input"
      value={phone1}
      onChange={(e) => setPhone1(e.target.value)}
      placeholder="07x xxx xxxx"
    />
  </div>

  <div>
    <label className="soft-label">Phone 02</label>
    <input
      className="soft-input"
      value={phone2}
      onChange={(e) => setPhone2(e.target.value)}
      placeholder="Optional"
    />
  </div>
</div>

{(pendingDupMsg || recentDispatchDupMsg) && (
  <div className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-4">
    <div></div>
    <div></div>
    <div className="md:col-span-2">
      {pendingDupMsg && (
        <div className="text-sm font-semibold text-red-600">
          {pendingDupMsg}
        </div>
      )}
      {recentDispatchDupMsg && (
        <div className="text-sm font-semibold text-orange-600">
          {recentDispatchDupMsg}
        </div>
      )}
    </div>
  </div>
)}

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1.6fr_0.8fr_0.8fr_0.8fr]">
  <div>
    <label className="soft-label">Address</label>
    <input
      className="soft-input"
      value={address}
      onChange={(e) => setAddress(e.target.value)}
      placeholder="Address"
    />
  </div>

  <div>
    <label className="soft-label">City</label>
    <input
      className="soft-input"
      value={city}
      onChange={(e) => setCity(e.target.value)}
      placeholder="City"
    />
  </div>

  <div>
    <label className="soft-label">Retail/Wholesale</label>
    <select
      className="soft-input"
      value={retailWholesale}
      onChange={(e) => setRetailWholesale(e.target.value)}
    >
      <option>Retail</option>
      <option>Wholesale</option>
    </select>
  </div>

  <div>
    <label className="soft-label">Sale Platform</label>
    <select
      className="soft-input"
      value={salePlatform}
      onChange={(e) => setSalePlatform(e.target.value)}
    >
      <option>Facebook</option>
      <option>TikTok</option>
      <option>Website</option>
      <option>Daraz</option>
      <option>Shop</option>
      <option>Other</option>
    </select>
  </div>
</div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="soft-label">Order Number</label>
              <input
                className="soft-input"
                value={loadingOrderNo ? "Generating..." : orderNo}
                readOnly
              />
            </div>

            <div className="md:col-span-2">
              <label className="soft-label">Sales Person</label>
              <input
                className="soft-input"
                value={currentUser?.email || ""}
                readOnly
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="w-full">
                <label className="soft-label">Transaction Type</label>
                <select
                  className="soft-input"
                  value={transactionType}
                  onChange={(e) => setTransactionType(e.target.value)}
                >
                  <option>COD</option>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Card</option>
                </select>
              </div>
              <button
                onClick={() => {
                  void clearSale();
                }}
                className="secondary-btn whitespace-nowrap"
              >
                Clear Sale
              </button>
            </div>
          </div>

          <hr className="muted-divider my-6" />

          <h3 className="mb-4 text-[18px] font-bold text-[var(--text)]">Add Items</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.1fr_1fr]">
            <div>
              <label className="soft-label">Product search</label>
              <input
                ref={productSearchRef}
                className="soft-input"
                placeholder="Search product"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    selectFirstFilteredProduct();
                  }
                }}
              />

              <select
                className="listbox-soft mt-2"
                size={10}
                value={selectedProductId}
                onChange={(e) => {
                  pickProductById(e.target.value);
                }}
              >
                {filteredProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} • {p.product_type} • {p.material} • {p.color} • {p.size}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div>
                <label className="soft-label">Price</label>
                <input
                  type="text"
                  className="soft-input bg-[#f8fafc] text-slate-700"
                  value={price ? formatRs(Number(price)) : ""}
                  readOnly
                />
              </div>

              <div className="mt-3">
                <label className="soft-label">Qty</label>
                <input
                  ref={qtyRef}
                  type="text"
                  className="soft-input"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToCart();
                    }
                  }}
                />
              </div>

              <div className="mt-3">
                <label className="soft-label">Extra Addon</label>
                <input
                  className="soft-input"
                  value={extraAddon}
                  onChange={(e) => setExtraAddon(e.target.value)}
                  placeholder="extra item"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToCart();
                    }
                  }}
                />
              </div>

              <div className="mt-3">
                <label className="soft-label">Extra Price</label>
                <input
                  type="text"
                  className="soft-input"
                  value={extraPrice}
                  onFocus={() => handleZeroFocus(extraPrice, setExtraPrice)}
                  onBlur={() => handleZeroBlur(extraPrice, setExtraPrice)}
                  onChange={(e) => setExtraPrice(e.target.value.replace(/[^\d.]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToCart();
                    }
                  }}
                />
              </div>

              <div className="mt-3">
                <label className="soft-label">Discount</label>
                <input
                  type="text"
                  className="soft-input"
                  value={discount}
                  onFocus={() => handleZeroFocus(discount, setDiscount)}
                  onBlur={() => handleZeroBlur(discount, setDiscount)}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addToCart();
                    }
                  }}
                />
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={addToCart}
                  className="primary-btn"
                  disabled={loadingOrderNo || loadingUser}
                >
                  Add to Cart
                </button>
                <button onClick={clearCartOnly} className="secondary-btn">
                  Clear Cart
                </button>
              </div>
            </div>
          </div>

          <hr className="muted-divider my-6" />

          <div>
            <h3 className="mb-3 text-[18px] font-bold text-[var(--text)]">Cart</h3>

            {cart.length === 0 ? (
              <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
                Cart empty
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
                <table className="w-full border-collapse text-[14px] text-[#1f2a37]">
                  <thead>
                    <tr className="bg-[#f8fafc]">
                      <th className="px-3 py-3 text-left font-bold">SKU</th>
                      <th className="px-3 py-3 text-left font-bold">Description</th>
                      <th className="px-3 py-3 text-center font-bold">Qty</th>
                      <th className="px-3 py-3 text-right font-bold">Price</th>
                      <th className="px-3 py-3 text-left font-bold">Extra</th>
                      <th className="px-3 py-3 text-right font-bold">Discount</th>
                      <th className="px-3 py-3 text-right font-bold">Line Total</th>
                      <th className="px-3 py-3 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={index} className="border-t border-[#e5ebf2]">
                        <td className="px-3 py-3 font-bold">{item.sku}</td>
                        <td className="px-3 py-3">{item.name}</td>
                        <td className="px-3 py-3 text-center">{item.qty}</td>
                        <td className="px-3 py-3 text-right">
                          Rs. {item.unit_price.toFixed(2)}
                        </td>
                        <td className="px-3 py-3">
                          {item.extra_addon
                            ? `${item.extra_addon} (+Rs. ${item.extra_price.toFixed(2)})`
                            : "-"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          Rs. {item.discount.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold">
                          Rs. {item.line_total.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => removeCartItem(index)}
                            className="rounded-[10px] bg-[#fee2e2] px-3 py-1 text-sm font-bold text-[#b91c1c]"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div>
              <label className="soft-label">Delivery Charge</label>
              <input
                type="text"
                className="soft-input"
                value={deliveryCharge}
                onFocus={() => handleZeroFocus(deliveryCharge, setDeliveryCharge)}
                onBlur={() => handleZeroBlur(deliveryCharge, setDeliveryCharge)}
                onChange={(e) => setDeliveryCharge(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>

            <div>
              <label className="soft-label">Advance</label>
              <input
                type="text"
                className="soft-input"
                value={advance}
                onFocus={() => handleZeroFocus(advance, setAdvance)}
                onBlur={() => handleZeroBlur(advance, setAdvance)}
                onChange={(e) => setAdvance(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>

            <div className="balance-badge">
              <div className="text-sm text-white/90">Balance</div>
              <div className="text-[22px] font-extrabold text-white">
                Rs. {balance.toFixed(2)}
              </div>
            </div>

            <div className="flex items-end">
              <button
  className="primary-btn w-full min-w-[180px] py-4"
  onClick={() => {
    void handleSubmitOrder();
  }}
  disabled={loadingOrderNo || loadingUser || submitting}
>
  {submitting ? "Saving..." : "Submit Order"}
</button>
            </div>
          </div>
                </div>
      )}

      {["ADMIN", "SALES", "ACCOUNTANT"].includes(currentUser?.role || "") && activeTab === "pending" && (
        <div className="soft-card mt-4 p-5">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-[22px] font-bold text-[var(--text)]">Pending Orders</h2>
              <div className="mt-1 text-sm text-[var(--muted)]">
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
  <div className="min-w-[280px]">
    <label className="soft-label">Search Phone</label>
    <input
      className="soft-input"
      value={pendingSearchPhone}
      onChange={(e) => setPendingSearchPhone(e.target.value)}
      placeholder="Type phone number"
    />
  </div>

  <button
    className="secondary-btn"
    onClick={() => {
      void fetchPendingOrders(pendingSearchPhone);
    }}
  >
    Refresh
  </button>

  <button
    className="rounded-[10px] bg-[#dcfce7] px-4 py-2 text-sm font-bold text-[#166534]"
    onClick={() => {
      void handleBulkPendingAction("DISPATCHED");
    }}
    disabled={bulkActing || selectedPendingIds.length === 0}
  >
    Dispatch Selected
  </button>

  <button
    className="rounded-[10px] bg-[#fee2e2] px-4 py-2 text-sm font-bold text-[#b91c1c]"
    onClick={() => {
      void handleBulkPendingAction("CANCELLED");
    }}
    disabled={bulkActing || selectedPendingIds.length === 0}
  >
    Cancel Selected
  </button>
</div>
          </div>

          {pendingLoading ? (
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
              Loading pending orders...
            </div>
          ) : pendingOrders.length === 0 ? (
            <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
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
        checked={
          pendingOrders.length > 0 &&
          pendingOrders.every((row) => selectedPendingIds.includes(row.order_id))
        }
        onChange={toggleSelectAllPending}
      />
    </th>
    <th>Date</th>
    <th>Order No</th>
    <th>Customer</th>
    <th>Phone</th>
    <th>Address</th>
    <th>City</th>
    <th>Products</th>
    <th className="num">Balance</th>
    <th>Actions</th>
  </tr>
</thead>
    <tbody>
      {pendingOrders.map((row) => (
        <tr key={row.order_id}>
  <td className="center">
    <input
      type="checkbox"
      checked={selectedPendingIds.includes(row.order_id)}
      onChange={() => togglePendingSelection(row.order_id)}
    />
  </td>
  <td>{formatDateTime(row.order_date || row.created_at)}</td>
  <td className="font-bold">{row.order_no}</td>
  <td>{row.customer_name || "-"}</td>
  <td>
    <div>{row.phone_primary || "-"}</div>
    {row.phone_secondary ? (
      <div className="text-xs text-[var(--muted)]">{row.phone_secondary}</div>
    ) : null}
  </td>
  <td>{row.address || "-"}</td>
  <td>{row.city || "-"}</td>
  <td>{row.product_summary || "-"}</td>
  <td className="num">{formatRs(Number(row.balance || 0))}</td>
  <td>
    <div className="flex gap-2">
      <button
        className="rounded-[10px] bg-[#dcfce7] px-3 py-1 text-sm font-bold text-[#166534]"
        onClick={() => {
          void handlePendingOrderAction(row.order_id, "DISPATCHED");
        }}
        disabled={actingOrderId === row.order_id || bulkActing}
      >
        Dispatch
      </button>

      <button
        className="rounded-[10px] bg-[#fee2e2] px-3 py-1 text-sm font-bold text-[#b91c1c]"
        onClick={() => {
          void handlePendingOrderAction(row.order_id, "CANCELLED");
        }}
        disabled={actingOrderId === row.order_id || bulkActing}
      >
        Cancel
      </button>
    </div>
  </td>
</tr>
      ))}
    </tbody>
  </table>
</div>
          )}
        </div>
      )}
      {["ADMIN", "SALES", "ACCOUNTANT"].includes(currentUser?.role || "") && activeTab === "dispatchedToday" && (
  <div className="soft-card mt-4 p-5">
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-[22px] font-bold text-[var(--text)]">Dispatched Orders Today</h2>
        <div className="mt-1 text-sm text-[var(--muted)]">
          Search by phone. Latest dispatched orders first.
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
        <div className="min-w-[280px]">
          <label className="soft-label">Search Phone</label>
          <input
            className="soft-input"
            value={dispatchedTodaySearchPhone}
            onChange={(e) => setDispatchedTodaySearchPhone(e.target.value)}
            placeholder="Type phone number"
          />
        </div>

        <button
          className="secondary-btn"
          onClick={() => {
            void fetchDispatchedOrdersToday(dispatchedTodaySearchPhone);
          }}
        >
          Refresh
        </button>
      </div>
    </div>

    {dispatchedTodayLoading ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        Loading dispatched orders...
      </div>
    ) : dispatchedTodayRows.length === 0 ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        No dispatched orders found for today
      </div>
    ) : (
      <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Order No</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Address</th>
              <th>City</th>
              <th>Products</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {dispatchedTodayRows.map((row) => (
              <tr key={row.order_id}>
                <td>{formatDateTime(row.dispatched_at)}</td>
                <td className="font-bold">{row.order_no}</td>
                <td>{row.customer_name || "-"}</td>
                <td>
                  <div>{row.phone_primary || "-"}</div>
                  {row.phone_secondary ? (
                    <div className="text-xs text-[var(--muted)]">{row.phone_secondary}</div>
                  ) : null}
                </td>
                <td>{row.address || "-"}</td>
                <td>{row.city || "-"}</td>
                <td>{row.product_summary || "-"}</td>
                <td className="num">{formatRs(Number(row.balance || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
{["ADMIN", "SALES", "ACCOUNTANT"].includes(currentUser?.role || "") && activeTab === "dispatched7" && (
  <div className="soft-card mt-4 p-5">
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-[22px] font-bold text-[var(--text)]">
          Dispatched Orders Last 7 Days
        </h2>
        <div className="mt-1 text-sm text-[var(--muted)]">
          Search by phone. Latest dispatched orders first.
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
        <div className="min-w-[280px]">
          <label className="soft-label">Search Phone</label>
          <input
            className="soft-input"
            value={dispatched7SearchPhone}
            onChange={(e) => setDispatched7SearchPhone(e.target.value)}
            placeholder="Type phone number"
          />
        </div>

        <button
          className="secondary-btn"
          onClick={() => {
            void fetchDispatchedOrdersLast7Days(dispatched7SearchPhone);
          }}
        >
          Refresh
        </button>
      </div>
    </div>

    {dispatched7Loading ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        Loading dispatched orders...
      </div>
    ) : dispatched7Rows.length === 0 ? (
      <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
        No dispatched orders found for last 7 days
      </div>
    ) : (
      <div className="overflow-x-auto rounded-[16px] border border-[#d7dee8] bg-white">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Order No</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Address</th>
              <th>City</th>
              <th>Products</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {dispatched7Rows.map((row) => (
              <tr key={row.order_id}>
                <td>{formatDateTime(row.dispatched_at)}</td>
                <td className="font-bold">{row.order_no}</td>
                <td>{row.customer_name || "-"}</td>
                <td>
                  <div>{row.phone_primary || "-"}</div>
                  {row.phone_secondary ? (
                    <div className="text-xs text-[var(--muted)]">{row.phone_secondary}</div>
                  ) : null}
                </td>
                <td>{row.address || "-"}</td>
                <td>{row.city || "-"}</td>
                <td>{row.product_summary || "-"}</td>
                <td className="num">{formatRs(Number(row.balance || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}
{(currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTANT") && activeTab === "stock" && (
  <div className="soft-card mt-4 p-5">

    <h2 className="text-[22px] font-bold mb-5">Stock Lookup</h2>

    {/* Dashboard Cards */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">

      <div className="soft-card p-4">
        <div className="text-sm text-gray-500">Total SKUs</div>
        <div className="text-xl font-bold">{stockStats.total_skus}</div>
      </div>

      <div className="soft-card p-4">
        <div className="text-sm text-gray-500">Negative Stock</div>
        <div className="text-xl font-bold text-red-600">{stockStats.negative_count}</div>
      </div>

      <div className="soft-card p-4">
        <div className="text-sm text-gray-500">Low Stock</div>
        <div className="text-xl font-bold text-orange-600">{stockStats.low_count}</div>
      </div>

      <div className="soft-card p-4">
        <div className="text-sm text-gray-500">Potential Value</div>
        <div className="text-xl font-bold">
          {formatRs(stockStats.potential_value)}
        </div>
      </div>

    </div>

    {/* Search */}
    <div className="mb-4">
      <input
        className="soft-input w-full"
        placeholder="Search SKU, type, material, color..."
        value={stockQuery}
        onChange={(e) => setStockQuery(e.target.value)}
      />
    </div>

    {/* Results */}
    <div className="rounded-[16px] border border-[#d7dee8] bg-white p-4 text-[16px] text-[#6b7280]">
      <table className="erp-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Type</th>
            <th>Material</th>
            <th>Color</th>
            <th>Size</th>
            <th>Stock</th>
            <th>Status</th>
            <th>Selling</th>
          </tr>
        </thead>
        <tbody>
          {stockRows.map((row) => (
            <tr key={row.product_id}>
              <td>{row.sku}</td>
              <td>{row.product_type}</td>
              <td>{row.material}</td>
              <td>{row.color}</td>
              <td>{row.size}</td>
              <td className={row.current_stock < 0 ? "text-red-600 font-bold" : ""}>
                {row.current_stock}
              </td>
              <td>
                {row.stock_status === "NEGATIVE" && <span className="badge-red">NEGATIVE</span>}
                {row.stock_status === "LOW" && <span className="badge-orange">LOW</span>}
                {row.stock_status === "OK" && <span className="badge-green">OK</span>}
              </td>
              <td>{formatRs(row.selling_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
</div>
)}
</>
)}
</div>
</main>
);
}