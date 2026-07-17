# AI calorie estimation setup

The public GitHub Pages frontend calls the authenticated Supabase Edge Function
`estimate-calories`. The DeepSeek API key must only be stored as a Supabase secret.

Required configuration:

1. Create a Supabase project and enable anonymous sign-ins.
2. Set the frontend `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` constants in
   `index.html` using the project's browser-safe values.
3. Set the server secret: `supabase secrets set DEEPSEEK_API_KEY=...`.
4. Optionally set `DEEPSEEK_MODEL`; the function defaults to `deepseek-v4-flash`.
5. Deploy with `supabase functions deploy estimate-calories`.

Do not commit `DEEPSEEK_API_KEY` to GitHub.

## Cloud meal records and cross-device sign-in

The migration in `migrations/202607170001_cloud_meals.sql` creates:

- the private `public.meals` table;
- per-user Row Level Security policies;
- the private `meal-photos` Storage bucket;
- per-user photo access policies.

Run the migration once in the Supabase SQL Editor. Then configure Auth in the
Supabase Dashboard:

1. Keep the Email provider enabled.
2. Set the Site URL to `https://mia-003.github.io/meal-journal/`.
3. Add `https://mia-003.github.io/meal-journal/` to Redirect URLs.
4. Keep anonymous sign-ins enabled for the AI-estimation experience before a
   user chooses to sign in.

The website sends an email Magic Link. After the user opens the link, the
website associates all cloud records with that permanent Supabase user ID.
The “同步本机记录到云端” action reads `shiguang-meals-v1`, uploads local photos
to Storage, and upserts meals by `(user_id, client_id)`. Repeating the migration
does not create duplicate meals, and local browser data is never deleted.
