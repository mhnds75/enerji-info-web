// Vercel Serverless Function — enerji.info iletişim formu
// POST /api/contact
// Gerekli ortam değişkenleri (Vercel Dashboard → Settings → Environment Variables):
//   RESEND_API_KEY  — https://resend.com adresinden alınan API anahtarı
//   CONTACT_TO      — form mesajlarının gönderileceği e-posta (örn. info@enerji.info)
//   CONTACT_FROM    — gönderim adresi (Resend'de doğrulanmış domain; örn. contact@enerji.info)
//                     Başlangıçta onboarding@resend.dev da kullanılabilir

export const config = { runtime: "edge" };

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Geçersiz istek gövdesi" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { name, email, company, phone, interest, plantType, message, website } = body || {};

  // Basit honeypot — bot'lar genellikle gizli "website" alanını doldurur
  if (website) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!name || !email || !message) {
    return new Response(
      JSON.stringify({ ok: false, error: "Ad, e-posta ve mesaj zorunludur" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Geçerli bir e-posta giriniz" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const CONTACT_TO = process.env.CONTACT_TO || "info@enerji.info";
  const CONTACT_FROM = process.env.CONTACT_FROM || "onboarding@resend.dev";

  // API key yoksa sadece başarı döneriz ama loglara yazarız — ilk deploy sonrası
  // kullanıcı Vercel dashboard'da env değişkenlerini ayarlayana kadar çalışmaya devam eder
  if (!RESEND_API_KEY) {
    console.log("Contact form submission (no RESEND_API_KEY set):", {
      name, email, company, phone, interest, plantType, message,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        warning: "RESEND_API_KEY tanımlı değil — mesaj yalnızca loglara yazıldı",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;">
      <h2 style="color:#0f4c81;">Yeni İletişim Formu Mesajı</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>Ad Soyad</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(name)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>E-posta</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(email)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>Şirket</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(company)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>Telefon</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(phone)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>İlgilenilen Ürün</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(interest)}</td></tr>
        <tr><td style="padding:6px;border-bottom:1px solid #eee;"><strong>Tesis Tipi</strong></td><td style="padding:6px;border-bottom:1px solid #eee;">${esc(plantType)}</td></tr>
      </table>
      <h3 style="color:#0f4c81;margin-top:20px;">Mesaj</h3>
      <p style="white-space:pre-wrap;background:#f7f9fc;padding:16px;border-radius:8px;">${esc(message)}</p>
      <p style="color:#888;font-size:12px;margin-top:20px;">enerji.info iletişim formu üzerinden gönderildi</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `enerji.info <${CONTACT_FROM}>`,
        to: [CONTACT_TO],
        reply_to: email,
        subject: `Yeni iletişim: ${name}${interest ? " — " + interest : ""}`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend API error:", res.status, errText);
      return new Response(
        JSON.stringify({ ok: false, error: "E-posta gönderilemedi" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Contact handler error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: "Beklenmeyen bir hata oluştu" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
