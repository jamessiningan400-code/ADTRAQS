# ADTRAQS

ADTRAQS is a web-based document registration, routing, and tracking system for the Office of the City Administrator and its partner offices. It provides a shared portal for managing documents and following their progress through office workflows.

**Live demo:** [https://adtraqs.infinityfree.io](https://adtraqs.infinityfree.io)

The live site is a demonstration deployment. Do not enter real personal, financial, or confidential government information.

## What the system does

- Registers and manages documents, including their control numbers and details.
- Records document status and movement through office handoffs.
- Supports tracking views, tracking history, and QR-based lookup.
- Provides dashboard and monitoring views for document activity.
- Includes grouped-document tracking workflows.
- Provides administrator, office, and processor modes.
- Supports user management and office assignment.

The application includes these office modes:

| Area | Mode URL |
| --- | --- |
| City Treasurer Office | `office.html?mode=office-ct` |
| City Budget Office | `office.html?mode=office-cb` |
| City Accounting Office | `office.html?mode=office-ca` |
| Processor | `office.html?mode=processor` |

Office contact records and login accounts are separate. Adding an office contact does not automatically create an account that can sign in.

## Workflow overview

The central workflow starts with document registration in the City Administrative Office, then follows the relevant partner-office handoffs. The system records status and tracking events as documents move between offices. Forwarding and receiving are distinct steps; a forwarded document is not necessarily recorded as received until the receiving office processes the handoff. Processors use the processor mode to access tracking functions available to their account.

## Technology and architecture

- **Frontend:** React, TypeScript, and Vite.
- **Hosted demo backend:** PHP endpoints using PDO.
- **Hosted demo database:** MySQL.
- **Local/compatibility backend:** Node.js service under `server/`, with SQLite and optional PostgreSQL support. It is not required for the PHP/MySQL shared-host deployment.

The main portal is loaded by [index.html](./index.html) and the office interface by [office.html](./office.html). Their React entry points are [src/main.tsx](./src/main.tsx) and [src/office.tsx](./src/office.tsx); shared application screens and workflow logic are in [src/app/App.tsx](./src/app/App.tsx). The PHP API, database configuration template, and MySQL schemas are under [smartdocs-php](./smartdocs-php).

For the hosted demo, the built frontend and PHP API are served from the same domain. The frontend calls the PHP API under `/smartdocs`; Apache rewrite rules route those requests to the PHP endpoints.

## Run the frontend locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

Vite prints the local URL when the development server starts. This starts the frontend only. To exercise PHP/MySQL-backed workflows locally, configure a PHP/Apache server and MySQL database, then follow the database setup below. The Node service can be started separately with `npm run server`; it is not the backend used by the deployed InfinityFree demo.

Create a production frontend build with:

```sh
npm run build
```

The generated site is written to `dist/`.

## PHP/MySQL setup

1. Create a MySQL database and a PHP/Apache web space.
2. Import `smartdocs-php/schema/smartdocs_mysql.sql` into that database. If the host has already created the database, remove the `CREATE DATABASE` and `USE adtraqs;` statements from a local copy before importing.
3. Import `smartdocs-php/schema/document_groups_mysql.sql` into the same database. If needed, remove its `USE adtraqs;` statement from a local copy.
4. Copy `smartdocs-php/config/database.local.php.example` to `smartdocs-php/config/database.local.php` and enter the database host, database name, username, and password provided by your host. Keep this private configuration file out of Git and never publish its password.
5. Build the frontend with `npm install` and `npm run build`.
6. Upload the **contents** of `dist/` to the site's web root, including the hidden `.htaccess` file. Upload the **contents** of `smartdocs-php/` to a `smartdocs/` directory inside that same web root.
7. Create an account through the app. To make the first account an administrator, use the database's SQL console to promote the account you created, substituting its email:

   ```sql
   UPDATE users
   SET role = 'admin',
       office = 'City Administrative Office',
       status = 'active'
   WHERE email = 'your-admin-email@example.com';
   ```

8. Check the health endpoint at `https://your-domain/smartdocs/api/health`. Then sign in and test the document and office workflows with non-sensitive demo data.

Hosting providers often assign a database name and hostname different from the local defaults. Use the exact values from the hosting control panel. The PHP database connection configures MySQL sessions for UTC+08:00 (Asia/Manila), so new MySQL-generated timestamps use that timezone; it does not change timestamps already stored.

## Deployment notes

The public demo uses PHP/MySQL shared hosting. Shared free hosting can impose resource and request limits, may suspend or remove services, and may not provide reliable backups or retention. Keep the demo low-traffic and use sample data only. This deployment is not a production security, availability, or backup guarantee.

Never commit database passwords, private configuration, real office records, or database backups. The local PHP configuration file is intended to be excluded from version control.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React and TypeScript frontend |
| `public/` | Static assets and frontend hosting rules |
| `server/` | Local/compatibility Node.js API |
| `smartdocs-php/` | PHP API, configuration template, and MySQL schemas |
| `tests/` | Node database and compatibility tests |
| `dist/` | Generated production frontend build |

The repository itself contains the complete source code. This README describes how the current system is organized and run; it is not a copy of the source files.
