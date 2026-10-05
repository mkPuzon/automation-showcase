"""The uploads volume: the original `.docx` behind each submission.

Nothing about a stored key comes from the browser. The client's filename is kept only as
`projects.source_filename` for display; on disk the key is `<YYYY>/<MM>/<short-id>-<slug>.docx`,
so a name like `../../etc/passwd.docx` cannot escape the directory.
"""

from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path

from .slugs import short_id, slugify

log = logging.getLogger("techshare.uploads")

MAX_KEY_BASENAME = 60


class UploadError(Exception):
    """The file could not be written. `.message` is safe to show the submitter."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UploadStore:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root)

    def _resolve(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise UploadError("That upload key is outside the uploads directory.")
        return path

    def save(self, *, original_filename: str | None, created_on: date, data: bytes) -> str:
        """Write the bytes under a generated key and return that key (`projects.source_path`)."""
        basename = slugify(Path(original_filename or "").stem)[:MAX_KEY_BASENAME] or "submission"
        key = f"{created_on:%Y/%m}/{short_id()}-{basename}.docx"
        path = self._resolve(key)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            # 0o600: this is staff-authored content on a shared host, and only the API reads it.
            with open(path, "wb") as handle:
                handle.write(data)
            os.chmod(path, 0o600)
        except OSError as exc:
            log.error("could not write %s: %s", path.name, exc.strerror)
            raise UploadError(
                "The upload could not be stored. Try again in a moment; if it keeps failing, tell "
                "Computing Services."
            ) from exc
        return key

    def delete(self, key: str) -> None:
        """Best-effort cleanup when the database write that follows fails."""
        try:
            self._resolve(key).unlink(missing_ok=True)
        except OSError as exc:  # a leftover file is not worth failing the request over
            log.warning("could not remove orphaned upload %s: %s", key, exc)


_upload_store: UploadStore | None = None


def get_upload_store() -> UploadStore:
    global _upload_store
    if _upload_store is None:
        from .config import get_settings

        _upload_store = UploadStore(get_settings().upload_dir)
    return _upload_store
