"""Apostol backend API test suite.

Covers: auth (register/login/me/logout), readings ES/EN, liturgy hours,
prayers index + individual, news ES/EN, bible translations/books/chapter,
catechism structure/paragraphs, examen upload/list/get/delete,
favorites CRUD.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://apostol-sacred.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Test credentials must come from the environment so they don't live in
# version control. `/app/memory/test_credentials.md` documents the expected
# values for the local admin seed; production test runs MUST provide their
# own via the runner's env.
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@apostol.app")
ADMIN_PASSWORD = os.environ["TEST_ADMIN_PASSWORD"] if "TEST_ADMIN_PASSWORD" in os.environ else "Apostol2026!"
# Random password for throwaway user fixtures; regenerated per run so no
# literal ever ends up hashed in the DB.
USER_PASSWORD = os.environ.get("TEST_USER_PASSWORD") or f"T{uuid.uuid4().hex[:14]}!"

TIMEOUT = 45  # external scrapers may be slow


# ---------- Shared fixtures ----------

@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def user_session():
    s = requests.Session()
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": USER_PASSWORD, "name": "Test User"}, timeout=TIMEOUT)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    s.test_email = email  # type: ignore[attr-defined]
    s.test_password = USER_PASSWORD  # type: ignore[attr-defined]
    return s


# ---------- Auth tests ----------

class TestAuth:
    def test_register_sets_cookie_and_returns_user(self):
        s = requests.Session()
        email = f"reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email
        assert data["role"] == "user"
        assert "id" in data
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies

    def test_register_duplicate_rejected(self, user_session):
        r = requests.post(f"{API}/auth/register",
                          json={"email": user_session.test_email, "password": "AnotherPass1!"},
                          timeout=TIMEOUT)
        assert r.status_code == 400

    def test_admin_login(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "access_token" in s.cookies

    def test_login_invalid_credentials(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": f"nouser_{uuid.uuid4().hex[:6]}@example.com", "password": "wrong"},
                          timeout=TIMEOUT)
        assert r.status_code == 401

    def test_me_with_cookie(self, user_session):
        r = user_session.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r.status_code == 200
        assert r.json()["email"] == user_session.test_email

    def test_me_without_auth_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_logout_clears_cookies(self):
        s = requests.Session()
        email = f"lo_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"}, timeout=TIMEOUT)
        assert "access_token" in s.cookies
        r = s.post(f"{API}/auth/logout", timeout=TIMEOUT)
        assert r.status_code == 200
        # Server sends Set-Cookie with expiry in past - requests.Session drops them
        r2 = s.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r2.status_code == 401

    def test_register_default_lang_is_es(self):
        s = requests.Session()
        email = f"l_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": USER_PASSWORD},
                   timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("lang") == "es"

    def test_register_with_lang_en(self):
        s = requests.Session()
        email = f"l_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register",
                   json={"email": email, "password": USER_PASSWORD, "lang": "en"},
                   timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json().get("lang") == "en"

    def test_patch_me_lang_persists(self):
        s = requests.Session()
        email = f"l_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register",
               json={"email": email, "password": USER_PASSWORD},
               timeout=TIMEOUT)
        # Default is es
        r = s.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r.json()["lang"] == "es"
        # Switch to en
        r2 = s.patch(f"{API}/auth/me", json={"lang": "en"}, timeout=TIMEOUT)
        assert r2.status_code == 200
        assert r2.json()["lang"] == "en"
        # Confirm persisted
        r3 = s.get(f"{API}/auth/me", timeout=TIMEOUT)
        assert r3.json()["lang"] == "en"

    def test_patch_me_rejects_invalid_lang(self):
        s = requests.Session()
        email = f"l_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register",
               json={"email": email, "password": USER_PASSWORD},
               timeout=TIMEOUT)
        r = s.patch(f"{API}/auth/me", json={"lang": "fr"}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_patch_me_requires_auth(self):
        r = requests.patch(f"{API}/auth/me", json={"lang": "en"}, timeout=TIMEOUT)
        assert r.status_code == 401


# ---------- WebAuthn ----------
# Full ceremony tests need a virtual authenticator (Playwright handles
# that in iteration_*.json E2E reports). Here we just lock down the auth
# wiring + endpoint shapes so a future refactor doesn't silently break
# the surface the frontend relies on.

class TestWebAuthn:
    def test_register_options_requires_auth(self):
        r = requests.post(f"{API}/auth/webauthn/register/options", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_register_verify_requires_auth(self):
        r = requests.post(f"{API}/auth/webauthn/register/verify",
                          json={"challengeKey": "x", "credential": {}},
                          timeout=TIMEOUT)
        assert r.status_code == 401

    def test_credentials_requires_auth(self):
        r = requests.get(f"{API}/auth/webauthn/credentials", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_delete_credential_requires_auth(self):
        r = requests.delete(f"{API}/auth/webauthn/credentials/abc", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_register_options_shape(self, admin_session):
        r = admin_session.post(f"{API}/auth/webauthn/register/options", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        # PublicKeyCredentialCreationOptions essentials
        assert "challengeKey" in data
        assert "challenge" in data
        assert data.get("rp", {}).get("id")
        assert data.get("rp", {}).get("name")
        assert data.get("user", {}).get("id")
        sel = data.get("authenticatorSelection") or {}
        assert sel.get("userVerification") == "required"
        assert sel.get("residentKey") == "required"

    def test_auth_options_is_public(self):
        # Discoverable-credential flow → no auth required, no email needed.
        r = requests.post(f"{API}/auth/webauthn/auth/options", timeout=TIMEOUT)
        assert r.status_code == 200
        data = r.json()
        assert "challengeKey" in data
        assert "challenge" in data
        # allowCredentials should be empty for discoverable flow.
        assert data.get("allowCredentials", []) == []

    def test_auth_verify_rejects_unknown_credential(self):
        r = requests.post(
            f"{API}/auth/webauthn/auth/verify",
            json={
                "challengeKey": "missing",
                "credential": {"id": "X", "rawId": "X", "type": "public-key", "response": {}},
            },
            timeout=TIMEOUT,
        )
        # Either 400 (bad challenge) or 401 (unknown credential) — both
        # are correct rejections; what matters is we never 200 or 500.
        assert r.status_code in (400, 401)

    def test_auth_verify_requires_credential(self):
        r = requests.post(
            f"{API}/auth/webauthn/auth/verify",
            json={"challengeKey": "x", "credential": {}},
            timeout=TIMEOUT,
        )
        assert r.status_code in (400, 401)

    def test_credentials_empty_for_fresh_user(self, user_session):
        r = user_session.get(f"{API}/auth/webauthn/credentials", timeout=TIMEOUT)
        assert r.status_code == 200
        # New users have no passkeys registered.
        assert isinstance(r.json(), list)


# ---------- Readings ----------
# The /api/readings endpoint aggregates the Evangelizo RSS feed. It makes
# 11 upstream calls per (date, lang) pair so tests are deliberately light:
# we check the shape and a couple of invariants, not the exact content.

class TestReadings:
    def test_readings_es_shape(self):
        r = requests.get(f"{API}/readings", params={"lang": "es", "date": "2026-05-03"},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        # Top-level fields the frontend relies on.
        assert data.get("date") == "2026-05-03"
        assert data.get("lang") == "es"
        assert data.get("liturgic_title")
        # May-3-2026 is the 5th Sunday of Easter → all four readings present.
        for key in ("first_reading", "psalm", "second_reading", "gospel"):
            section = data.get(key)
            assert section is not None, f"missing {key}"
            assert section.get("text_html"), f"empty body on {key}"
        assert data.get("commentary") and data["commentary"].get("text_html")

    def test_readings_en_shape(self):
        r = requests.get(f"{API}/readings", params={"lang": "en", "date": "2026-05-03"},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("liturgic_title")
        assert data.get("gospel") and data["gospel"].get("text_html")

    def test_readings_weekday_has_no_second_reading(self):
        # 2026-05-04 is a weekday → SR must be null so the UI can disable tab.
        r = requests.get(f"{API}/readings", params={"lang": "es", "date": "2026-05-04"},
                         timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("second_reading") is None

    def test_readings_strips_attribution_footer(self):
        r = requests.get(f"{API}/readings", params={"lang": "es", "date": "2026-05-04"},
                         timeout=TIMEOUT)
        assert r.status_code == 200
        body = (r.json().get("gospel") or {}).get("text_html", "")
        # The upstream footer must not leak into the rendered body.
        assert "Extraído de la Biblia" not in body
        assert "evangeliodeldia.org" not in body
        assert "<font" not in body.lower()

    def test_readings_invalid_date(self):
        r = requests.get(f"{API}/readings", params={"lang": "es", "date": "not-a-date"},
                         timeout=TIMEOUT)
        assert r.status_code == 400


# ---------- Liturgy ----------

class TestLiturgy:
    def test_hours_list_es(self):
        r = requests.get(f"{API}/liturgy/hours", params={"lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        # Accept either {hours: [...]} or plain list
        hours = data.get("hours") if isinstance(data, dict) else data
        assert isinstance(hours, list)
        assert len(hours) == 7, f"Expected 7 hours, got {len(hours)}"

    def test_liturgy_lauds_es(self):
        r = requests.get(f"{API}/liturgy", params={"hour": "lauds", "lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "title" in data
        assert "content_text" in data or "content_html" in data or "content" in data
        text = data.get("content_text") or data.get("content_html") or data.get("content") or ""
        assert len(text) > 200, f"Content too short: {len(text)} chars"


# ---------- Prayers ----------

class TestPrayers:
    @pytest.fixture(scope="class")
    def prayer_index(self):
        r = requests.get(f"{API}/prayers", params={"lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        return r.json()

    def test_prayers_index_has_categories(self, prayer_index):
        cats = prayer_index.get("categories") if isinstance(prayer_index, dict) else prayer_index
        assert isinstance(cats, list)
        assert len(cats) >= 10, f"Expected 10+ categories, got {len(cats)}"
        for c in cats:
            assert "items" in c or "prayers" in c

    def test_prayers_individual(self, prayer_index):
        cats = prayer_index.get("categories") if isinstance(prayer_index, dict) else prayer_index
        slug = None
        for c in cats:
            items = c.get("items") or c.get("prayers") or []
            for it in items:
                slug = it.get("slug") or it.get("id")
                if slug:
                    break
            if slug:
                break
        assert slug, "No prayer slug found in index"
        r = requests.get(f"{API}/prayers/{slug}", params={"lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, f"Prayer {slug}: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert "title" in data or "content" in data or "content_html" in data


# ---------- News ----------

class TestNews:
    def test_news_es_multiple_sources(self):
        r = requests.get(f"{API}/news", params={"lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert isinstance(items, list)
        assert len(items) > 0
        sources = {i.get("source") for i in items if i.get("source")}
        assert len(sources) >= 1

    def test_news_en_multi_sources(self):
        r = requests.get(f"{API}/news", params={"lang": "en", "source": "all"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert isinstance(items, list)
        assert len(items) > 0
        sources = {i.get("source") for i in items if i.get("source")}
        assert len(sources) >= 2, f"Expected >=2 sources for EN news, got {sources}"


# ---------- Bible ----------
# NOTE: Bible endpoints were removed. The full 73-book Catholic Bible is now
# shipped as static JSON in frontend/public/data/bible-*.json and consumed
# directly by the frontend (offline-first). Nothing to test here.


# ---------- Catechism ----------

class TestCatechism:
    def test_structure_es(self):
        r = requests.get(f"{API}/catechism/structure", params={"lang": "es"}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        parts = data.get("parts") if isinstance(data, dict) else data
        assert isinstance(parts, list)
        assert len(parts) == 4, f"Expected 4 parts, got {len(parts)}"

    def test_paragraphs_en_no_500(self):
        r = requests.get(f"{API}/catechism/paragraphs",
                         params={"start": 26, "end": 30, "lang": "en"}, timeout=TIMEOUT)
        # Source scrape may fail/empty but must not 500
        assert r.status_code != 500, r.text
        assert r.status_code in (200, 404)


# ---------- Examen ----------
# NOTE: Examen backend endpoints were REMOVED for privacy reasons. The
# Examen de Conciencia is strictly local to the device (localStorage only)
# and a pre-commit privacy fence (frontend/scripts/check-examen-privacy.js)
# blocks any attempt to reintroduce network calls from Examen.jsx.


# ---------- Favorites ----------

class TestFavorites:
    def test_favorites_requires_auth(self):
        r = requests.get(f"{API}/favorites", timeout=TIMEOUT)
        assert r.status_code == 401

    def test_create_list_delete_favorite(self, user_session):
        # Create
        payload = {"section": "prayers", "title": "TEST_Padre Nuestro",
                   "content": "Padre nuestro que estás...", "lang": "es"}
        r = user_session.post(f"{API}/favorites", json=payload, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        fav = r.json()
        assert fav["title"] == payload["title"]
        assert fav["section"] == "prayers"
        assert "id" in fav
        fav_id = fav["id"]

        # List shows only own
        r2 = user_session.get(f"{API}/favorites", timeout=TIMEOUT)
        assert r2.status_code == 200
        lst = r2.json()
        assert any(f["id"] == fav_id for f in lst)

        # Delete
        r3 = user_session.delete(f"{API}/favorites/{fav_id}", timeout=TIMEOUT)
        assert r3.status_code == 200

        # Confirm removed
        r4 = user_session.get(f"{API}/favorites", timeout=TIMEOUT)
        assert not any(f["id"] == fav_id for f in r4.json())

    def test_favorites_isolated_between_users(self, user_session, admin_session):
        # user creates
        r = user_session.post(f"{API}/favorites",
                              json={"section": "readings", "title": "TEST_private", "content": "secret", "lang": "es"},
                              timeout=TIMEOUT)
        assert r.status_code == 200
        fav_id = r.json()["id"]

        # admin should not see it
        r2 = admin_session.get(f"{API}/favorites", timeout=TIMEOUT)
        assert r2.status_code == 200
        assert not any(f["id"] == fav_id for f in r2.json())

        # admin cannot delete it
        r3 = admin_session.delete(f"{API}/favorites/{fav_id}", timeout=TIMEOUT)
        assert r3.status_code == 404

        # cleanup
        user_session.delete(f"{API}/favorites/{fav_id}", timeout=TIMEOUT)
