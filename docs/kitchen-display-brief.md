# Kitchen display brief (phase 2 reference)

> This was the original Skylight web-dashboard brief for this repo. The iPhone app (phase 1) replaced it.
> It's kept here as input for the phase 2 kitchen display. That display reads the same Supabase database as the phone app.


Project Brief: Family Dashboard Web App
Goal: Create a 1024x768 (iPad Landscape) optimized web dashboard.

1. External API Requirements:

Calendar: Integrate Google Calendar API. Use FullCalendar.js for the frontend. Must support multiple sub-calendars (e.g., "Family," "Work," "School") toggled by color.

Weather: Use OpenWeatherMap One Call API. Display current temp, high/low, and a 3-day forecast icon.

Auth: Implement Google OAuth 2.0 so the user can log in once and stay authenticated.

2. Database Schema (Supabase/Firebase): Agents should set up two tables with the following columns:

Table: groceries * id (uuid), item_name (text), category (text), is_bought (boolean), created_at (timestamp).

Table: chores * id (uuid), task_name (text), assigned_to (text), is_complete (boolean), due_date (date).

3. UX/UI Specifications:

Layout: Fixed-height (100vh) dashboard. No scrolling on the main page.

Theme: "Skylight Minimalist" (Dark Mode). Background: #000000, Cards: #1A1A1A, Text: #FFFFFF.

Mobile Sync: Ensure the app is a Progressive Web App (PWA) so it can be "Added to Home Screen" on iOS to hide the Safari URL bar.

4. The "Kiosk" Logic:

Implement an auto-refresh every 30 minutes for the weather and calendar.

Ensure the "Add Item" buttons open large, touch-friendly modals (minimum 44x44px hit area for iPad fingers).

---

## PWA / iOS kiosk notes

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
