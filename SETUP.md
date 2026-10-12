# Lab Reservation Website — Setup Guide
**American University of Kuwait**

This guide takes you from zero to a live website in about 30 minutes.
No coding required — just copy, paste, and click.

---

## What you need
- A computer with a web browser
- An email address (for creating free accounts)
- The website files (this folder)

---

## Step 1 — Create your Supabase project (10 min)

Supabase is your free database and authentication provider.

1. Go to **https://supabase.com** and click **Start your project**
2. Sign up with your email
3. Click **New project**
   - Organization: create one if prompted (your name is fine)
   - Name: `lab-reservation`
   - Database password: choose a strong password and **save it somewhere**
   - Region: choose the closest (e.g. Middle East if available, otherwise EU West)
4. Wait ~2 minutes for the project to be ready

### Get your credentials
5. In your project, go to **Settings → API**
6. Copy two values — you'll need them in Step 3:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** — a long string starting with `eyJ...`

### Set up the database tables
7. In your project, go to **SQL Editor** (left sidebar)
8. Click **New query**
9. Open the file `supabase-schema.sql` from this folder in any text editor
10. Select all the text, copy it, paste it into the SQL Editor
11. Click **Run** (green button)
12. You should see "Success. No rows returned" — that means it worked

### Configure email auth
13. Go to **Authentication → Providers** in your Supabase dashboard
14. Make sure **Email** is enabled (it is by default)
15. Go to **Authentication → URL Configuration**
16. Set **Site URL** to your Vercel URL (you'll get this in Step 2 — come back to this)
17. Add the same URL to **Redirect URLs**

### Restrict sign-ups to @au.edu.kw only
18. Go to **Authentication → Settings**
19. Under "Restrict sign-ups", add `au.edu.kw` to the allowed email domains
    *(If this option isn't visible, you can enforce it via the app — it already checks the domain)*

---

## Step 2 — Deploy to Vercel (10 min)

Vercel hosts your website for free.

1. Go to **https://github.com** and create a free account if you don't have one
2. Click the **+** button → **New repository**
   - Name: `lab-reservation`
   - Keep it **Public** (required for Vercel free tier) or Private if you have GitHub Pro
   - Click **Create repository**
3. On the next page, click **uploading an existing file**
4. Drag and drop **all the files and folders** from this project folder:
   - `index.html`
   - `css/` folder
   - `js/` folder  
   *(Do NOT upload `SETUP.md` or `supabase-schema.sql` — those are for your reference only)*
5. Click **Commit changes**

### Deploy on Vercel
6. Go to **https://vercel.com** and sign up with your GitHub account
7. Click **Add New → Project**
8. Find and select your `lab-reservation` repository
9. Click **Deploy** (no configuration needed — leave everything as default)
10. Wait ~1 minute. Vercel will give you a URL like `lab-reservation-xxx.vercel.app`
11. **Copy this URL** — go back to Supabase (Step 1, point 16) and paste it as the Site URL

### Custom domain (optional but recommended)
If you want a nicer URL like `labs.au.edu.kw`:
- In Vercel, go to your project → **Settings → Domains**
- Add your domain and follow the DNS instructions
- This requires access to your domain's DNS settings — ask IT if needed

---

## Step 3 — Configure the app (5 min)

1. Open the file `js/config.js` in any text editor (Notepad, TextEdit, etc.)
2. Fill in your values:

```javascript
SUPABASE_URL: 'https://xxxxxxxxxxxx.supabase.co',   // from Step 1
SUPABASE_ANON_KEY: 'eyJhbGci...',                   // from Step 1

ADMIN_EMAILS: [
  'youremail@au.edu.kw',    // your email — you'll see the Admin panel
  // add more admin emails if needed
],
```

3. Save the file
4. Go back to GitHub → your repository → find `js/config.js`
5. Click the pencil icon (Edit) → paste your updated content → **Commit changes**
6. Vercel automatically redeploys (takes about 1 minute)

---

## Step 4 — Test it (5 min)

1. Open your Vercel URL in a browser
2. Enter your admin email (`youremail@au.edu.kw`) → click **Send sign-in link**
3. Check your email → click the link
4. You should land on the app and see the **Admin** button in the header
5. Go to **Admin → Staff** → add a lab engineer with working hours
6. Go to **Admin → Classes** → add a class block
7. Go to **Book** → check that the schedule reflects your settings
8. Open an incognito window, sign in with a student email, and test a reservation request
9. Back in your admin window, go to **Admin → Approvals** → approve the test request
10. In the student window, check the **Updates** tab — the approval should appear

---

## Step 5 — Generate QR codes

For each lab entrance, generate a QR code pointing to your website URL.
Free QR code generators: **qr-code-generator.com** or **qrcode-monkey.com**

You can use the same URL for both labs (students select the lab inside the app),
or add `?lab=a` and `?lab=b` to the URL for direct lab links.

---

## Every new semester

1. Sign into the website with your admin email
2. Go to **Admin → Semester** → update the name and dates
3. Go to **Admin → Staff** → update working hours if changed
4. Go to **Admin → Classes** → delete old class blocks, add new ones
5. Done — changes are live immediately for all students

---

## Troubleshooting

**"Could not send email"** → Check that your Supabase project is active and the Site URL is set correctly.

**Admin panel not showing** → Make sure your email is listed in `ADMIN_EMAILS` in `config.js`.

**Slots showing "No staff"** → Add at least one staff member in Admin → Staff.

**Magic link not arriving** → Check spam folder. Supabase free tier has a limit of 3 emails/hour — for testing, use the Supabase dashboard to confirm users manually (Authentication → Users).

**Realtime not updating** → Make sure you ran the full SQL schema including the `alter publication` lines at the bottom.

---

## Security notes

- Only `@au.edu.kw` email addresses can sign in
- Admin features are restricted to emails listed in `config.js`
- For production, also update the admin email list in `supabase-schema.sql` policies
- The Supabase anon key is safe to expose in frontend code — it only allows what the Row Level Security policies permit
- Never share your Supabase database password

---

*Built for the American University of Kuwait — Research Labs*
