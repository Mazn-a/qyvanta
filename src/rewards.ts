import type { Order, RewardEntry, Voucher } from "./types";

/** نسبة المكافأة من قيمة الطلب بعد الخصم. */
export const REWARD_PERCENT = 5;
/** قيمة الفوتشر والحد الذي يُصدر عنده (بالهللة). */
export const VOUCHER_VALUE_HALALAS = 100_00;
/** أقل قيمة طلب يمكن استخدام الفوتشر عليها (بالهللة). */
export const VOUCHER_MIN_ORDER_HALALAS = 100_00;
/** عند هذا المتبقي أو أقل تظهر رسالة «باقي لك …». */
export const NEAR_VOUCHER_HALALAS = 25_00;

export function toHalalas(riyals: number) {
  return Math.round(riyals * 100);
}

export function rewardFor(eligibleHalalas: number) {
  if (!Number.isFinite(eligibleHalalas) || eligibleHalalas <= 0) return 0;
  return Math.round((eligibleHalalas * REWARD_PERCENT) / 100);
}

/** كم فوتشر يُصدر من هذا الرصيد. */
export function vouchersFrom(balanceHalalas: number) {
  return Math.max(0, Math.floor(balanceHalalas / VOUCHER_VALUE_HALALAS));
}

export function userLedger(ledger: RewardEntry[], userId: string) {
  return ledger.filter((entry) => entry.userId === userId);
}

export function balanceOf(ledger: RewardEntry[], userId: string) {
  return userLedger(ledger, userId).reduce((sum, entry) => sum + entry.amountHalalas, 0);
}

export function earnedTotalOf(ledger: RewardEntry[], userId: string) {
  return userLedger(ledger, userId)
    .filter((entry) => entry.kind === "earn")
    .reduce((sum, entry) => sum + entry.amountHalalas, 0);
}

export function remainingToVoucher(balanceHalalas: number) {
  const inCycle = ((balanceHalalas % VOUCHER_VALUE_HALALAS) + VOUCHER_VALUE_HALALAS) % VOUCHER_VALUE_HALALAS;
  return VOUCHER_VALUE_HALALAS - inCycle;
}

export function isExpired(voucher: Voucher, now = new Date()) {
  return Boolean(voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= now.getTime());
}

export function availableVouchers(vouchers: Voucher[], userId: string, now = new Date()) {
  return vouchers.filter((voucher) => voucher.userId === userId && voucher.status === "available" && !isExpired(voucher, now));
}

/** رقم فوتشر قصير يسهل قراءته للعميل. */
export function voucherCode(id: string) {
  let n = 0;
  for (const char of id) n = (n * 31 + char.charCodeAt(0)) % 90000;
  return `WV-${10000 + n}`;
}

/** هل الطلب يحمل فوتشر ساري (محجوز أو مطبّق)؟ */
export function orderHasVoucher(order: Order) {
  return order.voucherUse === "reserved" || order.voucherUse === "applied";
}

/** توافق مع الطلبات القديمة المخزنة قبل إضافة الحقول المالية. */
export function normalizeOrder(order: Partial<Order> & { items: Order["items"] }): Order {
  const subtotal = typeof order.subtotalHalalas === "number" ? order.subtotalHalalas : toHalalas(order.items.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
  const discount = typeof order.voucherDiscountHalalas === "number" ? order.voucherDiscountHalalas : 0;
  return {
    ...(order as Order),
    subtotalHalalas: subtotal,
    voucherDiscountHalalas: discount,
    totalHalalas: typeof order.totalHalalas === "number" ? order.totalHalalas : Math.max(0, subtotal - discount),
    voucherUse: order.voucherUse ?? "none",
    wifaqCoveredHalalas: typeof order.wifaqCoveredHalalas === "number" ? order.wifaqCoveredHalalas : discount,
    rewardStatus: order.rewardStatus ?? (order.status === "delivered" ? "not_eligible" : "pending"),
    rewardHalalas: typeof order.rewardHalalas === "number" ? order.rewardHalalas : 0,
  };
}
