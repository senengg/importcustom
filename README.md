# Custom Import Profit Calculator

A Vercel-ready web app generated from `Custom Import.xlsx`.

## What It Does

- Calculates freight, insurance, customs duty, SWS, IGST, import cost, landed cost, Amazon settlement, profit, margin, and ROI.
- Keeps the two sample products from the Excel workbook.
- Supports editable product rows, manual USD/INR override, optional live USD/INR refresh, CSV export, duplicate, delete, and reset.
- Stores edits in the browser on the same device.

## Deploy To Vercel

1. Open this folder in Vercel as a new project.
2. Use the default settings.
3. Deploy.

The app uses `/api/rates` for live USD/INR refresh and falls back to the workbook's manual rate if the exchange-rate provider is unavailable.
