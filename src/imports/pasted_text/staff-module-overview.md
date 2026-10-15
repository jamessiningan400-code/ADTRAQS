============================================
STAFF MODULE
============================================

1. Login Screen
- Gingoog City seal logo, "SMART DOCS" title + subtitle (per branding above)
- Username/email field, password field, "Login" button, "Forgot password" link
- "Sign Up" link/tab (for new staff account creation, pending admin approval)

2. Sign Up Screen
- Fields: Full Name, Email, Username, Password, Confirm Password, Role 
  (defaults to "Staff" — Admin accounts are created only via User Management, 
  not self-registration)
- "Create Account" button
- Note/banner: "Your account will be reviewed and activated by an administrator."
- Link back to Login

3. Dashboard
Top bar: seal icon + "SMART DOCS" wordmark (left), search bar, notifications, 
profile icon, logout (right).
Sidebar: Dashboard, Document Tracker, Signature Monitoring, Reports, Archive.

Row 1 — three cards:
- Card A: "Signature Status Breakdown (Today)" — donut chart, center label = 
  total documents. Segments only: Completed (purple), For Signature (blue), 
  Overdue (red). No "Pending" category — documents are expected to complete 
  same day, so anything not completed by end of day is flagged Overdue instead.
- Card B: "Documents by Signatory (Today)" — horizontal bar chart per 
  signatory (CA, SB, CM, and other assigned signatories), purple bars, count 
  labeled at bar end.
- Card C: "Documents by Type (Today)" — vertical bar chart by Type (DV, DC, DF), 
  purple bars, count labeled above each bar.

Row 2 — two tables:
- Table A: "Documents For Signature (Today)" — Control No., Type, Office, 
  Signature (assigned signatory), Date Forwarded, Status (blue "For Signature" 
  or red "Overdue" badge). "View All" button top right, pagination footer.
- Table B: "Recently Completed (Today)" — Control No., Type, Office, Signed 
  By, Date Forwarded, Turnaround Time. "View All" button, pagination footer.

4. Document Tracker (main working screen)
- Top bar with "+ Add New Document" button (opens Document Entry modal, see 
  below)
- Filter panel: Office, Type, Status, Date range
- Search bar
- Table columns: Control No., Date, Type, Office, Payroll/Voucher, 
  Particular/Details, Fund, Amount, Signature, Date Forwarded, Status
- Row actions: Edit (pencil icon), Archive (box icon)
- New documents appear at the top of this list immediately after being saved

5. Document Entry Modal (triggered by "+ Add New Document" — NOT a separate 
   page)
Pop-up/modal form with fields:
- Control Number — auto-generated, read-only, sequential starting at 0000001
- Date — auto-filled with current system date, read-only
- Type — dropdown: DV, DC, DF
- Office — dropdown: CHO, CMO, PNP, CTO, CEO, RTC, CSWD
- Payroll and Voucher — dropdown: MORESCO II, INNOVE COMMUNICATION INC., 
  STEPH PC SOLUTION, RAM SHURAB S. LANDIZA, DENNIS GAMOLO DELO SANTOS, 
  GINGOOG SHELL FUEL STATION, CITI GAS STATION, PFS CORPORATION, MYBEST 
  GENERAL MERCHANDISE
- Particular/Details — dropdown: Payment Power Bill, Payment Internet Bill, 
  Travelling Expenses, Honorarium, Gasoline, Office Supplies, Meals and Snacks
- Fund — dropdown (fund source list)
- Amount — numeric field
- Signature — dropdown (assigned signatory, auto-suggested but editable)
- Date Forwarded — auto-filled with current date/time when saved, read-only, 
  labeled "Date Forwarded (to Signatory)"
- "Save" and "Cancel" buttons at modal bottom
- On Save: modal closes, document appears at top of Document Tracker table

6. Edit Entry Modal (triggered by Edit action on a Document Tracker row)
Same fields as Document Entry, plus these additional fields that unlock once 
editing an existing record:
- Cheque No. — text field
- Date Forwarded (Returned) — labeled "Date Forwarded (Returned from 
  Signatory)", date/time picker
- Type — secondary classification field (sub-type, editable)
- P.R. Number — text field
- "Save Changes" and "Cancel" buttons

7. Signature Monitoring Screen
- Board/table view grouped by signatory (CA, SB, CM, etc.)
- Each signatory section lists their documents currently awaiting signature 
  today, with a simple status badge (blue "For Signature" / red "Overdue")
- No status timeline/stepper component — keep this screen to a flat list view 
  only (timeline view is a possible future enhancement, not in this version)
- Small summary bar chart at top (same style as Dashboard Card B)

8. Reports Screen
- Filters: date range, office, type
- Report preview table
- Charts: Signature Status Breakdown (donut, same categories as dashboard — 
  Completed/For Signature/Overdue) and Documents by Type (bar chart)
- No separate "Overdue" trend graph — overdue is only shown as a status 
  category within the existing charts, not its own dedicated chart
- Export button (PDF/Excel placeholder)

9. Archive Screen
- Searchable, read-only table of archived documents
- Read-only detail view on row click

============================================
ADMIN MODULE
============================================

Sidebar (Admin): Dashboard, Document Tracker (View Only), Signature 
Monitoring, Reports, Archive, User Management, Settings, Profile
(No "+ Add New Document" button anywhere in the Admin module, and no Edit/ 
Archive action icons in the Admin's Document Tracker view — rows are 
click-to-view only.)

1. Dashboard — same layout/charts as Staff Dashboard (view only)

2. Document Tracker (View Only)
- Same columns as Staff version, filters and search included
- No Edit or Archive icons on rows — clicking a row opens a read-only detail 
  panel
- Small "View Only" label/badge near the table title to make the restriction 
  visually clear

3. Signature Monitoring — same as Staff version (view only, no edit actions)

4. Reports — same as Staff version (no Overdue graph, view/export only)

5. Archive — same as Staff version

6. User Management (Admin-exclusive screen)
- Table: Name, Email, Role (Staff/Admin), Status (Active/Pending/Inactive), 
  Last Login
- "+ Add New User" button — modal form: Full Name, Email, Role, Temporary 
  Password
- Row actions: Activate/Deactivate, Edit Role, Remove
- Pending sign-ups (from Staff Sign Up screen) appear here awaiting approval

7. Settings (Admin-exclusive screen)
- System-level settings: Office list management, Fund list management, 
  Payroll/Voucher vendor list management, Particular/Details list management
  (these are the dropdown option lists used in the Document Entry form)
- General preferences: notification settings, session timeout

8. Profile (Admin-exclusive screen)
- Admin's own account info: Name, Email, Change Password, Profile Photo

============================================
FLOW / INTERACTIVITY
============================================
- Login → Dashboard → Document Tracker → (modal) Add New Document → Save → 
  returns to Document Tracker with new row visible
- Document Tracker row → Edit → Edit Entry modal → Save Changes → returns to 
  Document Tracker
- Sign Up → confirmation banner → (simulated) redirect to Login
- Admin: Login → Dashboard → sidebar navigation across all 8 Admin screens, 
  all document views strictly read-only
- Sidebar links clickable across all screens for full prototype flow

LAYOUT NOTES
- Desktop web app layout, fixed sidebar + top bar, scrollable content area
- Modals should overlay the Document Tracker screen with a dimmed background, 
  centered, with a visible close (X) button
- Consistent status colors: purple = completed, blue = for signature/ 
  in-progress, red = overdue
- Consistent card padding, rounded corners (8-12px), subtle borders