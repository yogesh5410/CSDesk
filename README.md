# CSDesk

CSDesk is a web portal for the CSE department at IIT Bhilai. It automates three
department chores that used to be done by hand:

| Module | What it does |
|---|---|
| **TA Allocation** | Assigns M.Tech and PhD teaching assistants to the courses that asked for them, with no timetable clashes, using a CP-SAT optimisation model. |
| **Lab Allocation** | Assigns a physical lab room to every lab batch in its fixed timetable slot, respecting room capacity and GPU needs. |
| **Lab Software Installs** | Runs shell commands and software installs on every lab PC at once from the dashboard, with live output from each machine. |

Sign-in is through Google and is limited to `@iitbhilai.ac.in` accounts.

Other entries in the sidebar (Room Booking, Inventory, Directory, Lost & Found,
Seating Arrangement) are placeholders that show a "Coming soon" page.

B.Tech Project I by Durgesh Nama and Yogesh.

---

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 19, Vite, Tailwind CSS 4, React Router 7 (`client/`) |
| Server | Node.js, Express 5, `ws` for WebSockets, `multer` for uploads (`server/`) |
| Solvers and parsers | Python 3 with Google OR-Tools CP-SAT, `pdfplumber`, and poppler's `pdftotext` (`server/optimization/`) |
| Database and auth | Supabase: Postgres, Google OAuth, row-level security |
| Lab PC agent | A single Python file with no dependencies, run as a systemd service |

The Express server starts the Python scripts as child processes. TA allocation
streams solver progress back to the browser as it runs.

## Repository layout

```
client/                     React app
  src/pages/dashboard/      TAAllocation, LabAllocation, LabAutomation (Lab Software Installs)
  src/components/ta/        TA allocation tabs: upload, requirements, run, results, requests
server/
  index.js                  Express app and HTTP/WebSocket server (port 5000)
  routes/                   taRoutes, optimizationRoutes (lab allocation), labAgentRoutes
  services/labAgentHub.js   WebSocket hub that lab PCs and the dashboard connect to
  middleware/requireAuth.js Supabase token check, domain check, role lookup
  db/migrations/            SQL schema (users, TA tables, lab tables, change requests)
  optimization/
    ta_solver.py            TA allocation CP-SAT model
    parse_courses.py        Course list PDF parser (TA module)
    parse_timetable.py      Common timetable PDF parser (TA module)
    lab_allocation/         Lab allocation parsers and CP-SAT solver
    lab_agent/              csdesk_agent.py, installed on each lab PC
Data/                       Original department files (course list, timetable, TA and faculty details)
Test1/                      A complete semester dataset for trying the TA module end to end
Test data/                  Smaller sample CSVs
```

## Prerequisites

- Node.js 20 or newer
- Python 3.10 or newer, with `venv`
- poppler-utils, which provides the `pdftotext` command used by the TA PDF parsers
  (`sudo apt install poppler-utils` on Ubuntu)
- A Supabase project

## Setup

### 1. Supabase

1. Create a Supabase project.
2. Under **Authentication → Providers**, enable Google.
3. Under **Authentication → URL Configuration**, add `http://localhost:5173/auth/callback`
   as a redirect URL. Also add `<your client origin>/auth/callback` for any deployed client.
4. Note the project URL, the publishable (anon) key, and the secret (service role) key.

### 2. Server

```bash
cd server
npm install
cp .env.example .env        # then fill in the values below
```

`server/.env`:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase **secret** key. The server writes tables with it, bypassing row-level security, so never put it in the client. |
| `PORT` | API port, default `5000` |
| `ALLOWED_EMAIL_DOMAIN` | Only accounts on this domain can use the API (default `iitbhilai.ac.in`) |
| `CLIENT_ORIGIN` | Comma-separated client origins allowed by CORS, e.g. `http://localhost:5173` |
| `LAB_AGENT_TOKEN` | Shared secret that lab PC agents must present. Set your own value; the fallback is written in the source code. |
| `PYTHON_PATH` | Optional. Defaults to `server/optimization/venv/bin/python`, then `python3`. |
| `NODE_ENV` | Set to `production` when deployed (see [Before deploying](#before-deploying)) |
| `SUPABASE_DB_URL` or `SUPABASE_ACCESS_TOKEN` | Only needed for `npm run db:migrate`. Use either the Postgres connection string, or a personal access token starting with `sbp_`. |

Create the tables. The migrations are safe to run more than once:

```bash
npm run db:migrate
```

### 3. Python environment

```bash
cd server/optimization
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

The server finds `venv/bin/python` automatically.

### 4. Client

```bash
cd client
npm install
cp .env.example .env
```

`client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable (anon) key |
| `VITE_ALLOWED_EMAIL_DOMAIN` | Domain hint for the Google sign-in screen |
| `VITE_API_BASE_URL` | Leave empty in development: Vite forwards `/api` and `/ws` to the server. Set it to the API's full origin when client and server are deployed separately. |

In development, Vite forwards requests to `http://localhost:5000`. To use a
different address, set `VITE_DEV_API_TARGET` in the shell before running
`npm run dev`.

### 5. Users and roles

Roles are stored in `public.users` (columns `email`, `name`, `role`):

| Role | Access |
|---|---|
| `admin` | Everything: uploads, runs, publishing, request review, lab commands |
| `faculty` | Submit TA requirements for their courses, view allocations, raise change requests |
| `ta` | See their own assignment |
| (none) | Any other `@iitbhilai.ac.in` account is treated as a `student` and can view the published TA allocations |

To make yourself an admin, run this in the Supabase SQL editor:

```sql
insert into public.users (email, name, role)
values ('you@iitbhilai.ac.in', 'Your Name', 'admin')
on conflict (email) do update set role = excluded.role;
```

`npm run seed:faculty` (run in `server/`) adds every faculty member with role
`faculty`. It reads `Test data/faculty.csv`, which must have a `name,email`
header. That file is not in the repository. You can build it from
`Data/Faculty_Details.csv`, which has the same data under different column names.

## Running locally

```bash
# terminal 1
cd server && npm run dev        # http://localhost:5000

# terminal 2
cd client && npm run dev        # http://localhost:5173
```

Open http://localhost:5173 and sign in with an `@iitbhilai.ac.in` Google account.

## Using the modules

### TA Allocation (`/dashboard/ta-allocation`)

1. **Data sources:** upload the course list PDF and the common timetable PDF.
   Then upload CSVs for TA details and M.Tech course registrations.
   `Test1/` has a complete set to try.
2. **Collect requirements:** open the collection window. Each faculty member
   enters how many TAs each course needs and ranks the TAs they prefer.
3. **Run:** the CP-SAT solver runs with live progress. Every course that ends up
   short of its request is listed with the reason.
4. **Results:** review, export to CSV, and publish. After publishing, faculty
   and TAs see their own allocations.
5. **Requests:** faculty can ask to add or remove a TA. The admin approves or
   rejects each request with a remark.

Details: [TA_ALLOCATION.md](TA_ALLOCATION.md).

### Lab Allocation (`/dashboard/lab-allocation`)

1. Upload the course list and timetable PDFs, then add the labs with their
   capacity and whether they have GPUs.
2. Check the parsed data in the Preview tab, then run the solver.
3. Results show a weekly room timetable. Courses too big for any lab are split
   into batches. GPU labs are used for other courses only when no other lab fits.

Details: [LAB_ALLOCATION.md](LAB_ALLOCATION.md).

### Lab Software Installs (`/dashboard/lab-software`)

Install the agent once on each Ubuntu lab PC. The PC must be able to reach the
server on port 5000.

```bash
SERVER=http://<server-ip>:5000
curl -sSL $SERVER/api/lab-automation/install.sh | sudo bash -s -- TL1 $SERVER [PC-NAME]
```

- `TL1` is the lab the PC belongs to.
- `PC-NAME` is optional.

The agent runs as the `csdesk-agent` systemd service. It reconnects on its own
after a reboot or a network drop. Booting into Windows or switching the PC off
simply takes it offline in the dashboard.

In the dashboard:

1. Pick a lab and the PCs you want.
2. Type a command or choose one of the presets.
3. Watch each PC's output line by line.

Only admins can run commands.

To remove the agent from a PC:

```bash
curl -sSL http://<server-ip>:5000/api/lab-automation/uninstall.sh | sudo bash
```

Details:
- [LAB_DEPLOYMENT_AND_TESTING_GUIDE.md](LAB_DEPLOYMENT_AND_TESTING_GUIDE.md)
- [LAB_SOFTWARE_AGENT_PLAN.md](LAB_SOFTWARE_AGENT_PLAN.md)

## Deployment

The client is a static Vite build (`npm run build` in `client/`). `client/vercel.json`
sends every path to `index.html` so routing works on Vercel.

The server is a long-running Node process. It needs Python, the venv,
`pdftotext`, and an open port for the lab agents. That means it cannot run on a
serverless host.

When client and server are on different origins:
- Set `VITE_API_BASE_URL` on the client.
- Add the client origin to `CLIENT_ORIGIN` on the server.

## Before deploying

These are known gaps in the current code. Fix them before running CSDesk where
anyone outside the team can reach it.

- **Testing role switcher:** the sidebar's "Testing Role" switcher sends
  `X-Simulate-Role` and `X-Simulate-User` headers.
  - The server honours them for any signed-in user, even when `NODE_ENV=production`.
  - Without a sign-in, it honours them whenever `NODE_ENV` is not `production`.
  - Remove the switcher, or restrict it to development, before going live.
- **Lab allocation API:** the `/api/optimization/*` routes have no
  authentication check.
- **Lab agent hub:**
  - The dashboard's WebSocket (`/ws/lab-admin`) has no authentication check.
  - `install.sh` can be downloaded without signing in, and it contains `LAB_AGENT_TOKEN`.
  - The agent's blocked-command list matches exact text, so treat it as a
    safety net, not as security.
- **PC renames:** names given to PCs are kept in server memory and are lost when
  the server restarts.
- **Overwritten data file:** each lab allocation run overwrites
  `server/optimization/lab_allocation/dummy_data.json` with the latest input.
