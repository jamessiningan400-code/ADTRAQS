# SMART DOCS System Architecture Design

This document describes the architectural design of the SMART DOCS wireframe/prototype, including the technical stack, runtime topology, module responsibilities, and data flow. It is intended as the canonical architecture guide for the repository.

## 1. Overview

SMART DOCS is a document tracking and workflow system designed for government office operations. The solution supports:

- main portal access for city administrative users
- office-specific mini-systems for Treasurer, Budget, and Accounting offices
- processor workflow and document forwarding
- QR-based document tracking
- status monitoring across document workflows
- user authentication, office assignment, and record management

The project is implemented as a hybrid prototype architecture that intentionally combines front-end UI simulation, a lightweight local API, and PHP/MySQL compatibility services. This makes it suitable for rapid prototyping, demo environments, and incremental migration toward a fully integrated production deployment.

## 2. Development Software and Tools

The SMART DOCS prototype was built and run using a modern front-end workflow and a hybrid backend setup. The following tools and technologies support both design and implementation:

### 2.1 Core Development Environment
- Visual Studio Code (primary IDE for development and workspace management)
- Git for version control and repository management
- GitHub for source hosting and collaboration
- Node.js and npm for package management and local runtime execution
- pnpm workspace configuration for managing the monorepo-style project structure

### 2.2 Front-end Development Stack
- React 18 for component-based UI development
- TypeScript for typed application logic and safer component development
- Vite as the development server and production bundler
- Tailwind CSS for utility-driven styling and layout control
- Custom CSS theme files for branded look and visual styling
- shadcn-style UI patterns implemented with Radix UI primitives
- React Hook Form for form handling and validation
- Recharts for reports and chart-based data visualization
- Framer Motion / Motion for animation and UI transitions
- Lucide React for interface icons
- date-fns for time and date formatting and logic
- Embla Carousel for carousel-driven UI components
- react-dnd and related drag-and-drop utilities for interactive workflow interactions
- Sonner for toast notifications

### 2.3 Back-end and API Tools
- Node.js HTTP server for the local REST API layer
- SQLite for lightweight local persistence and prototype data storage
- PostgreSQL support via the pg library for production-style database compatibility
- PHP with PDO for database access in the MySQL/XAMPP-compatible backend
- Apache/XAMPP-style deployment for PHP routes and database-backed services
- MySQL schema files for official document and workflow data modeling
- Express-like REST handling patterns implemented directly in the Node runtime

### 2.4 Design and Workflow Tools
- Figma as the source design and wireframe prototype environment
- Browser-based prototype testing using Vite and local forwarding
- VS Code dev tunnels / forwarded addresses for remote browser preview access
- QR code generation support for tracking and document monitoring
- Office-specific UI modes for Treasurer, Budget, and Accounting workflow testing

### 2.5 Supporting Utilities
- Concurrently for running multiple local services together
- PostCSS and Vite CSS pipeline for styling processing
- Browser dev tools for interface validation and responsive testing
- Local database backups and schema snapshots for restoration and migration readiness

This toolset gives the project a practical balance between rapid frontend iteration, backend flexibility, and realistic business workflow simulation.

## 3. Architectural Goals

The system is designed around the following goals:

- separation of responsibilities across presentation, business logic, and persistence layers
- rapid UI iteration for office workflows and document tracking flows
- support for multiple user roles and office contexts in one application shell
- compatibility with local SQLite/PostgreSQL development and MySQL-backed deployment patterns
- low-friction deployment for browser-based mockups and office demos
- capability to evolve from prototype to production with minimal rework

## 4. High-Level System Architecture

The application follows a layered architecture with three main runtime tiers:

### 4.1 Presentation Layer

This is the user-facing web experience built with React and TypeScript.

Core implementation:
- [index.html](./index.html) loads the primary portal application
- [office.html](./office.html) loads the office-focused mini-system
- [src/main.tsx](./src/main.tsx) renders the main portal
- [src/office.tsx](./src/office.tsx) renders the office/processor workflows
- [src/app/App.tsx](./src/app/App.tsx) contains the application logic, UI states, document management screens, and workflow interactions

Responsibilities:
- render dashboards and forms
- manage user login and session state in browser storage
- display document records, office steps, and route statuses
- provide workflow views for the main office, treasury, budget, accounting, and processor roles
- generate QR representations for document tracking
- orchestrate fetch calls to backend services

### 4.2 Application Layer

The application layer is split between a Node.js API service and PHP endpoint implementations.

#### Node.js API server

Primary server implementation:
- [server/index.js](./server/index.js)
- [server/db.js](./server/db.js)

This service provides local REST endpoints for:
- health checks
- document listing
- tracking information
- login and registration flows
- user retrieval

It supports two persistence modes:
- SQLite for local prototype data
- PostgreSQL when a DATABASE_URL is configured

This service acts as the modern developer-facing API layer for local testing and demo use.

#### PHP/MySQL API layer

Primary backend implementation:
- [smartdocs-php/index.php](./smartdocs-php/index.php)
- [smartdocs-php/config/database.php](./smartdocs-php/config/database.php)
- [smartdocs-php/api](./smartdocs-php/api)
- [smartdocs-php/schema](./smartdocs-php/schema)

This layer is aligned with a more traditional LAMP/XAMPP deployment pattern and is designed to be hosted by Apache/PHP. It provides role-aware data access and schema definitions that match the document-tracking domain model. The API layer supports user, office-staff, and authentication flows using MySQL with PDO.

### 4.3 Data Layer

The project uses several persistence mechanisms depending on stage of implementation:

- SQLite: local prototype data in [data/smart-docs.db](./data/smart-docs.db)
- PostgreSQL: optional production-like relational store via DATABASE_URL
- MySQL: official schema under [smartdocs-php/schema](./smartdocs-php/schema)

This hybrid approach allows the prototype to remain portable while still matching the enterprise workflow requirements of the target business process.

## 5. Runtime Topology

The system is designed for a dev environment in which multiple runtime components coexist:

1. Front-end SPA served by Vite
2. Local Node API on port 3001
3. PHP backend served through Apache/XAMPP or equivalent local web server
4. Relational database layer using SQLite, PostgreSQL, or MySQL

Typical local flow:

- the browser loads the main portal or office-specific entry page
- the React app performs API calls to the local Node server or PHP endpoints
- the API reads from the configured database
- document, tracking, and user data are returned as JSON to the front end
- the UI renders workflows and updates state without a full page reload

### Free capstone demo deployment (PHP/MySQL)

The existing UI uses PHP endpoints for its document, group-tracking, user, and catalog workflows. For a short, low-traffic capstone demo, a PHP/MySQL shared host is a closer fit than deploying only the Node API. The production build is configured to call the PHP app under `/smartdocs` on the same domain.

This is a demo setup, not production hosting. Use test data only. InfinityFree documents a 50,000-hit daily limit and possible 24-hour suspension after MySQL overload ([hit limit](https://forum.infinityfree.com/t/what-does-the-hits-limit-mean/49330), [MySQL overload](https://forum.infinityfree.com/t/what-does-mysql-overloading-mean/49333)). Its [browser security restrictions](https://forum.infinityfree.com/t/browser-security-system-features-and-limitations/49353) allow same-domain browser AJAX but may block cross-domain API calls and external tools; keep the frontend and PHP API on the same domain.

1. Create a free PHP/MySQL hosting account and a MySQL database in the hosting control panel. Record the database host, database name, username, and password privately.
2. In phpMyAdmin, select the database created by the host. For a local MySQL installation, the schema defaults to `adtraqs`. For hosting, import `smartdocs-php/schema/smartdocs_mysql.sql` after removing its first two lines (`CREATE DATABASE ...` and `USE adtraqs;`) from a local copy. Then import `smartdocs-php/schema/document_groups_mysql.sql` after removing its first line (`USE adtraqs;`) from a local copy. Use the exact host-assigned database name (including any account prefix) in the private PHP database config.
3. Copy `smartdocs-php/config/database.local.php.example` to `smartdocs-php/config/database.local.php` and fill it with the provider's database details. This local config is ignored by Git; do not commit it or share its password.
4. Build the frontend from the repository root with `npm install` followed by `npm run build`.
5. Upload the **contents** of `dist` to the host's web root (commonly `htdocs`), including the hidden `.htaccess` file. Upload the contents of `smartdocs-php` into a `smartdocs` folder under that same web root. The root `.htaccess` forwards direct `/api/*.php` requests to the PHP folder, and `smartdocs/.htaccess` maps the clean API URLs used by the app to their PHP endpoints.
6. Open the website, sign up with a demo account, then use phpMyAdmin to activate it as the first admin. In the host database's SQL tool, run `UPDATE users SET role = 'admin', office = 'City Administrative Office', status = 'active' WHERE email = 'your-demo-email@example.com';` with the same email used at signup.
7. Check `https://your-domain/smartdocs/api/docs.php` in a browser. Once the schema and database credentials are correct, it should return JSON. Then open the website root and test login, document creation, tracking, and office links with demo data.

The host-specific MySQL hostname is not necessarily `localhost`; use the exact value shown in its control panel. The browser-based interface and API should be hosted on the same domain. The Node service is not required for this PHP/MySQL deployment. The hosted database starts empty; the local SQLite databases and backup are intentionally not uploaded. The UI refreshes tracking frequently, so keep the demo low-traffic. Avoid using the free host for real records or expecting uploaded data to have guaranteed backup or retention.

## 6. System Components

### 6.1 Portal Application

The main portal is the central entry point for the SMART DOCS system. It provides a top-level experience for:

- selecting office paths
- logging in or creating user accounts
- navigating document and status monitoring screens
- viewing office-specific tasks and worker assignments

This portal acts as the main operational shell for the prototype.

### 6.2 Office and Processor Modules

The system supports specialized workflows through dedicated modes:

- office-ct: City Treasurer Office mode
- office-cb: City Budget Office mode
- office-ca: City Accounting Office mode
- processor: external processing workflow mode

Each mode reuses the same UI architecture but swaps behavior based on the selected context. The application logic uses an app mode to define which office flow is active and which business rules apply.

### 6.3 Document Tracking Engine

The tracking model is built around document movement through multiple administrative offices and signoff stages. Core concepts include:

- document metadata such as type, office, fund, particulars, payroll voucher, amount, and signature
- status transitions such as "For Signature" and "Completed"
- office-level checkpoints (e.g., CTO, CBO, CAO)
- forwarding logs and received-by data
- QR-generated tracking references

This is the central business function of the application.

### 6.4 Authentication and User Management

User handling is divided across the local Node API and PHP-backed user management logic. The system supports:

- role-based access (staff/admin)
- office assignment mapping
- account activation rules
- protection for main-system vs office-specific accounts
- office staff contact records in addition to system users

The auth layer ensures that the UI is aligned with the workflow context of the office or role being used.

### 6.5 Reporting and Monitoring

The front end includes dashboards, charts, and monitoring screens for:

- total documents and statuses
- workflow progress by office
- processing history and signature tracking
- grouped document monitoring and output reporting

The reporting layer consumes the same document and tracking records served by the API tier, enabling consistent reporting across modules.

## 7. Core Data Model

The domain model is centered on documents, users, offices, tracking steps, and group-based document workflows. The projected relational model includes entities such as:

- users
- office_staff
- processors
- documents
- tracking_records
- tracking_steps
- document_groups
- document_group_documents
- group_tracking_records
- group_tracking_steps
- offices
- funds
- document_types
- signatures

The schema files in [smartdocs-php/schema](./smartdocs-php/schema) show the intended MySQL structure and the document-group workflow model. These tables reflect the real office process rather than a flat single-table system.

The most important relationships are:

- each document belongs to a control number and office context
- each tracking record is associated with a document and a chain of office interactions
- grouped documents can share a common tracking stream
- staff and processors are separate entity categories for operational clarity
- office and fund metadata are normalized to lookup tables instead of raw repeated strings

## 8. Request and Data Flow

### 8.1 Login flow

1. user enters credentials in the React UI
2. UI calls the login endpoint
3. Node API resolves the user by email and validates credentials
4. user role and office assignment are checked
5. authenticated session state is stored in browser session storage
6. the app routes the user to the appropriate dashboard or office module

### 8.2 Document registration flow

1. user enters document details in a form
2. data is validated for required fields, amount, office, and signature
3. document record is sent to the API
4. the API persists the document in the active database store
5. tracking metadata is created or updated
6. the UI refreshes the document list and the workflow state

### 8.3 Tracking flow

1. the system loads document and office-step data
2. each stage is mapped to a tracking record
3. step data includes received, for-signature, and forwarded timestamps
4. the UI visualizes movement across offices and processors
5. QR code data links to document identifiers for external monitoring

## 9. Technology Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS and custom theme layer
- Radix UI primitives and shadcn-style component patterns
- Recharts, date libs, form libraries, and motion utilities

### Backend
- Node.js runtime
- native HTTP server for local API logic
- SQLite for local persistence
- PostgreSQL support via pg library
- PHP + PDO for MySQL-compatible deployment
- Apache/XAMPP as a deployment target

### Data and persistence
- SQLite for quick local prototype work
- PostgreSQL for more production-like application readiness
- MySQL schema for official workflow modeling and deployment in PHP-based infrastructure

## 10. Design Principles and Trade-offs

This project embraces a prototype-first architecture with deliberate flexibility:

- UI-first design: the front end is the primary driver of flow validation
- hybrid backend strategy: Node for local speed and PHP for enterprise compatibility
- schema evolution: relational modeling is maintained even in a prototype stack
- office-specific modularity: authorization and process logic are separate by workflow context
- low coupling: frontend can be adapted to a single backend implementation as the project matures

The main trade-off is that the architecture is intentionally non-monolithic. This is beneficial for rapid iteration but means that a production-grade deployment should consolidate on one backend stack and one persistence standard.

## 11. Suggested Production Evolution

A future production-ready version should likely standardize on one primary stack:

- frontend: React SPA with Vite
- API: Node.js or PHP service, but not both simultaneously for the same workflow
- database: MySQL or PostgreSQL as the single source of truth
- security layer: session management, RBAC, validation, logging, and audit trails
- deployment model: containerized services or a standard web app deployment

This would remove duplicate logic and align the architecture with a clear single-platform operational model.

## 12. Directory Structure Summary

- [src](./src): React application source and UI modules
- [server](./server): Node API and database access layer
- [smartdocs-php](./smartdocs-php): PHP/MySQL-compatible backend and database schema
- [data](./data): local SQLite database files
- [guidelines](./guidelines): project rules and design guidance
- [backups](./backups): prior database snapshots
- [tests](./tests): verification scripts for database and compatibility coverage

## 13. Conclusion

SMART DOCS is best understood as a hybrid office workflow prototype that combines a modern component-based frontend with lightweight service and database tiers. The architecture is intentionally flexible enough to support both user-driven UI exploration and enterprise-style document workflow modeling.

The most important architectural insight is that the system is organized around the actual office process, not just around screens. Document tracking, office handoff, role boundaries, and reporting are all modeled as first-class concerns in the design.

This is a strong foundation for future implementation maturity, especially if the team consolidates the backend and data layer into a single production-aligned technology stack.

## 14. Flowchart Generation Prompt

Use the following prompt to create a flowchart for the SMART DOCS document-routing system:

> Create a clear, professional flowchart for SMART DOCS, a document tracking and routing system for the Office of the City Administrator, Gingoog City. Show the document's complete round-trip workflow through the three partner offices, and show Processors as a separate read-only tracking role (not as a routing office).
>
> **Main document route:**
> 1. Start at the **Office of the City Administrator (CA)**. Staff register the document, enter its details, and create its control number and tracking record.
> 2. Route it to the **City Treasurer's Office (CTO)**.
> 3. Route it to the **City Budget Office (CBO)**.
> 4. Route it to the **City Accountant's Office (CAO)**.
> 5. Return it to the **Office of the City Administrator (CA)**. Mark the document **Complete** only after it has returned to CA and passed through all three partner offices.
>
> At each office handoff, show the same two-step receipt process: the sending office records **Forwarded** and selects the next office; the document enters **Forwarded — Awaiting Receipt**; then the receiving office independently opens or scans the document and records **Receive**. Do not show forwarding as automatic receipt. Once received, show the office's processing/signature status and its forwarding action to the next office in the sequence.
>
> **Processor tracking role:** Add a separate branch or side lane labeled **Processors — Viewing Only**. A processor scans the document's QR code or enters its control number to look up its tracking record and view the current office, status, and progress through CA → CTO → CBO → CAO → Complete. Make this lane read-only: processors cannot receive, sign, edit, or forward documents, and their lane does not alter the main route.
>
> Include a clear start and completion state, directional arrows, the office names and abbreviations (CA, CTO, CBO, CAO), and status labels for **Received**, **For Signature**, **Forwarded — Awaiting Receipt**, and **Complete**. Keep the main routing sequence visually distinct from the processor lookup lane, and make the diagram easy to read for both administrative staff and processors.

## 15. Use Case Diagram Generation Prompt

Use the following prompt to create a UML use case diagram for SMART DOCS:

> Create a clear, standards-based UML use case diagram for SMART DOCS, the document tracking and routing system for the Office of the City Administrator, Gingoog City. Put the system use cases inside a system boundary labeled **SMART DOCS** and place the external actors outside it. Use readable actor-to-use-case associations, and do not represent workflow sequence with arrows; this is a use case diagram, not a flowchart.
>
> **Actors:**
> - **Administrator** — manages system users and monitors documents and workflow activity.
> - **City Administrator Office Staff (CA)** — registers and manages documents, tracks document status, receives returning documents, and confirms completion.
> - **City Treasurer Office Staff (CTO)** — receives routed documents, processes/signs them, and forwards them to the City Budget Office.
> - **City Budget Office Staff (CBO)** — receives routed documents, processes/signs them, and forwards them to the City Accountant's Office.
> - **City Accountant Office Staff (CAO)** — receives routed documents, processes/signs them, and forwards them back to the City Administrator's Office.
> - **Processor (Viewing Only)** — scans a QR code or enters a control number to look up and view document tracking information.
>
> **Use cases inside SMART DOCS:**
> - Authenticate / log in.
> - Register a document and assign or view its control number.
> - View and manage document details.
> - Receive a document at the current office.
> - Update processing or signature status, including **For Signature**.
> - Forward a document to the next office and record the selected destination.
> - Track document progress and view tracking history.
> - View QR-based tracking information.
> - Monitor documents and workflow status.
> - Manage users (Administrator only).
> - Look up a document by QR code or control number and view its status (Processor only).
>
> Associate CA, CTO, CBO, and CAO staff with the office actions they perform. The document route represented by these office actions is CA → CTO → CBO → CAO → CA; completion is confirmed only when the document returns to CA after all three partner offices. Make clear that **Forward** and **Receive** are distinct actions: forwarding records a handoff but does not confirm receipt. Show **Forwarded — Awaiting Receipt** as a tracking state where useful.
>
> Keep the Processor actor strictly read-only. The Processor may search or scan and view the tracking result, but must not be connected to registering, editing, receiving, signing, forwarding, or completing documents. Distinguish Administrator capabilities from staff capabilities, avoid duplicating actors unnecessarily, and keep the diagram uncluttered and suitable for inclusion in technical documentation.
