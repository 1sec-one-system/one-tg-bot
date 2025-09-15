// Vercel Serverless Function (Node 18, ESM)
// Env: BOT_TOKEN, WORKER_URL

const OK = new Response("ok", { status: 200 });

export default async function handler(req, res) {
  // Vercel middleware compat: detect runtime
  const isNodeRes = typeof res?.status === "function";

  try {
    if (req.method === "GET") {
      return isNodeRes ? res.status(200).send("ok") : OK;
    }

    if (req.method !== "POST") {
      return isNodeRes ? res.status(405).send("method") : new Response("method", { status: 405 });
    }

    const body = isNodeRes ? req.body : await req.json();
    const msg = body?.message || body?.edited_message;
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim() || "";

    if (!chatId || !text) {
      return isNodeRes ? res.status(200).send("ok") : OK;
    }

    // Expect: "solusdt 1h" or "btc 4h" etc.
    const [raw, tfRaw] = text.split(/\s+/);
    const tf = (tfRaw || "1h").toLowerCase();
    let symbol = (raw || "").toUpperCase().replace(/[^A-Z]/g, "");

    // Çift USDT kontrolü
    if (symbol.endsWith("USDTUSDT")) {
      symbol = symbol.replace("USDTUSDT", "USDT");
    } else if (!symbol.endsWith("USDT")) {
      symbol = symbol + "USDT";
    }

    const WORKER_URL = process.env.WORKER_URL;
    const BOT_TOKEN = process.env.BOT_TOKEN;

    // Environment variables kontrolü
    if (!WORKER_URL || !BOT_TOKEN) {
      console.error("❌ Environment variables eksik:", { WORKER_URL: !!WORKER_URL, BOT_TOKEN: !!BOT_TOKEN });
      const msgTxt = `❌ Bot konfigürasyon hatası: Environment variables eksik`;
      await tgSend(BOT_TOKEN, chatId, msgTxt);
      return isNodeRes ? res.status(200).send("ok") : OK;
    }

    // Query worker for TA - sadece analyze endpoint'i kullan
    const workerUrl = `${WORKER_URL}/analyze?symbol=${symbol}&tf=${tf}`;
    
    let data = null;
    try {
      console.log(`🔍 Worker URL deneniyor: ${workerUrl}`);
      const r = await fetch(workerUrl, { 
        headers: { 
          "cf-no-cache": "1",
          "cache-control": "no-cache",
          "pragma": "no-cache"
        } 
      });
      console.log(`📡 Response status: ${r.status}`);
      
      if (r.ok) {
        data = await r.json();
        console.log(`✅ Worker response:`, {
          ok: data?.ok,
          fallback: data?.fallback,
          endpoint: data?.endpoint,
          summary: data?.summary?.substring(0, 100) + "..."
        });
      } else {
        console.error(`❌ Worker HTTP hatası: ${r.status} ${r.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Worker hatası:`, error.message);
    }

    if (!data?.ok) {
      const msgTxt = `Veri alınamadı: ${symbol} ${tf}\nHata: ${data?.error || "worker"}`;
      await tgSend(BOT_TOKEN, chatId, msgTxt);
      return isNodeRes ? res.status(200).send("ok") : OK;
    }

    // Expected shape (örnek):
    // { ok:true, summary:"...", details:{ price,e20,e50,r,macdHist,atr,hh20,ll20,side,entry,sl,tp1,tp2,score } }
    const d = data.details || {};
    const side = d.side || "WAIT";
    
    // Debug log
    console.log(`🔍 Side değeri: ${side}, Entry: ${d.entry}, SL: ${d.sl}, TP1: ${d.tp1}, TP2: ${d.tp2}`);

    // Worker'dan gelen summary'yi kullan
    let messageText = data.summary || "Veri alınamadı";
    
    // Cornix satırını ekle (varsa)
    const cornix =
      side === "LONG"
        ? `${symbol.toLowerCase().replace("usdt","/usdt")} buy ${num(d.entry)} sell ${num(d.tp1)}, ${num(d.tp2)} stop ${num(d.sl)}`
        : side === "SHORT"
        ? `${symbol.toLowerCase().replace("usdt","/usdt")} sell ${num(d.entry)} buy ${num(d.tp1)}, ${num(d.tp2)} stop ${num(d.sl)}`
        : null;
    
    if (cornix) {
      messageText += `\n\nCornix: ${cornix}`;
    }

    await tgSend(BOT_TOKEN, chatId, messageText, false);
    return isNodeRes ? res.status(200).send("ok") : OK;

  } catch (e) {
    console.error("❌ Handler hatası:", e);
    // silent 200 for Telegram
    return isNodeRes ? res.status(200).send("ok") : OK;
  }
}

// Helpers
function num(v) {
  if (v === null || v === undefined || Number.isNaN(+v)) return "-";
  const n = +v;
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function fmtScore(s) {
  if (s === null || s === undefined) return "0";
  const n = +s;
  return (n > 0 ? "+" : "") + n.toFixed(2);
}

async function tgSend(token, chatId, text, markdown=false) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: markdown ? "Markdown" : undefined,
    disable_web_page_preview: true
  };
  
  try {
    console.log(`📤 Telegram mesajı gönderiliyor: ${chatId}`);
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    console.log(`📤 Telegram response: ${response.status}`);
  } catch (error) {
    console.error(`❌ Telegram gönderim hatası:`, error.message);
  }
}
