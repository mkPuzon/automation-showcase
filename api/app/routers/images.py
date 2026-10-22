from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from .. import db

router = APIRouter(tags=["images"])

@router.get("/images/{img_uuid}")
async def get_image(img_uuid: str):
    async with db.connection() as conn:
        cur = await conn.execute(
            "SELECT mime_type, data FROM project_images WHERE uuid = %s", (img_uuid,)
        )
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="image not found")
    return Response(content=bytes(row["data"]), media_type=row["mime_type"])
