# Changes — October 2, 2026 session

A summary of every change made to RESERVATA during this session, grouped by area. Unless noted, everything is in `frontend/`.

## Running the project

- **Dependencies:** `npm install` in the root only installs root packages. Run `npm install` inside both `frontend/` and `backend/`, then `npm run dev` from the root.
- **Network access (LAN):** other devices on the same network can now sign in.
  - `dev-server.js` and `frontend/package.json` start Vite on `0.0.0.0` instead of `127.0.0.1`.
  - `frontend/vite.config.mjs` serves over HTTPS with `@vitejs/plugin-basic-ssl` (the login's `crypto.subtle` only works on HTTPS or localhost).
  - The `/api` and `/mock-sso` proxies keep the browser's `Host` header (`changeOrigin: false`).
  - `backend/server.js` (mock SSO redirect check, around line 695) accepts redirects back to the same host that served the request, plus the localhost origins over http and https. Other origins are still rejected.
  - Open `https://127.0.0.1:5178/` locally or `https://<PC-IP>:5178/` from another device, and accept the self-signed certificate warning once.

## Users & Roles (`views/admin/AdminViews.jsx`)

### Add account form
- **Super Admin** and **OSG Admin** roles lock the Office dropdown to `All Offices` / `OSG` (shown but disabled).
- **Office Admin** office list excludes *Facilities Management*, *Faculty of Arts and Letters* and *All Offices* (the backend rejects *All Offices* for Office Admins).
- Switching to Office Admin from Requester no longer keeps a typed department as the office.

### Directory redesign
- "Who can do what" header with clickable **role cards** (All users, Super Admin, Office Admin, Requester, OSG Admin) that filter the list.
- Toolbar: search, **All offices**, **All statuses**, sort and **Export CSV** (exports the filtered rows). The **All roles** dropdown was removed because the cards replace it.
- Table rows have initials avatars; your own account shows a yellow avatar and a **Protected** tag, and its dropdowns are locked.
- Status dropdown is green for Active and red for Inactive. Admin roles show "Not applicable" for affiliation.
- Footer shows "Showing X of Y users" and an active-role label with **Clear**.

## Offices (`views/admin/AdminViews.jsx`, `store/admin.js`, `store/shared.js`)

### Office directory
- Tabs: **Office directory**, **Active**, **Archived** (with counts) and **+ Add office**; **Edit office** appears as its own tab while editing.
- "Every office, at a glance" header with Offices / Resources / Admin accounts stat cards.
- Searchable office list: building icon, Active/Archived tag, a **No admin assigned** tag, resource and admin counts, and **View coverage**, edit and archive buttons. Archived offices show no archive button.
- Archived offices (status `Inactive`) are labelled "Archived". Empty lists show "No offices found".

### Office coverage page
- **View coverage** opens a per-office page: back link, header with **Edit office**, four stat cards (Resources, Admin accounts, Reservations, Payments to verify).
- Tabs: **Overview** (Needs attention + Recent activity), **Resources**, **Admin accounts**, **Calendar** (upcoming bookings by date), **Reservations**, **Payments**, **Activity**.
- Activity is matched to an office by its reservations, its name, its resource names or its admins, since activity records do not store an office.

### Add office page
- "Set up a new office" form with a live **How it will look** preview:
  - **Basic information:** name, short code (suggested from the name's initials, e.g. *Office of Student Affairs* → `OSA`), status.
  - **Contact and location:** contact email (required), phone, location, office hours (default 08:00–17:00), description.
  - **Administrators:** add UST emails; each gets an Office Admin account when the office is created, and temporary passwords are shown afterwards. Emails that already have an account are refused.
  - **Booking and payments:** default approval workflow and whether the office collects payments.
- `saveOffice` stores the new fields and validates them: unique office name, unique 2–8 character code, valid contact email, opening time before closing time. The quick edit form (name and status only) keeps the other fields.
- **Asset tags** use the office's short code when it has one (`OSA-VEH-001`). Offices without a code keep the previous prefix rule, so existing tags do not change.
- **New resources** start with their office's hours, default workflow and payment setting.
- ⚠️ The AWS handler (`backend/aws/backend/src/handlers/admin.mjs`) only saves the office name on create, so the new fields are not stored in the AWS deployment yet.

## Approval Workflows (`views/settings/SettingsViews.jsx`)

### Workflows tab
- Rebuilt to the "Who approves a reservation?" design: collapsible guide, tiered editor (one card per tier, **Add a step to Tier N**, dashed **Add Tier N**), live **Route preview** and a **New here?** tip.
- New steps start blank and must have a name and office before saving. Removing the last step of a tier renumbers the tiers.
- Configured workflows table with step counts and **Edit** buttons.

### Payment instructions tab (renamed from "Payment settings")
- "How requesters pay" layout: payment window with **Hours / Days / Weeks** (still stored as hours, max 168), instructions, and next-step cards with move up/down/delete.
- **Placeholders** panel inserts `{fee}`, `{office}`, `{window}` or `{reservationId}` into the focused step field.
- **What requesters see** preview uses the same token replacement as the requester pop-up. `{window}` stays the number of hours.

## Resource Management (`views/settings/OfficeSettingsView.jsx`, `store/resources.js`, `config.js`)

- **Super Admins** get **Resource Management** in the sidebar, with an **All resources** table (with an Office column) and an **Owning office** field when adding a resource.
- Fixed: Super Admin resources were saved with no office. `saveResource` now requires an active owning office for Super Admins.
- Super Admins can block and unblock dates.
- Removed the per-resource **custom approval tiers** builder; resources only choose a saved workflow.
- **Availability calendar:**
  - Removed the "Unavailable" legend and its tint; legend is centered.
  - Available days are plain white; hover and the selected day are green; blocked days are a stronger red; maintenance stays blue (scoped to this calendar only).
  - Available / Block / Maintenance buttons use their legend colors on hover and when selected, with a short lift animation (disabled for reduced motion).
  - The date panel has a **Hide** link.

## Super Admin dashboard (`views/dashboard/DashboardViews.jsx`)

- Uses the Office Admin dashboard layout with system-wide data:
  - Banner for requests waiting across offices and offices with pending approvals but no active Office Admin.
  - In Review / Starting Today / In Use Now / Expired numbers.
  - **Office overview** table, **Recent requests** across offices, Request status, Resource availability and Recent activity.

## Styles

- New style groups in `styles/base.css`: `wf-` (workflow and shared cards), `pay-` (payment instructions), `ur-` (users), `om-` (offices and coverage), `ao-` (add office), `day-choice` (calendar buttons).
- Calendar color overrides at the end of `styles/portal.css`.

## Tests

- `frontend/test/paper-alignment.test.js`:
  - The Super Admin resource test now checks the owning office is saved and that a resource without one is rejected.
  - New test for saving an office profile, rejecting duplicate codes, names and invalid hours, keeping the profile after a quick edit, and using the short code in asset tags.
- `npm test` in `frontend/`: 38 passing.
- `npm test` in `backend/`: 15 of 17 tests fail. They failed the same way before these changes, because the test logins are rejected (the passwords in `backend/data/accounts.json` no longer match the tests).
