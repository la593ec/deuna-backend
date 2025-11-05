// server.js
// Minimal backend for DeUna + WooCommerce
// Run with: node server.js
const express = require("express");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const crypto = require("crypto");

const app = express();
app.use(express.json());

// === Environment variables (configure these in your hosting/Vercel) ===
const DEUNA_API_BASE = process.env.DEUNA_API_BASE || "https://api.deuna.example"; // <-- replace with real
const DEUNA_API_KEY  = process.env.DEUNA_API_KEY  || "YOUR_DEUNA_API_KEY";
const DEUNA_MERCHANT = process.env.DEUNA_MERCHANT || "YOUR_DEUNA_MERCHANT_ID";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "YOUR_WEBHOOK_SECRET";
const WC_STORE_URL   = process.env.WC_STORE_URL   || "https://la593.com";
const WC_CK          = process.env.WC_CK || "ck_xxx";
const WC_CS          = process.env.WC_CS || "cs_xxx";

// Health check (GET) - optional
app.get("/", (_req, res) => res.json({ ok: true, service: "deuna-backend" }));

// 1) Create charge
app.post("/deuna/create-charge", async (req, res) => {
  try {
    const { order_id, amount, currency, customer_email } = req.body || {};
    if (!order_id || !amount) {
      return res.status(400).json({ error: "MISSING_FIELDS", detail: "order_id and amount are required" });
    }

    const reference = `ORDER-${order_id}`;
    const payload = {
      merchantId: DEUNA_MERCHANT,
      amount: { value: amount, currency: currency || "USD" },
      reference,
      customer: { email: customer_email || "cliente@correo.com" },
      callbackUrl: `https://app.la593.com/deuna/webhook`, // set your domain
      returnUrl: `${WC_STORE_URL}/checkout/order-received/${order_id}/?key=deuna`,
      channel: "QR" // or "LINK", depending on DeUna's API
    };

    const r = await fetch(`${DEUNA_API_BASE}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEUNA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const txt = await r.text();
    if (!r.ok) {
      return res.status(400).json({ error: "DEUNA_CREATE_FAILED", detail: txt });
    }

    const data = JSON.parse(txt || "{}");
    return res.json({
      ok: true,
      payment_id: data.paymentId || null,
      payment_url: data.paymentUrl || null,
      qr: data.qrImage || null,
      reference
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

// 2) Webhook
app.post("/deuna/webhook", async (req, res) => {
  try {
    // Signature validation (generic example; adapt to DeUna's actual header name)
    const signature = req.headers["x-deuna-signature"];
    if (signature && WEBHOOK_SECRET) {
      const computed = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (computed !== signature) {
        return res.status(401).json({ error: "INVALID_SIGNATURE" });
      }
    }

    const event = req.body || {};
    const ref = event.reference || event.data?.reference || "";
    const orderId = (ref || "").replace("ORDER-", "");

    const statusRaw = (event.status || event.data?.status || "").toLowerCase();
    const paidStatuses = ["paid", "approved", "confirmed", "success"];
    const isPaid = paidStatuses.includes(statusRaw);

    if (orderId && isPaid) {
      const url = f"{WC_STORE_URL}/wp-json/wc/v3/orders/{orderId}"
      // Update WooCommerce order status
      const r = await fetch(f"{WC_STORE_URL}/wp-json/wc/v3/orders/{orderId}", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + Buffer.from(`${WC_CK}:${WC_CS}`).toString("base64")
        },
        body: JSON.stringify({ status: "processing", meta_data: [{ key: "_deuna_paid", value: "1" }] })
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("Woo update failed:", t);
      }
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "WEBHOOK_ERROR" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`DeUna backend running on :${port}`));
