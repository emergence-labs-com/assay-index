# Emergence Labs · Assay Index

A static application for searching assay chapters, browsing provider listings, and comparing assay equipment with a staged lab plan. The [hosted Assay Index](https://assays.emergence-labs.com/) uses the company catalog and stage plan behind a password screen. This repository includes the application and fictional planning data for local development.

## Run locally

```sh
npm ci
npm test
npm run build
npm start
```

Open [the local app](http://127.0.0.1:4317/). The local preview binds to loopback. The password screen runs on Vercel.

## Deploy

The production project is `emergence-labs-assay-index` in the Emergence Labs Vercel team. Use the company workspace to release the full catalog and plan. The public sample has no workbook.

Set `ASSAY_SITE_PASSWORD` and a separately generated, high-entropy `ASSAY_SESSION_KEY` as secret environment variables in Vercel. Build with `npm run build`. Vercel serves the resulting `dist/` through the password middleware. The middleware protects the HTML, data, workbook and static assets with the same session cookie.
