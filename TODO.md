# MVP — Working skeleton with all services running and connected with dummy data

- Minimal Explore page at `http://localhost:5173/`
- Project detail pages at `/projects/id`
- Submission form at `http://localhost:5173/submit`
- Admin login and editing page at `http://localhost:5173/admin` (not linked in the public navigation)
- PostgreSQL-backed projects
- Project submission API
- Staff email validation using the `letters@colby.edu` convention
- Project fields for title, Markdown description, contributors, tools, department, and submitter email
- `pending`, `approved`, and `rejected` project statuses
- Public API that exposes approved projects only
- Individual project detail slugs based on project title, submission date, and a collision-safe ID
- Admin password login using an HttpOnly cookie
- Admin project editing, status changes, and deletion
- Sanitized Markdown rendering, including links and images
- Seven local seed projects (six approved and one pending)
- Separate production-style and local Docker Compose files

# v0.2.0 — First usable user flows to add projects and admin flows to edit and approve projects