Update the "SMART DOCS" wireframe prototype for the Office of the City 
Administrator, Gingoog City, to reflect the following revisions. The system 
now spans 5 separate interfaces, not just one.

============================================
GLOBAL STYLE UPDATE
============================================
- Keep the dark navy sidebar, top bar, and card backgrounds (#0B0E1A) for 
  Staff and Admin dashboards.
- CHANGE: the Document Tracker table's data area should now use a WHITE 
  background with dark navy text, matching the reference table style — 
  header row stays dark navy/purple with white bold text, but each data row 
  is white with subtle gray row borders, alternating very light gray for 
  readability. Control Number column text in purple/blue, bold, still acts 
  as a clickable link style.
- Keep this same white-table style consistent across Document Tracker, 
  Archive, and Reports tables.

============================================
INTERFACE 1: SMART DOCS Main System (City Admin — Staff + Admin)
============================================
All existing screens remain (Login, Sign Up, Dashboard, Document Tracker, 
Document Entry Modal, Edit Entry Modal, Signature Monitoring, Reports, 
Archive, User Management, Settings, Profile) with these updates:

DOCUMENT ENTRY MODAL — field changes:
- Payroll/Voucher — CHANGE from dropdown to manual text input field
- Particular/Details — CHANGE from dropdown to manual text input field
- Amount — CHANGE from dropdown to plain numeric text input
- Date — auto-filled with current date AND time (not date only), read-only, 
  format: "Monday 15 JANUARY 2024, 08:30 AM"
- Date Forwarded — auto-generated with current date and time upon save, 
  read-only

EDIT ENTRY MODAL — field changes:
- Cheque No. — CHANGE from dropdown to manual text input
- P.R. Number — CHANGE from dropdown to manual text input
- Type (2nd/secondary) — manual text input
- Date Fwd. (Returned) — date AND time picker
- NEW: "Generate QR Code" button below the existing fields. When clicked:
  - Generates a QR code tied to that document's control number
  - QR code image displays directly below the button inside the same modal
  - Button becomes disabled/greyed out permanently after first click (label 
    changes to "QR Code Generated" or similar), since each document gets 
    exactly one QR code, one time only
  - Include a small "Print QR Label" icon/button next to the generated QR

NEW SCREEN — Tracking Monitoring (added to Staff/Admin sidebar):
- New sidebar item: "Tracking Monitoring"
- Table/board view showing every document currently outside City Admin: 
  Control Number, Office (current location), Particular/Details, Current 
  Stage (Arrived / Signature Done / Forwarded), Timestamp of last update
- Filter by office (City Accountant / City Treasurer / City Budget)
- Visual flag/highlight for documents that have been at an office unusually 
  long or show no scan activity (failsafe indicator)
- Read-only for Admin, and Staff can view here too (not editable — updates 
  only come from the office mini-systems' QR scans)

============================================
INTERFACE 2, 3, 4: Office Mini-Systems 
(City Accountant, City Treasurer, City Budget — 3 near-identical, separate 
unlisted-URL pages, NO LOGIN)
============================================
Design ONE template screen (to be duplicated per office):

- Simple, minimal page — office name displayed at top (e.g., "City 
  Accountant — Document Tracking")
- Large "Scan QR Code" button/camera view (opens phone camera via browser)
- Below it: "Or enter Control Number manually" text input + Search button
- On finding a document, display ONLY these fields (limited visibility): 
  Control Number, Office, Particular/Details
- Below that: 3 large sequential action buttons, shown as a horizontal 
  progress stepper:
  1. "Arrived" 
  2. "Signature Done"
  3. "Forwarded"
- Each button is tappable once; after tapping, it becomes visually 
  checked/completed (green checkmark, greyed out, no longer clickable) and 
  shows the timestamp of when it was clicked (e.g., "Arrived — Aug 13, 2026, 
  10:42 AM")
- Only the next button in sequence is active/tappable at any time — the 
  other two remain disabled until their turn
- Clean mobile-first layout since this will primarily be opened on a phone 
  browser

============================================
INTERFACE 5: Processor Mini-System (separate unlisted URL, NO LOGIN, 
view-only)
============================================
- Same QR scan / manual control number entry as the office mini-systems
- On finding a document, display ONLY: Control Number, Office (current 
  location), Particular/Details, and Current Status (Arrived / Signature 
  Done / Forwarded, with timestamp)
- NO action buttons — this is strictly a read-only lookup screen
- Simple, single-purpose mobile page: search bar/scanner at top, result card 
  below

============================================
FLOW / INTERACTIVITY
============================================
- SMART DOCS main system: Document Tracker → Edit Modal → Generate QR → QR 
  locked after generation → document physically leaves with QR slip
- Office mini-systems: QR scan or manual entry → Arrived → Signature Done → 
  Forwarded (each step timestamped, one-way progression)
- Tracking Monitoring page in main system reflects these updates in near 
  real time (simulate with static data for the prototype)
- Processor mini-system: scan/search → view-only result, no further action

LAYOUT NOTES
- Main system: unchanged desktop layout, fixed sidebar + top bar, WHITE 
  table backgrounds as described above
- Office mini-systems and Processor mini-system: mobile-first, single-column, 
  large tap targets, minimal navigation (no sidebar needed — these are 
  single-purpose pages)