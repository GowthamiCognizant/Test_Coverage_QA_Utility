# QA Coverage Utility

AI-powered web application for test coverage gap analysis, script generation, and report export.

---

## What it does

- Upload Jira Excel/CSV (defects, enhancements, regression TCs)
- Upload or paste feature files directly in the browser
- Run AI-powered flow-wise gap analysis
- Auto-generate BDD feature files + pytest-bdd step definitions for uncovered flows
- Export Word coverage report
- Multi-user with per-account project isolation

---

## Project structure

```
qa-utility/
├── backend/
│   ├── main.py              ← FastAPI app (all API routes)
│   ├── auth.py              ← JWT login/register
│   ├── file_parser.py       ← Excel/CSV and .feature file parser
│   ├── analyzer.py          ← Coverage gap analysis engine
│   ├── generator.py         ← Feature file + step def generator
│   ├── report_generator.py  ← Word document export
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx            ← Auth context, routing, API helper
        ├── components/
        │   ├── Sidebar.jsx
        │   ├── Topbar.jsx
        │   └── ProjectSelector.jsx
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Upload.jsx         ← Jira Excel/CSV + step def upload
            ├── FeatureFiles.jsx   ← Upload or paste feature files
            ├── Analysis.jsx       ← Run analysis, view gaps, generate
            └── GeneratedScripts.jsx ← Download generated files
```

---

## Setup steps

### Prerequisites
- Python 3.10+
- Node.js 18+
- pip and npm

---

### Step 1 — Clone or copy the project

```bash
# If you have git:
git clone <your-repo-url> qa-utility
cd qa-utility

# Or just place the qa-utility/ folder anywhere on your machine
```

---

### Step 2 — Set up the backend

```bash
cd backend

# Create a virtual environment (recommended)
python -m venv venv

# Activate it
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

#SSL error - run this below command for installing requirements.tx
pip install -r requirements.txt --trusted-host pypi.org --trusted-host files.pythonhosted.org --trusted-host pypi.python.org
```

---

### Step 3 — Start the backend server

```bash
# Still inside backend/ with venv active
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

The API docs are available at: http://localhost:8000/docs

---

### Step 4 — Set up the frontend

Open a new terminal window:

```bash
cd frontend
npm install
```

---

### Step 5 — Start the frontend

```bash
npm run dev
```

You should see:
```
  VITE v5.x  ready in ...ms
  ➜  Local:   http://localhost:3000/
```

Open http://localhost:3000 in your browser.

---

### Step 6 — First-time use

1. Click **Register** and create your account (username, team name, password)
2. After login, click **Create** to create your first project (e.g. "Message Center Module")
3. Go to **Upload files** → drop your Jira Excel/CSV files
4. Go to **Feature files** → upload your .feature files OR paste content directly
5. Optionally upload your existing step definition .py files (improves generation quality)
6. Go to **Gap analysis** → click **Run analysis**
7. Review uncovered flows → click **Generate scripts**
8. Go to **Generated scripts** → download individual files or **Download all** as a zip
9. Click **Export report** to download a Word coverage document

---

## Multiple users

Each registered account gets completely isolated storage. Different team members can:
- Create their own accounts
- Work on separate projects simultaneously
- Share the same server instance

---

## Customising the analyzer

To tune how flows are grouped, edit `backend/analyzer.py`:

```python
flow_keywords = {
    "Your custom flow name": ["keyword1", "keyword2", "regex pattern"],
    ...
}
```

Keywords support basic regex (e.g. `"count.*filter"` matches "count updated based on filter").

---

## Environment variables (production)

For production deployment, replace the hardcoded secret in `auth.py`:

```python
SECRET_KEY = os.environ.get("QA_SECRET_KEY", "fallback-secret")
```

And add a `.env` file:
```
QA_SECRET_KEY=your-long-random-secret-key
```

---

## Deployment options

### Local (single machine)
- Run backend: `python main.py`
- Run frontend: `npm run dev`

### Team server (Linux)
```bash
# Backend — run as a service
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000

# Frontend — build and serve
npm run build
npx serve dist -p 3000
```

### Docker (optional)
A `Dockerfile` can be added per service. Backend uses Python slim image, frontend uses Node then nginx.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error in browser | Make sure backend is on port 8000 and frontend on port 3000 |
| `bcrypt` install fails on Windows | Run: `pip install bcrypt --pre` |
| Excel parse errors | Ensure your Jira export has a "Work Key" or "Summary" column |
| Feature file not parsed | File must use `.feature` or `.Feature` extension |
| Token expired | Sign out and sign back in (tokens expire after 24 hours) |
