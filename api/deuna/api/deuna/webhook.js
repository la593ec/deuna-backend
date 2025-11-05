// api/deuna/webhook.js

// (Opcional) Permitir leer el cuerpo RAW si luego validas firma HMAC
export const config = { api: { bodyParser: false } };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const { WEBHOOK_SECRET, WC_STORE_URL, WC_CK, WC_CS } = process.env;

    // 1) Leer evento (RAW para futura validación de firma)
    const raw = await readBody(req);
    const event = JSON.parse(raw || "{}");

    // 2) (Opcional) Validar firma si DeUna envía cabecera, ejemplo:
    // const signature = req.headers["x-deuna-signature"];
    // const crypto = await import("crypto");
    // const computed = crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
    // if (signature !== computed) return res.status(401).json({ error: "INVALID_SIGNATURE" });

    // 3) Obtener referencia y estado
    const ref = event.reference || event?.data?.reference || "";
    const orderId = (ref || "").replace("ORDER-", "");
    const statusRaw = (event.status || event?.data?.status || "").toLowerCase();
    const paid = ["paid", "approved", "confirmed", "success"].includes(statusRaw);

    // 4) Si pagado, marcar el pedido en WooCommerce
    if (orderId && paid) {
      const auth = Buffer.from(`${WC_CK}:${WC_CS}`).toString("base64");
      const r = await fetch(`${WC_STORE_URL}/wp-json/wc/v3/orders/${orderId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },
        body: JSON.stringify({
          status: "processing", // usa "completed" si tu flujo lo requiere
          meta_data: [{ key: "_deuna_paid", value: "1" }]
        })
      });
      if (!r.ok) {
        const t = await r.text();
        console.error("Woo update failed:", t);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "WEBHOOK_ERROR" });
  }
}
