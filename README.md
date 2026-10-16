# 繁星任意門｜starry-go

正式網址：`https://go.starry.phd/`

繁星 Starry.phd 生態系短網址服務。會員登入統一由「繁星通行證」Starry ID 管理；繁星任意門保留自己的短網址、個人化網址、點擊紀錄與 D1 資料。

## 目前功能

- 繁星通行證／Google 登入
- 登入一次後可承接繁星生態系中央登入狀態
- 登出與切換 Google 帳號同步中央登入
- 建立自動或自訂短碼
- 302 redirect
- 個人 Dashboard
- 啟用／刪除短網址
- 點擊數與最近點擊
- QR Code SVG
- `/privacy`、`/terms`
- 不保存完整 IP，只保存服務必要的匿名資料
- 基本建立速率限制與危險 URL scheme 阻擋

## 正式架構

- GitHub Repo：`yukidu/starry-go`
- 正式網址：`go.starry.phd`
- 中央會員：`https://id.starry.phd/`（繁星通行證）
- App D1：`go-starry-db`（保留既有資源名稱，避免無意義搬遷）

繁星通行證的敏感登入 Cookie 只屬於 `id.starry.phd`，不使用 `Domain=.starry.phd` 共用敏感 Cookie。繁星任意門透過中央登入狀態與一次性短效票證安全承接會員身份。

## 開發

```bash
npm install
npm run typecheck
npm test
```
