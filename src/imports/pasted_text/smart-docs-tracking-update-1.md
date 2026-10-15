Update the Figma wireframe prototype for "Document Tracking and Routing 
System with QR Code Scanner and Signature Tally for Multi-Departmental 
Operations" (system name used throughout the interface: SMART DOCS) for the 
Office of the City Administrator, Gingoog City.

============================================
CRITICAL WORKFLOW CHANGE — READ FIRST
============================================
Documents no longer go to a single destination office. Every document now 
travels through ALL FOUR offices in one fixed round-trip sequence:

CA (City Administrator's Office) -> CTO (City Treasurer's Office) -> 
CBO (City Budget Office) -> CAO (City Accountant's Office) -> back to CA 
(Complete)

- CA is both the STARTING point and the FINAL destination.
- A document is only "Complete" once it has passed through all three partner 
  offices and returned to CA.
- Forwarding is a TWO-STEP handshake, not a single action: when an office 
  marks a document "Forwarded," it does NOT automatically appear as received 
  at the next office. The next office must independently scan/open the 
  document and tap "Receive" before the transfer is considered confirmed. 
  Until then, the document sits in a "Forwarded — awaiting receipt" state.
- When marking a document as "Forwarded," the staff member must select 
  which office it is going to next from a choice/dropdown (even though the 
  round order is fixed, this confirms and logs the explicit hand-off 
  destination for that document).

============================================
NEW TRACKING VISUAL DESIGN (apply across Office Mini-Systems, Processor 
Mini-System, AND the Admin/Staff Tracking Monitoring page in the main 
system)
============================================
Redesign the tracking view using this exact visual pattern:

HORIZONTAL PROGRESS STEPPER (top of the tracking view)
- Five circular nodes in a horizontal row, connected by arrows:
  CA -> CTO -> CBO -> CAO -> Complete (checkmark icon)
- Each circle contains a bold 2-3 letter office code (CA, CTO, CBO, CAO) 
  except the last node, which shows a checkmark icon instead of text
- Completed steps: filled GREEN circle, with a GREEN arrow connecting to 
  the next completed/current step
- Remaining/upcoming steps: WHITE/outline circle with black text, connected 
  by a plain white/gray arrow
- Below each circle: the office's full name (e.g., "City Treasurers Office") 
  and, once completed, the date/time it was processed there (e.g., 
  "08/14/26 10:35")
- This stepper should visually and immediately communicate "how far along" 
  the document is in its 4-office journey

DOCUMENT STATUS SECTION (below the stepper)
- Section header: "Document Status"
- Shows the current office's name and a Control Number range (e.g., 
  "Control No.: 338-347" when multiple related documents are grouped, or a 
  single control number for one document)
- A compact table showing: Control No. | Particulars/Details | Type — 
  listing each document/line item under that control number group
- Below the table: Date Delivered, Date Forwarded, Forwarded By 
  (Name/Contact Number), Received By (Name/Contact Number)
- When a document has completed a full stage, show a second summary block 
  underneath (e.g., "City Administrator Office — Control No.: 338-347 / 
  Complete") with its own Date Delivered, Date Forwarded, Forwarded By, 
  Received By fields

ACTION BUTTONS (bottom of the tracking view, Office Mini-System only — NOT 
shown on the Processor view)
- Three buttons in a row: "RECEIVE" | "FOR SIG." | "FWD"
- Timestamp shown below the most recently pressed button (e.g., "08/14/26 
  10:30AM" under RECEIVE)
- Buttons follow sequential logic: RECEIVE must be tapped before FOR SIG. 
  becomes active; FOR SIG. must be completed before FWD becomes active
- Once a button's action is completed, it becomes visually locked (checked/
  greyed) and cannot be tapped again for that stage

FORWARD CONFIRMATION MODAL (triggered when staff taps "FWD")
- White modal card, rounded corners, overlaying the dimmed tracking screen
- Green checkmark icon top-left, close (X) button top-right
- Title: the name of the office the document is being forwarded to (e.g., 
  "City Treasurers Office")
- Subtitle: "Please review the receiving office details before confirming."
- Toggle 1: "Are you [Name]/[Contact Number]?" (pre-filled with the 
  logged/assumed staff identity) — if toggled OFF, reveal a text field: 
  "If no, can you type your name/contact number here?"
- Toggle 2: "Are all documents complete?" — if toggled OFF, reveal a text 
  field: "If no, please enter the missing control number(s) here."
- Primary button: "Confirm" (solid purple/violet, full width)
- Secondary button: "Cancel" (outline, full width, below Confirm)
- This same confirmation modal pattern should also appear when tapping 
  "RECEIVE," adapted to confirm receipt instead of forwarding, and should 
  include a dropdown/selector for choosing which office the document is 
  being forwarded to next when applicable

============================================
PROCESSOR MINI-SYSTEM — updated to "PROCESSORS VIEW (VIEWING ONLY)"
============================================
- Same horizontal stepper and Document Status section as the Office 
  Mini-System, fully redesigned to match the new visual style above
- Header explicitly labeled "PROCESSORS VIEW (VIEWING ONLY)" to reinforce 
  no editing capability
- NO action buttons (no Receive/For Sig./FWD) — this remains strictly 
  read-only
- Processors can scan a QR code or manually enter a control number to pull 
  up this exact view for any document in transit

============================================
MAIN SYSTEM UPDATES
============================================

SIDEBAR NAVIGATION
- Rename "Signature Monitoring" to simply "Signatory" (applies to both 
  Staff and Admin sidebars)

NEW/REDESIGNED: Tracking Monitoring page (Staff + Admin, Admin view-only)
- Apply the exact same horizontal stepper + Document Status card design 
  described above, so City Admin sees the identical visual language used 
  in the office and processor mini-systems — just with full document 
  details visible (not the restricted field set)
- List/grid of documents currently in transit, each showing its own mini 
  stepper indicating current position across the 4-office round trip
- Filter by current office (CA / CTO / CBO / CAO), status (Forwarded — 
  Awaiting Receipt / Received / For Signature / Complete)
- Flag/highlight documents stuck in "Forwarded — Awaiting Receipt" for an 
  unusually long time (the receiving office may have forgotten to confirm)

DOCUMENT TRACKER — sort order change
- Reverse the current sort order: the OLDEST document entry (lowest/ 
  earliest Control Number) appears at the BOTTOM of the table, and the 
  MOST RECENTLY entered document appears at the TOP row
- This applies to both Staff (full view) and Admin (view-only) Document 
  Tracker tables
- New documents entered via "+ Add New Document" should visually insert at 
  the top of the table, consistent with this sort order

EDIT DOCUMENT MODAL — unchanged from previous design
- Manual text entry for Payroll/Voucher, Particular/Details, Amount, 
  Cheque No., P.R. Number
- One-time "Generate QR Code" button (locks after use)
- Full date + time on entry and forwarding fields

TITLE / BRANDING UPDATE
- Remove the word "Automated" from any full-title display: system full 
  title now reads "Document Tracking and Routing System with QR Code 
  Scanner and Signature Tally for Multi-Departmental Operations"
- Continue using "SMART DOCS" as the short wordmark/logo text throughout 
  the interface (sidebar header, login page)
- Retain the Gingoog City official seal on the Login screen

============================================
STYLE
============================================
- Dark navy (#0B0E1A style) backgrounds for the main system and the 
  stepper/tracking views, consistent with existing screens
- White modal cards for confirmation dialogs (Forward/Receive), rounded 
  corners, purple primary buttons (#6C4FF5), outline secondary buttons
- Green (#10B981 or similar) for completed stepper nodes/arrows and 
  toggles in the "on" state; white/gray for upcoming/incomplete states
- Mobile-first layout for Office Mini-System and Processor Mini-System 
  screens (this is the primary use case — phone browser, no installation)
- Keep the white-background table style (from the earlier update) for the 
  Document Tracker and Archive tables in the main desktop system