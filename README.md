# skylight

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
