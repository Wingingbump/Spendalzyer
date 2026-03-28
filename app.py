import streamlit as st
import streamlit.components.v1 as _components
import pandas as _pd
from datetime import datetime as _datetime

from core.insights import load_data, filter_by_range, filter_by_month, filter_by_institution, filter_by_account
from core.dedup import get_dedup_summary
from core.theme import inject_theme, plot_layout, get_palette, ACCENT, ACCENT2, ACCENT3
import views.overview as overview
import views.categories as categories
import views.merchants as merchants
import views.transactions as transactions
import views.settings as settings
import views.ledger as ledger

st.set_page_config(
    page_title="Spend",
    page_icon="💳",
    layout="wide",
    initial_sidebar_state="expanded",
    menu_items={}
)

inject_theme()

_SESSION_TIMEOUT = 15  # minutes


# ── Session persistence helpers ──────────────────────────────────────────────────

def _inject_session_js():
    """
    Handles three things via JS running in Streamlit's iframe (same origin):
      1. localStorage ↔ URL query param sync (persistence across tab close/reopen)
      2. Client-side inactivity timer — logs out after 15 min of no user activity
      3. Updates lastActivity on every Streamlit re-run (= user is active)

    The window.parent.__spendInit guard prevents duplicate listeners and
    timers when Streamlit re-renders this component on each script run.
    """
    timeout_ms = _SESSION_TIMEOUT * 60 * 1000
    _components.html(f"""
    <script>
    (function() {{
        try {{
            var p = window.parent;

            // ── 1. localStorage ↔ URL sync ──────────────────────────────────────
            var stored = localStorage.getItem('spend_s');
            var url    = new URL(p.location.href);
            var inUrl  = url.searchParams.get('s');

            if (stored && !inUrl) {{
                url.searchParams.set('s', stored);
                p.location.replace(url.toString());
                return; // page will reload
            }} else if (inUrl && !stored) {{
                localStorage.setItem('spend_s', inUrl);
            }}

            // ── 2. Inactivity timer (set up once per page load) ─────────────────
            if (!p.__spendInit) {{
                p.__spendInit = true;

                var TIMEOUT = {timeout_ms};

                function logout() {{
                    localStorage.removeItem('spend_s');
                    localStorage.removeItem('spend_activity');
                    var u = new URL(p.location.href);
                    u.searchParams.delete('s');
                    p.location.replace(u.toString());
                }}

                function updateActivity() {{
                    localStorage.setItem('spend_activity', Date.now());
                }}

                // Track activity on the main page document
                ['mousemove','mousedown','keypress','touchstart','scroll','click']
                    .forEach(function(ev) {{
                        p.document.addEventListener(ev, updateActivity, true);
                    }});

                // Check every 30 seconds
                setInterval(function() {{
                    var last = parseInt(localStorage.getItem('spend_activity') || '0');
                    if (last && (Date.now() - last) > TIMEOUT) {{
                        logout();
                    }}
                }}, 30000);
            }}

            // ── 3. Mark activity on every Streamlit re-run ──────────────────────
            localStorage.setItem('spend_activity', Date.now());

        }} catch(e) {{}}
    }})();
    </script>
    """, height=0)


def _clear_storage():
    """Remove session token and activity timestamp from localStorage."""
    _components.html("""
    <script>
    try {
        localStorage.removeItem('spend_s');
        localStorage.removeItem('spend_activity');
    } catch(e) {}
    </script>
    """, height=0)


def _restore_session():
    """Try to restore user from URL token. Returns True if restored."""
    from core.db import get_session, touch_session, delete_session, get_user_by_id
    token = st.query_params.get("s")
    if not token:
        return False
    session = get_session(token)
    if not session:
        del st.query_params["s"]
        _clear_storage()
        return False
    # Check inactivity timeout
    last = _datetime.fromisoformat(session["last_activity"])
    elapsed = (_datetime.utcnow() - last).total_seconds() / 60
    if elapsed > _SESSION_TIMEOUT:
        delete_session(token)
        del st.query_params["s"]
        _clear_storage()
        return False
    user = get_user_by_id(session["user_id"])
    if not user:
        delete_session(token)
        del st.query_params["s"]
        _clear_storage()
        return False
    st.session_state.user_id = user["id"]
    st.session_state.username = user["username"]
    touch_session(token)
    return True


# Run on every render: sync localStorage ↔ URL, run inactivity timer, restore session if needed
_inject_session_js()
if not st.session_state.get("user_id"):
    _restore_session()

if "data_version" not in st.session_state:
    st.session_state.data_version = 0

# ── Auth gate ───────────────────────────────────────────────────────────────────

def _render_login():
    from core.db import list_users, create_user, get_user_by_username
    from core.crypto import verify_password

    st.markdown("""
    <style>section[data-testid="stSidebar"] { display: none; }</style>
    <div class="login-wrap"><div class="login-card">
        <div class="login-logo">spend<span>.</span></div>
        <div class="login-sub">personal finance</div>
    </div></div>
    """, unsafe_allow_html=True)

    users = list_users()
    tab_sign_in, tab_create = st.tabs(["Sign in", "Create account"])

    with tab_create:
        new_username = st.text_input("Username", key="setup_username")
        new_pw1 = st.text_input("Password", type="password", key="setup_pw1")
        new_pw2 = st.text_input("Confirm password", type="password", key="setup_pw2")
        if st.button("Create account", use_container_width=True):
            if not new_username.strip():
                st.error("Username cannot be empty.")
            elif not new_pw1:
                st.error("Password cannot be empty.")
            elif new_pw1 != new_pw2:
                st.error("Passwords do not match.")
            elif get_user_by_username(new_username.strip()):
                st.error("Username already taken.")
            else:
                from core.db import create_session
                user_id = create_user(new_username.strip(), new_pw1)
                token = create_session(user_id)
                st.session_state.user_id = user_id
                st.session_state.username = new_username.strip()
                st.query_params["s"] = token
                st.rerun()

    with tab_sign_in:
        username = st.text_input("Username", key="login_username")
        pw = st.text_input("Password", type="password", key="login_pw")
        if st.button("Sign in", use_container_width=True):
            user = get_user_by_username(username.strip())
            if user and verify_password(pw, user["password"]):
                from core.db import create_session
                token = create_session(user["id"])
                st.session_state.user_id = user["id"]
                st.session_state.username = user["username"]
                st.query_params["s"] = token
                st.rerun()
            else:
                st.error("Incorrect username or password.")

if not st.session_state.get("user_id"):
    _render_login()
    st.stop()

# Touch session on every authenticated render
_active_token = st.query_params.get("s")
if _active_token:
    from core.db import touch_session
    touch_session(_active_token)


def get_data():
    user_id = st.session_state.user_id
    version = st.session_state.data_version
    cache_key = f"df_cache_{user_id}_{version}"
    if cache_key not in st.session_state:
        for key in list(st.session_state.keys()):
            if key.startswith("df_cache_"):
                del st.session_state[key]
        st.session_state[cache_key] = load_data(user_id)
    return st.session_state[cache_key]


# ── Sidebar ─────────────────────────────────────────────────────────────────────

with st.sidebar:
    p = get_palette()
    _username = st.session_state.get("username", "")
    st.markdown(f"""
    <div style="font-family:DM Mono,monospace;font-size:22px;font-weight:500;
    color:{p['logo_text']};letter-spacing:-0.02em;padding:8px 0 4px;">
        spend<span style="color:{p['accent_dot']};">.</span>
    </div>
    <div style="font-family:DM Mono,monospace;font-size:10px;color:{p['text_muted']};
    letter-spacing:0.2em;text-transform:uppercase;margin-bottom:24px;">
        {_username}
    </div>
    """, unsafe_allow_html=True)

    PAGES = ["Overview", "Categories", "Merchants", "Transactions", "Ledger", "Settings"]
    page = st.radio("View", PAGES, key="current_page", label_visibility="collapsed")

    st.markdown('<div style="height:16px"></div>', unsafe_allow_html=True)

    df_full = get_data()

    month_periods = sorted(df_full["date"].dt.to_period("M").unique(), reverse=True)
    month_options = [mp.strftime("%b %Y") for mp in month_periods]
    date_options = ["Last 30 days", "Last 60 days", "Last 90 days", "Last 6 months", "YTD", "All time"] + month_options
    institutions = ["All"] + sorted(df_full["institution"].dropna().unique().tolist())

    if st.session_state.get("sidebar_date_range") not in date_options:
        st.session_state["sidebar_date_range"] = "Last 30 days"
    if st.session_state.get("sidebar_institution") not in institutions:
        st.session_state["sidebar_institution"] = "All"

    date_range = st.selectbox("Date range", date_options, key="sidebar_date_range")
    institution_filter = st.selectbox("Institution", institutions, key="sidebar_institution")

    # Account sub-filter
    from core.db import list_plaid_accounts, list_connected_accounts
    account_filter = None
    if institution_filter != "All":
        inst_accounts_all = list_connected_accounts(st.session_state.user_id)
        inst_row = next((a for a in inst_accounts_all if a["name"] == institution_filter), None)
        if inst_row:
            plaid_accs = list_plaid_accounts(inst_row["id"])
            if plaid_accs:
                acc_options = ["All accounts"] + [
                    f"{a['name']} *{a['mask']}" if a["mask"] else a["name"]
                    for a in plaid_accs
                ]
                acc_map = {
                    (f"{a['name']} *{a['mask']}" if a["mask"] else a["name"]): a["plaid_account_id"]
                    for a in plaid_accs
                }
                if st.session_state.get("sidebar_account") not in acc_options:
                    st.session_state["sidebar_account"] = "All accounts"
                selected_acc = st.selectbox("Account", acc_options, key="sidebar_account")
                if selected_acc != "All accounts":
                    account_filter = acc_map[selected_acc]
    else:
        st.session_state["sidebar_account"] = "All accounts"

    st.markdown('<div style="height:24px"></div>', unsafe_allow_html=True)

    from core.db import get_last_synced_at
    last_date = get_last_synced_at(st.session_state.user_id)
    last_label = f"Last sync: {last_date}" if last_date else "Never synced"
    st.markdown(
        f'<div style="font-family:DM Mono,monospace;font-size:11px;color:{p["text_muted"]};margin-bottom:8px;">'
        f'{last_label}</div>',
        unsafe_allow_html=True
    )
    if st.button("Sync transactions", use_container_width=True):
        with st.spinner("Pulling..."):
            try:
                import sys, os as _os
                sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
                from services.pull import main as pull_main
                pull_main(user_id=st.session_state.user_id)
                st.session_state.data_version += 1
                st.session_state.pending_toast = "Sync complete"
            except Exception as e:
                st.error(str(e))
        st.rerun()

    st.markdown('<div style="height:16px"></div>', unsafe_allow_html=True)

    dedup = get_dedup_summary(df_full)
    st.markdown(
        f'<div style="font-family:DM Mono,monospace;font-size:11px;color:{p["text_secondary"]};line-height:2.2;">'
        f'{dedup["clean_transactions"]} clean txns<br>'
        f'{dedup["transfers_flagged"]} transfers filtered<br>'
        f'{dedup["duplicates_flagged"]} dupes removed</div>',
        unsafe_allow_html=True
    )



# ── Data prep ──────────────────────────────────────────────────────────────────

_days_map = {
    "Last 30 days": 30, "Last 60 days": 60,
    "Last 90 days": 90, "Last 6 months": 180, "All time": None
}

df = df_full.copy()
if account_filter:
    df = filter_by_account(df, account_filter)
elif institution_filter != "All":
    df = filter_by_institution(df, institution_filter)

days = None
if date_range in _days_map:
    days = _days_map[date_range]
    df_ranged = filter_by_range(df, days)
elif date_range == "YTD":
    import datetime as _dt
    ytd_start = _pd.Timestamp(_dt.date.today().year, 1, 1)
    df_ranged = df[df["date"] >= ytd_start].copy()
else:
    period = _pd.Period(date_range, freq="M")
    df_ranged = filter_by_month(df, period.year, period.month)

# ── Routing ────────────────────────────────────────────────────────────────────

_p = get_palette()
ctx = {
    "df": df,
    "df_ranged": df_ranged,
    "days": days,
    "PLOT_LAYOUT": plot_layout(),
    "ACCENT":      _p["chart_1"],
    "ACCENT2":     _p["chart_2"],
    "ACCENT3":     _p["chart_3"],
    "CHART_SEQ":   _p["chart_seq"],
}

if page == "Overview":
    overview.render(ctx)
elif page == "Categories":
    categories.render(ctx)
elif page == "Merchants":
    merchants.render(ctx)
elif page == "Transactions":
    changes = transactions.render(ctx)
    if changes:
        st.rerun()
elif page == "Ledger":
    ledger.render(ctx)
elif page == "Settings":
    settings.render(ctx)

if "pending_toast" in st.session_state:
    st.toast(st.session_state.pending_toast, icon="✅")
    del st.session_state.pending_toast
