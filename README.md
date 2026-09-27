# Parts movement

A phone-friendly log for the inventory exit. A technician scans a QR code, chooses **Take part out** or **Put part back**, enters the part, confirms, and the row is appended to a private Google Sheet.

The website is React and Vite. Google Apps Script is the only API. The spreadsheet is the database. There is no separate server, no email, and no scheduled job. Each entry is saved on the website first. Open History, choose the days, and import those rows into Google Sheets when you want.

Practice mode is built in, so the screen can be tried with no Google account and no real company data. Those entries stay in the browser.

## What a technician does

1. Scan the QR code at the inventory exit. The phone opens this site.
2. Choose **Take part out** or **Put part back**.
3. Enter the FG number, or mark **No FG number**.
4. Enter description, part number, company, quantity, and technician. Work order is optional.
5. Review the entry and tap **Save transaction**.
6. Read the success screen, including the transaction ID. Tap **Record another transaction** for the next part.

The sheet stores the movement as `OUT` or `RETURN`. Quantity is stored as a positive whole number. The transaction ID, date, time, and timestamp are created by Apps Script, using the spreadsheet’s time zone.

Each save adds a new row. The script never overwrites or deletes earlier rows.

## Project files

```text
src/                  React app
apps-script/Code.gs   Web app that reads and appends the sheet
.env.example          Local settings template
```

## 1. Create the Google Sheet

1. Create a blank spreadsheet in the Google account that should own the log. A shared warehouse account is safer than one person’s private login. If that account goes away, the web app stops.
2. Name the file something generic, such as `Inventory movements`. Do not put a real customer or company list in a copy of this repo.
3. Choose **File → Settings** and set the time zone. Date, Time, and Timestamp are written in that zone.
4. Leave the sheet private. Do not press **Share**. Technicians never need access to the file.

You will create the `Transactions` tab from Apps Script in the next section. Do not rename those columns later.

The columns are:

| Column | What is stored |
| --- | --- |
| Transaction ID | Server id, such as `TXN-20260927-114801-a1b2c3d4` |
| Date | `yyyy-MM-dd` |
| Time | `HH:mm:ss` |
| Timestamp | `yyyy-MM-dd HH:mm:ss` in the spreadsheet time zone |
| Movement | `OUT` or `RETURN` |
| FG Number | Blank when the technician marks no FG number |
| Description | Required |
| Part Number | Required |
| Company | Required |
| Quantity | Positive whole number, 1 through 999999 |
| Technician | Required. This is typed text, not a Google account |
| Work Order | Optional |

Do not insert columns, and do not type notes below the table. New rows are appended after the last filled row.

## 2. Install the Apps Script

1. In the spreadsheet, choose **Extensions → Apps Script**.
2. Delete the sample `myFunction` code and paste the full contents of `apps-script/Code.gs`.
3. Open **Project Settings** and turn on **Show "appsscript.json" manifest file in editor**.
4. Replace the manifest with `apps-script/appsscript.json`. This limits the script to the current spreadsheet. If Google later refuses that scope, add `https://www.googleapis.com/auth/spreadsheets` as well, save, and authorize again.
5. Select `installSheet` in the function dropdown and press **Run**. Approve the spreadsheet permission. The log should say the Transactions sheet is ready.
6. If an empty `Sheet1` is still there and it has no data, delete that tab by hand. `installSheet` will not delete a tab that already has cells in it.
7. Run `installSheet` again later if you want. When the header row is already correct, it leaves existing transactions alone. If someone renamed a column, it stops and changes nothing.

`installSheet` writes the header row only when the Transactions tab is empty.

## 3. Create the two tokens

The script expects two secrets in **Project Settings → Script properties**. Do not paste them into `Code.gs`, the spreadsheet, or git.

Generate two different long random values. On a Mac:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Add these script properties:

| Property | Who knows it | Purpose |
| --- | --- | --- |
| `API_TOKEN` | The website build | Required to append a row |
| `ADMIN_TOKEN` | Supervisors only | Required to view history |

They must be different. Use at least 24 characters each.

Then select `checkSetup` and press **Run**. The log reports whether each property is set and whether the two values differ. It does not print the secrets.

## 4. Deploy the web app

Apps Script can keep the spreadsheet private and still accept requests from this website, but only with a specific deployment:

1. Choose **Deploy → New deployment**.
2. Click the gear and choose **Web app**.
3. Set **Execute as** to **Me** (the account that owns the sheet).
4. Set **Who has access** to **Anyone**.
5. Press **Deploy**, authorize if asked, and copy the **Web app URL**. It must end in `/exec`.

Use that `/exec` URL in the website. The `/dev` test URL only works for the signed-in editor and will fail on a phone.

After every edit to `Code.gs`, open **Deploy → Manage deployments**, edit the web app, choose **New version**, and deploy again. The URL stays the same. Saving the script without a new deployment does not update the live app.

**Anyone** does not share the spreadsheet. It means anyone who can call the URL can run the script as you. The tokens in the next section are what stop casual calls. Read [Security and access control](#security-and-access-control) before you post the QR code. If the access list has no **Anyone** option, a Google Workspace admin has blocked anonymous web apps. This React app cannot use the “signed-in users only” setting. See the security section.

Open the `/exec` URL once in a browser. You should see a short JSON note that the service is up. That page does not list transactions.

## 5. Run it on your computer

```bash
npm install
cp .env.example .env
npm run dev
```

`.env` is ignored by git. Leave the example values in place to use practice mode:

```text
VITE_USE_MOCK=true
```

Open the local address Vite prints. A yellow banner means entries stay in this browser. History in practice mode can be opened with **Continue in practice mode**; that button is not shown when practice mode is off. To try the layout on a phone, use the Network address on the same Wi-Fi. A QR code for that Network address works only while the dev server is running.

To send practice entries to the real sheet, edit `.env`:

```text
VITE_USE_MOCK=false
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
VITE_API_TOKEN=the API_TOKEN script property
```

Restart `npm run dev` after any `.env` change. Vite reads these values at startup. Do not put `ADMIN_TOKEN` in `.env`. History asks for it on the page.

Use obvious test values the first time, such as description `Test bracket`, part number `TEST-1`, company `Example Company`, and technician `Test User`. The app cannot delete that row. Delete the test row yourself in the sheet if you do not want to keep it.

Check the production build locally with:

```bash
npm run build
npm run preview
```

## 6. Put it on Vercel (optional)

The site is a static Vite build. Vercel is optional.

1. Import the project. Framework preset: **Vite**.
2. Add environment variables, then deploy:
   - `VITE_USE_MOCK` = `false`
   - `VITE_APPS_SCRIPT_URL` = the `/exec` URL
   - `VITE_API_TOKEN` = the same value as the `API_TOKEN` script property
3. Do not add `ADMIN_TOKEN`. It is not a build setting.
4. Changing those variables does nothing until you redeploy. They are copied into the JavaScript at build time.
5. Turn on the strongest access control your Vercel plan offers for the production URL (password or SSO). On the free Hobby plan, production URLs are often public and password protection may only cover preview deployments. If you cannot lock the production URL, host the `dist` folder somewhere only staff can open. A public page lets anyone submit movements. Details are in the security section.

`vercel.json` rewrites every path to `index.html` so `/history` survives a refresh, and it sends basic security headers.

## 7. Make the QR code

The code is only a link to the site. It does not contain a part number.

1. Finish deployment first, then open the exact HTTPS address on your phone and confirm the movement screen loads.
2. Put that address into any free QR generator. Do not encode the Apps Script `/exec` URL, a `/dev` URL, or `localhost`.
3. Print the code at least 5 cm (2 inches) square and post it at the inventory exit.
4. Scan it with an iPhone camera and an Android camera.
5. Save one test transaction and confirm a new row appeared at the bottom of `Transactions`.
6. If the site address changes, print a new code. Old codes will keep opening the old address.

## 8. Review, filter, and export to Excel

### On the phone or a laptop

Open **History**. The list is the log stored on that phone or computer. It uses the same fields as the Transactions sheet: date, time, movement (`OUT` or `RETURN`), FG number, description, part number, company, quantity, technician, and work order.

1. Set **From**, **To**, or both. Use the same date in both fields for one day.
2. Tap **Apply days**.
3. Tap **Import to Google Sheets**. Only rows still marked **On this device** are sent. Rows already imported are skipped, so importing the same day again does not add duplicates.
4. **Download Excel** saves the same filtered days as a `.csv` file that opens in Excel. That download does not require Google.

The Date and Time columns in the sheet are the time the part was recorded, not the time you pressed Import.

**Remove old entries** deletes rows from this device only. Copies already imported stay in the sheet. Paste the updated Apps Script and deploy a new version before the first real import. The script also keeps a hidden Receipts tab so a repeated import cannot write the same entry twice.

### In Google Sheets, the next day

1. Open the private spreadsheet.
2. For a quick look, choose **Data → Create a filter** and filter Date, Technician, Part Number, or Movement.
3. To keep a full Excel copy, choose **File → Download → Microsoft Excel (.xlsx)**. The download includes every row. Rows hidden by a filter are still in the file.
4. To copy only the visible rows into Excel, filter first, select the header and the rows still on screen, copy, and paste into a blank workbook.

There is no automatic workbook and no emailed report.

## Security and access control

The spreadsheet stays private. The script runs as the owner, so callers never receive a Google password, an API key from Google Cloud, or access to the file’s sharing dialog. Secrets are not written into `Code.gs`.

That is not the same as a private website. Google Apps Script cannot be locked to your Workspace domain and still answer `fetch()` from this React app.

| Web app access | Works from this site? | What it actually allows |
| --- | --- | --- |
| Anyone | Yes | Anyone on the internet can invoke the script if they have the URL |
| Anyone with a Google account, or only your domain | No | The browser is sent through a Google sign-in page. `fetch()` from Vercel or your laptop cannot complete that sign-in |
| Only myself | No | Only the owner, and not from the phone app |

An unlisted URL is not a login. The QR code is posted in the building, and URLs show up in browser history. **Anyone** plus a quiet URL is not the protection.

What this project does instead:

1. **Append token (`API_TOKEN`).** Every save must send it. The React app gets it from `VITE_API_TOKEN`. Vite places that value in the built JavaScript, so anyone who can open the website can read it and can submit a movement. That is acceptable for the exit station, where the people who can open the page are the people who should record parts. It does not protect a public URL.
2. **History token (`ADMIN_TOKEN`).** It is not part of the website build. A person types it on the History page, and it is kept only in that browser tab. The same value as `API_TOKEN` is rejected on purpose, so the token hidden in the website cannot be reused to read the log. Treat the admin token as a shared password. Give it only to people who should review entries. Press **Lock** on a shared phone.
3. **Keep the website itself limited** when the log is sensitive. People who cannot open the site cannot extract the append token. Prefer Vercel password or SSO protection if your plan includes it for production. If it does not, serve the built files on an internal network instead of a public Vercel URL. The QR code should point at that restricted address.
4. **Do not add analytics or other third-party scripts.** They would run on the page where a supervisor types the admin token.
5. **Rotate a leaked token** by editing the script property. The old value stops working on the next request. After changing `API_TOKEN`, update the site environment and redeploy. After changing `ADMIN_TOKEN`, tell supervisors the new value. No site rebuild is required for the admin token.

There are no per-person Google accounts in this app. The technician name is whatever is typed. A double tap is collapsed for about six hours: the browser sends an idempotency key, and Apps Script returns the original transaction instead of adding a second row. Two intentional entries of the same part still create two rows. After six hours, a retry of an old unsaved screen could add another row. That window is the practical duplicate protection Apps Script’s cache allows without a second sheet.

If you need each technician to sign in with a company Google account, this split between a static site and an anonymous Apps Script web app cannot do it. You would need a different host for the form. That is outside this project.

## Field rules

The phone checks these before review. Apps Script checks them again before appending.

- FG number is optional only when **No FG number** is checked. Otherwise it is required.
- Description, part number, company, and technician are required.
- Quantity must be a whole number from 1 to 999999. Zero, decimals, and negative numbers are rejected.
- Work order is optional.
- The save button locks while the request is in flight.
- A lost response can be retried from the review screen. The same entry is not written twice during the six-hour window.
- Success and failure both stay on screen in plain language.
- Inputs use 16px type so iPhone does not zoom the page, and the buttons are large enough for a thumb.
- **Remember this name on this phone** is off unless someone turns it on. Leave it off on a shared station.

Values that start with `=`, `+`, `-`, or `@` are stored as text so a part number cannot become a spreadsheet formula.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Setup still needed | Set the `.env` values, or turn practice mode on. Restart `npm run dev`. |
| Could not reach Google | Check the phone’s connection. Confirm the URL ends in `/exec` and access is **Anyone**. |
| Google refused the request | You deployed as signed-in users, or you used the `/dev` URL. Create a web app deployment with access **Anyone**. |
| Request was not authorized | The website token and `API_TOKEN` differ, or the history token and `ADMIN_TOKEN` differ. Restart or redeploy after changing the website token. |
| API_TOKEN and ADMIN_TOKEN must be different | Generate two values and update the script properties. |
| Header row does not match | Put the original column names back. The script will not rewrite existing rows. |
| Transactions sheet is missing | Run `installSheet` from the script editor. |
| Already saved | The row is already there. Use the transaction ID on the success screen to find it. |
| History looks incomplete | Set a From or To date. Without one, only the latest 400 rows are searched. |
| Script edits seem ignored | Deploy a new web app version. |
| Workspace has no **Anyone** choice | An admin blocked anonymous Apps Script. This site cannot call a sign-in-only web app. |

## What this app does not do

It does not send email, build Excel files on a schedule, or calculate how many parts remain. Download Excel from History when you want a file. Delete old rows only with the button on that page.
