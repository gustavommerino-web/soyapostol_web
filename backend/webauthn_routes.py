"""WebAuthn / Passkey authentication (Face ID, Touch ID, Windows Hello).

Adds a SECOND auth method on top of the existing password flow. Users opt
in via /api/auth/webauthn/register/* after a normal login, then on future
visits hit /api/auth/webauthn/auth/* to sign in with biometrics — no
email or password required (discoverable credential / resident-key flow).

Endpoints (all under /api/auth/webauthn):

    POST   /register/options       (auth required) → PublicKeyCredentialCreationOptions
    POST   /register/verify        (auth required) → {ok:true, credential:{...}}
    POST   /auth/options                            → PublicKeyCredentialRequestOptions
    POST   /auth/verify                             → {user:{...}}  + cookies
    GET    /credentials            (auth required) → list of registered devices
    DELETE /credentials/{cid}      (auth required) → remove one device

Storage:
    users.webauthn_credentials = [
        { credential_id, public_key, sign_count, transports,
          device_name, created_at, last_used_at, aaguid }
    ]
    webauthn_challenges  (TTL 5min) = { _id, user_id?, kind, challenge,
                                        created_at }

Challenges are stored in MongoDB (not session middleware) keyed by a
random opaque ID returned to the client in the options payload as
`challengeKey`. The client echoes it on /verify so the server can locate
and consume the exact challenge.
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes
from webauthn.helpers.structs import (
    AuthenticatorAttachment,
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    set_auth_cookies,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/webauthn", tags=["webauthn"])

CHALLENGE_TTL_SECONDS = 300  # 5 minutes

# RP ID + allowed origins are env-driven so prod (soyapostol.org) and
# preview (apostol-sacred.preview.emergentagent.com) can each run with
# their own values without code changes.
def _rp_id() -> str:
    rp = os.environ.get("WEBAUTHN_RP_ID")
    if not rp:
        # Fall back to deriving from the public backend URL so the preview
        # works out-of-the-box without needing extra env vars.
        host = os.environ.get("PUBLIC_BACKEND_HOST", "").strip()
        if host:
            return host
        # Last-resort default — keeps the module import-safe in tests.
        return "localhost"
    return rp


def _rp_name() -> str:
    return os.environ.get("WEBAUTHN_RP_NAME", "Soy Apóstol")


def _allowed_origins() -> list[str]:
    raw = os.environ.get("WEBAUTHN_ALLOWED_ORIGINS", "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    # Build a reasonable default from rp_id (https variant).
    rp = _rp_id()
    return [f"https://{rp}", f"http://{rp}"] if rp != "localhost" else [
        "http://localhost:3000", "http://localhost:8000",
    ]


def _expected_origin(request: Request) -> str:
    """Pick the origin that the browser sent so verification matches.
    Falls back to the first allowed origin for safety."""
    sent = request.headers.get("origin")
    allowed = _allowed_origins()
    if sent and sent in allowed:
        return sent
    return allowed[0]


# ---------- Models ----------

class RegisterVerifyIn(BaseModel):
    challengeKey: str
    credential: dict
    deviceName: Optional[str] = None


class AuthVerifyIn(BaseModel):
    challengeKey: str
    credential: dict


# ---------- Challenge helpers ----------

async def _save_challenge(db, *, kind: str, challenge: bytes, user_id: Optional[str] = None) -> str:
    """Persist a server-generated challenge and return an opaque key the
    client echoes back on /verify. The collection has a TTL index so old
    challenges expire automatically; we still mark them as consumed on
    verify to prevent replay within the TTL window."""
    key = secrets.token_urlsafe(24)
    await db.webauthn_challenges.insert_one({
        "_id": key,
        "kind": kind,
        "challenge": bytes_to_base64url(challenge),
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc),
    })
    return key


async def _consume_challenge(db, *, key: str, kind: str) -> bytes:
    doc = await db.webauthn_challenges.find_one_and_delete(
        {"_id": key, "kind": kind}
    )
    if not doc:
        raise HTTPException(status_code=400, detail="Challenge expired or invalid")
    # TTL guard at the app level too (in case the index hasn't kicked in).
    created_at = doc["created_at"]
    if created_at.tzinfo is None:
        # MongoDB stores naive UTC; coerce to aware before subtracting.
        created_at = created_at.replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - created_at).total_seconds()
    if age > CHALLENGE_TTL_SECONDS:
        raise HTTPException(status_code=400, detail="Challenge expired")
    return base64url_to_bytes(doc["challenge"])


async def ensure_indexes(db):
    """Called from server.py on startup."""
    await db.webauthn_challenges.create_index(
        "created_at", expireAfterSeconds=CHALLENGE_TTL_SECONDS,
    )
    # Lookup by credential_id during /auth/verify is on the hot path.
    await db.users.create_index("webauthn_credentials.credential_id")


# ---------- Registration ----------

@router.post("/register/options")
async def register_options(request: Request, user: dict = Depends(get_current_user)):
    db = request.app.state.db
    user_id = str(user["_id"])

    # Already-registered credentials — exclude so the same authenticator
    # can't be registered twice.
    existing = user.get("webauthn_credentials") or []
    exclude = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c["credential_id"]))
        for c in existing
    ]

    options = generate_registration_options(
        rp_id=_rp_id(),
        rp_name=_rp_name(),
        user_id=user_id.encode("utf-8"),
        user_name=user["email"],
        user_display_name=user.get("name") or user["email"],
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=exclude,
    )
    challenge_key = await _save_challenge(
        db, kind="register", challenge=options.challenge, user_id=user_id,
    )
    # Return options as JSON dict the @simplewebauthn/browser library expects.
    payload = options_to_json(options)
    import json
    payload_dict = json.loads(payload)
    payload_dict["challengeKey"] = challenge_key
    return payload_dict


@router.post("/register/verify")
async def register_verify(
    request: Request,
    body: RegisterVerifyIn,
    user: dict = Depends(get_current_user),
):
    db = request.app.state.db
    challenge = await _consume_challenge(db, key=body.challengeKey, kind="register")

    try:
        verification = verify_registration_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_origin=_allowed_origins(),
            expected_rp_id=_rp_id(),
            require_user_verification=True,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("WebAuthn registration verify failed: %s", e)
        raise HTTPException(status_code=400, detail=f"Verification failed: {e}")

    cred_id_b64 = bytes_to_base64url(verification.credential_id)
    pub_key_b64 = bytes_to_base64url(verification.credential_public_key)

    # Default device name: pick something the user can recognise. The
    # browser doesn't tell us "iPhone 15 Pro" specifically; a UA-derived
    # hint is the best we can do without entitlements.
    device_name = (body.deviceName or "").strip() or _ua_device_hint(request)

    new_cred = {
        "credential_id": cred_id_b64,
        "public_key": pub_key_b64,
        "sign_count": verification.sign_count,
        "transports": (body.credential.get("response") or {}).get("transports") or [],
        "device_name": device_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_used_at": None,
        "aaguid": getattr(verification, "aaguid", None),
    }

    await db.users.update_one(
        {"_id": user["_id"]},
        {"$push": {"webauthn_credentials": new_cred},
         "$set": {"webauthn_enabled": True}},
    )
    return {"ok": True, "credential": {
        "credential_id": cred_id_b64,
        "device_name": device_name,
        "created_at": new_cred["created_at"],
    }}


# ---------- Authentication ----------

@router.post("/auth/options")
async def auth_options(request: Request):
    db = request.app.state.db
    options = generate_authentication_options(
        rp_id=_rp_id(),
        # Empty allow_credentials → discoverable credential / resident key.
        # Browser shows account picker + biometric.
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    challenge_key = await _save_challenge(db, kind="auth", challenge=options.challenge)
    import json
    payload_dict = json.loads(options_to_json(options))
    payload_dict["challengeKey"] = challenge_key
    return payload_dict


@router.post("/auth/verify")
async def auth_verify(request: Request, response: Response, body: AuthVerifyIn):
    db = request.app.state.db
    challenge = await _consume_challenge(db, key=body.challengeKey, kind="auth")

    raw_id_b64 = body.credential.get("rawId") or body.credential.get("id")
    if not raw_id_b64:
        raise HTTPException(status_code=400, detail="Missing credential id")

    # Look up the user that owns this credential.
    user_doc = await db.users.find_one(
        {"webauthn_credentials.credential_id": raw_id_b64},
    )
    if not user_doc:
        raise HTTPException(status_code=401, detail="Unknown credential")

    cred = next(
        (c for c in user_doc["webauthn_credentials"] if c["credential_id"] == raw_id_b64),
        None,
    )
    if not cred:
        raise HTTPException(status_code=401, detail="Credential mismatch")

    try:
        verification = verify_authentication_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_origin=_allowed_origins(),
            expected_rp_id=_rp_id(),
            credential_public_key=base64url_to_bytes(cred["public_key"]),
            credential_current_sign_count=cred.get("sign_count", 0),
            require_user_verification=True,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("WebAuthn auth verify failed: %s", e)
        raise HTTPException(status_code=401, detail="Verification failed")

    # Update sign count + last_used_at to detect cloned authenticators
    # next time around.
    await db.users.update_one(
        {"_id": user_doc["_id"], "webauthn_credentials.credential_id": raw_id_b64},
        {"$set": {
            "webauthn_credentials.$.sign_count": verification.new_sign_count,
            "webauthn_credentials.$.last_used_at": datetime.now(timezone.utc).isoformat(),
        }},
    )

    # Mint the same JWT cookies as the password login flow.
    user_id = str(user_doc["_id"])
    access = create_access_token(user_id, user_doc["email"])
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh, request)

    return {
        "id": user_id,
        "email": user_doc["email"],
        "name": user_doc.get("name") or user_doc["email"].split("@")[0],
        "role": user_doc.get("role", "user"),
        "lang": user_doc.get("lang") if user_doc.get("lang") in ("es", "en") else "es",
    }


# ---------- Credential management ----------

@router.get("/credentials")
async def list_credentials(user: dict = Depends(get_current_user)):
    creds = user.get("webauthn_credentials") or []
    # Strip public_key + raw fields; UI only needs the metadata.
    return [
        {
            "credential_id": c["credential_id"],
            "device_name": c.get("device_name") or "Dispositivo",
            "created_at": c.get("created_at"),
            "last_used_at": c.get("last_used_at"),
        }
        for c in creds
    ]


@router.delete("/credentials/{cid}")
async def delete_credential(
    cid: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    db = request.app.state.db
    result = await db.users.update_one(
        {"_id": user["_id"]},
        {"$pull": {"webauthn_credentials": {"credential_id": cid}}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Credential not found")

    # If user has no remaining credentials, flip webauthn_enabled off so
    # the frontend hides the "biometric available" hint.
    fresh = await db.users.find_one({"_id": user["_id"]}, {"webauthn_credentials": 1})
    if not (fresh and fresh.get("webauthn_credentials")):
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"webauthn_enabled": False}},
        )
    return {"ok": True}


# ---------- Helpers ----------

def _ua_device_hint(request: Request) -> str:
    """Cheap UA-based device label so the user sees something better than
    "Dispositivo desconocido" in the credential list."""
    ua = (request.headers.get("user-agent") or "").lower()
    if "iphone" in ua:
        return "iPhone"
    if "ipad" in ua:
        return "iPad"
    if "macintosh" in ua or "mac os" in ua:
        return "Mac"
    if "android" in ua:
        return "Android"
    if "windows" in ua:
        return "Windows"
    if "linux" in ua:
        return "Linux"
    return "Dispositivo"
