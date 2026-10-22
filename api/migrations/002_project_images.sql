-- 002_project_images.sql — images extracted from .docx write-ups

CREATE TABLE project_images (
    id          bigserial PRIMARY KEY,
    project_id  bigint NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    uuid        uuid NOT NULL UNIQUE,
    position    int NOT NULL DEFAULT 0,
    mime_type   text NOT NULL,
    data        bytea NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_images_project_idx ON project_images (project_id);
CREATE INDEX project_images_uuid_idx ON project_images (uuid);
