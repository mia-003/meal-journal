# Mia's Eating Life

[中文](README.md) | [English](README.en.md)

A personal meal journal for recording food, estimated calories, meal expenses, and photos while building a clearer picture of long-term eating habits.

**Live site:** [https://mia-003.github.io/meal-journal/](https://mia-003.github.io/meal-journal/)

> Calorie estimates are approximate and intended for personal tracking only. They are not nutritional or medical advice.

## Features

- Record breakfast, lunch, dinner, and snacks using natural-language descriptions.
- Take a photo or choose one from the device, compress it, and keep it with the meal record.
- Record meal expenses and track daily food spending.
- Use DeepSeek to estimate calories dynamically from the written description.
- Review the estimated range and edit the result before saving.
- Track today's calories, meal count, spending, logging streak, and seven-day calorie trend.
- Review 30-day meal distribution, frequently mentioned foods, and logging patterns.
- Export all records as JSON for backup.
- Sign in through an email Magic Link and migrate local records to Supabase.
- Access the same cloud records from different browsers and devices.

## User Flow

1. Open the site, choose a meal type, and describe the food.
2. Optionally add the meal cost and a photo.
3. Select **AI Estimate** to send the text description to the server-side calorie estimator.
4. Review or edit the estimated calories and save the meal.
5. Without an account, the record stays in the current browser. After sign-in, new records are saved locally and in the cloud.
6. Existing browser records can be migrated with **Sync local records to cloud**. Local copies are preserved.
7. Sign in with the same email on another device to load records associated with the same Supabase user ID.

## Data Model and Flow

### Local storage

Before sign-in, meal records are stored in browser `localStorage` under:

```text
shiguang-meals-v1
```

This makes the site usable without registration, but the data belongs to that specific browser profile. Clearing browser data or switching browsers or devices will not restore it automatically. Exporting JSON or enabling cloud sync is recommended.

### Cloud storage

After email Magic Link authentication, Supabase creates a persistent session and assigns a user ID:

- Meal records are stored in `public.meals`.
- Photos are stored in the private `meal-photos` Storage bucket.
- Every record is associated with the authenticated Supabase user ID.
- Row Level Security ensures users can access only their own meals and photos.
- Local migration uses `(user_id, client_id)` for deduplication, so repeated syncs do not duplicate the same meal.

### AI calorie estimation

The browser never contains the DeepSeek API key. Requests follow this path:

```text
Meal description
  → Supabase Edge Function: estimate-calories
  → DeepSeek API
  → Estimate, calorie range, and explanation
  → Browser for user review
```

Meal photos are never sent to the AI model. They remain in browser storage before sign-in and are uploaded only to Supabase Storage during cloud sync.

## Tech Stack

- **Frontend:** HTML, CSS, and vanilla JavaScript
- **Static hosting:** GitHub Pages
- **Authentication:** Supabase Auth with anonymous sessions and email Magic Links
- **Database:** Supabase Postgres
- **Photo storage:** Supabase Storage
- **Server-side logic:** Supabase Edge Functions
- **AI model:** DeepSeek API
- **Offline data:** Browser `localStorage`

## Project Structure

```text
.
├── index.html
├── cloud-sync.js
├── README.md
├── README.en.md
└── supabase
    ├── README.md
    ├── config.toml
    ├── functions
    │   └── estimate-calories
    │       └── index.ts
    └── migrations
        └── 202607170001_cloud_meals.sql
```

- `index.html` contains the interface, local persistence, and trend calculations.
- `cloud-sync.js` handles email authentication, migration, cloud CRUD, and photo sync.
- `supabase/functions/estimate-calories/index.ts` securely calls DeepSeek.
- `supabase/migrations/202607170001_cloud_meals.sql` creates the meal table, RLS policies, and private photo storage policies.
- `supabase/config.toml` enables JWT verification for the Edge Function.

## Local Development

Opening `index.html` directly is enough to inspect the interface, but email authentication and some browser APIs can be restricted on `file://` pages. A local static server is recommended:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Supabase Setup

### 1. Create the database and photo bucket

Run the following migration in Supabase SQL Editor:

```text
supabase/migrations/202607170001_cloud_meals.sql
```

It creates:

- the `public.meals` table;
- per-user Row Level Security policies;
- the private `meal-photos` bucket;
- per-user photo access policies.

### 2. Configure authentication

In Supabase Authentication:

- enable the Email provider;
- keep anonymous sign-ins enabled so the protected AI function can be used before permanent sign-in;
- set the Site URL to `https://mia-003.github.io/meal-journal/`;
- add the same address to Redirect URLs.

### 3. Configure DeepSeek secrets

Store the API key only as a Supabase secret:

```bash
supabase secrets set DEEPSEEK_API_KEY=your_key
```

Optionally set the model:

```bash
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
```

Never commit the DeepSeek API key to HTML, a README, or GitHub.

### 4. Deploy the calorie function

```bash
supabase functions deploy estimate-calories
```

`verify_jwt = true` requires every function request to include a valid Supabase session token.

## Deploying to GitHub Pages

1. Place `index.html`, `cloud-sync.js`, both README files, and `supabase/` in the repository root.
2. Open **Settings → Pages** in the GitHub repository.
3. Choose **Deploy from a branch**.
4. Select `main` and `/ (root)`.
5. Save and wait for GitHub Pages to finish publishing.

## Security and Privacy

- The DeepSeek API key is stored only in Supabase server-side secrets.
- The frontend Supabase publishable key is intentionally public and cannot bypass RLS.
- Cloud meals and photos are isolated by user ID.
- The photo bucket is private and the app uses time-limited signed URLs.
- The AI receives only written meal descriptions, never food photos.
- Migrating local records does not delete the browser copy.

## Known Limitations

- The AI does not know exact weights, brands, ingredients, or cooking oil quantities, so calorie values remain estimates.
- The site cannot provide laboratory-grade nutrient or vitamin measurements.
- Browser storage is limited and may fill up when many photos are saved locally.
- Supabase rate-limits Magic Link emails, so repeated requests in a short period may fail temporarily.
- Cloud features depend on Supabase, DeepSeek, and network availability. Local records remain available if cloud sync fails.

## Product Direction

Mia's Eating Life is designed to reduce the friction of everyday meal logging. It brings calories, spending, photos, and long-term habits into one personal journal—not to measure every bite perfectly, but to make daily patterns easier to notice.
