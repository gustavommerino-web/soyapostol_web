from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import asyncio
import logging
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

from auth import router as auth_router, seed_admin, ensure_indexes
from liturgy import router as liturgy_router
from prayers import router as prayers_router, seed_prayers_if_empty
from news import router as news_router
from catechism import router as catechism_router
from favorites import router as favorites_router
from readings import router as readings_router
from webauthn_routes import router as webauthn_router, ensure_indexes as ensure_webauthn_indexes

# MongoDB
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Apostol API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Apostol API", "status": "ok"}


# Mount sub-routers under /api
api_router.include_router(auth_router)
api_router.include_router(liturgy_router)
api_router.include_router(prayers_router)
api_router.include_router(news_router)
api_router.include_router(catechism_router)
api_router.include_router(favorites_router)
api_router.include_router(readings_router)
api_router.include_router(webauthn_router)

app.include_router(api_router)

# Production origins that should always be allowed for the deployed app.
# Baked in so that redeploying "just works" with the public domain, no env vars needed.
_PRODUCTION_ORIGINS = [
    "https://soyapostol.org",
    "https://www.soyapostol.org",
]

_env_origins = [o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip() and o.strip() != "*"]

# Always allow the production domain(s) + anything the user configured via env.
# Starlette's CORSMiddleware with an explicit list returns Access-Control-Allow-Origin:
# <exact origin> when credentials are allowed, which is what browsers require.
_allow_origins = list(dict.fromkeys(_PRODUCTION_ORIGINS + _env_origins))

# Regex fallback: allow *.emergent.host and *.emergentagent.com (Emergent preview/prod
# URLs) so the app works during development too. Matches against the Origin header.
_allow_origin_regex = r"^https://([a-z0-9-]+\.)*(emergent\.host|emergentagent\.com|soyapostol\.org)$"

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_allow_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Share db via app.state
app.state.db = db

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    await ensure_indexes(db)
    await ensure_webauthn_indexes(db)
    await seed_admin(db)
    # Indexes for the prayers collection
    await db.prayers.create_index([("lang", 1), ("slug", 1)], unique=True)
    await db.prayers.create_index([("lang", 1), ("category", 1)])
    # One-time prayer seed from aciprensa. Runs in the background so it never
    # blocks startup; subsequent boots find a non-empty collection and skip.
    asyncio.create_task(seed_prayers_if_empty(db))
    logger.info("Apostol API started")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
