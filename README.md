# one-tg-bot

Telegram → Vercel → Cloudflare Worker akışı.

## Kurulum

### 1. Environment Variables
Vercel dashboard'da aşağıdaki environment variables'ları ekleyin:

- `BOT_TOKEN`: BotFather'dan aldığınız Telegram bot token'ı
- `WORKER_URL`: Cloudflare Worker URL'iniz (örn: https://one.1sec-one-system.workers.dev)

### 2. Vercel Deploy
```bash
# GitHub'a push edin
git add .
git commit -m "Telegram bot kurulumu"
git push origin main

# Vercel'de otomatik deploy olacak
```

### 3. Telegram Webhook Kurulumu
Vercel deploy sonrası webhook URL'inizi alın ve Telegram'a kaydedin:

```bash
# Webhook URL formatı
https://your-app-name.vercel.app/api

# Webhook kurulumu (BotFather ile)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-app-name.vercel.app/api"}'
```

### 4. Test
Telegram'da botunuza şu komutları gönderin:
- `solusdt 1h`
- `btc 4h`
- `eth 1d`

## Sorun Giderme

### Bot Cevap Vermiyor
1. Vercel logs'ları kontrol edin
2. Environment variables doğru mu?
3. Worker URL çalışıyor mu?
4. Webhook doğru kurulmuş mu?

### Debug Endpoint
Worker'ınızda debug endpoint'i varsa:
```
https://your-worker.workers.dev/debug
```

## Dosya Yapısı
```
one-tg-bot/
├── api/
│   └── index.js          # Vercel serverless function
├── package.json          # Dependencies
├── vercel.json          # Vercel config
├── env.example          # Environment variables örneği
└── README.md            # Bu dosya
```
