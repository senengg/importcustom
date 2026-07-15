# Custom Import Profit Calculator

A Vercel-ready web app generated from `Custom Import.xlsx`.

## What It Does

- Calculates freight, insurance, customs duty, SWS, IGST, import cost, landed cost, Amazon settlement, profit, margin, and ROI.
- Keeps the two sample products from the Excel workbook.
- Supports editable product rows, manual USD/INR override, optional live USD/INR refresh, CSV export, duplicate, delete, and reset.
- Stores edits locally as a fallback and can sync shared data across devices through Upstash Redis.

## Deploy To Vercel

1. Open this folder in Vercel as a new project.
2. From the Vercel Marketplace, add an Upstash Redis database and connect it to the project. This supplies `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In the Vercel project's environment variables, add `APP_SYNC_PASSWORD` with a strong password known only to app users.
4. Deploy or redeploy the project.

On the first visit after setup, enter the sync password. Open the updated app first in the existing browser that contains the full product list. If cloud storage is empty, that browser automatically uploads its local data. Other browsers and devices then load the shared copy.

The app uses `/api/rates` for live USD/INR refresh and falls back to the workbook's manual rate if the exchange-rate provider is unavailable.
