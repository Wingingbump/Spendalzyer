import os
import threading
import streamlit as st
from core.categorize import CATEGORIES
from core.theme import get_palette, theme_toggle
from core.db import (
    load_category_map, upsert_category_mapping,
    get_credential, set_credential,
    list_connected_accounts, add_connected_account,
    remove_connected_account, get_connected_account_by_name,
)

_link_server_started = False


def _start_link_server():
    global _link_server_started
    if _link_server_started:
        return
    from services.link import app
    _link_server_started = True
    t = threading.Thread(target=lambda: app.run(port=5000, debug=False, use_reloader=False), daemon=True)
    t.start()


def render(ctx):
    user_id = st.session_state.user_id
    p = get_palette()
    st.markdown("# Settings")

    current_env    = get_credential("plaid_env") or "sandbox"
    current_id     = get_credential("plaid_client_id") or ""
    current_secret = get_credential("plaid_secret") or ""
    has_keys = bool(current_id and current_secret)

    # ── Connected accounts ──────────────────────────────────────────────────────

    st.markdown('<div class="section-header">Connected accounts</div>', unsafe_allow_html=True)

    accounts = list_connected_accounts(user_id)
    if accounts:
        for acc in accounts:
            c1, c2 = st.columns([5, 1])
            with c1:
                st.markdown(
                    f'<div class="highlight-sub" style="margin-bottom:4px;">'
                    f'<b style="color:{p["text_primary"]}">{acc["name"]}</b>'
                    f'<span style="color:{p["text_muted"]};font-size:11px;margin-left:10px;">{acc["account_type"]}</span>'
                    f'</div>',
                    unsafe_allow_html=True
                )
            with c2:
                if st.button("Remove", key=f"rm_{acc['id']}"):
                    remove_connected_account(acc["id"])
                    st.rerun()
    else:
        st.markdown(
            f'<div style="font-size:13px;color:{p["text_muted"]};margin-bottom:12px;">No accounts connected yet.</div>',
            unsafe_allow_html=True
        )

    # Primary: connect via Plaid Link
    if has_keys:
        if st.button("Connect account with Plaid", use_container_width=True):
            _start_link_server()
            st.session_state["show_link_url"] = True

        if st.session_state.get("show_link_url"):
            from services.link import sign_user_id
            _link_base = os.environ.get("LINK_BASE_URL", "http://localhost:5000")
            link_url = f"{_link_base}?t={sign_user_id(user_id)}"
            st.markdown(
                f'<div style="margin-top:12px;padding:14px;background:{p["surface_raise"]};'
                f'border:1px solid {p["border"]};border-radius:8px;font-size:13px;color:{p["text_secondary"]};">'
                f'1. <a href="{link_url}" target="_blank" style="color:{p["accent_dot"]};">Open Plaid Link →</a>'
                f' &nbsp; 2. Connect your institution &nbsp; 3. Come back and click Refresh'
                f'</div>',
                unsafe_allow_html=True
            )
            if st.button("Refresh accounts"):
                st.session_state["show_link_url"] = False
                st.rerun()
    else:
        st.info("Configure Plaid credentials above before connecting accounts.")

    # Advanced: manual token entry
    with st.expander("Advanced — enter access token manually"):
        acc_name  = st.text_input("Institution name")
        acc_type  = st.selectbox("Type", ["bank", "credit_card", "p2p"], key="adv_type")
        acc_token = st.text_input("Plaid access token", type="password")
        if st.button("Add account") and acc_name and acc_token:
            existing = get_connected_account_by_name(acc_name.strip(), user_id)
            if existing:
                st.error(f"'{acc_name}' is already connected. Remove it first.")
            else:
                add_connected_account(acc_name.strip(), acc_type, acc_token.strip(), user_id)
                st.success(f"Added {acc_name}.")
                st.rerun()

    # ── Security ────────────────────────────────────────────────────────────────

    st.markdown('<div class="section-header">Security</div>', unsafe_allow_html=True)
    with st.expander("Change password"):
        cur_pw  = st.text_input("Current password", type="password", key="sec_cur")
        new_pw1 = st.text_input("New password", type="password", key="sec_new1")
        new_pw2 = st.text_input("Confirm new password", type="password", key="sec_new2")
        if st.button("Update password"):
            from core.crypto import verify_password
            from core.db import get_user_by_id, update_user_password
            user = get_user_by_id(user_id)
            stored_hash = st.session_state.get("_pw_hash")
            # Re-fetch password hash for verification
            from core.db import get_user_by_username
            full_user = get_user_by_username(user["username"]) if user else None
            if not full_user or not verify_password(cur_pw, full_user["password"]):
                st.error("Current password is incorrect.")
            elif not new_pw1:
                st.error("New password cannot be empty.")
            elif new_pw1 != new_pw2:
                st.error("Passwords do not match.")
            else:
                update_user_password(user_id, new_pw1)
                st.success("Password updated.")

    if st.button("Sign out", use_container_width=True):
        from core.db import delete_session
        import streamlit.components.v1 as _comp
        token = st.query_params.get("s")
        if token:
            delete_session(token)
            del st.query_params["s"]
        _comp.html("""<script>try{localStorage.removeItem('spend_s');}catch(e){}</script>""", height=0)
        for key in ["user_id", "username"]:
            st.session_state.pop(key, None)
        st.rerun()

    # ── Appearance ───────────────────────────────────────────────────────────────

    st.markdown('<div class="section-header">Appearance</div>', unsafe_allow_html=True)
    current = st.session_state.get("theme", "dark")
    col_a, col_b = st.columns(2)
    with col_a:
        dark_style = f"background:{p['surface_raise']};border:1px solid {p['border']};border-radius:8px;padding:10px;text-align:center;font-family:DM Mono,monospace;font-size:12px;color:{p['text_primary'] if current == 'dark' else p['text_muted']};cursor:pointer;"
        if st.button("● Dark", use_container_width=True, key="_theme_dark"):
            st.session_state.theme = "dark"
            st.rerun()
    with col_b:
        if st.button("☀ Light", use_container_width=True, key="_theme_light"):
            st.session_state.theme = "light"
            st.rerun()

    # ── Category mappings ───────────────────────────────────────────────────────

    st.markdown('<div class="section-header">Category mappings</div>', unsafe_allow_html=True)
    st.markdown(
        f'<div style="font-size:13px;color:{p["text_muted"]};margin-bottom:16px;">'
        f'Maps external categories (e.g. from Plaid) to your internal categories.</div>',
        unsafe_allow_html=True
    )

    cat_map = load_category_map()
    if cat_map:
        for ext, internal in sorted(cat_map.items()):
            st.markdown(
                f'<div class="highlight-sub" style="margin-bottom:4px;">'
                f'<b style="color:{p["text_primary"]}">{ext}</b> → {internal}</div>',
                unsafe_allow_html=True
            )
    else:
        st.info("No mappings yet.")

    with st.expander("Add / update mapping"):
        ext_cat = st.text_input("External category (e.g. Plaid name)")
        int_cat = st.selectbox("Maps to", CATEGORIES, key="map_internal")
        if st.button("Save mapping") and ext_cat:
            upsert_category_mapping(ext_cat.strip(), int_cat)
            st.success(f"Mapped '{ext_cat}' → {int_cat}")
            st.rerun()
