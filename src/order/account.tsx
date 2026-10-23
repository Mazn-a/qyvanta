import { cloneElement, isValidElement, useEffect, useId, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { BackButton, PasswordField, RequiredStar } from "../components";
import { useStore } from "../store";
import { PROFILE_KEY } from "./draft";
import { readMigrated, REMEMBER_KEY } from "../storage";
import { companyError, emailError, normalizeEmail, normalizePhone, passwordError, personNameError, phoneError } from "./validate";

function strengthLevel(value: string) {
  if (!value) return null;
  if (value.length < 8) return "weak" as const;
  if (value.length < 16) return "mid" as const;
  return "strong" as const;
}

export function AccountStep({
  onBack,
  onLogin,
  onSubmit,
}: {
  onBack: () => void;
  onLogin: () => void;
  onSubmit: (profile: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    companyName: string;
    companyEmail: string;
    password: string;
    save: boolean;
  }) => Promise<string | null>;
}) {
  const saved = readProfile();
  const [values, setValues] = useState({
    firstName: saved.firstName ?? "",
    lastName: saved.lastName ?? "",
    phone: saved.phone ?? "",
    email: saved.email ?? "",
    companyName: saved.companyName ?? "",
    companyEmail: saved.companyEmail ?? "",
    password: "",
    confirm: "",
    save: false,
    privacy: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    next.firstName = personNameError(values.firstName);
    next.lastName = personNameError(values.lastName);
    next.phone = phoneError(values.phone);
    next.email = emailError(values.email);
    next.companyName = companyError(values.companyName);
    next.companyEmail = emailError(values.companyEmail);
    next.password = passwordError(values.password);
    if (values.confirm !== values.password) next.confirm = "كلمتا المرور غير متطابقتين.";
    if (!values.privacy) next.privacy = "يلزم الموافقة قبل الإرسال.";
    setErrors(next);
    if (Object.values(next).some(Boolean) || sending) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".wizard .field.invalid, .wizard .choice .err")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    setSending(true);
    const error = await onSubmit({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      phone: values.phone,
      email: values.email,
      companyName: values.companyName.trim(),
      companyEmail: values.companyEmail,
      password: values.password,
      save: values.save,
    });
    if (error === "err.emailTaken") setFormError("هذا البريد الشخصي مسجّل مسبقًا. سجّل الدخول بدل إنشاء حساب جديد.");
    else if (error === "err.password") setFormError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
    else if (error) setFormError(error);
    setSending(false);
  }

  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <p className="progress-label" id="account-progress-label">
        الخطوة 9 من 9
      </p>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={9}
        aria-valuenow={9}
        aria-labelledby="account-progress-label"
      >
        <div className="progress-fill" style={{ width: "100%" }} />
      </div>
      <h1>أكمل بياناتك لإرسال الطلب</h1>
      <p className="lead">نحتاج بعض البيانات لإتمام الطلب والتواصل معك ومتابعة تفاصيله.</p>
      <form noValidate onSubmit={submit}>
        <h2>بياناتك الشخصية</h2>
        <Field label="الاسم الأول" error={errors.firstName}>
          <input autoComplete="given-name" value={values.firstName} onChange={(event) => set("firstName", event.target.value)} />
        </Field>
        <Field label="اسم العائلة" error={errors.lastName}>
          <input autoComplete="family-name" value={values.lastName} onChange={(event) => set("lastName", event.target.value)} />
        </Field>
        <Field label="رقم الجوال" error={errors.phone} hint="سنستخدم رقم الجوال للتواصل معك بشأن طلبك عند الحاجة.">
          <input
            inputMode="tel"
            autoComplete="tel"
            placeholder="05XXXXXXXX"
            value={values.phone}
            onChange={(event) => set("phone", normalizePhone(event.target.value))}
          />
        </Field>
        <Field label="البريد الإلكتروني الشخصي" error={errors.email} hint="سيتم إرسال تأكيدات الطلب والفواتير إلى هذا البريد.">
          <input
            className="ltr"
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={values.email}
            onChange={(event) => set("email", normalizeEmail(event.target.value))}
          />
        </Field>
        <h2>بيانات الشركة</h2>
        <p className="lead">أدخل بيانات الجهة التي تم تقديم الطلب لصالحها.</p>
        <Field label="اسم الشركة" error={errors.companyName}>
          <input autoComplete="organization" value={values.companyName} onChange={(event) => set("companyName", event.target.value)} />
        </Field>
        <Field label="البريد الإلكتروني للشركة" error={errors.companyEmail}>
          <input
            className="ltr"
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={values.companyEmail}
            onChange={(event) => set("companyEmail", normalizeEmail(event.target.value))}
          />
        </Field>
        <h2>أنشئ كلمة مرور لحسابك</h2>
        <p className="lead">ستستخدم كلمة المرور هذه لتسجيل الدخول ومتابعة طلباتك السابقة والقادمة.</p>
        <Field label="كلمة المرور" error={errors.password} hint="8 أحرف على الأقل.">
          <PasswordField
            value={values.password}
            shown={showPassword}
            autoComplete="new-password"
            strength={strengthLevel(values.password)}
            onChange={(password) => set("password", password)}
            onToggle={() => setShowPassword((current) => !current)}
          />
        </Field>
        <Field label="تأكيد كلمة المرور" error={errors.confirm}>
          <PasswordField
            value={values.confirm}
            shown={showConfirm}
            autoComplete="new-password"
            onChange={(confirm) => set("confirm", confirm)}
            onToggle={() => setShowConfirm((current) => !current)}
          />
        </Field>
        <div className="choices">
          <label className={errors.privacy ? "choice invalid" : values.privacy ? "choice on" : "choice"}>
            <input
              type="checkbox"
              checked={values.privacy}
              aria-invalid={Boolean(errors.privacy)}
              onChange={(event) => set("privacy", event.target.checked)}
            />
            <span>
              أوافق على{" "}
              <button type="button" className="text-link" onClick={() => setPolicyOpen(true)}>
                سياسة الخصوصية
              </button>{" "}
              والشروط.
              <RequiredStar />
            </span>
          </label>
          <label className={values.save ? "choice on" : "choice"}>
            <input type="checkbox" checked={values.save} onChange={(event) => set("save", event.target.checked)} />
            <span>
              تذكّر بياناتي على هذا الجهاز
              <small>اختياري</small>
            </span>
          </label>
        </div>
        {errors.privacy ? <p className="err">{errors.privacy}</p> : null}
        {formError ? <p className="err">{formError}</p> : null}
        <button className="btn primary block" type="submit" disabled={sending}>
          {sending ? "جارٍ إرسال الطلب..." : "تأكيد وإرسال الطلب"}
        </button>
        {policyOpen ? <PolicyDialog onClose={() => setPolicyOpen(false)} /> : null}
        <button className="btn ghost block" type="button" onClick={onLogin}>
          لديك حساب؟ تسجيل الدخول
        </button>
        <button className="text-back" type="button" onClick={onBack}>
          رجوع
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  error,
  hint,
  optional = false,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>, {
        id,
        "aria-invalid": Boolean(error) || undefined,
        "aria-describedby": described,
      })
    : children;
  return (
    <div className={error ? "field invalid" : "field"}>
      <label htmlFor={id}>
        {label}
        {optional ? <small className="optional">اختياري</small> : <RequiredStar />}
      </label>
      {control}
      {hint ? (
        <small id={hintId} className="fine">
          {hint}
        </small>
      ) : null}
      {error ? (
        <em id={errorId} className="err">
          {error}
        </em>
      ) : null}
    </div>
  );
}

function ForgotNote({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  if (sent) return <p className="fine">إذا كان البريد مرتبطًا بحساب، فسيصلك رابط لإعادة تعيين كلمة المرور.</p>;
  return (
    <div className="forgot-box">
      <h2>استعادة كلمة المرور</h2>
      <p className="fine">أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.</p>
      {error ? <p className="err">{error}</p> : null}
      <button
        type="button"
        className="btn primary"
        onClick={() => {
          if (emailError(email)) {
            setError("يرجى إدخال بريد إلكتروني صحيح، مثل example@email.com");
            return;
          }
          setSent(true);
        }}
      >
        إرسال رابط الاستعادة
      </button>
    </div>
  );
}

function PolicyDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dialog-back" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="policy-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="policy-title">سياسة الخصوصية</h2>
        <div className="policy-copy">
          <p>تلتزم قيفانتا بحماية خصوصيتك. لا نجمع من بياناتك إلا ما يلزم لإتمام طلب الضيافة ومتابعته.</p>
          <p>
            <strong>البيانات التي نجمعها.</strong> الاسم، ورقم الجوال، والبريد الإلكتروني، واسم الجهة إن أدخلته، وتفاصيل المناسبة والطلب.
          </p>
          <p>
            <strong>كيف نستخدمها.</strong> لمعالجة طلبك، وإظهار حالته، والتواصل معك عند الحاجة. تُرسل الفاتورة النهائية إلى بريدك الإلكتروني الشخصي فقط.
          </p>
          <p>
            <strong>مع من تُشارك.</strong> لا نبيع بياناتك ولا نشاركها لغرض غير مرتبط بتنفيذ الطلب. يطّلع المطعم على بيانات الطلب اللازمة لتنفيذه، ولا يُتاح له رقم جوالك إلا عند مرحلة تنسيق التسليم.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>
          إغلاق
        </button>
      </div>
    </div>
  );
}

function readProfile(): Partial<Record<"firstName" | "lastName" | "phone" | "email" | "companyName" | "companyEmail", string>> {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function LoginPanel({
  onBack,
  onStart,
  onHome,
  showForgot,
  setShowForgot,
}: {
  onBack: () => void;
  onStart: () => void;
  onHome: (email: string) => void;
  showForgot: boolean;
  setShowForgot: (value: boolean) => void;
}) {
  const store = useStore();
  const remembered = readMigrated(REMEMBER_KEY, "diyafa-remember-email") ?? "";
  const [email, setEmail] = useState(remembered);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const mail = normalizeEmail(email);
    if (emailError(mail)) {
      setError("يرجى إدخال بريد إلكتروني صحيح، مثل example@email.com");
      return;
    }
    if (!password) {
      setError("أدخل كلمة المرور المرتبطة بهذا البريد.");
      return;
    }
    const result = await store.login(mail, password);
    if (result) {
      setError("البريد أو كلمة المرور غير مطابقة لحساب محفوظ. راجع البيانات أو ابدأ طلبًا جديدًا.");
      return;
    }
    if (remember) localStorage.setItem(REMEMBER_KEY, mail);
    else localStorage.removeItem(REMEMBER_KEY);
    onHome(mail);
  }

  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <h1>مرحبًا بعودتك</h1>
      <p className="lead">سجّل الدخول للوصول إلى طلباتك ومتابعة حالتها.</p>
      <form noValidate onSubmit={submit}>
        <Field label="البريد الإلكتروني" error={error && emailError(normalizeEmail(email)) ? error : ""}>
          <input
            className="ltr"
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="example@email.com"
            value={email}
            onChange={(event) => setEmail(normalizeEmail(event.target.value))}
          />
        </Field>
        <Field label="كلمة المرور">
          <PasswordField
            value={password}
            shown={show}
            autoComplete="current-password"
            placeholder="********"
            onChange={setPassword}
            onToggle={() => setShow((current) => !current)}
          />
        </Field>
        <label className="check">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          <span>تذكر هذا البريد على هذا الجهاز</span>
        </label>
        {error && !emailError(normalizeEmail(email)) ? <p className="err">{error}</p> : null}
        <button className="btn primary block" type="submit">
          تسجيل الدخول
        </button>
        <div className="login-extra">
          <button className="login-extra-btn" type="button" onClick={() => setShowForgot(true)}>
            نسيت كلمة المرور؟
          </button>
          {showForgot ? <ForgotNote email={normalizeEmail(email)} /> : null}
          <div className="login-alt">
            <p>ليس لديك حساب؟</p>
            <button className="login-extra-btn login-start" type="button" onClick={onStart}>
              ابدأ طلبك
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
