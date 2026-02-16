# Deploy Project Pelican to Vercel (frontend + backend)

## Full-stack deploy (recommended)

Frontend and API run on the same Vercel project.

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New…** → **Project** → import your repo (e.g. **pp**).
3. **Root Directory:** leave **empty** or **`.`** (repo root). Do **not** set it to `client`, or the backend (`api/`, `server/`) will not deploy.
4. Vercel uses the root **vercel.json**:
   - **Build:** `cd client && npm ci && npm run build`
   - **Output:** `client/dist`
   - **API:** Python serverless in `api/` handles `/api/*` and `/classify` (memory 1024 MB, 30 s timeout).
5. Click **Deploy**.

Your app will be at `https://your-project.vercel.app`. The frontend uses the same origin for the API (no `VITE_API_URL` needed).

**Check that the backend is live:** open `https://your-project.vercel.app/api/health` — you should see `{"status":"ok"}`. If you get 404, ensure Root Directory is the repo root so `api/` and `server/` are included.

## Optional: frontend only

To deploy only the client and point it at another backend:

1. Set **Root Directory** to **`client`**.
2. Add **Environment variable:** `VITE_API_URL` = your backend URL (no trailing slash).
3. Deploy. The client at `client/vercel.json` will be used.
