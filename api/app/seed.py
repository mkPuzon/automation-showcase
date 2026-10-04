"""Dev seed: 3 published + 1 pending project across 3 submitters.

Run after the API has started once (migrations applied):

    cd api && uv run python -m app.seed

Wipes the two tables first — dev only, never point this at a real deployment.
"""

import asyncio
from datetime import date

import psycopg
from psycopg.rows import dict_row

from .config import get_settings
from .slugs import build_slug

# (email, first, last, departments) — the first submitter spans two departments, which is
# what submitters.departments (accumulated across submissions) exists for.
SUBMITTERS: list[tuple[str, str, str, list[str]]] = [
    (
        "mdubois@colby.edu",
        "Marie",
        "Dubois",
        ["Computing Services", "Digital Learning"],
    ),
    ("jchen@colby.edu", "Jessie", "Chen", ["Computational Science"]),
    ("ataylor@colby.edu", "April", "Taylor", ["Environmental Studies"]),
]

# (submitter_index, title, department, technologies, contributors, status, date, markdown)
PROJECTS: list[tuple[int, str, str, list[str], list[str], str, date, str]] = [
    (
        0,
        "Auto-filling the Faculty Directory Update Form",
        "Computing Services",
        ["Python", "Google Sheets", "Cron"],
        ["Karen Vreeland"],
        "published",
        date(2026, 9, 18),
        """Every January I retype the same 400 rows into the faculty directory form. This script
reads the roster Google Sheet, formats each row, and posts it to the form endpoint.

## What you need

- The roster sheet shared with you as a viewer
- Your own Colby `applications` service account (ask Computing Services)

## Steps

1. Download the sheet as `.csv` into `~/directory/roster.csv`.
2. Edit the `DEPARTMENT_MAP` at the top of the script to match your unit names.
3. Run it with `python post_directory.py --dry-run` first; it prints what it *would* send.

## Gotchas

- The form silently drops rows with a comma in the title field — the script quotes them using the
  standard [csv module](https://docs.python.org/3/library/csv.html).
- Nothing here writes to Workday; it only fills the public directory form.

> Took about 2 hours to write, saves me roughly a day every January.
""",
    ),
    (
        1,
        "Grading 120 Lab Reports with a Rubric Macro",
        "Computational Science",
        ["Python", "pandas", "Google Docs"],
        [],
        "published",
        date(2026, 10, 1),
        """A short macro plus a CSV of comment snippets that turns my rubric into reusable
feedback blocks. Students get consistent wording; I stop typing "see page 3" 60 times.

## The idea

1. Keep every rubric comment in `comments.csv` with an id, e.g. `R3-plot-axis`.
2. In the grading sheet, type the ids separated by semicolons: `R3-plot-axis;R4-stats`.
3. The script expands ids into the full comment text and appends the point total.

## Files

| File | Purpose |
| --- | --- |
| `comments.csv` | rubric ids and text |
| `expand_feedback.py` | the script itself |

Run it as `python expand_feedback.py grades.csv comments.csv > feedback.txt` and paste the
output into the returned assignment.
""",
    ),
    (
        2,
        "Cleaning Up Watershed Sensor Exports Before Class",
        "Environmental Studies",
        ["R", "tidyverse", "Google Sheets"],
        ["Owen Brantley", "Sana Iqbal"],
        "published",
        date(2026, 9, 29),
        """The oddson-meter exports come out as one 40,000-row CSV with a new header every time the
logger reconnects. This R script drops the repeated headers, converts timestamps to Eastern,
and writes one tidy sheet per sensor so students start from clean data.

## Using it

```r
source("clean_sensors.R")
clean_all("Downloads/oddson_export.csv", out_dir = "class/data")
```

## Notes

- Sensor 4 has drifted; the script flags rows outside 2-14 NTU instead of deleting them.
- If a deployment has no rows after cleaning, you probably pointed it at the wrong season.
""",
    ),
    (
        0,
        "Batch Renaming Scanned Syllabi for the Library Drive",
        "Digital Learning",
        ["Power Automate", "Naming conventions"],
        ["Miller Library digitization team"],
        "pending",
        date(2026, 10, 2),
        """A Power Automate flow that renames scanned syllabi to `TERM_DEPT_COURSE_SECTION.pdf` as
they land in the shared folder, so the library drive stays sortable.

## Flow outline

1. Trigger: a file is created in the `Inbox` folder.
2. Compose: split the original filename on underscores, validate four parts.
3. Rename, then move to the term folder.

Anything that fails validation moves to `Needs-a-human` rather than being renamed wrong.
""",
    ),
]


async def seed() -> None:
    settings = get_settings()
    async with await psycopg.AsyncConnection.connect(
        settings.database_url, row_factory=dict_row, autocommit=False
    ) as conn:
        await conn.execute("TRUNCATE projects, submitters RESTART IDENTITY CASCADE")

        submitter_ids: list[int] = []
        for email, first, last, departments in SUBMITTERS:
            cursor = await conn.execute(
                """
                INSERT INTO submitters (email, first_name, last_name, departments)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (email.lower(), first, last, departments),
            )
            submitter_ids.append((await cursor.fetchone())["id"])

        counts: dict[str, int] = {}
        for (
            submitter_index,
            title,
            department,
            technologies,
            contributors,
            status,
            created_on,
            body,
        ) in PROJECTS:
            await conn.execute(
                """
                INSERT INTO projects
                    (slug, title, body_markdown, technologies, contributors,
                     department, submitter_id, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    build_slug(title, created_on),
                    title,
                    body.strip(),
                    technologies,
                    contributors,
                    department,
                    submitter_ids[submitter_index],
                    status,
                    created_on,
                    created_on,
                ),
            )
            counts[status] = counts.get(status, 0) + 1
        await conn.commit()

    summary = ", ".join(f"{count} {status}" for status, count in sorted(counts.items()))
    print(f"seeded {len(PROJECTS)} projects ({summary}) for {len(SUBMITTERS)} submitters")


if __name__ == "__main__":
    asyncio.run(seed())
