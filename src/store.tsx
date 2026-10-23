import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, readToken, writeToken } from "./api";
import { loadCatalog } from "./catalog";
import { normalizeOrder } from "./rewards";
import type { Order, PlaceOrderInput, PublicUser, Rating, RegisterInput, RewardEntry, Voucher } from "./types";

type Kind = "customer" | "restaurant" | "admin" | null;

interface StoreApi {
  ready: boolean;
  apiDown: boolean;
  sessionKind: Kind;
  permissions: string[];
  restaurantId: string | null;
  orders: Order[];
  accounts: PublicUser[];
  currentUser: PublicUser | null;
  vouchers: Voucher[];
  ledger: RewardEntry[];
  refresh: () => Promise<void>;
  register: (input: RegisterInput) => Promise<string | null>;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  updateProfile: (input: Omit<PublicUser, "id">) => Promise<string | null>;
  placeOrder: (input: PlaceOrderInput, options?: { voucherId?: string | null }) => Promise<Order>;
  rateOrder: (id: string, rating: Rating) => Promise<string | null>;
  requestCancel: (id: string) => Promise<string | null>;
}

const Ctx = createContext<StoreApi | null>(null);

let lastKind: Kind = null;
export function peekSessionKind() {
  return lastKind;
}

function toOrder(raw: Record<string, unknown>): Order {
  return normalizeOrder({
    id: String(raw.id),
    userId: String(raw.userId),
    cityId: String(raw.cityId),
    cityName: String(raw.cityName),
    restaurantId: String(raw.restaurantId),
    restaurantName: String(raw.restaurantName),
    clientName: String(raw.clientName ?? ""),
    phone: String(raw.phone ?? ""),
    personalEmail: String(raw.personalEmail ?? ""),
    companyEmail: String(raw.companyEmail ?? ""),
    companyName: String(raw.companyName ?? ""),
    mealType: raw.mealType as Order["mealType"],
    items: (Array.isArray(raw.items) ? raw.items : []).map((item) => {
      const line = item as Order["items"][number];
      return { ...line, key: `${line.itemId}:${line.tier}` };
    }),
    attendees: Number(raw.attendees),
    eventDate: String(raw.eventDate),
    pickupTime: String(raw.pickupTime),
    pickupLocation: String(raw.pickupLocation),
    notes: String(raw.notes ?? ""),
    status: raw.status as Order["status"],
    cancelRequested: Boolean(raw.cancelRequested),
    cancelRequestedAt: raw.cancelRequestedAt ? String(raw.cancelRequestedAt) : undefined,
    createdAt: String(raw.createdAt),
    confirmedAt: raw.confirmedAt ? String(raw.confirmedAt) : undefined,
    rejectedAt: raw.rejectedAt ? String(raw.rejectedAt) : undefined,
    deliveredAt: raw.deliveredAt ? String(raw.deliveredAt) : undefined,
    cancelledAt: raw.cancelledAt ? String(raw.cancelledAt) : undefined,
    rating: raw.rating as Order["rating"],
    subtotalHalalas: Number(raw.subtotalHalalas ?? 0),
    voucherDiscountHalalas: Number(raw.voucherDiscountHalalas ?? 0),
    totalHalalas: Number(raw.totalHalalas ?? 0),
    voucherId: raw.voucherId ? String(raw.voucherId) : undefined,
    voucherUse: (raw.voucherUse as Order["voucherUse"]) ?? "none",
    wifaqCoveredHalalas: Number(raw.wifaqCoveredHalalas ?? 0),
    rewardStatus: (raw.rewardStatus as Order["rewardStatus"]) ?? "pending",
    rewardHalalas: Number(raw.rewardHalalas ?? 0),
  });
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apiDown, setApiDown] = useState(false);
  const [sessionKind, setSessionKind] = useState<Kind>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [ledger, setLedger] = useState<RewardEntry[]>([]);

  async function refresh() {
    if (!readToken()) {
      setCurrentUser(null);
      setSessionKind(null);
      setOrders([]);
      setVouchers([]);
      setLedger([]);
      setApiDown(false);
      setReady(true);
      return;
    }
    try {
      const me = await api<{ user: PublicUser & { kind: Kind }; kind: Kind; permissions: string[]; restaurantId: string | null }>("/api/me");
      setCurrentUser(me.user);
      setSessionKind(me.kind);
      setPermissions(me.permissions ?? []);
      setRestaurantId(me.restaurantId ?? null);
      if (me.kind === "customer") {
        const [orderData, rewardData] = await Promise.all([
          api<{ orders: Record<string, unknown>[] }>("/api/orders"),
          api<{ vouchers: Voucher[]; ledger: RewardEntry[] }>("/api/rewards"),
        ]);
        setOrders(orderData.orders.map(toOrder));
        setVouchers(rewardData.vouchers);
        setLedger(rewardData.ledger);
      } else {
        setOrders([]);
        setVouchers([]);
        setLedger([]);
      }
      setApiDown(false);
    } catch {
      setApiDown(true);
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void Promise.all([refresh(), loadCatalog()]);
  }, []);

  async function register(input: RegisterInput) {
    try {
      const data = await api<{ token: string; user: PublicUser }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
      writeToken(data.token);
      lastKind = "customer";
      await refresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "تعذر إنشاء الحساب.";
    }
  }

  async function login(email: string, password: string) {
    try {
      const data = await api<{ token: string; user: PublicUser & { kind: Kind } }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      writeToken(data.token);
      lastKind = data.user.kind ?? null;
      await refresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "تعذر تسجيل الدخول.";
    }
  }

  function logout() {
    writeToken(null);
    lastKind = null;
    setCurrentUser(null);
    setSessionKind(null);
    setOrders([]);
    setVouchers([]);
    setLedger([]);
  }

  async function updateProfile(input: Omit<PublicUser, "id">) {
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify(input) });
      await refresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "تعذر حفظ التعديل.";
    }
  }

  async function placeOrder(input: PlaceOrderInput, options?: { voucherId?: string | null }) {
    const data = await api<{ order: Record<string, unknown> }>("/api/orders", {
      method: "POST",
      body: JSON.stringify({ ...input, voucherId: options?.voucherId || null }),
    });
    const order = toOrder(data.order);
    await refresh();
    return order;
  }

  async function requestCancel(id: string) {
    try {
      await api(`/api/orders/${id}/cancel-request`, { method: "POST" });
      await refresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "تعذر إرسال طلب الإلغاء";
    }
  }

  async function rateOrder(id: string, rating: Rating) {
    try {
      await api(`/api/orders/${id}/rate`, { method: "POST", body: JSON.stringify(rating) });
      await refresh();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "لا يمكن حفظ التقييم الآن";
    }
  }

  const value: StoreApi = {
    ready,
    apiDown,
    sessionKind,
    permissions,
    restaurantId,
    orders,
    accounts: currentUser ? [currentUser] : [],
    currentUser,
    vouchers,
    ledger,
    refresh,
    register,
    login,
    logout,
    updateProfile,
    placeOrder,
    rateOrder,
    requestCancel,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const value = useContext(Ctx);
  if (!value) throw new Error("Store missing");
  return value;
}
