import os
from typing import Optional

import plaid
from fastapi import APIRouter, Depends, HTTPException
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from plaid.api import plaid_api
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.country_code import CountryCode
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from pydantic import BaseModel

from backend.dependencies import get_current_user
from core.db import (
    add_connected_account,
    get_connected_account_by_name,
    get_credential,
    upsert_plaid_accounts,
)

router = APIRouter(prefix="/plaid", tags=["plaid"])

PLAID_ENVS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

_LINK_TOKEN_MAX_AGE = 3600
_PLAID_SALT = "plaid-link"


def _get_flask_secret() -> str:
    return os.getenv("FLASK_SECRET_KEY", "dev-insecure-change-me")


def _signer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_get_flask_secret())


def _sign_user_id(user_id: int) -> str:
    return _signer().dumps(user_id, salt=_PLAID_SALT)


def _verify_signed_token(token: str) -> Optional[int]:
    try:
        return _signer().loads(token, salt=_PLAID_SALT, max_age=_LINK_TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def _build_plaid_client():
    client_id = get_credential("plaid_client_id") or os.getenv("PLAID_CLIENT_ID")
    env = get_credential("plaid_env") or os.getenv("PLAID_ENV", "sandbox")
    secret = get_credential("plaid_secret") or os.getenv(f"PLAID_SECRET_{env.upper()}")
    configuration = plaid.Configuration(
        host=PLAID_ENVS[env.lower()],
        api_key={"clientId": client_id, "secret": secret},
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


class ExchangeBody(BaseModel):
    public_token: str
    institution: str
    account_type: str = "bank"
    signed_token: str


@router.get("/link-token")
def get_link_token(current_user: dict = Depends(get_current_user)):
    try:
        client = _build_plaid_client()
        response = client.link_token_create(
            LinkTokenCreateRequest(
                user=LinkTokenCreateRequestUser(client_user_id=str(current_user["id"])),
                client_name="Spend",
                products=[Products("transactions")],
                country_codes=[CountryCode("US")],
                language="en",
            )
        )
        signed_token = _sign_user_id(current_user["id"])
        return {"link_token": response["link_token"], "signed_token": signed_token}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=str(e.body))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/exchange")
def exchange_token(body: ExchangeBody, current_user: dict = Depends(get_current_user)):
    verified_user_id = _verify_signed_token(body.signed_token)
    if not verified_user_id or verified_user_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Session expired or invalid signed token")

    existing = get_connected_account_by_name(body.institution, current_user["id"])
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"'{body.institution}' is already connected. Remove it in Settings first.",
        )

    try:
        client = _build_plaid_client()
        response = client.item_public_token_exchange(
            ItemPublicTokenExchangeRequest(public_token=body.public_token)
        )
        access_token = response["access_token"]
        connected_id = add_connected_account(body.institution, body.account_type, access_token, current_user["id"])

        accounts_resp = client.accounts_get(AccountsGetRequest(access_token=access_token))
        upsert_plaid_accounts(
            connected_id,
            [
                {
                    "account_id": a["account_id"],
                    "name": a["name"],
                    "official_name": a.get("official_name"),
                    "mask": a["mask"],
                    "type": str(a["type"]),
                    "subtype": str(a["subtype"]),
                }
                for a in accounts_resp["accounts"]
            ],
        )
        return {"institution": body.institution}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=str(e.body))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
