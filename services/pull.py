import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import logging
import datetime
from dotenv import load_dotenv
from core.db import upsert_transactions, fetch_transactions, load_category_map, seed_category_map
import plaid
from plaid.api import plaid_api
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler("pull.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

load_dotenv()

PLAID_ENVS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

def _build_client():
    from core.db import get_credential
    client_id = get_credential("plaid_client_id") or os.getenv("PLAID_CLIENT_ID")
    env        = get_credential("plaid_env")       or os.getenv("PLAID_ENV", "sandbox")
    secret     = get_credential("plaid_secret")    or os.getenv(f"PLAID_SECRET_{env.upper()}")
    configuration = plaid.Configuration(
        host=PLAID_ENVS[env.lower()],
        api_key={"clientId": client_id, "secret": secret}
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration)), env

CSV_FILE = "data/transactions.csv"
FIELDNAMES = ["id", "date", "name", "amount", "category", "pending", "institution"]

def load_existing_ids(user_id: int) -> set:
    from core.db import fetch_transactions
    return {t["id"] for t in fetch_transactions(user_id)}


def fetch_all_transactions(client, access_token: str, start_date, end_date) -> list:
    all_transactions = []
    offset = 0

    while True:
        try:
            request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date,
                end_date=end_date,
                options=TransactionsGetRequestOptions(
                    count=500,
                    offset=offset
                )
            )
            response = client.transactions_get(request)
            transactions = response["transactions"]
            total = response["total_transactions"]
            all_transactions.extend(transactions)
            log.info(f"Fetched {len(all_transactions)}/{total} transactions")

            if len(all_transactions) >= total:
                break

            offset += len(transactions)

        except plaid.ApiException as e:
            log.error(f"Plaid API error: {e.body}")
            raise

    return all_transactions


def save_transactions(transactions: list, institution: str,
                      existing_ids: set, account_map: dict, user_id: int) -> int:
    new_transactions = [
        t for t in transactions
        if t["transaction_id"] not in existing_ids
    ]

    if not new_transactions:
        return 0

    category_map = load_category_map(user_id)

    upsert_transactions([{
        "id":               t["transaction_id"],
        "date":             str(t["date"]),
        "name":             t["name"],
        "amount":           t["amount"],
        "category":         category_map.get(
                                t["category"][0] if t["category"] else "", "Uncategorized"
                            ),
        "pending":          bool(t["pending"]),
        "institution":      account_map.get(t["account_id"], {}).get("institution_name", institution),
        "plaid_account_id": t["account_id"],
        "user_id":          user_id,
    } for t in new_transactions])

    return len(new_transactions)


def main(user_id: int, full_sync: bool = False):
    from core.db import get_connected_account_tokens, get_latest_transaction_date, set_last_synced_at
    seed_category_map(user_id)

    client, env = _build_client()
    log.info(f"Starting transaction pull ({env}) for user {user_id}")

    end_date = datetime.date.today()
    if full_sync:
        start_date = datetime.date(2024, 1, 1)
        log.info("Full sync requested — pulling from 2024-01-01")
    else:
        last = get_latest_transaction_date(user_id)
        start_date = datetime.date.fromisoformat(last) if last else datetime.date(2024, 1, 1)
    log.info(f"Pulling from {start_date} to {end_date}")

    existing_ids = {t["id"] for t in fetch_transactions(user_id)}
    log.info(f"Found {len(existing_ids)} existing transactions")

    accounts = get_connected_account_tokens(user_id)
    if not accounts:
        log.warning("No connected accounts found — add accounts in Settings")
        return

    from core.db import get_plaid_account_map, list_plaid_accounts, upsert_plaid_accounts
    from plaid.model.accounts_get_request import AccountsGetRequest

    # Sync plaid_accounts for any institution that has none yet
    for account in accounts:
        existing = list_plaid_accounts(account["id"])
        if not existing:
            try:
                resp = client.accounts_get(AccountsGetRequest(access_token=account["access_token"]))
                upsert_plaid_accounts(account["id"], [
                    {
                        "account_id":    a["account_id"],
                        "name":          a["name"],
                        "official_name": a.get("official_name"),
                        "mask":          a["mask"],
                        "type":          str(a["type"]),
                        "subtype":       str(a["subtype"]),
                    }
                    for a in resp["accounts"]
                ])
                log.info(f"{account['name']}: synced {len(resp['accounts'])} plaid accounts")
            except Exception as e:
                log.warning(f"{account['name']}: could not sync accounts — {e}")

    account_map = get_plaid_account_map(user_id)
    log.info(f"Account map loaded: {len(account_map)} plaid accounts")

    total_new = 0
    for account in accounts:
        log.info(f"Pulling {account['name']}...")
        try:
            transactions = fetch_all_transactions(client, account["access_token"], start_date, end_date)
            saved = save_transactions(transactions, account["name"], existing_ids, account_map, user_id)
            total_new += saved
            log.info(f"{account['name']}: {saved} new transactions saved")
        except Exception as e:
            log.error(f"{account['name']} pull failed: {e}")
            continue

    log.info(f"Done — {total_new} total new transactions saved")
    set_last_synced_at(user_id, datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))

if __name__ == "__main__":
    main()