  import fetch from "node-fetch";

  export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(200).send("ok");

    const BOT_TOKEN = process.env.BOT_TOKEN;
    const WORKER_URL = process.env.WORKER_URL;
    if (!BOT_TOKEN || !WORKER_URL) return res.status(500).send("Missing env");

    const update = req.body || {};
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return res.status(200).send("ok");

    const chatId = msg.chat.id;
    const [rawSym = "BTCUSDT", tf = "1h"] = msg.text.trim().split(/\s+/);
    const symUp = rawSym.toUpperCase();
    const symbol = symUp.endsWith("USDT") ? symUp : `${symUp}USDT`;

    const fmt = (n,p=4)=> (n==null||Number.isNaN(n)) ? "?" : Number(n).toFixed(p);

    let text = `⚡️ İstek: ${symbol} | ${tf}`;

    try {
      const a = await fetch(`${WORKER_URL}/analyze?symbol=${symbol}&tf=${tf}`);
      const aj = await a.json();

      if (aj.ok) {
        const d = aj.details || {};
        const side = d.side || "WAIT";
        text =
`*${symbol}* | *${tf}*
Skor: *${fmt(d.score,2)}* | Plan: *${side}*
Fiyat: \`${fmt(d.price,4)}\`  RSI14: \`${fmt(d.r,1)}\`
EMA20: \`${fmt(d.e20,4)}\`  EMA50: \`${fmt(d.e50,4)}\`
MACD-h: \`${fmt(d.macdHist,4)}\`  ATR14: \`${fmt(d.atr,4)}\`
20H: \`${fmt(d.hh20,4)}\`  20L: \`${fmt(d.ll20,4)}\`

Giriş: \`${fmt(d.entry,4)}\`
SL: \`${fmt(d.sl,4)}\`
TP1: \`${fmt(d.tp1,4)}\`
TP2: \`${fmt(d.tp2,4)}\`

_Cornix:_
\`${symbol.lower().replace("usdt","/usdt")}\`
\`${side=="LONG"?"buy":"sell"} ${fmt(d.entry,4)}\`
\`sell ${fmt(d.tp1,4)}, ${fmt(d.tp2,4)}\`
\`stop ${fmt(d.sl,4)}\`

Öneri: ${aj.note || "Sinyal zayıfsa hacim düşür, SL şart."}`;
      } else {
        text += `\n\nHata: ${aj.error || "analiz yapılamadı"}`;
      }

      const t = await fetch(`${WORKER_URL}/top?tf=${tf}&n=5`);
      const tj = await t.json();
      if (tj.ok && Array.isArray(tj.top)) {
        const alt = tj.top.find(x => x.symbol !== symbol && x.plan && x.plan.side && x.plan.side !== "WAIT");
        if (alt) {
          const p = alt.plan;
          text +=
`\n\n✨ *Benim bir önerim var:* *${alt.symbol}*.
${p.side==="LONG" ? `\`${fmt(p.entry,4)}\` üstü alım` : `\`${fmt(p.entry,4)}\` altı satış`} fırsatı olabilir.
SL \`${fmt(p.sl,4)}\`, TP1 \`${fmt(p.tp1,4)}\`, TP2 \`${fmt(p.tp2,4)}\`.`;
        }
      }
    } catch(e) {
      text += `\n\nHata: ${String(e)}`;
    }

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({chat_id: chatId, text, parse_mode:"Markdown"})
    });

    res.status(200).send("ok");
  }
