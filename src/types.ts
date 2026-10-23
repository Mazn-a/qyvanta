export type MealType = "breakfast" | "lunch" | "dinner";
export type Tier = "luxury" | "regular";
export type OrderStatus = "pending_restaurant" | "rejected" | "confirmed" | "delivered" | "cancelled";
export type OrderStage = "attention" | "pending_restaurant" | "confirmed" | "delivered" | "stopped" | "all";

/** كل المبالغ المالية في نظام المكافآت تُخزَّن بالهللة (أعداد صحيحة) لتفادي أخطاء الكسور. */
export type VoucherStatus = "available" | "reserved" | "used" | "expired";

export interface Voucher {
  id: string;
  userId: string;
  valueHalalas: number;
  status: VoucherStatus;
  issuedAt: string;
  expiresAt: string | null;
  reservedOrderId?: string;
  usedOrderId?: string;
  usedAt?: string;
}

export type RewardEntryKind = "earn" | "voucher_issued" | "voucher_reserved" | "voucher_released" | "voucher_used";

export interface RewardEntry {
  id: string;
  userId: string;
  kind: RewardEntryKind;
  at: string;
  /** أثر الحركة على رصيد المكافآت (موجب للكسب، سالب لإصدار فوتشر، صفر لحركات الفوتشر). */
  amountHalalas: number;
  balanceAfterHalalas: number;
  orderId?: string;
  voucherId?: string;
  eligibleHalalas?: number;
}

export type OrderVoucherUse = "none" | "reserved" | "applied" | "released";
export type OrderRewardStatus = "pending" | "earned" | "not_eligible";

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  companyEmail: string;
  companyName: string;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  companyEmail: string;
  companyName: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  prices: Record<Tier, number>;
}

export interface City {
  id: string;
  name: string;
  nameEn: string;
}

export interface Restaurant {
  id: string;
  cityId: string;
  name: string;
  district: string;
  specialty: string;
  menu: Record<MealType, MenuItem[]>;
}

export interface LineItem {
  key: string;
  itemId: string;
  name: string;
  tier: Tier;
  unitPrice: number;
  qty: number;
}

export interface PlaceOrderInput {
  cityId: string;
  cityName: string;
  restaurantId: string;
  restaurantName: string;
  mealType: MealType;
  items: LineItem[];
  attendees: number;
  eventDate: string;
  pickupTime: string;
  pickupLocation: string;
  notes: string;
}

export interface Rating {
  food: number;
  timing: number;
  accuracy: number;
  presentation: number;
  comment: string;
}

export interface Order extends PlaceOrderInput {
  id: string;
  userId: string;
  clientName: string;
  phone: string;
  personalEmail: string;
  companyEmail: string;
  companyName: string;
  status: OrderStatus;
  cancelRequested?: boolean;
  cancelRequestedAt?: string;
  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  invoicePhoto?: string;
  deliveryPhoto?: string;
  rating?: Rating;
  /** المبالغ تُحسب في المخزن من الأصناف، لا من المتصفح. */
  subtotalHalalas: number;
  voucherDiscountHalalas: number;
  totalHalalas: number;
  voucherId?: string;
  voucherUse: OrderVoucherUse;
  /** المبلغ الذي تتحمله قيفانتا عن الفوتشر، لا المطعم. */
  wifaqCoveredHalalas: number;
  rewardStatus: OrderRewardStatus;
  rewardHalalas: number;
}
