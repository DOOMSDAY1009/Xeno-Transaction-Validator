# Transaction Data Validation (Vercel)

A static web app that validates transaction datasets entirely in the browser, plus an
optional serverless function for running real MySQL queries.

## Structure
```
index.html      the page
styles.css      styling
app.js          validation engine + UI + in-browser SQL (AlaSQL)
api/sql.js      serverless function: runs real MySQL (optional)
package.json    declares mysql2 for the serverless function
```

## What it does
- Upload a transaction CSV (or use the built-in sample).
- Validates phone numbers per country, dates, amounts, payment modes, emails, duplicates.
- Splits issues into errors (row dropped) and warnings (row kept but flagged).
- Downloads: cleaned CSV, issues report, and the cleaned data auto-split into a zip of chunks.
- SQL playground:
  - "Run in browser" - AlaSQL, standard SQL, no setup.
  - "Run on cloud MySQL" - real MySQL via the serverless function (full MySQL syntax).

## Deploy on Vercel
1. Push this folder to a GitHub repo.
2. Go to vercel.com -> Add New -> Project -> import the repo.
3. Framework preset: "Other" (it's static; the `api/` folder is auto-detected as functions).
4. Click Deploy. You get a public `*.vercel.app` URL.

The validation app works immediately. The cloud-MySQL button only works after you add a
database (next section).

## Enable real MySQL (optional)
1. Create a free MySQL database - TiDB Cloud Serverless is a good choice
   (https://tidbcloud.com, MySQL-compatible, free, no card). Copy its host, port,
   user, password, and database name.
2. In your Vercel project: Settings -> Environment Variables, add:
   ```
   DB_HOST      = <host>
   DB_PORT      = 4000
   DB_USER      = <user>
   DB_PASSWORD  = <password>
   DB_NAME      = test
   ```
   (Optional) `APP_API_KEY = <any secret>` to gate the endpoint.
3. Redeploy (Deployments -> ... -> Redeploy) so the new variables take effect.
4. On the site: "Push data to cloud DB", then "Run on cloud MySQL".

Credentials live only in Vercel's environment variables on the server side - they are
never exposed in the browser.

## Run locally
Because it uses `fetch`, open it through a tiny web server rather than double-clicking:
```bash
python -m http.server 8000
# then open http://localhost:8000
```
The cloud-MySQL button needs Vercel's serverless runtime, so it only works once deployed.
