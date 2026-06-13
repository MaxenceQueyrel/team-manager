from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.core.config import get_configs
from api.v1.router import router as v1_router

settings = get_configs()

app = FastAPI(
    title="Team Manager API",
    version="0.1.0",
    description="Team management with Operations Research optimization",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
