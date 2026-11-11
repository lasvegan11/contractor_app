# PROJECT_NAME

A phone app for contractors: **talk or type your material list on the job site, then send it as a text in one tap.**

Three screens: Login (phone + text code) → Jobs → Job materials. It's an installable PWA ("Add to Home Screen"), with no app store. English/Español.

## Try it right now (demo mode)

```bash
npm install
npm run dev
```

With no Supabase keys in `.env.local`, the app runs in **demo mode**: any phone number and any 6-digit code log you in, lists stay in the browser, and "Add to list" uses the built-in simple splitter instead of Claude.

## Connect the real backend

### 1. Supabase project

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push                      # creates profiles / jobs / materials + RLS
```

### 2. Phone login (SMS)

Phone login is set up from `supabase/config.toml`:

```bash
SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=placeholder supabase config push
```

That turns on phone login with one **test number**: `702-555-0100` with code `123456`. No SMS is sent for it, so it works before you have an SMS provider. The Twilio values in the config are placeholders, so **real numbers won't get a code yet**. Email/password sign-up is switched off on purpose (the app is phone-only).

`config push` applies its changes straight away without asking, so read the diff it prints.

**Real texts are not set up yet.** The plan is **Telnyx**, once its 10DLC registration is approved. Telnyx is not one of Supabase's built-in SMS providers (those are Twilio, Twilio Verify, MessageBird, Textlocal and Vonage), so it can't just be pasted into the dashboard. It goes through Supabase's **Send SMS hook**: a small edge function that Supabase calls with the phone number and code, and that sends the text through the Telnyx API. That function still has to be written. It will need a Telnyx API key (set as a Supabase secret) and the approved sending number.

Until then the Twilio values in `supabase/config.toml` stay as placeholders; they only exist so phone login is switched on for the test number.

### 3. Claude parsing (edge function)

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy parse-materials
```

Only a logged-in app user can call the function; the public app key on its own gets a 401 (so strangers can't spend your Claude credit). The function uses `claude-opus-5-5` at low effort, with server-side refusal fallback turned on. It gives Claude **5 seconds**; if Claude is slow, errors, or declines, it splits the text with plain rules instead, so the user is never blocked. Measured on 2026-11-10 from the deployed function: about 2.5s for a typical list, 3–3.6s for a 12-item list, 4.5s on the first call after it has been idle; 13 of 13 calls came back from Claude. If the function logs show `using fallback` often, switch to a faster model:

```bash
supabase secrets set CLAUDE_MODEL=claude-haiku-5-5
```

### 4. App keys

```bash
cp .env.example .env.local
# then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Supabase → Project Settings → API)
npm run dev
```

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel (framework preset: Vite), or run `npx vercel`.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Project → Settings → Environment Variables.
3. Deploy. `vercel.json` already handles SPA routing and stops the service worker from being cached.

On the phone: open the site → Share → **Add to Home Screen** (iPhone), or menu → **Install app** (Android).

## How it works

| Piece | Where |
|---|---|
| Screens | `src/screens/Login.tsx`, `Jobs.tsx`, `Materials.tsx` |
| Auth, profile, language | `src/AppContext.tsx` |
| Offline-first data + sync | `src/lib/data.ts` |
| Talk-to-text (Web Speech API, `en-US` / `es-US`) | `src/lib/useSpeech.ts` |
| Sent message format | `src/lib/format.ts` |
| EN / ES strings | `src/lib/i18n.ts` |
| Claude parsing | `supabase/functions/parse-materials/index.ts` |
| Simple splitter (server fallback **and** offline) | `supabase/functions/_shared/fallback.ts` |
| Schema + RLS | `supabase/migrations/` |

**Offline / bad signal.** Every change is saved on the phone first and queued. The queue syncs when signal comes back (on reconnect, on app focus, and every 30s). IDs are made on the phone, so items added offline keep their identity. The unsent text in the box is saved too. If there's no signal when you tap "Add to list", the simple splitter runs on the phone.

**Picked up.** Checking an item off moves it to a "Picked up" section and fills the progress bar on the job and its card. When only some items are checked, the Send sheet asks whether to send what's still needed (the default) or everything. "Clear" on the Picked up section removes those items after a supply run (with Undo).

**Editing an item.** Tap an item to change it: − / + for the quantity and one-tap chips for common units (the list is `units` in `src/lib/i18n.ts`, one per language).

**Install hint.** The Jobs screen shows a one-time "Put this on your home screen" card: an Install button on Android/Chrome, the Share steps on iPhone. It hides once the app is installed or dismissed (`src/lib/install.ts`).

**Jobs.** Tap the job name or ⋯ on the materials screen to rename a job, change its address, or delete it. Deleting asks first and removes the job's items too.

**No mic?** If the browser has no speech recognition (some iPhones, especially as an installed app), the mic button hides and the app says "Tap the mic on your keyboard to talk." Keyboard dictation works everywhere.

## Renaming

`PROJECT_NAME` is a placeholder. Find-and-replace it across the repo (`index.html`, `vite.config.ts`, `src/lib/i18n.ts`, `README.md`, the migration comment). Replace `public/favicon.svg` with a new logo and run `npm run icons` to regenerate the PNG icons.

## Before showing it to pros (build step 8)

Test on a real iPhone and a real Android, outdoors:

- [ ] Install to home screen, open from the icon
- [ ] Log in with a real number (real SMS arrives, code autofills on iPhone)
- [ ] Talk a list in English, then in Spanish, then mixed
- [ ] Airplane mode: add items, check some off, then reconnect and confirm they sync (log in on another device to check)
- [ ] Send → Text message opens Messages with the list filled in, on both phones
- [ ] Readable in direct sun, usable with one thumb and gloves on
