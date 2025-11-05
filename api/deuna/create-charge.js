// api/deuna/create-charge.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    const {
      DEUNA_API_BASE,
      DEUNA_API_KEY,
      DEUNA_MERCHANT,
      WC_STORE_URL
    } = process.env;

    const { order_id, amount, currency, customer_email } = req.body || {};
    if (!order_id || !amount) {
      return res.status(400).json({ error: 'MISSING_FIELDS', detail: 'order_id and amount are required' });
    }

    const reference = `ORDER-${order_id}`;
    const payload = {
      merchantId: DEUNA_MERCHANT,
      amount: { value: amount, currency: currency || 'USD' },
      reference,
      customer: { email: customer_email || 'cliente@correo.com' },
      callbackUrl: `https://app.la593.com/api/deuna/webhook`,
      returnUrl: `${WC_STORE_URL}/checkout/order-received/${order_id}/?key=deuna`,
      channel: 'QR' // o 'LINK' según tu configuración en DeUna
    };

    const r = await fetch(`${DEUNA_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEUNA_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const txt = await r.text();
    if (!r.ok) {
      return res.status(400).json({ error: 'DEUNA_CREATE_FAILED', detail: txt });
    }
    const data = JSON.parse(txt || '{}');

    return res.status(200).json({
      ok: true,
      payment_id: data.paymentId || null,
      payment_url: data.paymentUrl || null,
      qr: data.qrImage || null,
      reference
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
}
