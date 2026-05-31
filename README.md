# QR TimeClock Pro (QRTIMECLOCK2 Mirror)

This repo is meant to stay visually and functionally similar to the original QRTimeClock Pro app while remaining isolated from the original repo's live Firebase data.

By default, `QRTIMECLOCK2` ships with blank Firebase config values, so it will not read or write the original app's data until you connect this repo to its own Firebase project.

This version is built for **Firebase Hosting + Firebase Authentication + Cloud Firestore + Firebase Functions**.

## What it does

- Worker opens the same simple QRTimeClock-style punch page
- Worker enters:
  - name
  - worker PIN
  - company/client
  - job site
- Worker can:
  - Clock In
  - Start Lunch
  - End Lunch
  - Clock Out
- Worker can also:
  - view **My Time**
  - submit a **Request Time Fix**
- Every punch saves instantly through Firebase Functions into Firestore
- Manager sees live punches automatically
- Manager can open weekly timesheets and sign each one
- Signed timesheets can be reopened by a manager if needed
- Manager page lets you manage worker records, worker PINs, and Firestore `users` profiles

## Folder files

- `index.html` — main app UI
- `style.css` — styling
- `app.js` — Firebase logic, punches, timesheets, QR tools
- `firebase-config.js` — your Firebase config + Functions URL goes here
- `firestore.rules` — starter Firestore security rules
- `firebase.json` — Firebase Hosting config
- `functions/index.js` — worker PIN verification, worker punch creation, and time-fix request endpoints

## Firebase setup

### 1) Create a Firebase project
In Firebase Console:
- Create project
- Add a **Web App**
- Enable **Authentication > Email/Password**
- Enable **Cloud Firestore**
- Enable **Cloud Functions**
- Enable **Hosting**

### 2) Paste config into `firebase-config.js`
Replace the placeholder values with your real Firebase web config.

### 3) Create Auth users
Create your managers/admins in **Authentication**.
Temp workers do **not** need Firebase Auth accounts.

### 4) Create matching Firestore user profiles
For every manager/admin, create a doc in:

`users/{uid}`

Example:

```json
{
  "name": "Brandon Evanshine",
  "email": "manager@company.com",
  "companyId": "acme_warehouse",
  "role": "manager",
  "active": true
}
```

Roles supported:
- `employee`
- `worker`
- `manager`
- `admin`
- `clientManager`
- `agencyOwner`
- `agencyAdmin`
- `platformOwner`

### 5) Create worker records
Create worker docs in:

`workers/{workerId}`

Example:

```json
{
  "name": "Brandon Evanshine",
  "displayName": "Brandon Evanshine",
  "nameKey": "brandon_evanshine",
  "employeeNumber": "EMP-1001",
  "companyId": "acme_warehouse",
  "clientId": "acme_warehouse",
  "siteId": "dock_a",
  "agencyId": "sterling_staffing",
  "status": "active",
  "pinHash": "<sha256 hash>"
}
```

### 6) Deploy Functions

From the `functions` folder:

```bash
npm install
firebase deploy --only functions
```

## Firestore collections used

### `users`
Stores profile and role info.

### `workers`
Worker records used for PIN verification and QR punch matching.

### `punches`
One document per punch.

Example:

```json
{
  "workerId": "EMP-1001",
  "employeeId": "EMP-1001",
  "name": "Brandon Evanshine",
  "action": "clock_in",
  "companyId": "acme_warehouse",
  "clientId": "acme_warehouse",
  "siteId": "dock_a",
  "agencyId": "sterling_staffing",
  "dateKey": "2026-04-13",
  "weekKey": "2026-04-13",
  "timestampMs": 1776110400000
}
```

### `timesheets`
One document per employee per week.

Doc id format:

`EMP-1001_2026-04-13`

Example fields:

```json
{
  "employeeId": "EMP-1001",
  "name": "Brandon Evanshine",
  "weekKey": "2026-04-13",
  "weeklyHours": 38.5,
  "status": "open",
  "managerSignedBy": "Jane Smith"
}
```

## How weekly signoff works

- Every punch updates that employee’s weekly timesheet doc
- Manager opens **Weekly Signoff**
- Manager clicks **Sign** on each person’s row
- The app stores:
  - `status = signed`
  - `managerSignedBy`
  - `managerSignedAt`

## How QR works

### Company QR poster
Generates a QR that opens your deployed app URL.
Post this in the warehouse so workers can open the punch page fast.

## Deploy with Firebase Hosting

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Log in:

```bash
firebase login
```

From this app folder:

```bash
firebase init hosting
```

Use these choices:
- existing project
- public directory: `.`
- single-page app: `No`
- do not overwrite files

Deploy rules:

```bash
firebase deploy --only firestore:rules
```

Deploy functions:

```bash
firebase deploy --only functions
```

Deploy hosting:

```bash
firebase deploy --only hosting
```

## Good next upgrades

- export payroll CSV
- overtime calculation
- employee acknowledgment signature
- edit/correction request flow
- shift schedules and late flags
- department or location tags
- photo capture on clock in/out
- geofencing
- Cloud Functions for stricter server-side payroll calculations

## Important note

This is a practical working QRTimeClock-style app.
For payroll-grade compliance, you may eventually want:
- audit trail logs
- stronger rules around edits after signoff
- payroll export approval flow
