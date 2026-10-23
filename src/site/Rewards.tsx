import { BackButton } from "../components";
import { arabicNumber, riyalFromHalalas, riyalWords } from "../format";
import { VoucherIcon } from "../order/steps";
import {
  balanceOf,
  isExpired,
  NEAR_VOUCHER_HALALAS,
  remainingToVoucher,
  userLedger,
  VOUCHER_VALUE_HALALAS,
} from "../rewards";
import { useStore } from "../store";
import type { Voucher, VoucherStatus } from "../types";

function voucherStatusKey(voucher: Voucher): VoucherStatus {
  return voucher.status === "available" && isExpired(voucher) ? "expired" : voucher.status;
}

function voucherCountLabel(count: number) {
  const n = arabicNumber(count);
  if (count === 1) return "فوتشر واحد";
  if (count === 2) return "فوتشران";
  if (count >= 3 && count <= 10) return `${n} فوتشرات`;
  return `${n} فوتشر`;
}

export function RewardsPage({ onBack }: { onBack: () => void; onOrder: () => void }) {
  const { currentUser, vouchers, ledger } = useStore();
  if (!currentUser) return null;
  const userId = currentUser.id;
  const balance = balanceOf(ledger, userId);
  const remaining = remainingToVoucher(balance);
  const progress = Math.min(100, Math.round(((VOUCHER_VALUE_HALALAS - remaining) / VOUCHER_VALUE_HALALAS) * 100));
  const mine = vouchers.filter((voucher) => voucher.userId === userId);
  const earned = mine.reduce((sum, voucher) => sum + voucher.valueHalalas, 0) + Math.max(0, balance);
  const available = mine.filter((voucher) => voucherStatusKey(voucher) === "available");
  const empty = userLedger(ledger, userId).length === 0 && mine.length === 0;

  return (
    <section className="wizard rewards">
      <BackButton onBack={onBack} />
      <h1>مكافآتي</h1>
      <p className="lead">مع كل طلب مكتمل تكسب 5% من قيمته. عند بلوغ 100 ريال يصدر لك فوتشر بقيمة 100 ريال تلقائيًا.</p>

      <article className="reward-card">
        <div className="reward-card-top">
          <div>
            <span className="fine">رصيد المكافآت الحالي</span>
            <strong className="reward-balance ltr">{riyalFromHalalas(balance)}</strong>
          </div>
          <div className="reward-voucher-mark">
            <VoucherIcon />
            {available.length > 0 ? (
              <span>
                <strong>{arabicNumber(available.length)}</strong>
                <em className="ltr">{riyalFromHalalas(VOUCHER_VALUE_HALALAS)}</em>
              </span>
            ) : null}
          </div>
        </div>
        <div className="reward-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="التقدم نحو الفوتشر القادم">
          <div className="reward-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="reward-progress-label">
          <span className="ltr">
            {riyalFromHalalas(VOUCHER_VALUE_HALALAS - remaining)} / {riyalFromHalalas(VOUCHER_VALUE_HALALAS)}
          </span>
          <span>{arabicNumber(progress)}%</span>
        </p>
        <dl className="reward-stats">
          <div>
            <dt>إجمالي المكافآت المكتسبة</dt>
            <dd className="ltr">{riyalFromHalalas(earned)}</dd>
          </div>
          <div>
            <dt>المتبقي للفوتشر القادم</dt>
            <dd className="ltr">{riyalFromHalalas(remaining)}</dd>
          </div>
        </dl>
        {available.length > 0 ? (
          <div className="voucher-awards">
            <div className="voucher-awards-head">
              <strong>{voucherCountLabel(available.length)}</strong>
            </div>
            <ul className="voucher-badges">
              {available.map((voucher) => (
                <li key={voucher.id} className="voucher-badge">
                  <VoucherIcon />
                  <strong className="ltr">{riyalFromHalalas(VOUCHER_VALUE_HALALAS)}</strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {empty ? (
          <p className="reward-msg">كل طلب يقرّبك من مكافأتك القادمة! ابدأ الطلب واجمع مكافآتك.</p>
        ) : remaining <= NEAR_VOUCHER_HALALAS && remaining < VOUCHER_VALUE_HALALAS ? (
          <p className="reward-msg is-gold">باقي لك {riyalWords(remaining)} فقط للحصول على فوتشر جديد!</p>
        ) : available.length > 0 ? (
          <p className="reward-msg is-ok">
            لديك {voucherCountLabel(available.length)}، قيمة كل فوتشر {riyalWords(VOUCHER_VALUE_HALALAS)}. يظهر لك واحد منها تلقائيًا عند مراجعة طلبك القادم.
          </p>
        ) : null}
      </article>
    </section>
  );
}
