"""Catholic News aggregator — Vatican News + ACI Prensa / CNA RSS feeds.

Two official feeds per language, unified through a single normalizer that
exposes image, title, summary and publish date. The frontend exposes
three tabs: Vatican, ACI/CNA, and All (merged chronologically).
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import re

import feedparser
import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Request, Query

router = APIRouter(prefix="/news", tags=["news"])

# Each language has two feeds keyed by a stable id used as the tab value
# on the frontend. "aci" is Spanish; the English tab maps to CNA/EWTN News
# which is the sister publication of ACI Prensa.
FEEDS = {
    "es": {
        "vatican": {
            "label": "Vatican News",
            "url": "https://www.vaticannews.va/es.rss.xml",
            "link": "https://www.vaticannews.va/es.html",
        },
        "aci": {
            "label": "ACI Prensa",
            "url": "https://www.aciprensa.com/rss/news",
            "link": "https://www.aciprensa.com/",
        },
    },
    "en": {
        "vatican": {
            "label": "Vatican News",
            "url": "https://www.vaticannews.va/en.rss.xml",
            "link": "https://www.vaticannews.va/en.html",
        },
        "aci": {
            "label": "EWTN News",
            "url": "https://www.ewtnnews.com/rss?redirectedfrom=cna",
            "link": "https://www.ewtnnews.com/",
        },
    },
}

CACHE_TTL = timedelta(minutes=30)
MAX_ITEMS = 10

_IMG_SRC_RE = re.compile(r'<img[^>]+src="([^"]+)"', re.IGNORECASE)


async def _fetch_feed(url: str) -> bytes:
    try:
        async with httpx.AsyncClient(
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (ApostolApp)"},
        ) as client:
            r = await client.get(url)
            if r.status_code < 400:
                return r.content
    except Exception:
        pass
    return b""


def _extract_image(entry) -> Optional[str]:
    """Best-effort image extraction across different RSS conventions."""
    for m in (entry.get("media_content") or []):
        url = m.get("url")
        if url:
            return url
    for enc in (entry.get("enclosures") or []):
        url = enc.get("href") or enc.get("url")
        ctype = (enc.get("type") or "").lower()
        if url and (ctype.startswith("image/") or
                    url.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))):
            return url
    # <content:encoded> (feedparser -> entry.content) — ACI, CNA, etc.
    content_list = entry.get("content") or []
    for c in content_list:
        value = c.get("value", "") if isinstance(c, dict) else ""
        m = _IMG_SRC_RE.search(value or "")
        if m:
            return m.group(1)
    # Last resort: inline <img> inside the summary/description HTML.
    m = _IMG_SRC_RE.search(entry.get("summary", "") or entry.get("description", "") or "")
    if m:
        return m.group(1)
    return None


def _normalize_summary(entry) -> str:
    summary_html = entry.get("summary", "") or entry.get("description", "") or ""
    if not summary_html:
        return ""
    text = BeautifulSoup(summary_html, "lxml").get_text(" ", strip=True)
    # Strip the Vatican News "Read all / Leer todo" anchors.
    text = re.sub(r"\s*(Read all|Leer todo|Ler tudo|Lire tout)\s*$", "",
                  text, flags=re.IGNORECASE)
    return text.strip()[:400]


def _to_iso(entry) -> str:
    published = entry.get("published") or entry.get("updated") or ""
    try:
        pp = entry.get("published_parsed") or entry.get("updated_parsed")
        if pp:
            return datetime(*pp[:6], tzinfo=timezone.utc).isoformat()
    except Exception:
        pass
    return published


async def _fetch_source(lang: str, source_id: str) -> list[dict]:
    feed = FEEDS.get(lang, {}).get(source_id)
    if not feed:
        return []
    data = await _fetch_feed(feed["url"])
    if not data:
        return []
    parsed = feedparser.parse(data)
    items: list[dict] = []
    for entry in parsed.entries[:MAX_ITEMS]:
        items.append({
            "source": feed["label"],
            "source_id": source_id,
            "title": (entry.get("title", "") or "").strip(),
            "link": entry.get("link", "") or "",
            "summary": _normalize_summary(entry),
            "published": _to_iso(entry),
            "image": _extract_image(entry),
        })
    return items


async def _get_cached(db, cache_key: str, refresh: bool, fetcher):
    doc = await db.news_cache.find_one({"_id": cache_key})
    if doc and not refresh:
        try:
            ts = datetime.fromisoformat(doc.get("fetched_at"))
            if datetime.now(timezone.utc) - ts < CACHE_TTL:
                return doc
        except Exception:
            pass
    items = await fetcher()
    if not items and doc:  # transient failure — keep previous cache
        items = doc.get("items", [])
    fresh = {
        "_id": cache_key,
        "items": items,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.news_cache.replace_one({"_id": cache_key}, fresh, upsert=True)
    return fresh


@router.get("")
async def get_news(
    request: Request,
    lang: str = Query("es"),
    source: str = Query("vatican"),
    refresh: bool = Query(False),
):
    if lang not in ("es", "en"):
        lang = "es"
    if source not in ("vatican", "aci", "all"):
        source = "vatican"

    db = request.app.state.db

    if source == "all":
        # Fetch each source through its own cache entry, then merge.
        v = await _get_cached(
            db, f"news_v2_{lang}_vatican", refresh,
            lambda: _fetch_source(lang, "vatican"),
        )
        a = await _get_cached(
            db, f"news_v2_{lang}_aci", refresh,
            lambda: _fetch_source(lang, "aci"),
        )
        merged = (v.get("items", []) + a.get("items", []))
        merged.sort(key=lambda x: x.get("published") or "", reverse=True)
        return {
            "lang": lang,
            "source": "all",
            "items": merged[:MAX_ITEMS * 2],
            "fetched_at": max(v.get("fetched_at", ""), a.get("fetched_at", "")),
        }

    doc = await _get_cached(
        db, f"news_v2_{lang}_{source}", refresh,
        lambda: _fetch_source(lang, source),
    )
    return {
        "lang": lang,
        "source": source,
        "items": doc.get("items", []),
        "fetched_at": doc.get("fetched_at"),
    }
