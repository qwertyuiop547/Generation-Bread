import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "spylt_backend.settings")
django.setup()

from accounts.models import MenuItem

# Same 6 items as the home page flavor cards (frontend/src/constants flavorList)
menu_items = [
    {
        "name": "Ube Cheese Pandesal",
        "category": "food",
        "color": "purple",
        "price": 65.00,
        "description": "Soft ube pandesal with that melty cheese pull — purple, warm, and baked fresh daily.",
        "bg_color": "#5b2c6f",
        "is_hidden": False,
    },
    {
        "name": "Pork Floss Ensaymada",
        "category": "food",
        "color": "orange",
        "price": 75.00,
        "description": "Buttery ensaymada topped with savory pork floss — soft, fluffy, and filling.",
        "bg_color": "#c47a2c",
        "is_hidden": False,
    },
    {
        "name": "Matcha Latte",
        "category": "drink",
        "color": "green",
        "price": 149.00,
        "description": "Smooth matcha latte with creamy milk — earthy, lightly sweet, and refreshing.",
        "bg_color": "#2f5d50",
        "is_hidden": False,
    },
    {
        "name": "Sausage Croissant",
        "category": "food",
        "color": "brown",
        "price": 95.00,
        "description": "Flaky croissant wrapped around a savory sausage — golden and freshly baked.",
        "bg_color": "#6b3e26",
        "is_hidden": False,
    },
    {
        "name": "Ham & Cheese Croissant",
        "category": "food",
        "color": "gold",
        "price": 99.00,
        "description": "Classic ham and cheese in a buttery croissant — melty, flaky, and satisfying.",
        "bg_color": "#8a6a2f",
        "is_hidden": False,
    },
    {
        "name": "Pistachio Pain au Chocolat",
        "category": "food",
        "color": "olive",
        "price": 120.00,
        "description": "Chocolate-filled pastry with pistachio — crisp layers and a rich finish.",
        "bg_color": "#6b7c3a",
        "is_hidden": False,
    },
]

keep_names = {item["name"] for item in menu_items}

# Remove old Spylt drink catalog so admin menu matches the home page
removed, _ = MenuItem.objects.exclude(name__in=keep_names).delete()
if removed:
    print(f"Removed {removed} outdated menu item(s).")

for item_data in menu_items:
    MenuItem.objects.update_or_create(
        name=item_data["name"],
        defaults=item_data,
    )
    print(f"Created/Updated: {item_data['name']}")

print("Menu items seeded successfully (Generation Bread — matches home flavor cards)!")
