# 繁星短網址｜go-starry

正式網域：`https://go.starry.phd`

完全獨立的短網址 App，不使用 Starry ID、EchoStars 會員資料、session 或 D1。

## MVP

- Google OAuth 登入
- 建立自動或自訂 slug
- 302 redirect
- 個人 Dashboard
- 啟用 / 停用 / 刪除
- 點擊數與最近點擊
- QR Code SVG
- `/privacy`、`/terms`
- D1 session / links / analytics
- 不保存完整 IP，只保存可選的 salted hash
- 基本建立速率限制與危險 URL scheme 阻擋

## Cloudflare resources

- Worker: `go-starry`
- D1: `go-starry-db`
- Domain: `go.starry.phd`

## 首次部署前需要完成

1. 在 Cloudflare 建立 D1 `go-starry-db`，把 Database ID 填入 `wrangler.toml`。
2. Cloudflare Worker secrets：
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `IP_HASH_SALT`
3. GitHub Actions secrets：
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Google OAuth Web Client：
   - Authorized JavaScript origin: `https://go.starry.phd`
   - Authorized redirect URI: `https://go.starry.phd/auth/google/callback`
5. Cloudflare DNS / Worker route 確認 `go.starry.phd/*` 指向 `go-starry`。

## 本機

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```
