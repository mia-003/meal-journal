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
