# Voyage — wiring real data

The app runs on mock data out of the box. To switch on real backend + APIs,
add the env vars below. Each integration is independent — you can turn on one
at a time.

## 1. Supabase (cross-device accounts + trip persistence)

1. Create a free project at <https://supabase.com>.
2. In the **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql` and run it.
3. **Settings → API** → copy the **Project URL** and **anon public** key.
4. On Vercel:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel deploy --prod
```

Once those vars are set, sign-in/sign-up automatically use Supabase Auth and
trips sync across devices via the `trips` table. No code changes needed —
`AuthProvider` and `lib/storage.ts` detect the env vars on boot.

## 2. Amadeus (live flights + hotels)

1. Sign up at <https://developers.amadeus.com>.
2. **Self-Service Workspace → Create New App** → copy **API Key** and **API Secret**.
3. The free tier targets `test.api.amadeus.com` (already wired in `lib/services/amadeus.ts`).
4. On Vercel:

```bash
vercel env add AMADEUS_API_KEY production
vercel env add AMADEUS_API_SECRET production
vercel deploy --prod
```

`/flights` and `/hotels` will show **● Live data · Amadeus** instead of
**Demo data**. The route falls back to mock if Amadeus errors.

## 3. Mapbox (real driving distance + geocoding)

1. Sign up at <https://mapbox.com>.
2. **Account → Tokens** → copy your **default public token** (or create one).
3. On Vercel:

```bash
vercel env add MAPBOX_TOKEN production
vercel deploy --prod
```

`/api/directions?origin=NYC&destination=Tokyo` returns real coordinates and
driving distance/time when wired.

## 4. Where the seams live

If you want to swap providers, the seams are:

| Concern | File |
|---|---|
| Auth | `components/AuthProvider.tsx` |
| Trip persistence | `lib/storage.ts` |
| Flight search | `lib/services/amadeus.ts` + `app/api/flights/route.ts` |
| Hotel search | `lib/services/amadeus.ts` + `app/api/hotels/route.ts` |
| Geocoding + driving distance | `lib/services/mapbox.ts` + `app/api/directions/route.ts` |
| Mock fallback | `lib/mock-data.ts` |
