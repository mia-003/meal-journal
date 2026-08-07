# Mia's Eating Life（食光记）

[中文](README.md) | [English](README.en.md)

一个面向个人使用的饮食记录网站，用来记录每天吃了什么、预估热量、餐费和食物照片，并通过长期记录观察自己的饮食习惯。

在线使用：[https://mia-003.github.io/meal-journal/](https://mia-003.github.io/meal-journal/)

> 热量结果来自 AI 粗略估算，只适合个人记录与趋势观察，不构成营养或医疗建议。

## 项目功能

- 通过文字描述记录早餐、午餐、晚餐和加餐。
- 拍照或选择食物照片，压缩后保存并显示预览。
- 填写每餐花费，统计当天餐费。
- 根据文字描述调用 DeepSeek，返回动态热量估算和参考区间。
- 手动修改 AI 估算结果后再保存，避免把模型结果当成精确数值。
- 查看今日摄入、记录餐次、连续记录天数和近 7 天热量趋势。
- 查看最近 30 天餐次分布、常见食物和记录习惯。
- 将饮食记录导出为 JSON 文件备份。
- 使用邮箱 Magic Link 登录，将本机记录和照片同步到 Supabase。
- 登录后可在不同浏览器或设备读取同一账户的云端记录。

## 用户使用旅程

1. 打开网站，选择餐次并填写食物描述。
2. 可选填餐费，也可以拍照或上传照片。
3. 点击“AI 估算”，网站把文字描述发送到服务端，获得热量估算。
4. 确认或手动调整热量后保存本餐。
5. 未登录时，记录保存在当前浏览器；登录后，新记录会同时保存到本机和云端。
6. 已有本机记录可通过“同步本机记录到云端”一次性迁移，原本的本机数据不会被删除。
7. 在其他设备使用同一个邮箱登录，即可读取该用户 ID 对应的记录。

## 数据如何流转

### 本机保存

未登录时，饮食记录保存在浏览器 `localStorage` 中，数据键为：

```text
shiguang-meals-v1
```

这种方式无需注册即可使用，但数据只存在当前浏览器。清除浏览器数据、更换浏览器或更换设备后，记录不会自动出现，因此建议定期导出 JSON 或登录后同步到云端。

### 云端保存

用户通过邮箱 Magic Link 登录后，Supabase 会建立持久登录会话并分配用户 ID：

- 餐食数据保存到 `public.meals`。
- 照片保存到私有 Storage bucket：`meal-photos`。
- 每条数据都关联当前 Supabase 用户 ID。
- Row Level Security（RLS）确保用户只能读写自己的记录和照片。
- 本机迁移使用 `(user_id, client_id)` 去重，重复同步不会产生相同记录的副本。

### AI 热量估算

浏览器不会直接持有 DeepSeek API Key。调用过程是：

```text
食物文字描述
  → Supabase Edge Function：estimate-calories
  → DeepSeek API
  → 热量估值、参考区间和估算说明
  → 返回网页供用户确认
```

食物照片不会发送给 AI。照片只用于饮食记录，未登录时保存在浏览器，登录同步时上传到 Supabase Storage。

## 技术架构

- 前端：原生 HTML、CSS、JavaScript
- 静态托管：GitHub Pages
- 身份认证：Supabase Auth（匿名会话 + 邮箱 Magic Link）
- 云端数据库：Supabase Postgres
- 图片存储：Supabase Storage
- 服务端函数：Supabase Edge Functions
- AI 模型：DeepSeek API
- 本地离线数据：浏览器 `localStorage`

## 项目结构

```text
.
├── index.html
├── cloud-sync.js
├── README.md
└── supabase
    ├── README.md
    ├── config.toml
    ├── functions
    │   └── estimate-calories
    │       └── index.ts
    └── migrations
        └── 202607170001_cloud_meals.sql
```

- `index.html`：页面、UI 样式、本机记录和趋势统计逻辑。
- `cloud-sync.js`：邮箱登录、本机数据迁移、云端读写和照片同步。
- `supabase/functions/estimate-calories/index.ts`：调用 DeepSeek 的服务端热量估算函数。
- `supabase/migrations/202607170001_cloud_meals.sql`：数据表、RLS 和私有照片存储策略。
- `supabase/config.toml`：Edge Function 的 JWT 验证设置。

## 本地运行

直接打开 `index.html` 可以查看页面，但邮箱登录和部分浏览器 API 在 `file://` 环境下可能受限。建议在项目目录启动本地静态服务器：

```bash
python3 -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

## Supabase 配置

### 1. 创建数据库和照片存储

在 Supabase SQL Editor 执行：

```text
supabase/migrations/202607170001_cloud_meals.sql
```

该脚本会创建：

- `public.meals` 数据表；
- 用户级 Row Level Security 策略；
- 私有 `meal-photos` bucket；
- 用户级照片访问策略。

### 2. 配置登录

在 Supabase Authentication 中：

- 启用 Email Provider；
- 保留匿名登录，用于登录前调用受保护的 AI 函数；
- 将 Site URL 设置为 `https://mia-003.github.io/meal-journal/`；
- 将同一网址加入 Redirect URLs。

### 3. 配置 DeepSeek 密钥

API Key 只能作为 Supabase secret 保存：

```bash
supabase secrets set DEEPSEEK_API_KEY=你的密钥
```

可选设置模型名称：

```bash
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
```

不要把 DeepSeek API Key 写入 `index.html`、README 或 GitHub。

### 4. 部署热量估算函数

```bash
supabase functions deploy estimate-calories
```

`verify_jwt = true` 表示只有携带有效 Supabase 会话令牌的请求才能调用该函数。

## 发布到 GitHub Pages

1. 将 `index.html`、`cloud-sync.js`、`README.md` 和 `supabase/` 放在仓库根目录。
2. 在 GitHub 仓库中进入 **Settings → Pages**。
3. Source 选择 **Deploy from a branch**。
4. 选择 `main` 分支和 `/ (root)`。
5. 保存并等待 GitHub Pages 完成部署。

## 安全与隐私

- DeepSeek API Key 只保存在 Supabase 服务端 secret 中。
- 前端的 Supabase Publishable Key 是浏览器公开配置，不具备绕过 RLS 的权限。
- 云端餐食和照片由用户 ID 隔离。
- 照片 bucket 为私有，网页使用限时签名网址读取。
- AI 只接收用户输入的食物文字描述，不接收照片。
- 本机记录迁移到云端后仍保留，不会自动删除。

## 已知限制

- AI 无法知道真实克重、食材品牌和实际用油量，热量只能作为估算。
- 维生素和营养素没有精确检测数据，不能替代专业营养评估。
- 浏览器本地存储空间有限，保存大量照片时可能达到容量上限。
- 邮箱 Magic Link 受 Supabase 邮件发送频率限制，短时间反复发送可能暂时失败。
- 云端功能依赖 Supabase、DeepSeek 和网络连接；失败时本机记录仍会保留。

## 项目定位

Mia's Eating Life 的核心目标不是“精确计算每一口食物”，而是降低日常记录门槛，把热量、花费、照片和长期习惯放在同一个个人日志中，帮助用户持续观察自己的饮食生活。
