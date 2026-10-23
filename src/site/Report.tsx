import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api";
import { BackButton, RequiredStar } from "../components";
import { useStore } from "../store";

const VIDEO_MAX_SEC = 10;

function validateMedia(file: File) {
  return new Promise<File>((resolve, reject) => {
    if (file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    if (!file.type.startsWith("video/")) {
      reject(new Error("ارفق صورة أو فيديو فقط."));
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (!Number.isFinite(video.duration) || video.duration > VIDEO_MAX_SEC + 0.05) {
        reject(new Error(`الفيديو لازم يكون ${VIDEO_MAX_SEC} ثوانٍ أو أقل (مدته الآن: ${Math.ceil(video.duration)} ث).`));
        return;
      }
      resolve(file);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ما قدرنا نقرأ الفيديو — جرّب صيغة mp4 أو webm."));
    };
    video.src = url;
  });
}

export function ReportPage({ onBack }: { onBack: () => void }) {
  const { currentUser } = useStore();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const filled = useRef(false);

  useEffect(() => {
    if (filled.current || !currentUser) return;
    filled.current = true;
    setName(`${currentUser.firstName} ${currentUser.lastName}`.trim());
    setContact(currentUser.email || currentUser.phone || "");
  }, [currentUser]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function clearMedia() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview("");
  }

  async function onPick(list: FileList | null) {
    const next = list?.[0];
    if (!next) {
      clearMedia();
      return;
    }
    try {
      const valid = await validateMedia(next);
      if (preview) URL.revokeObjectURL(preview);
      setFile(valid);
      setPreview(URL.createObjectURL(valid));
      setError("");
    } catch (err) {
      clearMedia();
      setError(err instanceof Error ? err.message : "تعذر قراءة المرفق.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (text.length < 5) {
      setError("اكتب وصف أوضح للمشكلة.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const body = new FormData();
      body.append("name", name.trim());
      body.append("contact", contact.trim());
      body.append("orderNo", orderNo.trim());
      body.append("message", text);
      body.append("page", window.location.hash || "موقع العملاء");
      if (file) body.append("media", file);
      await api<{ ok: boolean }>("/api/reports", { method: "POST", body });
      setDone(true);
      setMessage("");
      setOrderNo("");
      clearMedia();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال البلاغ.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="wizard">
      <BackButton onBack={onBack} />
      <h1>الإبلاغ عن مشكلة</h1>
      <p className="lead">شفت خطأ، أو الطلب ما طلع كما هو، أو شي مو واضح؟ اكتبها هنا. تقدر ترفق صورة أو مقطع قصير.</p>
      {done ? (
        <p className="report-ok" role="status">
          وصلنا بلاغك. الإدارة تراجعه من لوحة قيفانتا.
        </p>
      ) : null}
      <form className="report-form" onSubmit={(event) => void submit(event)}>
        <div className="report-fields">
          <label className="field">
            <span>اسمك <em className="optional">اختياري</em></span>
            <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={80} />
          </label>
          <label className="field">
            <span>بريد أو جوال <em className="optional">اختياري</em></span>
            <input value={contact} onChange={(event) => setContact(event.target.value)} autoComplete="email" maxLength={120} />
          </label>
        </div>
        <label className="field">
          <span>رقم الطلب <em className="optional">إن وُجد</em></span>
          <input value={orderNo} onChange={(event) => setOrderNo(event.target.value)} placeholder="مثال: QY-1234" maxLength={40} />
        </label>
        <label className="field">
          <span>
            وصف المشكلة <RequiredStar />
          </span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            required
            minLength={5}
            maxLength={2000}
            placeholder="صف ما حدث، والخطوة التي كنت فيها، وما كنت تتوقعه."
          />
        </label>
        <div className="report-media">
          <label className="report-media-btn">
            إرفاق صورة أو فيديو
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              hidden
              onChange={(event) => void onPick(event.target.files)}
            />
          </label>
          <span className="report-media-name">{file ? file.name : "اختياري · الفيديو ≤ ١٠ ثوانٍ"}</span>
          {file ? (
            <button type="button" className="report-media-clear" onClick={clearMedia}>
              إزالة
            </button>
          ) : null}
        </div>
        {preview ? (
          <div className="report-media-preview">
            {file?.type.startsWith("video/") ? (
              <video src={preview} controls muted playsInline />
            ) : (
              <img src={preview} alt="معاينة المرفق" />
            )}
          </div>
        ) : null}
        {error ? (
          <p className="err" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn primary block" type="submit" disabled={sending}>
          {sending ? "جاري الإرسال…" : "إرسال البلاغ"}
        </button>
        <p className="fine">لا تُرفق كلمة المرور. رقم الجوال إن كتبته يبقى لتنسيق الرد فقط.</p>
      </form>
    </section>
  );
}
