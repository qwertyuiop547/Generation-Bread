export interface IFlavorList {
    name: string;
    image: string;
    bgColor: string;
    rotation: string;
}

export interface INutrientList {
    label: string;
    amount: string;
}

export interface ICard {
    src: string;
    rotation: string;
    name: string;
    img: string;
    translation?: string;
}

export const STAFF_POSITIONS: { key: string; label: string; badge: string; badgeText: string; icon: string }[] = [
    { key: "barista",  label: "Barista",  badge: "bg-amber-100",  badgeText: "text-amber-800", icon: "☕" },
    { key: "cashier",  label: "Cashier",  badge: "bg-emerald-100", badgeText: "text-emerald-800", icon: "💰" },
    { key: "manager",  label: "Manager",  badge: "bg-violet-100",  badgeText: "text-violet-800", icon: "👔" },
    { key: "delivery", label: "Delivery", badge: "bg-sky-100",     badgeText: "text-sky-800", icon: "🛵" },
    { key: "cleaner",  label: "Cleaner",  badge: "bg-rose-100",    badgeText: "text-rose-800", icon: "🧹" },
];

export const flavorList: IFlavorList[] = [
    {
        name: "Ube Cheese Pandesal",
        image: "/images/flavor-ube-cheese-pandesal.png",
        bgColor: "#5b2c6f",
        rotation: "rotate-0",
    },
    {
        name: "Pork Floss Ensaymada",
        image: "/images/flavor-pork-floss-ensaymada.png",
        bgColor: "#c47a2c",
        rotation: "rotate-0",
    },
    {
        name: "Matcha Latte",
        image: "/images/flavor-matcha-latte.png",
        bgColor: "#2f5d50",
        rotation: "rotate-0",
    },
    {
        name: "Sausage Croissant",
        image: "/images/flavor-sausage-croissant.png",
        bgColor: "#6b3e26",
        rotation: "rotate-0",
    },
    {
        name: "Ham & Cheese Croissant",
        image: "/images/flavor-ham-cheese-croissant.png",
        bgColor: "#8a6a2f",
        rotation: "rotate-0",
    },
    {
        name: "Pistachio Pain au Chocolat",
        image: "/images/flavor-pistachio-pain-au-chocolat.png",
        bgColor: "#6b7c3a",
        rotation: "rotate-0",
    },
];

/** Same photos as the home flavor cards — use when menu API has no uploaded image */
export const menuImageByName: Record<string, string> = Object.fromEntries(
  flavorList.map((f) => [f.name, f.image])
);

export function getMenuItemImage(
  name?: string | null,
  imageUrl?: string | null,
  color?: string
): string {
  if (imageUrl && imageUrl.trim()) return imageUrl;
  if (!name) return "/images/generation-bread-ube-cheese-pandesal.png";

  const cleanName = name.split("(")[0].trim();
  if (menuImageByName[cleanName]) return menuImageByName[cleanName];
  if (menuImageByName[name]) return menuImageByName[name];

  const lower = cleanName.toLowerCase();
  for (const [k, v] of Object.entries(menuImageByName)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }

  if (lower.includes("pandesal") || lower.includes("ube")) return "/images/generation-bread-ube-cheese-pandesal.png";
  if (lower.includes("ensaymada") || lower.includes("floss")) return "/images/flavor-pork-floss-ensaymada.png";
  if (lower.includes("matcha")) return "/images/flavor-matcha-latte.png";
  if (lower.includes("sausage")) return "/images/flavor-sausage-croissant.png";
  if (lower.includes("ham") || lower.includes("cheese croissant")) return "/images/flavor-ham-cheese-croissant.png";
  if (lower.includes("pistachio") || lower.includes("pain au chocolat")) return "/images/flavor-pistachio-pain-au-chocolat.png";
  if (lower.includes("cheese roll") || lower.includes("roll")) return "/images/generation-bread-cheese-roll.png";
  if (lower.includes("chocolate") || lower.includes("choco") || lower.includes("cocoa") || lower.includes("mocha")) return "/images/brown-drink.webp";
  if (lower.includes("latte") || lower.includes("coffee") || lower.includes("espresso") || lower.includes("americano")) return "/images/black-drink.webp";
  if (lower.includes("milk") || lower.includes("vanilla")) return "/images/white-drink.webp";
  if (lower.includes("berry") || lower.includes("strawberry") || lower.includes("red")) return "/images/red-drink.webp";
  if (lower.includes("orange") || lower.includes("mango") || lower.includes("citrus")) return "/images/orange-drink.webp";
  if (lower.includes("blue") || lower.includes("taro")) return "/images/blue-drink.webp";

  if (color) return `/images/${color}-drink.webp`;
  return "/images/generation-bread-ube-cheese-pandesal.png";
}

export const nutrientList: INutrientList[] = [
    { label: "Potassium", amount: "245mg" },
    { label: "Calcium", amount: "500mg" },
    { label: "Vitamin A", amount: "176mcg" },
    { label: "Vitamin D", amount: "5mcg" },
    { label: "Iron", amount: "1mg" },
];

export const card: ICard[] = [
    {
        src: "/videos/gb-review1.mp4",
        rotation: "rotate-z-[-10deg]",
        name: "Customer 1",
        img: "/images/gb-review1.jpg",
        translation: "translate-y-[-5%]",
    },
    {
        src: "/videos/gb-review2.mp4",
        rotation: "rotate-z-[4deg]",
        name: "Customer 2",
        img: "/images/gb-review2.jpg",
    },
    {
        src: "/videos/gb-review3.mp4",
        rotation: "rotate-z-[-4deg]",
        name: "Customer 3",
        img: "/images/gb-review3.jpg",
        translation: "translate-y-[-5%]",
    },
    {
        src: "/videos/gb-review4.mp4",
        rotation: "rotate-z-[4deg]",
        name: "Customer 4",
        img: "/images/gb-review4.jpg",
        translation: "translate-y-[5%]",
    },
    {
        src: "/videos/gb-review5.mp4",
        rotation: "rotate-z-[-10deg]",
        name: "Customer 5",
        img: "/images/gb-review5.jpg",
    },
    {
        src: "/videos/gb-review6.mp4",
        rotation: "rotate-z-[4deg]",
        name: "Customer 6",
        img: "/images/gb-review6.jpg",
        translation: "translate-y-[5%]",
    },
    {
        src: "/videos/gb-review7.mp4",
        rotation: "rotate-z-[-3deg]",
        name: "Customer 7",
        img: "/images/gb-review7.jpg",
        translation: "translate-y-[10%]",
    },
    {
        src: "/videos/gb-review8.mp4",
        rotation: "rotate-z-[6deg]",
        name: "Customer 8",
        img: "/images/gb-review8.jpg",
        translation: "translate-y-[-3%]",
    },
];
