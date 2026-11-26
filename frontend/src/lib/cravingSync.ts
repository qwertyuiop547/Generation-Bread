export interface CravingMenuItem {
  name: string;
  price: number;
  category?: "drink" | "food";
  stock?: number;
  track_stock?: boolean;
  is_hidden?: boolean;
  image_url?: string | null;
  color?: string;
}

export interface CravingWeather {
  temperature: number;
  code: number;
  precipitation: number;
  rain: number;
  observedAt: string;
  place: string;
}

export type CravingMood = "rain" | "heat" | "morning" | "evening";

export interface CravingCartLine {
  name: string;
  price: number;
  notes: string;
  menuName: string;
  image_url?: string | null;
  color?: string;
  swappedFrom?: string;
}

export interface CravingSuggestion {
  mood: CravingMood;
  kicker: string;
  line: string;
  reason: string;
  items: CravingCartLine[];
  total: number;
}

const OAT_MILK_PRICE = 40;

export function isInStock(item: CravingMenuItem): boolean {
  if (item.is_hidden) return false;
  if (!item.track_stock) return true;
  return Number(item.stock ?? 0) > 0;
}

export function isRainCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

export function isActuallyRaining(weather: Pick<CravingWeather, "code" | "precipitation" | "rain">): boolean {
  // A drizzle code with 0.0 mm of rain is model noise, not rain people can see.
  if (weather.rain >= 0.2) return true;
  if (weather.precipitation >= 0.5 && isRainCode(weather.code)) return true;
  return false;
}

export function isClearCode(code: number): boolean {
  return code === 0 || code === 1;
}

export function weatherPhrase(weather: Pick<CravingWeather, "code" | "temperature" | "precipitation" | "rain">): string {
  if (isActuallyRaining(weather)) return "Rainy";
  if (weather.temperature >= 30) return "Hot";
  if (weather.temperature <= 25) return "Cool";
  if (isClearCode(weather.code)) return "Clear";
  return "Cloudy";
}

export function manilaHour(date: Date): number {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(value);
}

export function pickMood(date: Date, weather: CravingWeather | null): CravingMood {
  const hour = manilaHour(date);
  const rainy = weather ? isActuallyRaining(weather) : false;
  const cold = weather ? weather.temperature <= 25 : false;
  if (rainy || cold) return "rain";

  const hot = weather ? weather.temperature >= 30 : hour >= 11 && hour < 15;
  const blazing = weather ? isClearCode(weather.code) || hot : hour >= 11 && hour < 15;
  if (hour >= 11 && hour < 16 && blazing) return "heat";
  if (hour >= 5 && hour < 11) return "morning";
  return "evening";
}

function findItem(menu: CravingMenuItem[], query: string, category?: "food" | "drink") {
  const needle = query.toLowerCase();
  return menu.find((item) => {
    if (category && (item.category || "drink") !== category) return false;
    return item.name.toLowerCase() === needle;
  });
}

function firstAvailable(
  menu: CravingMenuItem[],
  names: string[],
  category: "food" | "drink"
): { item: CravingMenuItem; swappedFrom?: string } | null {
  const preferred = names
    .map((name) => findItem(menu, name, category))
    .filter((item): item is CravingMenuItem => Boolean(item));
  const available = preferred.find((item) => isInStock(item));
  if (!available) {
    const any = menu.find((item) => (item.category || "drink") === category && isInStock(item));
    if (!any) return null;
    return { item: any, swappedFrom: names[0] };
  }
  if (available.name.toLowerCase() !== names[0].toLowerCase()) {
    return { item: available, swappedFrom: names[0] };
  }
  return { item: available };
}

function drinkLine(
  item: CravingMenuItem,
  sugar: string,
  addOns: string[],
  notes: string,
  swappedFrom?: string
): CravingCartLine {
  const extra = addOns.includes("Oat Milk Swap") ? OAT_MILK_PRICE : 0;
  const addOnText = addOns.length > 0 ? `, ${addOns.join(", ")}` : "";
  return {
    menuName: item.name,
    name: `${item.name} (Small, ${sugar} Sugar${addOnText})`,
    price: Number(item.price) + extra,
    notes,
    image_url: item.image_url,
    color: item.color,
    swappedFrom,
  };
}

function foodLine(item: CravingMenuItem, notes: string, swappedFrom?: string): CravingCartLine {
  return {
    menuName: item.name,
    name: item.name,
    price: Number(item.price),
    notes,
    image_url: item.image_url,
    color: item.color,
    swappedFrom,
  };
}

export function buildCravingSuggestion(
  menu: CravingMenuItem[],
  date: Date,
  weather: CravingWeather | null
): CravingSuggestion | null {
  const mood = pickMood(date, weather);

  if (mood === "rain") {
    const food = firstAvailable(
      menu,
      ["Ube Cheese Pandesal", "Pork Floss Ensaymada", "Ham & Cheese Croissant"],
      "food"
    );
    const drink = firstAvailable(menu, ["Matcha Latte"], "drink");
    const items = [
      food ? foodLine(food.item, "Serve warm", food.swappedFrom) : null,
      drink ? drinkLine(drink.item, "100%", [], "Serve hot", drink.swappedFrom) : null,
    ].filter((item): item is CravingCartLine => Boolean(item));
    if (items.length === 0) return null;
    const foodName = food?.item.name;
    const drinkName = drink?.item.name;
    const line =
      foodName && drinkName
        ? `Warm ${foodName} + Hot ${drinkName}`
        : foodName
          ? `Warm ${foodName}`
          : `Hot ${drinkName}`;
    return {
      mood,
      kicker: "Rainy-day comfort",
      line,
      reason:
        weather && weather.temperature <= 25
          ? "It's cool in Tacloban. A warm bake and a hot drink fit right now."
          : "It's raining in Tacloban. A warm bake and a hot drink fit right now.",
      items,
      total: items.reduce((sum, item) => sum + item.price, 0),
    };
  }

  if (mood === "heat") {
    const drink = firstAvailable(menu, ["Matcha Latte"], "drink");
    if (!drink) return null;
    const item = drinkLine(drink.item, "75%", ["Oat Milk Swap"], "Iced", drink.swappedFrom);
    const icedName = drink.item.name.toLowerCase().includes("matcha")
      ? "Iced Matcha Latte (75% sugar, Oat Milk)"
      : `Iced ${drink.item.name} (75% sugar, Oat Milk)`;
    return {
      mood,
      kicker: "Beat the heat",
      line: icedName,
      reason: "It's hot in Tacloban. A cold drink is the better pick right now.",
      items: [item],
      total: item.price,
    };
  }

  if (mood === "morning") {
    const food = firstAvailable(
      menu,
      ["Pork Floss Ensaymada", "Ube Cheese Pandesal", "Sausage Croissant"],
      "food"
    );
    const drink = firstAvailable(menu, ["Matcha Latte"], "drink");
    const items = [
      food ? foodLine(food.item, "Serve warm", food.swappedFrom) : null,
      drink ? drinkLine(drink.item, "50%", [], "Serve hot", drink.swappedFrom) : null,
    ].filter((item): item is CravingCartLine => Boolean(item));
    if (items.length === 0) return null;
    return {
      mood,
      kicker: "Morning bake",
      line: items.map((item) => item.menuName).join(" + "),
      reason: "It's morning. A warm bake and matcha to start the day.",
      items,
      total: items.reduce((sum, item) => sum + item.price, 0),
    };
  }

  const food = firstAvailable(
    menu,
    ["Pistachio Pain au Chocolat", "Ham & Cheese Croissant", "Ube Cheese Pandesal"],
    "food"
  );
  const drink = firstAvailable(menu, ["Matcha Latte"], "drink");
  const items = [
    food ? foodLine(food.item, "", food.swappedFrom) : null,
    drink ? drinkLine(drink.item, "75%", [], "Less ice", drink.swappedFrom) : null,
  ].filter((item): item is CravingCartLine => Boolean(item));
  if (items.length === 0) return null;
  return {
    mood: "evening",
    kicker: "After-hours pair",
    line: items.map((item) => item.menuName).join(" + "),
      reason: "It's afternoon or evening. A bake and a matcha for a break.",
    items,
    total: items.reduce((sum, item) => sum + item.price, 0),
  };
}

export const TACLOBAN_CITY = { latitude: 11.24333, longitude: 125.00472, name: "Tacloban City" };

async function resolveTaclobanCity() {
  try {
    const res = await fetch(
      "https://geocoding-api.open-meteo.com/v1/search?name=Tacloban%20City&count=5&language=en&format=json&countryCode=PH",
      { cache: "no-store" }
    );
    if (!res.ok) return TACLOBAN_CITY;
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const city = results.find(
      (row: { name?: string; country_code?: string; admin1?: string }) =>
        row?.name === "Tacloban City" &&
        row?.country_code === "PH" &&
        String(row?.admin1 || "").includes("Eastern")
    );
    if (!city || !Number.isFinite(Number(city.latitude)) || !Number.isFinite(Number(city.longitude))) {
      return TACLOBAN_CITY;
    }
    return {
      latitude: Number(city.latitude),
      longitude: Number(city.longitude),
      name: "Tacloban City",
    };
  } catch {
    return TACLOBAN_CITY;
  }
}

let taclobanPlace: Promise<{ latitude: number; longitude: number; name: string }> | null = null;

function taclobanCity() {
  if (!taclobanPlace) taclobanPlace = resolveTaclobanCity();
  return taclobanPlace;
}

export async function fetchTaclobanWeather(): Promise<CravingWeather | null> {
  const place = await taclobanCity();
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    "&current=temperature_2m,weather_code,precipitation,rain&timezone=Asia%2FManila";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  const temperature = Number(data?.current?.temperature_2m);
  const code = Number(data?.current?.weather_code);
  const precipitation = Number(data?.current?.precipitation ?? 0);
  const rain = Number(data?.current?.rain ?? 0);
  const observedAt = String(data?.current?.time || "");
  if (!Number.isFinite(temperature) || !Number.isFinite(code) || !observedAt) return null;
  return {
    temperature,
    code,
    precipitation: Number.isFinite(precipitation) ? precipitation : 0,
    rain: Number.isFinite(rain) ? rain : 0,
    observedAt,
    place: place.name,
  };
}
