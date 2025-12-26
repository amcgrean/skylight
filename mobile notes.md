Here is the **Web App Manifest** and the final **iOS-specific meta tags**.

These are the "secret sauce" files. Without these, your app will just look like a website in Safari. With them, it becomes a full-screen kiosk app that hides the address bar and stays in the iPad's memory.

### 1. The Manifest (`public/manifest.json`)

Tell your agents to include this in the `public` folder. It tells the iPad that this is a "Standalone" app.

```json
{
  "short_name": "FamilyHub",
  "name": "Family Calendar Dashboard",
  "icons": [
    {
      "src": "icon-192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "icon-512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#000000"
}

```

### 2. The iOS "Magic" Tags

These must be placed in the `<head>` of your `index.html` (or `_document.js` in Next.js). These specifically target the iPad's behavior.

```html
<meta name="apple-mobile-web-app-capable" content="yes">

<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

<meta name="apple-mobile-web-app-title" content="Family Hub">

<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">

```

---

### Final Checklist for your Agents

To ensure you get exactly what you want, send them this final "Definition of Done":

1. **Google OAuth:** Can I log in and see *my* specific calendar?
2. **Real-time Lists:** If I add a grocery item on my phone, does it show up on the iPad without refreshing?
3. **Landscape Lock:** Is the UI optimized for a horizontal iPad screen?
4. **No Scrollbars:** Does the whole app fit on one screen? (Important for a "Skylight" feel).

### What you need to provide them:

* **Google Cloud Console Credentials:** (Client ID and API Key).
* **OpenWeatherMap API Key:** (Usually free for small personal use).
* **Supabase/Firebase URL:** (If they aren't setting up the account for you).

**Would you like me to draft a quick "How-To" guide for you to follow once they give you the finished link so you can get it onto your iPad properly?**
