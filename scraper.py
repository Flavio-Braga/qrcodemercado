import html
import re

from bs4 import BeautifulSoup

TAG_RE = re.compile(r"<[^>]*>")
ENTITY_RE = re.compile(r"&#(?:x([\da-fA-F]+)|(\d+));")
WHITESPACE_RE = re.compile(r"\s+")

BLOCK_TAGS = ["tr", "li", "div"]
BLOCK_ATTR_RE = re.compile(r"prod|item|produto", re.IGNORECASE)
TOTAL_RE = re.compile(r"(?:valor\s*(?:total)?|total)\s*(?:r\$\s*)?([\d.]+,\d{2})", re.IGNORECASE)
PRICE_RE = re.compile(r"r\$\s*([\d.]+,\d{2})", re.IGNORECASE)
QUANTITY_RE = re.compile(r"(?:qtd\.?|quantidade)\s*[:]?\s*([\d.,]+)", re.IGNORECASE)
UNIT_RE = re.compile(r"(?:vl\.?\s*unit\.?|valor\s*unit[áa]rio)\s*[:]?\s*(?:r\$\s*)?([\d.]+,\d{2})", re.IGNORECASE)
DESCRIPTION_STRIP_RE = re.compile(
    r"(?:qtd\.?|quantidade|vl\.?\s*unit\.?|valor\s*unit[áa]rio|valor\s*total|total)\s*[:]?\s*(?:r\$\s*)?[\d.,]+",
    re.IGNORECASE,
)
DESCRIPTION_PRICE_RE = re.compile(r"r\$\s*[\d.]+,\d{2}", re.IGNORECASE)


def decode_html(text):
    text = re.sub(r"&nbsp;", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&amp;", "&", text, flags=re.IGNORECASE)
    text = re.sub(r"&quot;", '"', text, flags=re.IGNORECASE)

    def replace(match):
        hex_value, decimal_value = match.group(1), match.group(2)
        value = hex_value if hex_value else decimal_value
        base = 16 if hex_value else 10
        try:
            return chr(int(value, base))
        except (TypeError, ValueError):
            return match.group(0)

    return html.unescape(ENTITY_RE.sub(replace, text))


def clean_text(text):
    return WHITESPACE_RE.sub(" ", decode_html(TAG_RE.sub(" ", text))).strip()


def parse_money(text):
    normalized = re.sub(r"[^\d.-]", "", text.replace(".", "").replace(",", "."))
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def block_matches(tag):
    attributes = " ".join(
        " ".join(value) if isinstance(value, list) else value for value in tag.attrs.values()
    )
    return bool(BLOCK_ATTR_RE.search(attributes))


def extract_items(html_text):
    soup = BeautifulSoup(html_text, "lxml")
    blocks = [tag for tag in soup.find_all(BLOCK_TAGS) if block_matches(tag)]
    candidates = blocks or soup.find_all(["tr", "li"])
    items = []
    for block in candidates:
        text = clean_text(str(block))
        total_match = TOTAL_RE.search(text) or PRICE_RE.search(text)
        if not total_match:
            continue
        quantity_match = QUANTITY_RE.search(text)
        unit_match = UNIT_RE.search(text)
        description = DESCRIPTION_PRICE_RE.sub("", DESCRIPTION_STRIP_RE.sub("", text)).strip()
        if len(description) < 2:
            continue
        total = parse_money(total_match.group(1))
        items.append(
            {
                "description": description,
                "quantity": parse_money(quantity_match.group(1)) if quantity_match else 1,
                "unitPrice": parse_money(unit_match.group(1)) if unit_match else total,
                "total": total,
            }
        )
    return items
