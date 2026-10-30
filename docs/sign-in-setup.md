# Sign-in setup for arcade.vrg.li

Four OAuth clients, one per provider. Every provider uses the same two values:

- **Site / origin:** `https://arcade.vrg.li`
- **Callback (redirect) URL:** `https://arcade.vrg.li/auth/<provider>/callback`, i.e.
  `https://arcade.vrg.li/auth/google/callback`, `.../auth/github/callback`, `.../auth/discord/callback`, `.../auth/apple/callback`

Do each provider independently; the site switches a button on as soon as that provider's values are in place. Step labels in quotes were checked against the provider's own documentation; where a label could not be verified it says "look for".

---

## Google

Source: support.google.com/cloud/answer/6158849, developers.google.com/identity/openid-connect/openid-connect.

1. Open https://console.cloud.google.com/auth/clients and sign in. Create a project if asked (any name, e.g. `vrg-arcade`).
2. If the page asks you to configure Google Auth first (the consent screen), do it: look for "Branding" — enter app name `VRG Arcade`, a support e-mail, and `vrg.li` under authorized domains; look for "Audience" and choose **External**. Save.
3. Back on the Clients page click **"CREATE CLIENT"**.
4. Application type: **Web application**. Name: `arcade.vrg.li`.
5. Under **"Authorized JavaScript origins"** add `https://arcade.vrg.li`.
6. Under **"Authorized redirect URIs"** add `https://arcade.vrg.li/auth/google/callback` (exact match, no trailing slash).
7. Click **"CREATE"**. The client secret is shown only once at this point — copy both values now.
8. If the audience is External and the app is in "Testing", only listed test users can sign in. Look for a **Publish app** / "Publishing status" control under Audience and publish it; the `openid email profile` scopes need no verification review.

Hand back: `GOOGLE_CLIENT_ID` (ends in `.apps.googleusercontent.com`), `GOOGLE_CLIENT_SECRET`.

---

## GitHub

Source: docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app. Do this signed in as the `vrgli` account.

1. Go to https://github.com/settings/developers (profile picture → **"Settings"** → **"Developer settings"** → **"OAuth apps"**).
2. Click **"New OAuth App"** (reads **"Register a new application"** the first time).
3. **"Application name"**: `VRG Arcade`.
4. **"Homepage URL"**: `https://arcade.vrg.li`.
5. **"Authorization callback URL"**: `https://arcade.vrg.li/auth/github/callback`.
6. Leave "Enable Device Flow" off and "Expire user access tokens" as it is.
7. Click **"Register application"**.
8. On the app's page copy the **Client ID**, then look for a **"Generate a new client secret"** button; copy the secret immediately — it is shown once.

Hand back: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

---

## Discord

Source: docs.discord.com/developers/topics/oauth2, docs.discord.com/developers/quick-start/getting-started.

1. Go to https://discord.com/developers/applications and click the create button (look for **"New Application"**). Name: `VRG Arcade`, press **"Create"**.
2. You land on **"General Information"**. Optionally add the icon and description players will see on the consent screen.
3. In the left menu open **OAuth2**.
4. Copy the **Client ID** (the same value as the Application ID).
5. Look for **"Client Secret"** and press **"Reset Secret"** to generate one; copy it immediately.
6. Under **Redirects** click **"Add Redirect"** and enter `https://arcade.vrg.li/auth/discord/callback`. Save changes.
7. No bot, no gateway intents, no scopes beyond `identify` need enabling; the site requests `identify` at sign-in time.

Hand back: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`.

---

## Apple

Sources: developer.apple.com/help/account (Register an App ID; Register a Services ID; Configure Sign in with Apple for the web; Create a private key; Get a key identifier; Account landing page).

Requirements: a paid **Apple Developer Program** membership (about US$99/year) with the Account Holder or Admin role. A free registration does not show Certificates, Identifiers & Profiles. Four things come out of this: a Team ID, a Services ID, a Key ID and a `.p8` file.

### A. Team ID

1. Open https://developer.apple.com/account.
2. Look for **"Membership details"**; the 10-character **Team ID** is listed there.

### B. App ID (Apple requires a primary app even for a website)

1. In **Certificates, Identifiers & Profiles** click **Identifiers**, then the add button (+).
2. Select **App IDs**, click **Continue**; confirm type **App**, click **Continue**.
3. **Description**: `VRG Arcade`. Select **Explicit App ID** and enter Bundle ID `li.vrg.arcade`.
4. Under **Capabilities** tick **Sign in with Apple**.
5. Click **Continue**, then **Register**.

### C. Services ID (this is the client id)

1. **Identifiers** → add button (+) → select **Services IDs** → **Continue**.
2. **Description**: `arcade.vrg.li`. **Identifier**: `li.vrg.arcade.web`. Click **Continue**, then **Register**.
3. Select the new Services ID from the list. Tick **Sign in with Apple**, click **Configure**.
4. In the modal pick the primary App ID from step B.
5. Under **Website URLs** enter domain `arcade.vrg.li` and return URL `https://arcade.vrg.li/auth/apple/callback` (comma-separated if the form takes one field; otherwise look for separate "Domains and Subdomains" and "Return URLs" boxes). No verification file upload is needed.
6. Click **Done**, **Continue**, then **Save**.

### D. Private key (.p8) and Key ID

1. **Keys** → add button (+).
2. **Key Name**: `arcade sign in`. Tick **Sign in with Apple**, click **Configure**, choose the primary App ID from step B, save, then **Continue**.
3. Review and click **Confirm** (or **Register**).
4. Click **Download**. The file is `AuthKey_<KEYID>.p8`. It can be downloaded only once; Apple does not keep a copy.
5. Click **Done**. Select the key in the list: the **Key ID** (10 characters) appears below the key name.

Hand back: `APPLE_CLIENT_ID` = the Services ID identifier (`li.vrg.arcade.web`), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` = the full contents of the `.p8` file (BEGIN/END lines included).

---

## Handing the values over

1. In your password manager create one item named exactly **`arcade.vrg.li sign-in`** (type Login is fine; leave username/password empty).
2. Add one custom field per value, of type **Hidden**, named exactly like the env vars:
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.
3. For `APPLE_PRIVATE_KEY` paste the whole `.p8` text into the field (multi-line is fine), or attach the `.p8` file to the item as well.
4. Save. Fill in whichever providers are ready; missing ones simply stay switched off on the site.
