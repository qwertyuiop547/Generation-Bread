"""
Customer-facing caption helper for Generation Bread.
Only the IG / TikTok caption feature remains available.
"""
import json
import os
import re
import urllib.request
from typing import Any, Dict, List


def _call_optional_gemini(prompt: str) -> str | None:
    """Call Google Gemini API if GEMINI_API_KEY is configured in environment."""
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={api_key}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 600},
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            candidates = body.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and "text" in parts[0]:
                    return str(parts[0]["text"]).strip()
    except Exception:
        return None
    return None


def parse_barkada_chat(raw_text: str, menu_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Parse messy Messenger / Viber group order text into structured per-person cart lines
    and calculate a bill split summary.
    """
    lines = [
        ln.strip()
        for ln in re.split(r"[\r\n;]+", raw_text or "")
        if ln.strip()
    ]
    parsed_members = []
    all_cart_items = []

    for idx, line in enumerate(lines):
        # Extract "Name: order details" or "Name - order details"
        match = re.match(r"^([A-Za-z0-9_.\s]{2,22}?)\s*[:\-–—]\s*(.+)$", line)
        if match:
            person = match.group(1).strip().title()
            order_part = match.group(2).strip()
        else:
            person = f"Friend {idx + 1}"
            order_part = line

        # Split multiple items ordered by the same person using commas or "at" / "and" / "+"
        chunks = [
            c.strip()
            for c in re.split(r",|\+|\band\b|\bat\b|\bwith\b", order_part, flags=re.IGNORECASE)
            if c.strip()
        ]
        person_items = []
        for chunk in chunks:
            qty_match = re.search(r"\b(\d+)\s*x?\b", chunk, flags=re.IGNORECASE)
            qty = int(qty_match.group(1)) if qty_match else 1
            qty = max(1, min(qty, 20))

            lower_chunk = chunk.lower()
            if "dalawa" in lower_chunk or "two" in lower_chunk:
                qty = 2
            elif "tatlo" in lower_chunk or "three" in lower_chunk:
                qty = 3
            elif "isa" in lower_chunk or "isang" in lower_chunk:
                qty = max(qty, 1)

            best_item = None
            best_score = 0
            for m in menu_items:
                name_lower = str(m.get("name", "")).lower()
                tokens = [t for t in re.split(r"\W+", name_lower) if len(t) > 2]
                score = sum(2 for t in tokens if t in lower_chunk)
                if name_lower in lower_chunk:
                    score += 5
                if score > best_score:
                    best_score = score
                    best_item = m

            if not best_item and menu_items:
                best_item = menu_items[0]

            if best_item:
                base_price = float(best_item.get("price", 100))
                category = best_item.get("category") or "drink"
                notes_list = [f"For {person}"]
                custom_suffix = []

                if category != "food":
                    size = "Large" if "large" in lower_chunk else ("Medium" if "medium" in lower_chunk else "Small")
                    if size == "Medium":
                        base_price += 20
                    elif size == "Large":
                        base_price += 40
                    sugar = "50%" if ("less" in lower_chunk or "half" in lower_chunk) else (
                        "0%" if ("no sugar" in lower_chunk or "zero" in lower_chunk) else "100%"
                    )
                    addons = []
                    if "oat" in lower_chunk:
                        addons.append("Oat Milk Swap")
                        base_price += 40
                    if "protein" in lower_chunk or "extra shot" in lower_chunk:
                        addons.append("Extra Protein")
                        base_price += 30
                    addon_str = f", {', '.join(addons)}" if addons else ""
                    custom_suffix.append(f"{size}, {sugar} Sugar{addon_str}")

                if any(k in lower_chunk for k in ("init", "warm", "toasted", "hot")):
                    notes_list.append("Warm / toasted please")
                if "separate" in lower_chunk or "hiwalay" in lower_chunk:
                    notes_list.append("Pack separately")

                display_name = best_item["name"]
                if custom_suffix:
                    display_name = f"{display_name} ({', '.join(custom_suffix)})"

                item_entry = {
                    "name": display_name,
                    "baseName": best_item["name"],
                    "qty": qty,
                    "price": base_price,
                    "subtotal": round(base_price * qty, 2),
                    "notes": " · ".join(notes_list),
                }
                person_items.append(item_entry)
                all_cart_items.append(item_entry)

        if person_items:
            person_total = round(sum(i["subtotal"] for i in person_items), 2)
            parsed_members.append({
                "person": person,
                "items": person_items,
                "total": person_total,
            })

    grand_total = round(sum(m["total"] for m in parsed_members), 2)
    return {
        "members": parsed_members,
        "cart_items": all_cart_items,
        "grand_total": grand_total,
        "member_count": len(parsed_members),
    }


_RETIRED_FEATURES = {
    "barkada",
    "barkada_split",
    "bread_doctor",
    "gift_note",
    "mystery_box",
    "home_pair",
    "habit_coach",
    "quiz",
}


def handle_customer_ai_request(feature: str, payload: Dict[str, Any], menu_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Caption requests only. Older suite features are retired."""
    feature = (feature or "").strip().lower()

    if feature in _RETIRED_FEATURES:
        return {
            "status": "unavailable",
            "feature": feature,
            "message": "Only the caption feature is available.",
        }

    # Optional Gemini enhancement for open-ended text prompts
    custom_prompt = payload.get("prompt")
    if custom_prompt:
        gemini_reply = _call_optional_gemini(str(custom_prompt))
        if gemini_reply:
            return {"status": "ok", "source": "gemini", "reply": gemini_reply}

    return {
        "status": "ok",
        "source": "generation_bread_ai",
        "feature": feature,
    }
