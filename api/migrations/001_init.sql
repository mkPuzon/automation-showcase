-- 001_init.sql — initial schema: submitters + projects

CREATE TABLE submitters (
    id          bigserial PRIMARY KEY,
    email       text NOT NULL UNIQUE CHECK (email = lower(email)),
    first_name  text NOT NULL,
    last_name   text NOT NULL,
    -- accumulated across this person's submissions
    departments text[] NOT NULL DEFAULT '{}',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id              bigserial PRIMARY KEY,           -- the numeric "name"
    slug            text NOT NULL UNIQUE,
    title           text NOT NULL,
    body_markdown   text NOT NULL DEFAULT '',        -- sanitized Markdown
    technologies    text[] NOT NULL DEFAULT '{}',
    contributors    text[] NOT NULL DEFAULT '{}',
    department      text NOT NULL,
    submitter_id    bigint NOT NULL REFERENCES submitters (id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'published', 'rejected')),
    source_filename text,
    source_path     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_status_created_idx ON projects (status, created_at DESC);
CREATE INDEX projects_submitter_idx ON projects (submitter_id);
CREATE INDEX submitters_departments_idx ON submitters USING gin (departments);
CREATE INDEX projects_technologies_idx ON projects USING gin (technologies);
