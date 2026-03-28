import os
import anthropic
import re
from dotenv import load_dotenv

load_dotenv()

CATEGORIES = [
    "Food & Drink",
    "Transport",
    "Shopping",
    "Subscriptions",
    "Health",
    "Utilities",
    "Travel",
    "Payments",
    "Income / Interest",
    "Other"
]
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

def apply_categories(df):
    from core.db import load_normalization_cache, save_normalization_entry

    norm_cache = load_normalization_cache()
    df = df.copy()

    def smart_normalize(name: str) -> str:
        if name in norm_cache:
            return norm_cache[name]

        normalized = normalize_merchant(name)

        if looks_noisy(normalized):
            try:
                cleaned = ai_clean_merchant(name, normalized)
                save_normalization_entry(name, cleaned)
                norm_cache[name] = cleaned
                return cleaned
            except Exception:
                pass

        save_normalization_entry(name, normalized)
        norm_cache[name] = normalized
        return normalized

    df["merchant_normalized"] = df["name"].apply(smart_normalize)
    return df

def normalize_merchant(name: str) -> str:
    original = name.strip()

    # Known aliases
    ALIASES = {
        "METRO WASHINGTON DC": "DC Metro",
        "METRO WASHINGTON": "DC Metro",
        "RECREATION.GOV": "Recreation.gov",
        "MCDONALD'S": "McDonald's",
        "MCDONALDS": "McDonald's",
    }
    for pattern, alias in ALIASES.items():
        if pattern in name.upper():
            return alias

    # Venmo peer payments — extract person name before quote
    venmo_match = re.match(r'^([A-Za-z]+ [A-Za-z]+)\s*["\u201c\u2018].*$', original)
    if venmo_match:
        return venmo_match.group(1).title()

    name = name.upper()

    # Remove common prefixes
    for prefix in ["TST* ", "TST*", "SQ *", "SQ*", "SP *", "SP*",
                   "PP *", "PP*", "DDA *", "DDA*"]:
        if name.startswith(prefix):
            name = name[len(prefix):]
            break

    # Remove anything after * # |
    name = re.split(r'[\*#\|]', name)[0]

    # Remove currency conversion info
    name = re.sub(r'\d+\.\d+\s*@\s*[\d\.]+\s*[A-Z]{3}', '', name)

    # Remove long alphanumeric codes (8+ chars)
    name = re.sub(r'\b[A-Z0-9]{8,}\b', '', name)

    # Remove phone numbers
    name = re.sub(r'\b\d{7,}\b', '', name)

    # Remove standalone digit sequences
    name = re.sub(r'\b\d+\b', '', name)

    # Remove domain extensions but keep the name before them
    name = re.sub(r'\.(COM|GOV|NET|ORG|IO)\b', '', name)

    # Remove promo/order codes (mixed alpha-numeric short strings like 1PMGPS1)
    name = re.sub(r'\b[A-Z]*\d+[A-Z]+\d*\b', '', name)
    name = re.sub(r'\b\d+[A-Z]+\d*\b', '', name)

    # Remove city/location suffixes — TYSONS, VIENNA, ASHBURN, ANNANDALE etc
    LOCATION_WORDS = [
        "TYSONS", "VIENNA", "ASHBURN", "ANNANDALE", "STERLING",
        "RESTON", "HERNDON", "ARLINGTON", "ALEXANDRIA", "FALLS CHURCH",
        "CORNER", "ONLINE", "RESTAURANT", "CORNER"
    ]
    for loc in LOCATION_WORDS:
        name = re.sub(rf'\b{loc}\b', '', name)

    # Remove US state abbreviations
    name = re.sub(r'\b(CA|VA|TX|NY|FL|MD|DC|GA|IL|WA|OR|CO|AZ|NV|NC|SC|OH|MI|PA|NJ|TY)\b', '', name)

    # Remove single letters left over
    name = re.sub(r'\b[A-Z]\b', '', name)

    # Remove special characters except spaces and apostrophes
    name = re.sub(r'[^A-Z0-9 \']', ' ', name)

    # Fix apostrophe casing (S → 's)
    name = re.sub(r"'S\b", "'s", name.title())

    # Collapse whitespace
    name = ' '.join(name.split())

    return name.strip() or original.strip()

def looks_noisy(name: str) -> bool:
    """Heuristic — does this normalized name still look messy?"""
    if not name:
        return True
    # Too long (real merchant names rarely exceed 4 words)
    if len(name.split()) > 4:
        return True
    # Contains leftover codes or numbers
    if re.search(r'\d', name):
        return True
    # Single character words leftover
    if re.search(r'\b[A-Za-z]\b', name):
        return True
    return False


def ai_clean_merchant(raw_name: str, normalized: str) -> str:
    prompt = f"""Clean up this bank transaction merchant name into a short, readable business name.

Raw: "{raw_name}"
Current attempt: "{normalized}"

Rules:
- Return ONLY the merchant/business name, 1-3 words max
- Remove location names (cities, states like VA, CA, DC)
- Remove order codes, phone numbers, transaction IDs
- Remove "RESTAURANT", "ONLINE", "CORNER" suffixes unless part of the brand
- Keep apostrophes correct: "Lei'd", "Teas'n", "Joe's", "McDonald's"
- For "TST* NAME - LOCATION" just return NAME
- For "BRAND LOCATION LOCATION" just return BRAND
- Title case the result
- If already clean and short, return as-is

Examples:
"TST* LEI'D POKE" → "Lei'd Poke"
"TST* STELLINA - TYSON'S TYSONS" → "Stellina"
"LA CAMPESINA RESTAURANT" → "La Campesina"
"HEYTEA-US-TYSONS CORNE TYSONS" → "Heytea"
"MEOKJA MEOKJA KOREAN BBQ" → "Meokja"
"AMC 9640 ONLINE" → "AMC"
"TEABREAK PHO & BOBA" → "Teabreak"
"TST* HANGRY JOE'S - STER" → "Hangry Joe's"
"ENTERTAINMENT EXPERTS" → "Entertainment Experts"

Return ONLY the clean name, nothing else."""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=32,
        messages=[{"role": "user", "content": prompt}]
    )
    return response.content[0].text.strip().strip('"')

