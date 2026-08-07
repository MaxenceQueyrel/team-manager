# /new-endpoint

Scaffold a new FastAPI endpoint in `backend/src/api/v1/`.

## Usage

`/new-endpoint <resource-name>`

Example: `/new-endpoint assignments`

## Steps

1. Create `backend/src/api/v1/<resource>.py` with:
   - A `APIRouter` with prefix `/<resource>` and an appropriate tag.
   - Stub handlers for GET (list), GET (by id), POST, PUT, DELETE — each returning HTTP 501 Not Implemented until implemented.
   - Pydantic request/response models defined at the top of the file (or imported from `api/models/` if a matching model already exists).
2. Register the new router in `backend/src/api/v1/router.py`.
3. Follow the existing patterns in `backend/src/api/v1/` — no deviations.
4. Run `make lint-backend` and fix any issues.
5. Report which files were created or modified.
