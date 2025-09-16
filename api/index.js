// Vercel → Telegram webhook: grafik + caption gönder, ardından /track ile Worker'a kaydet
const TG = (t)=>`https://api.telegram.org/bot${t}`;

const cornix = (sym, side, entry, tps, sl) => {
  const base = sym.toLowerCase().replace("usdt","/usdt");
  return side==="SHORT"
    ? `${base}\nsell ${entry}\nbuy ${tps.join(", ")}\nstop ${sl}`
    : `${base}\nbuy ${entry}\nsell ${tps.join(", ")}\nstop ${sl}`;
};

export default async function handler(req, res){
  const body = req.body || req.query || {};
  const msg = body.message || body.edited_message;
  if(!msg?.text) return { status: 200, json: () => ({ok:true}) };
  const chatId = msg.chat.id;

  const [raw, tf="1h"] = msg.text.trim().split(/\s+/);
    const isFut = /p$/i.test(raw);
  const symbol = raw.replace(/p$/i,"").toUpperCase();
  
  console.log(`🔍 Bot işlemi: ${raw} → ${symbol} (${isFut ? "futures" : "spot"})`);

  const WORKER = process.env.WORKER_URL?.replace(/\/$/,"") || "https://one.1sec-one-system.workers.dev";
  if(!WORKER) {
    await fetch(TG(process.env.BOT_TOKEN)+"/sendMessage",{
      method:"POST", headers:{'content-type':'application/json'},
      body: JSON.stringify({ chat_id: chatId, text:`❌ Worker URL eksik - Sistem yapılandırılmamış` })
    });
    return { status: 200, json: () => ({ok:true}) };
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 saniye timeout
  
  const a = await fetch(`${WORKER}/analyze?symbol=${symbol}&tf=${tf}&market=${isFut?"futures":"spot"}`, {
    signal: controller.signal
  }).then(r=>r.json()).catch(()=>null);
  
  clearTimeout(timeoutId);

  if(!a?.ok){
    await fetch(TG(process.env.BOT_TOKEN)+"/sendMessage",{
      method:"POST", headers:{'content-type':'application/json'},
      body: JSON.stringify({ chat_id: chatId, text:`Veri alınamadı: ${symbol} ${tf}` })
    });
    return { status: 200, json: () => ({ok:true}) };
  }

  // caption = Worker summary + Cornix free text
  const d=a.details, tps=[d.tp1,d.tp2,d.tp3].filter(Boolean);
  const caption = `${a.summary}\n\nCornix Free Text:\n${cornix(d.symbol||symbol, d.side, d.entry, tps, d.sl)}`;

  // 1) sendPhoto
  const r = await fetch(TG(process.env.BOT_TOKEN)+"/sendPhoto",{
    method:"POST", headers:{'content-type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, photo: a.chartUrl, caption })
  }).then(r=>r.json());

  // 2) track (KV'ye yaz, cron izleyecek)
  const message_id = r?.result?.message_id;
  if (message_id){
    await fetch(`${WORKER}/track`,{
      method:"POST", headers:{'content-type':'application/json'},
            body: JSON.stringify({
              id: `${Date.now()}-${symbol}-${tf}`,
              chat_id: chatId,
              message_id,
        tf, symbol, market: isFut?"futures":"spot",
              side: d.side, entry: d.entry, sl: d.sl, tp1: d.tp1, tp2: d.tp2, tp3: d.tp3,
              cachedText: caption
            })
    }).catch(()=>{});
  }

  return res.status(200).json({ok:true});
}
