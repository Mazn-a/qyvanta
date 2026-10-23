import { useLang } from "./i18n";

export function PasswordField({
  value,
  shown,
  onChange,
  onToggle,
  autoComplete,
  placeholder,
  id,
  maxLength = 128,
  strength = null,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  value: string;
  shown: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
  autoComplete: string;
  placeholder?: string;
  id?: string;
  maxLength?: number;
  strength?: "weak" | "mid" | "strong" | null;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const { t } = useLang();
  const strengthLabel = strength === "weak" ? "ضعيفة" : strength === "mid" ? "متوسطة" : strength === "strong" ? "قوية" : "";
  return (
    <div className="password">
      <input
        id={id}
        className="ltr"
        dir="ltr"
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder ?? "********"}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {strength ? (
        <span className={`strength-mark is-${strength}`} role="img" aria-label={strengthLabel}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3.2 5.5 6v5.2c0 4.1 2.7 7.1 6.5 8.6 3.8-1.5 6.5-4.5 6.5-8.6V6L12 3.2Z" fill="currentColor" />
          </svg>
        </span>
      ) : null}
      <button type="button" className="eye" aria-pressed={shown} aria-label={shown ? t("auth.hide") : t("auth.show")} onClick={onToggle}>
        <EyeIcon hidden={shown} />
      </button>
    </div>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {hidden ? <path d="M5 19 19 5" stroke="currentColor" strokeWidth="1.7" /> : null}
    </svg>
  );
}

export function RequiredStar() {
  return (
    <span className="req" aria-hidden="true">
      *
    </span>
  );
}

export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="text-back page-back-btn" onClick={onBack}>
      رجوع
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
