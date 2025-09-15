// /analyze?symbol=SOLUSDT&tf=1h  -> gerçek zamanlı analiz ve öneri döner

// Binance API için farklı endpointler ve yöntemler
const BINANCE_ENDPOINTS = [
  // Ana Binance API'leri
  "https://api.binance.com/api/v3/klines",
  "https://api1.binance.com/api/v3/klines", 
  "https://api2.binance.com/api/v3/klines",
  "https://api3.binance.com/api/v3/klines",
  "https://api4.binance.com/api/v3/klines",
  
  // Futures API'leri
  "https://fapi.binance.com/fapi/v1/klines",
  "https://fapi1.binance.com/fapi/v1/klines",
  "https://fapi2.binance.com/fapi/v1/klines",
  
  // Testnet API'leri
  "https://testnet.binance.vision/api/v3/klines",
  "https://testnet.binancefuture.com/fapi/v1/klines"
];

const BASE = BINANCE_ENDPOINTS[0]; // Varsayılan

const ema=(a,p)=>{const k=2/(p+1);let e=a[0];return a.map((v,i)=>i?(e=v*k+e*(1-k)):v)};
const rsi=(a,p=14)=>{
  if(a.length<=p) return Array(a.length).fill(50); // Varsayılan 50 değeri
  
  let g=0,l=0;
  for(let i=1;i<=p;i++){
    const d=a[i]-a[i-1];
    if(d>=0) g+=d; else l-=d;
  }
  
  let rs=(g/p)/((l||1)/p);
  const out=Array(p).fill(50); // İlk p değer için 50
  out.push(100-100/(1+rs));
  
  for(let i=p+1;i<a.length;i++){
    const d=a[i]-a[i-1];
    g=g*(p-1)+Math.max(0,d);
    l=l*(p-1)+Math.max(0,-d);
    rs=(g/p)/((l||1)/p);
    const rsiVal = 100-100/(1+rs);
    out.push(isNaN(rsiVal) ? 50 : rsiVal); // NaN kontrolü
  }
  return out;
};
const macd=(a)=>{const e12=ema(a,12),e26=ema(a,26);
  const m=e12.map((v,i)=>v-e26[i]);const s=ema(m.slice(26),9);return {macd:m.slice(26),sig:s}};
const atr=(h,l,c,p=14)=>{const tr=[];for(let i=0;i<h.length;i++){
  const pr=i?c[i-1]:c[0];tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-pr),Math.abs(l[i]-pr)))}return ema(tr,p)};

// ADX (Average Directional Index) hesaplama
const adx=(h,l,c,p=14)=>{
  if(h.length<p) return Array(h.length).fill(50);
  
  const dmPlus=[], dmMinus=[], tr=[];
  
  for(let i=1;i<h.length;i++){
    const highDiff=h[i]-h[i-1];
    const lowDiff=l[i-1]-l[i];
    
    dmPlus.push(highDiff>lowDiff && highDiff>0 ? highDiff : 0);
    dmMinus.push(lowDiff>highDiff && lowDiff>0 ? lowDiff : 0);
    
    const trueRange=Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1]));
    tr.push(trueRange);
  }
  
  const atrValues=ema(tr,p);
  const diPlus=dmPlus.map((dm,i)=>atrValues[i]>0 ? (dm/atrValues[i])*100 : 0);
  const diMinus=dmMinus.map((dm,i)=>atrValues[i]>0 ? (dm/atrValues[i])*100 : 0);
  
  const dx=diPlus.map((plus,i)=>{
    const minus=diMinus[i];
    const sum=plus+minus;
    return sum>0 ? Math.abs(plus-minus)/sum*100 : 0;
  });
  
  return ema(dx,p);
};

// CCI (Commodity Channel Index) hesaplama
const cci=(h,l,c,p=20)=>{
  if(h.length<p) return Array(h.length).fill(0);
  
  const typicalPrice=h.map((high,i)=>(high+l[i]+c[i])/3);
  const sma=typicalPrice.map((_,i)=>{
    if(i<p-1) return 0;
    return typicalPrice.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p;
  });
  
  const meanDev=typicalPrice.map((tp,i)=>{
    if(i<p-1) return 0;
    const slice=typicalPrice.slice(i-p+1,i+1);
    const avg=sma[i];
    return slice.reduce((sum,val)=>sum+Math.abs(val-avg),0)/p;
  });
  
  return typicalPrice.map((tp,i)=>{
    if(i<p-1 || meanDev[i]===0) return 0;
    return (tp-sma[i])/(0.015*meanDev[i]);
  });
};

// Chande MO (Chande Momentum Oscillator) hesaplama
const chandeMO=(c,p=14)=>{
  if(c.length<p) return Array(c.length).fill(0);
  
  return c.map((_,i)=>{
    if(i<p-1) return 0;
    const slice=c.slice(i-p+1,i+1);
    const gains=slice.filter((val,idx)=>idx>0 && val>slice[idx-1]).length;
    const losses=slice.filter((val,idx)=>idx>0 && val<slice[idx-1]).length;
    return ((gains-losses)/(gains+losses))*100;
  });
};

// Boğa ve Ayı Gücü hesaplama
const bullBearPower=(h,l,c,p=13)=>{
  const emaHigh=ema(h,p);
  const emaLow=ema(l,p);
  const emaClose=ema(c,p);
  
  return {
    bullPower: h.map((high,i)=>high-emaClose[i]),
    bearPower: l.map((low,i)=>low-emaClose[i])
  };
};

// WMA (Weighted Moving Average) hesaplama
const wma=(arr,p)=>{
  if(arr.length<p) return Array(arr.length).fill(arr[0]||0);
  
  return arr.map((_,i)=>{
    if(i<p-1) return arr[0]||0;
    const slice=arr.slice(i-p+1,i+1);
    let sum=0, weightSum=0;
    slice.forEach((val,idx)=>{
      const weight=p-idx;
      sum+=val*weight;
      weightSum+=weight;
    });
    return sum/weightSum;
  });
};

// Fallback veri - API çalışmazsa kullanılır
function getFallbackData(symbol) {
  const fallbackPrices = {
    'SOLUSDT': 180,
    'BTCUSDT': 65000,
    'ETHUSDT': 3500,
    'ADAUSDT': 0.45,
    'BNBUSDT': 600
  };
  
  const basePrice = fallbackPrices[symbol] || 100;
  const data = [];
  
  // Son 300 mum için simüle edilmiş veri oluştur
  for(let i = 0; i < 300; i++) {
    const variation = (Math.random() - 0.5) * 0.02; // %2 varyasyon
    const price = basePrice * (1 + variation);
    const high = price * (1 + Math.random() * 0.01);
    const low = price * (1 - Math.random() * 0.01);
    
    data.push([0, price, high, low, price]); // [timestamp, open, high, low, close]
  }
  
  return data;
}

// Gerçek zamanlı veri için webhook sistemi
let realTimeData = new Map();

// Webhook'dan gelen veriyi kaydet
function saveWebhookData(symbol, data) {
  const key = symbol.toUpperCase();
  realTimeData.set(key, {
    ...data,
    timestamp: Date.now(),
    source: 'webhook'
  });
  console.log(`📊 Webhook verisi kaydedildi: ${key}`, data);
}

// Kaydedilmiş veriyi al
function getWebhookData(symbol) {
  const key = symbol.toUpperCase();
  const data = realTimeData.get(key);
  
  if(data) {
    const age = Date.now() - data.timestamp;
    const maxAge = 5 * 60 * 1000; // 5 dakika
    
    if(age < maxAge) {
      console.log(`✅ Güncel webhook verisi bulundu: ${key} (${Math.round(age/1000)}s önce)`);
      return data;
    } else {
      console.log(`⏰ Webhook verisi eski: ${key} (${Math.round(age/1000)}s önce)`);
      realTimeData.delete(key);
    }
  }
  
  return null;
}

// Gelişmiş Binance API test fonksiyonu
async function testBinanceAPI() {
  console.log('🔍 Binance API testi başlatılıyor...');
  
  // Farklı test endpointleri
  const testEndpoints = [
    'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    'https://api1.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    'https://api2.binance.com/api/v3/ticker/price?symbol=BTCUSDT',
    'https://fapi.binance.com/fapi/v1/ticker/price?symbol=BTCUSDT',
    'https://testnet.binance.vision/api/v3/ticker/price?symbol=BTCUSDT'
  ];
  
  for(let i = 0; i < testEndpoints.length; i++) {
    const testUrl = testEndpoints[i];
    console.log(`Test ${i+1}/${testEndpoints.length}: ${testUrl}`);
    
    try {
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Origin': 'https://tradingview.com'
        },
        cf: {
          cacheTtl: 0
        }
      });
      
      console.log(`Status: ${response.status} ${response.statusText}`);
      console.log('Headers:', Object.fromEntries(response.headers.entries()));
      
      if(response.ok) {
        const data = await response.json();
        console.log('✅ Başarılı! Response:', data);
        return { success: true, endpoint: testUrl, data: data };
      } else {
        console.log(`❌ Başarısız: ${response.status}`);
      }
    } catch(error) {
      console.log(`❌ Hata: ${error.message}`);
    }
    
    // Kısa bekleme
    if(i < testEndpoints.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('🚨 Tüm Binance endpointleri başarısız');
  return { success: false, endpoint: null, data: null };
}

async function fetchKlines(symbol,tf="1h",limit=300){
  // Önce webhook verisini kontrol et
  const webhookData = getWebhookData(symbol);
  if(webhookData) {
    console.log('🎯 Webhook verisi kullanılıyor:', symbol);
    const klines = webhookData.klines || [];
    if(klines.length > 0) {
      const o=klines.map(r=>+r[1]),h=klines.map(r=>+r[2]),l=klines.map(r=>+r[3]),c=klines.map(r=>+r[4]);
      return {o,h,l,c,fallback:false, endpoint: 'webhook'};
    }
  }
  
  // Binance API testi yap
  const apiTest = await testBinanceAPI();
  
  if(!apiTest.success) {
    console.log('🚨 Binance API testi başarısız - Fallback veri kullanılıyor');
    const fallbackData = getFallbackData(symbol);
    const o=fallbackData.map(r=>+r[1]),h=fallbackData.map(r=>+r[2]),l=fallbackData.map(r=>+r[3]),c=fallbackData.map(r=>+r[4]);
    return {o,h,l,c,fallback:true, endpoint: 'fallback'};
  }
  
  // Çalışan endpoint'i bul ve klines verisini çek
  const workingEndpoint = apiTest.endpoint.replace('/ticker/price', '/klines');
  const baseUrl = workingEndpoint.split('/api')[0] + '/api';
  
  try {
    const url = `${baseUrl}/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`;
    console.log('📡 Klines verisi çekiliyor:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://tradingview.com'
      },
      cf: {
        cacheTtl: 0
      }
    });
    
    console.log('Klines Status:', response.status);
    console.log('Klines Headers:', Object.fromEntries(response.headers.entries()));
    
    if(response.ok) {
      const data = await response.json();
      console.log('Klines veri sayısı:', data.length);
      
      if(Array.isArray(data) && data.length > 0) {
        console.log('✅ Binance gerçek veri başarıyla alındı!');
        console.log('İlk veri:', data[0]);
        const o=data.map(r=>+r[1]),h=data.map(r=>+r[2]),l=data.map(r=>+r[3]),c=data.map(r=>+r[4]);
        return {o,h,l,c,fallback:false, endpoint: url};
      }
    }
    
    console.log('❌ Klines verisi alınamadı');
    throw new Error('Klines verisi alınamadı');
    
  } catch(error) {
    console.log('❌ Klines hatası:', error.message);
    const fallbackData = getFallbackData(symbol);
    const o=fallbackData.map(r=>+r[1]),h=fallbackData.map(r=>+r[2]),l=fallbackData.map(r=>+r[3]),c=fallbackData.map(r=>+r[4]);
    return {o,h,l,c,fallback:true, endpoint: 'fallback'};
  }
}

function analyze({o,h,l,c}){
  const price=c.at(-1);
  
  // Temel göstergeler
  const e20=ema(c,20).at(-1), e50=ema(c,50).at(-1);
  const rsiValues=rsi(c,14);
  const r=rsiValues.at(-1);
  const {macd:macdArr,sig:sigArr}=macd(c);
  const macdVal=macdArr.at(-1), sigVal=sigArr.at(-1), macdHist=macdVal-sigVal;
  const A=atr(h,l,c,14).at(-1);
  const hh20=Math.max(...h.slice(-20)), ll20=Math.min(...l.slice(-20));

  // Yeni göstergeler
  const adxValues=adx(h,l,c,14);
  const adxVal=adxValues.at(-1);
  const cciValues=cci(h,l,c,20);
  const cciVal=cciValues.at(-1);
  const chandeValues=chandeMO(c,14);
  const chandeVal=chandeValues.at(-1);
  const {bullPower, bearPower}=bullBearPower(h,l,c,13);
  const bullPowerVal=bullPower.at(-1), bearPowerVal=bearPower.at(-1);
  
  // Çoklu EMA'lar
  const e5=ema(c,5).at(-1), e9=ema(c,9).at(-1), e22=ema(c,22).at(-1), e30=ema(c,30).at(-1), e100=ema(c,100).at(-1), e200=ema(c,200).at(-1);
  
  // WMA'lar
  const wma9=wma(c,9).at(-1), wma15=wma(c,15).at(-1), wma22=wma(c,22).at(-1), wma30=wma(c,30).at(-1), wma50=wma(c,50).at(-1), wma100=wma(c,100).at(-1), wma200=wma(c,200).at(-1);

  // RSI değeri güvenlik kontrolü
  const validR = (r && !isNaN(r) && isFinite(r)) ? r : 50;
  
  // Durum analizleri
  let side="WAIT", reason=[];
  
  // EMA analizleri
  if(e20>e50) reason.push("EMA20>EMA50"); else reason.push("EMA20<EMA50");
  if(e9>e30) reason.push("EMA9>EMA30"); else reason.push("EMA9<EMA30");
  if(e5>e22) reason.push("EMA5>EMA22"); else reason.push("EMA5<EMA22");
  
  // RSI analizi
  if(validR>55) reason.push("RSI>55"); else if(validR<45) reason.push("RSI<45");
  
  // MACD analizi
  if(macdHist>0) reason.push("MACD↑"); else reason.push("MACD↓");
  
  // ADX analizi
  if(adxVal>25) reason.push("ADX>25"); else if(adxVal<20) reason.push("ADX<20");
  
  // CCI analizi
  if(cciVal>100) reason.push("CCI>100"); else if(cciVal<-100) reason.push("CCI<-100");
  
  // Chande MO analizi
  if(chandeVal>0) reason.push("ChandeMO>0"); else if(chandeVal<0) reason.push("ChandeMO<0");
  
  // WMA analizleri
  if(wma9>wma15) reason.push("WMA9>WMA15"); else reason.push("WMA9<WMA15");
  const wma10=wma(c,10).at(-1);
  if(wma10>wma22) reason.push("WMA10>WMA22"); else reason.push("WMA10<WMA22");

  // Sinyal belirleme
  if(e20>e50 && validR>55 && macdHist>0 && adxVal>25) side="LONG";
  if(e20<e50 && validR<45 && macdHist<0 && adxVal>25) side="SHORT";

  let entry=null, sl=null, tp1=null, tp2=null, rr=null;
  if(side==="LONG"){
    entry=Math.max(price,hh20);
    sl=Math.min(ll20, price-1.5*A);
    const R=entry-sl; tp1=entry+R; tp2=entry+2*R; rr="1:2";
  }else if(side==="SHORT"){
    entry=Math.min(price,ll20);
    sl=Math.max(hh20, price+1.5*A);
    const R=sl-entry; tp1=entry-R; tp2=entry-2*R; rr="1:2";
  }

  // Fiyat-EMA ilişkileri
  const priceAboveEMAs=[];
  const priceBelowEMAs=[];
  const emas=[e5,e9,e20,e22,e30,e50,e100,e200];
  const emaNames=['5','9','20','22','30','50','100','200'];
  emas.forEach((emaVal,idx)=>{
    if(price>emaVal) priceAboveEMAs.push(emaNames[idx]);
    else priceBelowEMAs.push(emaNames[idx]);
  });

  // Fiyat-WMA ilişkileri
  const priceAboveWMAs=[];
  const priceBelowWMAs=[];
  const wmas=[wma9,wma15,wma22,wma30,wma50,wma100,wma200];
  const wmaNames=['9','15','22','30','50','100','200'];
  wmas.forEach((wmaVal,idx)=>{
    if(price>wmaVal) priceAboveWMAs.push(wmaNames[idx]);
    else priceBelowWMAs.push(wmaNames[idx]);
  });

  // Skor hesaplama
  let score=0;
  if(e20>e50) score++; else score--;
  if(e9>e30) score++; else score--;
  if(e5>e22) score++; else score--;
  if(validR>60) score+=2; else if(validR>55) score++; else if(validR<40) score-=2; else if(validR<45) score--;
  if(macdHist>0) score++; else score--;
  if(adxVal>25) score++; else if(adxVal<20) score--;
  if(cciVal>100) score++; else if(cciVal<-100) score--;
  if(chandeVal>0) score++; else score--;
  if(wma9>wma15) score++; else score--;
  if(wma10>wma22) score++; else score--;

  return {
    // Temel veriler
    price,e20,e50,r:validR,macdHist,atr:A,hh20,ll20,side,entry,sl,tp1,tp2,rr,score,reason,
    
    // Yeni göstergeler
    adx:adxVal, cci:cciVal, chandeMO:chandeVal,
    bullPower:bullPowerVal, bearPower:bearPowerVal,
    
    // Çoklu EMA'lar
    e5,e9,e22,e30,e100,e200,
    
    // WMA'lar
    wma9,wma10,wma15,wma22,wma30,wma50,wma100,wma200,
    
    // Fiyat ilişkileri
    priceAboveEMAs, priceBelowEMAs, priceAboveWMAs, priceBelowWMAs,
    
    // MACD detayları
    macdMain:macdVal, macdSignal:sigVal
  };
}

function formatMsg(sym,tf,a,isFallback=false,endpoint=''){
  const lines=[
    `Coin: ${sym}  TF: ${tf}`,
    `Fiyat: ${a.price.toFixed(4)}`,
    `RSI: ${a.r.toFixed(1)}  MACD hist: ${a.macdHist.toFixed(4)}`,
    `EMA20: ${a.e20.toFixed(4)}  EMA50: ${a.e50.toFixed(4)}`,
    `ATR14: ${a.atr.toFixed(4)}`,
    `Durum: ${a.side}`,
  ];
  
  if(isFallback) {
    lines.push(`⚠️ UYARI: Binance API çalışmıyor, simüle edilmiş veri kullanılıyor!`);
  } else if(endpoint === 'webhook') {
    lines.push(`🎯 Gerçek Zamanlı Veri: TradingView Webhook`);
  } else {
    lines.push(`✅ Veri Kaynağı: ${endpoint}`);
  }
  
  if(a.side!=="WAIT"){
    lines.push(
      `Giriş: ${a.entry.toFixed(4)}  SL: ${a.sl.toFixed(4)}`,
      `TP1: ${a.tp1.toFixed(4)}  TP2: ${a.tp2.toFixed(4)}  RR: ${a.rr}`
    );
  }
  
  // Detaylı gösterge değerleri
  lines.push(`\n📊 DETAYLI GÖSTERGELER:`);
  lines.push(`RSI: ${a.r.toFixed(2)}`);
  lines.push(`MACD Ana: ${a.macdMain.toFixed(2)}  Sinyal: ${a.macdSignal.toFixed(2)}`);
  lines.push(`ADX: ${a.adx.toFixed(2)}`);
  lines.push(`CCI: ${a.cci.toFixed(2)}`);
  lines.push(`Chande MO: ${a.chandeMO.toFixed(2)}`);
  lines.push(`Boğa Gücü: ${a.bullPower.toFixed(2)}  Ayı Gücü: ${a.bearPower.toFixed(2)}`);
  
  // EMA değerleri
  lines.push(`\n📈 EMA DEĞERLERİ:`);
  lines.push(`EMA5: ${a.e5.toFixed(2)}  EMA9: ${a.e9.toFixed(2)}  EMA20: ${a.e20.toFixed(2)}`);
  lines.push(`EMA22: ${a.e22.toFixed(2)}  EMA30: ${a.e30.toFixed(2)}  EMA50: ${a.e50.toFixed(2)}`);
  lines.push(`EMA100: ${a.e100.toFixed(2)}  EMA200: ${a.e200.toFixed(2)}`);
  
  // WMA değerleri
  lines.push(`\n📊 WMA DEĞERLERİ:`);
  lines.push(`WMA9: ${a.wma9.toFixed(2)}  WMA10: ${a.wma10.toFixed(2)}  WMA15: ${a.wma15.toFixed(2)}`);
  lines.push(`WMA22: ${a.wma22.toFixed(2)}  WMA30: ${a.wma30.toFixed(2)}  WMA50: ${a.wma50.toFixed(2)}`);
  lines.push(`WMA100: ${a.wma100.toFixed(2)}  WMA200: ${a.wma200.toFixed(2)}`);
  
  // Fiyat ilişkileri
  lines.push(`\n🔗 FİYAT İLİŞKİLERİ:`);
  if(a.priceAboveEMAs.length > 0) {
    lines.push(`Fiyat > EMA: ${a.priceAboveEMAs.join(', ')}`);
  }
  if(a.priceBelowEMAs.length > 0) {
    lines.push(`Fiyat < EMA: ${a.priceBelowEMAs.join(', ')}`);
  }
  if(a.priceAboveWMAs.length > 0) {
    lines.push(`Fiyat > WMA: ${a.priceAboveWMAs.join(', ')}`);
  }
  if(a.priceBelowWMAs.length > 0) {
    lines.push(`Fiyat < WMA: ${a.priceBelowWMAs.join(', ')}`);
  }
  
  lines.push(`\nSkor: ${a.score}  (${a.reason.join(", ")})`);
  lines.push(`Benim bir önerim var: risk yönetimi için pozisyonu küçük başlat, SL zorunlu.`);
  return lines.join("\n");
}

export default {
  async fetch(req){
    const u=new URL(req.url);
    
    // Webhook endpoint - TradingView'den gelen verileri kaydet
    if(u.pathname==="/webhook"){
      try{
        const body = await req.json();
        console.log('📨 Webhook alındı:', body);
        
        // Webhook verisini kaydet
        if(body.symbol && body.klines) {
          saveWebhookData(body.symbol, body);
          return new Response(JSON.stringify({
            ok: true,
            message: `Webhook verisi kaydedildi: ${body.symbol}`,
            timestamp: new Date().toISOString()
          }),{headers:{"content-type":"application/json"}});
        } else {
          return new Response(JSON.stringify({
            ok: false,
            error: "Geçersiz webhook formatı",
            timestamp: new Date().toISOString()
          }),{status:400,headers:{"content-type":"application/json"}});
        }
      }catch(e){
        return new Response(JSON.stringify({
          ok: false,
          error: String(e),
          timestamp: new Date().toISOString()
        }),{status:500,headers:{"content-type":"application/json"}});
      }
    }
    
    // Debug endpoint
    if(u.pathname==="/debug"){
      try{
        const apiTest = await testBinanceAPI();
        const webhookData = Array.from(realTimeData.entries()).map(([key, data]) => ({
          symbol: key,
          age: Math.round((Date.now() - data.timestamp) / 1000),
          source: data.source
        }));
        
        return new Response(JSON.stringify({
          ok: true,
          binanceTest: apiTest,
          webhookData: webhookData,
          timestamp: new Date().toISOString(),
          message: apiTest.success ? `Binance API çalışıyor: ${apiTest.endpoint}` : "Binance API çalışmıyor"
        }),{headers:{"content-type":"application/json"}});
      }catch(e){
        return new Response(JSON.stringify({
          ok: false,
          error: String(e),
          timestamp: new Date().toISOString()
        }),{status:500,headers:{"content-type":"application/json"}});
      }
    }
    
    // Ana analiz endpoint
    if(u.pathname==="/analyze"){
      const symbol=(u.searchParams.get("symbol")||"SOLUSDT").toUpperCase();
      const tf=u.searchParams.get("tf")||"1h";
      try{
        const kl=await fetchKlines(symbol,tf,300);
        const a=analyze(kl);
        return new Response(JSON.stringify({ok:true,summary:formatMsg(symbol,tf,{
          ...a, r:a.r, macdHist:a.macdHist, atr:a.atr, e20:a.e20, e50:a.e50
        }, kl.fallback, kl.endpoint), details:a, fallback:kl.fallback, endpoint:kl.endpoint}),{headers:{"content-type":"application/json"}});
      }catch(e){
        console.error('API hatası:', e);
        return new Response(JSON.stringify({
          ok:false,
          error:String(e),
          details: {
            symbol: symbol,
            timeframe: tf,
            timestamp: new Date().toISOString()
          }
        }),{status:500,headers:{"content-type":"application/json"}});
      }
    }
    
    return new Response("ok");
  }
};
