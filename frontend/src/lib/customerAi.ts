export interface AiMenuItem {
  id?: string | number;
  name: string;
  price: number;
  description: string;
  category?: "drink" | "food";
  color?: string;
  bgColor?: string;
  image_url?: string | null;
}

export interface AiOrderItem {
  name: string;
  price: number;
  qty: number;
}

export interface AiOrderRecord {
  id: string;
  items: AiOrderItem[];
  total: number;
  date: string;
  status: string;
}

/* ============================================================================
 * 1. AI BARKADA / OFFICE ORDER CONSOLIDATOR & BILL SPLITTER
 * ============================================================================ */
export interface BarkadaParsedItem {
  name: string;
  baseName: string;
  qty: number;
  price: number;
  subtotal: number;
  notes: string;
}

export interface BarkadaMemberSplit {
  person: string;
  items: BarkadaParsedItem[];
  subtotal: number;
  sharedFee: number;
  totalOwed: number;
}

export interface BarkadaSplitResult {
  members: BarkadaMemberSplit[];
  allCartItems: BarkadaParsedItem[];
  itemsSubtotal: number;
  extraSharedFee: number;
  grandTotal: number;
  summaryText: string;
}

export const BARKADA_SAMPLE_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  {
    label: "🏢 Office Merienda (4 pax)",
    text: `Mark: 1 large Matcha Latte less sweet, 1 Sausage Croissant paki-init\nSarah: 2 Ube Cheese Pandesal, 1 Matcha Latte oat milk\n Carlo: 1 Ham & Cheese Croissant at 1 Pistachio Pain au Chocolat\nBea: 1 Pork Floss Ensaymada, 1 medium Matcha Latte no sugar`,
  },
  {
    label: "📚 Thesis Study Group (3 pax)",
    text: `Jules: 2 Ham & Cheese Croissant paki-init\nMia: 1 Pistachio Pain au Chocolat, 1 Large Matcha Latte extra protein\nKen: 2 Ube Cheese Pandesal, 1 Pork Floss Ensaymada`,
  },
  {
    label: "🥐 Weekend Family Box",
    text: `Mama: 2 Ube Cheese Pandesal, 1 Pork Floss Ensaymada\nPapa: 1 Sausage Croissant paki-init\nAte: 1 Pistachio Pain au Chocolat, 1 Medium Matcha Latte oat milk`,
  },
];

export function parseBarkadaOrder(
  rawText: string,
  menuItems: AiMenuItem[],
  extraFee: number = 0
): BarkadaSplitResult {
  const catalog: AiMenuItem[] =
    menuItems.length > 0
      ? menuItems
      : [
          { name: "Ube Cheese Pandesal", price: 65, description: "Soft ube pandesal with melty cheese", category: "food" },
          { name: "Pork Floss Ensaymada", price: 75, description: "Buttery ensaymada with savory pork floss", category: "food" },
          { name: "Matcha Latte", price: 149, description: "Smooth matcha latte with creamy milk", category: "drink" },
          { name: "Sausage Croissant", price: 95, description: "Flaky croissant wrapped around savory sausage", category: "food" },
          { name: "Ham & Cheese Croissant", price: 99, description: "Classic ham and cheese buttery croissant", category: "food" },
          { name: "Pistachio Pain au Chocolat", price: 120, description: "Chocolate-filled pastry with pistachio", category: "food" },
        ];

  const lines = rawText
    .split(/[\r\n;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rawMembers: { person: string; items: BarkadaParsedItem[] }[] = [];
  const allCartItems: BarkadaParsedItem[] = [];

  lines.forEach((line, idx) => {
    const m = line.match(/^([A-Za-z0-9_.\s]{2,22}?)\s*[:\-–—]\s*(.+)$/);
    const person = m ? m[1].trim() : `Guest ${idx + 1}`;
    const orderBody = m ? m[2].trim() : line;

    // Split by comma, plus, or Tagalog/English connectors ("at", "and")
    // Careful not to split "Ham & Cheese"
    const segments = orderBody
      .split(/,|\+|\s+at\s+|\s+and\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const personItems: BarkadaParsedItem[] = [];

    segments.forEach((seg) => {
      const lower = seg.toLowerCase();

      // Quantity detection (numbers or Tagalog/English words)
      let qty = 1;
      const numMatch = lower.match(/(?:^|\s)(\d+)\s*x?(?:\s|$)/);
      if (numMatch) {
        qty = Math.max(1, Math.min(20, parseInt(numMatch[1], 10)));
      } else if (/\b(dalawa|dalawang|two)\b/.test(lower)) {
        qty = 2;
      } else if (/\b(tatlo|tatlong|three)\b/.test(lower)) {
        qty = 3;
      } else if (/\b(apat|four)\b/.test(lower)) {
        qty = 4;
      }

      // Fuzzy match against menu catalog
      let bestMatch = catalog[0];
      let bestScore = -1;

      for (const item of catalog) {
        const itemLower = item.name.toLowerCase();
        const words = itemLower.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
        let score = 0;
        if (lower.includes(itemLower)) score += 10;
        for (const w of words) {
          if (lower.includes(w)) score += 3;
        }
        // Helpful keyword aliases
        if (itemLower.includes("matcha") && (lower.includes("latte") || lower.includes("kape") || lower.includes("coffee") || lower.includes("drink"))) {
          score += 1.5;
        }
        if (itemLower.includes("pandesal") && (lower.includes("ube") || lower.includes("pandesal") || lower.includes("cheese"))) {
          score += 2;
        }
        if (itemLower.includes("ensaymada") && (lower.includes("floss") || lower.includes("ensaymada") || lower.includes("pork"))) {
          score += 2;
        }
        if (itemLower.includes("pistachio") && (lower.includes("choco") || lower.includes("pain") || lower.includes("pistachio"))) {
          score += 2;
        }
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }

      const isFood = (bestMatch.category || "drink") === "food";
      let unitPrice = Number(bestMatch.price) || 95;
      let fullName = bestMatch.name;

      if (!isFood) {
        let size: "Small" | "Medium" | "Large" = "Small";
        if (/\blarge\b|\blrg\b/.test(lower)) {
          size = "Large";
          unitPrice += 40;
        } else if (/\bmedium\b|\bmed\b/.test(lower)) {
          size = "Medium";
          unitPrice += 20;
        }

        let sugar = "100%";
        if (/no sugar|zero sugar|0%|unsweetened/.test(lower)) {
          sugar = "0%";
        } else if (/25%|quarter sweet/.test(lower)) {
          sugar = "25%";
        } else if (/less sweet|less sugar|half sweet|50%/.test(lower)) {
          sugar = "50%";
        } else if (/75%/.test(lower)) {
          sugar = "75%";
        }

        const addOns: string[] = [];
        if (/oat\s*milk|oat/.test(lower)) {
          addOns.push("Oat Milk Swap");
          unitPrice += 40;
        }
        if (/extra\s*protein|protein|extra\s*shot/.test(lower)) {
          addOns.push("Extra Protein");
          unitPrice += 30;
        }

        const addOnText = addOns.length > 0 ? `, ${addOns.join(", ")}` : "";
        fullName = `${bestMatch.name} (${size}, ${sugar} Sugar${addOnText})`;
      }

      const notesParts: string[] = [`For ${person}`];
      if (/init|warm|toast|mainit|reheat/.test(lower)) {
        notesParts.push("Warm / toasted please");
      }
      if (/less ice|konting yelo|no ice/.test(lower)) {
        notesParts.push("Less ice");
      }
      if (/hiwalay|separate/.test(lower)) {
        notesParts.push("Pack separately");
      }

      const parsedItem: BarkadaParsedItem = {
        name: fullName,
        baseName: bestMatch.name,
        qty,
        price: unitPrice,
        subtotal: unitPrice * qty,
        notes: notesParts.join(" · "),
      };

      personItems.push(parsedItem);
      allCartItems.push(parsedItem);
    });

    if (personItems.length > 0) {
      rawMembers.push({ person, items: personItems });
    }
  });

  const count = Math.max(1, rawMembers.length);
  const cleanExtra = Math.max(0, Number(extraFee) || 0);
  const perPersonFee = rawMembers.length > 0 ? cleanExtra / count : 0;

  const members: BarkadaMemberSplit[] = rawMembers.map((m) => {
    const subtotal = m.items.reduce((acc, i) => acc + i.subtotal, 0);
    const totalOwed = subtotal + perPersonFee;
    return {
      person: m.person,
      items: m.items,
      subtotal,
      sharedFee: perPersonFee,
      totalOwed,
    };
  });

  const itemsSubtotal = members.reduce((acc, m) => acc + m.subtotal, 0);
  const grandTotal = itemsSubtotal + cleanExtra;

  const summaryLines = [
    `🥐 GENERATION BREAD — BARKADA BILL SPLIT`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    ...members.map((m) => {
      const itemsDesc = m.items.map((i) => `${i.qty}x ${i.baseName}`).join(", ");
      const feeNote = m.sharedFee > 0 ? ` (+₱${m.sharedFee.toFixed(0)} shared fee)` : "";
      return `• ${m.person}: ₱${m.totalOwed.toFixed(2)} — [${itemsDesc}${feeNote}]`;
    }),
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `💰 GRAND TOTAL: ₱${grandTotal.toFixed(2)} (${allCartItems.reduce((a, b) => a + b.qty, 0)} items)`,
  ];

  return {
    members,
    allCartItems,
    itemsSubtotal,
    extraSharedFee: cleanExtra,
    grandTotal,
    summaryText: summaryLines.join("\n"),
  };
}

/* ============================================================================
 * 2. AI BREAD DOCTOR (REHEATING & STORAGE GUIDE)
 * ============================================================================ */
export type ApplianceType = "air_fryer" | "oven" | "pan" | "microwave" | "storage";
export type BreadCondition = "same_day" | "next_day_chilled" | "frozen";

export interface BreadDoctorPrescription {
  itemName: string;
  pastryCategory: string;
  applianceLabel: string;
  temperature: string;
  duration: string;
  steps: string[];
  proSecret: string;
  warning: string;
  textureResult: string;
  shelfLifeTip: string;
}

export function getBreadDoctorAdvice(
  itemName: string,
  appliance: ApplianceType,
  condition: BreadCondition
): BreadDoctorPrescription {
  const lower = (itemName || "Croissant").toLowerCase();
  const isCroissant = /croissant|pain au chocolat|danish|puff|laminated/.test(lower);
  const isPandesal = /pandesal|ube|bun|roll/.test(lower);
  const isEnsaymada = /ensaymada|floss|brioche/.test(lower);
  const isDrink = /latte|matcha|coffee|americano|mocha|brew|drink/.test(lower);

  const extraTimeNote =
    condition === "frozen"
      ? " (+2 mins from frozen; let sit 5 mins at room temp first)"
      : condition === "next_day_chilled"
      ? " (+1 min since chilled from fridge)"
      : "";

  if (isDrink) {
    return {
      itemName,
      pastryCategory: "Handcrafted Cafe Beverage",
      applianceLabel: appliance === "storage" ? "Fridge & Tumbler Care" : "Gentle Beverage Re-warm",
      temperature: appliance === "storage" ? "4°C Chilled" : "60°C – 65°C (Never Boil)",
      duration: appliance === "storage" ? "Up to 18 Hours" : "45 – 60 seconds",
      steps: [
        "If iced: Strain out remaining ice cubes before storing in the refrigerator so the milk & espresso/matcha don't get watered down.",
        "Before drinking or gently warming: Stir or shake vigorously for 10 seconds to re-emulsify the milk proteins and matcha/espresso.",
        appliance === "pan"
          ? "Warm gently on low heat in a small saucepan while whisking—stop as soon as steam rises (around 62°C)."
          : "Transfer to a ceramic mug and warm in short 20-second intervals, stirring in between.",
      ],
      proSecret: "Add 1–2 fresh ice cubes or a splash of fresh milk right before serving to restore the velvety café crema texture!",
      warning: "Never boil milk-based lattes or matcha above 70°C—boiling scorches the milk sweetness and turns matcha bitter.",
      textureResult: "Silky, frothy body with preserved aromatic notes",
      shelfLifeTip: "Best consumed within 4 hours at room temp, or up to 18 hours sealed in the fridge.",
    };
  }

  if (appliance === "microwave") {
    return {
      itemName,
      pastryCategory: isCroissant ? "Laminated Butter Pastry" : "Artisanal Soft Bake",
      applianceLabel: "Microwave (Emergency Rescue Mode)",
      temperature: "Medium Power (50%–60% Wattage)",
      duration: isPandesal || isEnsaymada ? `12 – 18 seconds${extraTimeNote}` : `10 – 15 seconds MAX`,
      steps: [
        "Wrap the pastry loosely in a dry paper towel to absorb excess steam.",
        "Place a small microwave-safe cup with 2 tablespoons of water beside the plate (keeps soft bread from drying out).",
        "Heat in 10-second bursts only. Let rest for 30 seconds before biting as cheese or chocolate fillings get lava-hot first!",
      ],
      proSecret: isCroissant
        ? "After 10 seconds in the microwave, toss it onto a dry hot pan for 45 seconds per side to crisp the bottom crust back up!"
        : "Sprinkle 2–3 drops of water on top of Ube Pandesal before microwaving for 12 seconds—it comes out pillowy like fresh steam!",
      warning: isCroissant
        ? "⚠️ Bread Doctor Alert: Microwaving croissants for more than 15 seconds melts the 27 butter layers into steam, making the crust soggy and chewy. Use an Air Fryer or Oven whenever possible!"
        : "⚠️ Overheating by even 10 extra seconds will harden the bread crumb once it cools down.",
      textureResult: isCroissant ? "Warm & soft interior (less flaky crust)" : "Steamy, pillowy soft & melty center",
      shelfLifeTip: "Consume immediately after microwaving while warm.",
    };
  }

  if (appliance === "storage") {
    return {
      itemName,
      pastryCategory: isCroissant ? "Laminated French Viennoiserie" : isEnsaymada ? "Rich Brioche Pastry" : "Soft Filled Artisan Bread",
      applianceLabel: "Artisanal Storage & Freshness Protocol",
      temperature: "Room Temp (20–24°C) or Freezer (-18°C)",
      duration: isCroissant ? "2 Days Room Temp · 3 Weeks Frozen" : "3 Days Room Temp · 1 Month Frozen",
      steps: [
        "Day 1–2: Keep in a breathable paper bakery bag or breadbox at cool room temperature away from direct sunlight.",
        "Avoid storing naked bread in the fridge (4°C)—cold air accelerates starch retrogradation and dries out the crumb 3x faster!",
        "For long storage: Wrap tightly in parchment paper + zip-top freezer bag and freeze directly while fresh.",
      ],
      proSecret: "Freeze pastries on the same day you buy them if you won't eat them within 24 hours—when reheated from frozen in an air fryer, they taste 98% identical to fresh-out-of-the-oven!",
      warning: "Never seal warm bread in plastic bags; trapped condensation softens the flaky crust and invites mold.",
      textureResult: "Preserved butter aroma & moisture lock",
      shelfLifeTip: isEnsaymada || isPandesal ? "Because of savory pork floss / cheese filling, refrigerate in an airtight container if keeping past 36 hours." : "Best revived in a 160°C Air Fryer for 3 minutes before serving.",
    };
  }

  if (appliance === "pan") {
    return {
      itemName,
      pastryCategory: isCroissant ? "Flaky Butter Croissant / Viennoiserie" : "Artisanal Stuffed Bake",
      applianceLabel: "Stovetop Non-Stick Pan / Skillet",
      temperature: "Very Low Flame (130°C – 140°C surface)",
      duration: `2 – 3 mins per side${extraTimeNote}`,
      steps: [
        "Preheat a dry non-stick pan on the lowest stove setting for 1 minute (no oil or butter needed!).",
        isEnsaymada
          ? "Place Ensaymada bottom-down ONLY, add 3 drops of water to the side of the pan, and cover with a lid for 2.5 minutes so the pork floss on top doesn't burn."
          : "Place the pastry in the pan, add 1/2 teaspoon of water to the corner of the pan, and cover with a tight lid to create a mini-oven effect.",
        "Remove the lid for the final 45 seconds to crisp up the base.",
      ],
      proSecret: "Covering the pan traps gentle radiant heat that melts the cheese/chocolate core without scorching the bottom!",
      warning: "Never use medium or high flame—sugar and butter in the dough caramelize and burn rapidly on direct metal.",
      textureResult: "Crispy golden base with a warm, gooey interior",
      shelfLifeTip: "Let rest 1 minute off the pan so the bottom crust sets crisp.",
    };
  }

  if (appliance === "air_fryer") {
    return {
      itemName,
      pastryCategory: isCroissant ? "27-Layer Butter Viennoiserie" : isEnsaymada ? "Topped Brioche Ensaymada" : "Cheese-Filled Artisan Bake",
      applianceLabel: "Air Fryer (Gold Standard Revival)",
      temperature: isEnsaymada ? "150°C (300°F)" : "160°C (320°F)",
      duration: isCroissant ? `2.5 – 3.5 minutes${extraTimeNote}` : `3 – 4 minutes${extraTimeNote}`,
      steps: [
        isEnsaymada
          ? "Tent a small piece of aluminum foil loosely over the top of the Pork Floss Ensaymada so the high-velocity fan doesn't blow away or scorch the delicate pork floss."
          : "Lightly mist the exterior with a tiny spritz of water (or flick 3 drops of water with your fingers) to hydrate the outer crust.",
        `Place in the Air Fryer basket at ${isEnsaymada ? "150°C" : "160°C"} for ${isCroissant ? "3 minutes" : "3.5 minutes"}.`,
        "CRITICAL STEP: Let the pastry rest on a plate for 90 seconds after taking it out—the molten butter layers re-crystallize into glass-like shattering flakes as it cools slightly!",
      ],
      proSecret: "That 90-second cool-down rest is the secret French bakers use—if you cut a croissant straight out of the heat, it squishes; after 90 seconds, it shatters with a loud crunch!",
      warning: "Do not set Air Fryer to 200°C! High convection heat burns chocolate, pistachio, and pork floss toppings before the center warms through.",
      textureResult: "Bakery-fresh shattering flaky crust & molten center",
      shelfLifeTip: "Tastes 100% freshly baked out of our Generation Bread deck oven.",
    };
  }

  // Default: Oven / Toaster Oven
  return {
    itemName,
    pastryCategory: isCroissant ? "Artisanal Laminated Pastry" : "Signature Fresh Bake",
    applianceLabel: "Oven / Countertop Toaster Oven",
    temperature: "175°C (350°F)",
    duration: `4 – 5 minutes${extraTimeNote}`,
    steps: [
      "Preheat your oven or toaster oven to 175°C (350°F) for at least 3 minutes before placing the pastry inside.",
      "Place the pastry on a baking sheet or piece of foil (middle rack, away from the top red-hot heating coil).",
      "Bake for 4–5 minutes until the aroma of cultured butter fills your kitchen, then rest for 1 minute before serving.",
    ],
    proSecret: "In small toaster ovens where the top coil is very close to the bread, lay a loose sheet of foil on top for the first 3 minutes so the top doesn't brown too fast!",
    warning: "Never put cold pastry into an un-preheated toaster oven while the coils are blasting at max power to warm up.",
    textureResult: "Evenly heated crumb with a crisp, fragrant crust",
    shelfLifeTip: "Pair immediately with hot coffee or cold milk.",
  };
}

/* ============================================================================
 * 3. AI GIFT NOTE & MESSAGE WRITER ("SEND AS A GIFT")
 * ============================================================================ */
export type GiftOccasion =
  | "exam_cheer"
  | "birthday"
  | "peace_offering"
  | "romantic"
  | "thank_you"
  | "office_treat";

export type GiftTone = "sweet" | "taglish" | "witty" | "aesthetic";

export interface GeneratedGiftNote {
  id: string;
  headline: string;
  body: string;
  signOff: string;
  fullOrderNote: string;
}

export function generateGiftNotes(
  recipientName: string,
  senderName: string,
  occasion: GiftOccasion,
  tone: GiftTone,
  itemNames: string[]
): GeneratedGiftNote[] {
  const to = recipientName.trim() || "My Favorite Human";
  const from = senderName.trim() || "Someone rooting for you";
  const featuredItem =
    itemNames.length > 0 ? itemNames[0].replace(/\s*\(.*?\)$/, "") : "freshly baked croissants & warm brew";

  const templates: Record<GiftOccasion, Record<GiftTone, { headline: string; body: string; signOff: string }[]>> = {
    exam_cheer: {
      sweet: [
        {
          headline: `Fuel for Your Bright Mind, ${to}! ✨`,
          body: `Sending you warm ${featuredItem} from Generation Bread to power you through your review and deadlines. Take a deep breath—you've prepared for this and you're going to crush it!`,
          signOff: `Cheering for you always, ${from}`,
        },
        {
          headline: `One Sip Closer to Victory ☕`,
          body: `Whenever the study grind feels heavy, pause for 5 minutes and enjoy this ${featuredItem}. Proud of how hard you're working!`,
          signOff: `You've got this, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Laban sa Thesis / Exams, ${to}! 🔥🥐`,
          body: `Pampagising at pampatalino! Kainin mo muna itong ${featuredItem} bago ka mag-puyat ulit. Konting kembot na lang, pasado na 'yan!`,
          signOff: `Sagot ko na merienda mo, ${from}`,
        },
        {
          headline: `Bawal Mag-Pass Out, Mag-Croissant Muna! ☕`,
          body: `Huwag puro aral/trabaho, ${to}! Recharge muna with Generation Bread's ${featuredItem}. Good luck today, kaya mo 'yan!`,
          signOff: `Fighting! — ${from}`,
        },
      ],
      witty: [
        {
          headline: `Scientifically Proven to Boost Grades by 99% 🧠`,
          body: `Okay maybe not peer-reviewed, but ${featuredItem} definitely beats staring at a blank screen on an empty stomach. Go ace it, ${to}!`,
          signOff: `Your Academic Sponsor, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `Slow sips & steady focus for ${to}. 🌿`,
          body: `A little warmth from Generation Bread (${featuredItem}) to keep you company while you chase your goals today.`,
          signOff: `Warmly, ${from}`,
        },
      ],
    },
    birthday: {
      sweet: [
        {
          headline: `Happy Birthday, ${to}! 🎂🥐`,
          body: `May your year ahead be as warm, golden, and sweet as freshly baked ${featuredItem}. Wishing you endless joy and good coffee every single morning!`,
          signOff: `With love, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Happy Birthday, ${to}! Deserve Mo 'To! 🥳✨`,
          body: `Special delivery ng ${featuredItem} para sa birthday celebrant! Sana kasing sarap ng bagong lutong tinapay ang buong taon mo!`,
          signOff: `Cheers! — ${from}`,
        },
      ],
      witty: [
        {
          headline: `Another Year Older, Another Reason for Pastries 🥐`,
          body: `Forget counting candles, ${to}—let's count layers of butter in this ${featuredItem}. Happy Birthday!`,
          signOff: `Stay golden, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `Golden hour wishes for ${to}'s birthday. ✨`,
          body: `Celebrating your life today with artisanal bakes (${featuredItem}) and warm moments.`,
          signOff: `Always, ${from}`,
        },
      ],
    },
    peace_offering: {
      sweet: [
        {
          headline: `A Warm Peace Offering for ${to} 🕊️🥐`,
          body: `Words aren't always enough, so I'm starting with warm ${featuredItem}. I'm really sorry—hope this brings a little smile back to your face today.`,
          signOff: `Truly sorry, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Bati Na Tayo Please, ${to}? 🥺🥐`,
          body: `May dala akong ${featuredItem} mula sa Generation Bread pampalambot ng puso! Sorry na ha, huwag ka nang magtampo—kain ka na muna!`,
          signOff: `Peace offering mula kay ${from}`,
        },
      ],
      witty: [
        {
          headline: `Officially Bribing You with Carbs & Caffeine 🏳️`,
          body: `It is legally impossible to stay mad while eating warm ${featuredItem}. Truce, ${to}?`,
          signOff: `Waving the white napkin, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `Warmth to mend the day, for ${to}. ☕`,
          body: `Sending ${featuredItem} as a gentle apology and a fresh start.`,
          signOff: `Sincerely, ${from}`,
        },
      ],
    },
    romantic: {
      sweet: [
        {
          headline: `Just Because I Was Thinking of You, ${to} 💛`,
          body: `Saw this ${featuredItem} at Generation Bread and immediately thought of you. Hope your day feels a little sweeter with every bite!`,
          signOff: `Yours, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Para sa Pinaka-Sweet Kong Favorite, ${to} 🥰☕`,
          body: `Kumain ka na ba? Pinadalhan kita ng ${featuredItem} para maalala mong may nag-aalaga sa'yo kahit busy ang araw. Enjoy!`,
          signOff: `Love, ${from}`,
        },
      ],
      witty: [
        {
          headline: `I Like You More Than Fresh Croissants (And That's Saying A Lot) 🥐❤️`,
          body: `Sharing my ${featuredItem} with you is the highest form of romance I know, ${to}. Enjoy every crumb!`,
          signOff: `Your favorite person, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `Morning light & warm pastries for ${to}. ✨`,
          body: `Every sip and every flaky layer of ${featuredItem} is a little reminder that you're cherished.`,
          signOff: `With all my heart, ${from}`,
        },
      ],
    },
    thank_you: {
      sweet: [
        {
          headline: `A Huge Thank You, ${to}! 🌟`,
          body: `Thank you for always going above and beyond. Please enjoy this ${featuredItem} from Generation Bread as a small token of my gratitude!`,
          signOff: `Gratefully, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Maraming Salamat, ${to}! Dabest Ka! 🙌🥐`,
          body: `Sobrang na-appreciate ko yung tulong mo! Heto ang ${featuredItem} bilang pasasalamat—enjoy your coffee break!`,
          signOff: `Salamat ulit, ${from}`,
        },
      ],
      witty: [
        {
          headline: `Payment in Pastries for Being Awesome 🏆`,
          body: `Since medals aren't edible, here's ${featuredItem} for saving the day, ${to}!`,
          signOff: `Big thanks, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `In gratitude, for ${to}. 🌾`,
          body: `Thank you for your kindness and warmth—paired today with ${featuredItem}.`,
          signOff: `Warmest thanks, ${from}`,
        },
      ],
    },
    office_treat: {
      sweet: [
        {
          headline: `Happy Merienda Break, ${to}! ☕🥐`,
          body: `You've been crushing it at work today! Take a well-deserved breather with this ${featuredItem} from Generation Bread.`,
          signOff: `Cheers, ${from}`,
        },
      ],
      taglish: [
        {
          headline: `Merienda Time Na, ${to}! Tigil Muna Trabaho! 💻🥐`,
          body: `Pahinga muna ang mata sa laptop! Heto ang ${featuredItem} pampa-good vibes sa shift natin ngayon.`,
          signOff: `Happy eating! — ${from}`,
        },
      ],
      witty: [
        {
          headline: `Emergency Corporate Survival Kit 🚨☕`,
          body: `For surviving meetings that could have been emails: please apply ${featuredItem} directly to your afternoon, ${to}.`,
          signOff: `Your Desk Neighbor, ${from}`,
        },
      ],
      aesthetic: [
        {
          headline: `Afternoon pause for ${to}. ☕`,
          body: `Elevating the workday rhythm with Generation Bread's ${featuredItem}.`,
          signOff: `Enjoy, ${from}`,
        },
      ],
    },
  };

  const selectedSet = templates[occasion]?.[tone] || templates.exam_cheer.taglish;
  const fallbackSet = templates[occasion]?.sweet || [];
  const combined = [...selectedSet, ...fallbackSet].slice(0, 3);

  return combined.map((c, idx) => ({
    id: `gift_${occasion}_${tone}_${idx}`,
    headline: c.headline,
    body: c.body,
    signOff: c.signOff,
    fullOrderNote: `🎁 GIFT FOR ${to.toUpperCase()}: "${c.headline} — ${c.body}" (${c.signOff})`,
  }));
}

/* ============================================================================
 * 4. AI MYSTERY BOX GENERATOR (FOR UNDECIDED CUSTOMERS)
 * ============================================================================ */
export type MysteryVibe =
  | "sweet_tooth"
  | "caffeine_kick"
  | "chill_zen"
  | "savory_feast"
  | "total_surprise";

export interface MysteryBoxResult {
  boxTitle: string;
  vibeBadge: string;
  crypticClues: string[];
  flavorRadar: {
    sweetness: number;
    savory: number;
    richness: number;
    energy: number;
  };
  items: {
    name: string;
    baseName: string;
    price: number;
    category: "food" | "drink";
    notes: string;
  }[];
  totalPrice: number;
  whyItWorks: string;
}

export function generateMysteryBox(
  vibe: MysteryVibe,
  maxBudget: number,
  menuItems: AiMenuItem[],
  seedOffset: number = 0
): MysteryBoxResult {
  const catalog: AiMenuItem[] =
    menuItems.length > 0
      ? menuItems
      : [
          { name: "Ube Cheese Pandesal", price: 65, description: "Soft ube pandesal with melty cheese", category: "food" },
          { name: "Pork Floss Ensaymada", price: 75, description: "Buttery ensaymada with savory pork floss", category: "food" },
          { name: "Matcha Latte", price: 149, description: "Smooth matcha latte with creamy milk", category: "drink" },
          { name: "Sausage Croissant", price: 95, description: "Flaky croissant wrapped around savory sausage", category: "food" },
          { name: "Ham & Cheese Croissant", price: 95, description: "Classic ham and cheese buttery croissant", category: "food" },
          { name: "Pistachio Pain au Chocolat", price: 120, description: "Chocolate-filled pastry with pistachio", category: "food" },
        ];

  const foods = catalog.filter((i) => (i.category || "drink") === "food");
  const drinks = catalog.filter((i) => (i.category || "drink") === "drink");

  const pickFrom = <T,>(arr: T[], idx: number): T => arr[((idx % arr.length) + arr.length) % arr.length];

  let chosenItems: { name: string; baseName: string; price: number; category: "food" | "drink"; notes: string }[] = [];
  let boxTitle = "The Golden Hour Mystery Box";
  let vibeBadge = "✨ Curated Artisan Surprise";
  let crypticClues: string[] = [];
  let flavorRadar = { sweetness: 4, savory: 3, richness: 4, energy: 4 };
  let whyItWorks = "";

  if (vibe === "sweet_tooth") {
    const sweetFoods = foods.filter((f) => /ube|pistachio|choco|ensaymada/i.test(f.name));
    const pool = sweetFoods.length > 0 ? sweetFoods : foods;
    const f1 = pickFrom(pool, seedOffset);
    const f2 = pickFrom(pool, seedOffset + 1);
    const drink = drinks[0];

    if (maxBudget >= 210 && drink) {
      chosenItems = [
        { name: f1.name, baseName: f1.name, price: Number(f1.price), category: "food", notes: "🎁 AI Mystery Box (Sweet Tooth)" },
        { name: `${drink.name} (Small, 100% Sugar)`, baseName: drink.name, price: Number(drink.price), category: "drink", notes: "🎁 AI Mystery Box (Sweet Tooth)" },
      ];
    } else {
      chosenItems = [
        { name: f1.name, baseName: f1.name, price: Number(f1.price), category: "food", notes: "🎁 AI Mystery Box (Sweet Tooth)" },
        { name: f2.name, baseName: f2.name, price: Number(f2.price), category: "food", notes: "🎁 AI Mystery Box (Sweet Tooth)" },
      ];
    }
    boxTitle = "The Velvet Confection Mystery Box";
    vibeBadge = "🍫 Sweet & Indulgent Tier";
    crypticClues = [
      "Clue #1: Features rich purple yam or nutty roasted pistachio notes.",
      "Clue #2: Baked to a golden finish with a melt-in-your-mouth center.",
      "Clue #3: Designed to satisfy afternoon sugar cravings immediately.",
    ];
    flavorRadar = { sweetness: 5, savory: 2, richness: 5, energy: 4 };
    whyItWorks = "Balances caramelized pastry sweetness with creamy, velvety textures that stay within your budget.";
  } else if (vibe === "savory_feast") {
    const savoryFoods = foods.filter((f) => /sausage|ham|floss|cheese/i.test(f.name));
    const pool = savoryFoods.length > 0 ? savoryFoods : foods;
    const f1 = pickFrom(pool, seedOffset);
    const f2 = pickFrom(pool, seedOffset + 1);
    chosenItems = [
      { name: f1.name, baseName: f1.name, price: Number(f1.price), category: "food", notes: "🎁 AI Mystery Box (Savory Feast · Warm please)" },
      { name: f2.name, baseName: f2.name, price: Number(f2.price), category: "food", notes: "🎁 AI Mystery Box (Savory Feast · Warm please)" },
    ];
    boxTitle = "The Savory Boulangerie Mystery Box";
    vibeBadge = "🧀 Umami & Hearty Bake Duo";
    crypticClues = [
      "Clue #1: 27 flaky butter layers hugging smoky, savory protein.",
      "Clue #2: Melty cheese pull meets golden-brown crust.",
      "Clue #3: Filling enough to power you through lunch or dinner.",
    ];
    flavorRadar = { sweetness: 2, savory: 5, richness: 5, energy: 4 };
    whyItWorks = "Pairs two hearty, protein-packed artisanal bakes that deliver maximum umami satisfaction.";
  } else if (vibe === "caffeine_kick" || vibe === "chill_zen") {
    const d1 = drinks.length > 0 ? pickFrom(drinks, seedOffset) : null;
    const f1 = foods.length > 0 ? pickFrom(foods, seedOffset + 1) : null;
    if (d1) {
      const sugar = vibe === "caffeine_kick" ? "50% Sugar" : "75% Sugar";
      chosenItems.push({
        name: `${d1.name} (Small, ${sugar})`,
        baseName: d1.name,
        price: Number(d1.price),
        category: "drink",
        notes: `🎁 AI Mystery Box (${vibe === "caffeine_kick" ? "Focus Boost" : "Zen Chill"})`,
      });
    }
    if (f1 && (!d1 || Number(d1.price) + Number(f1.price) <= maxBudget + 35)) {
      chosenItems.push({
        name: f1.name,
        baseName: f1.name,
        price: Number(f1.price),
        category: "food",
        notes: "🎁 AI Mystery Box Pairing",
      });
    }
    boxTitle = vibe === "caffeine_kick" ? "The Deep Focus Alchemist Box" : "The Cozy Afternoon Cloud Box";
    vibeBadge = vibe === "caffeine_kick" ? "⚡ High-Clarity Study Fuel" : "🍵 Earthy & Calming Pairing";
    crypticClues = [
      "Clue #1: Earthy ceremonial-grade antioxidants blended with silky milk.",
      "Clue #2: Paired with a freshly baked artisan pastry for steady energy release.",
      "Clue #3: Zero jittery crash—crafted for flow state.",
    ];
    flavorRadar =
      vibe === "caffeine_kick"
        ? { sweetness: 3, savory: 3, richness: 4, energy: 5 }
        : { sweetness: 4, savory: 2, richness: 4, energy: 3 };
    whyItWorks = "Combines L-theanine/caffeine synergy with complex bakery carbs so your energy stays smooth for hours.";
  } else {
    // Total surprise
    const f1 = pickFrom(foods.length > 0 ? foods : catalog, seedOffset + 2);
    const secondPool = maxBudget >= 210 && drinks.length > 0 ? drinks : foods.length > 0 ? foods : catalog;
    const i2 = pickFrom(secondPool, seedOffset + 3);
    chosenItems = [
      {
        name: f1.name,
        baseName: f1.name,
        price: Number(f1.price),
        category: (f1.category || "food") as "food" | "drink",
        notes: "🎁 AI Chef's Mystery Selection",
      },
      {
        name: (i2.category || "drink") === "drink" ? `${i2.name} (Small, 75% Sugar)` : i2.name,
        baseName: i2.name,
        price: Number(i2.price),
        category: (i2.category || "drink") as "food" | "drink",
        notes: "🎁 AI Chef's Mystery Selection",
      },
    ];
    boxTitle = "The Master Baker's Secret Vault";
    vibeBadge = "🎲 100% Wildcard Artisan Combo";
    crypticClues = [
      "Clue #1: Handpicked from our highest-rated customer favorites today.",
      "Clue #2: Combines contrasting textures—crisp outer layers & creamy/melty notes.",
      "Clue #3: A signature Generation Bread experience in one box.",
    ];
    flavorRadar = { sweetness: 4, savory: 4, richness: 5, energy: 4 };
    whyItWorks = "Selected by our AI taste-matching matrix to give you our #1 sweet-savory contrast.";
  }

  // Trim if strictly over budget and more than 1 item
  let totalPrice = chosenItems.reduce((sum, i) => sum + i.price, 0);
  if (maxBudget < 900 && totalPrice > maxBudget && chosenItems.length > 1) {
    // Try swapping second item with the most affordable pastry
    const cheapestFood = [...foods].sort((a, b) => Number(a.price) - Number(b.price))[0];
    if (cheapestFood && chosenItems[0].price + Number(cheapestFood.price) <= maxBudget) {
      chosenItems[1] = {
        name: cheapestFood.name,
        baseName: cheapestFood.name,
        price: Number(cheapestFood.price),
        category: "food",
        notes: "🎁 AI Mystery Box Pairing",
      };
      totalPrice = chosenItems.reduce((sum, i) => sum + i.price, 0);
    }
  }

  return {
    boxTitle,
    vibeBadge,
    crypticClues,
    flavorRadar,
    items: chosenItems,
    totalPrice,
    whyItWorks,
  };
}

/* ============================================================================
 * 5. AI PAIR WITH MY HOME FOOD (TAKEOUT ASSISTANT)
 * ============================================================================ */
export interface HomeFoodPairingResult {
  homeDish: string;
  culinaryAnalysis: string;
  primaryBake: AiMenuItem;
  primaryBakeReason: string;
  companionItem: AiMenuItem;
  companionReason: string;
  servingTip: string;
}

export const HOME_FOOD_PRESETS: ReadonlyArray<{ label: string; query: string }> = [
  { label: "🍳 Corned Beef & Egg", query: "Corned beef at scrambled egg sa bahay" },
  { label: "🍝 Creamy Carbonara / Pasta", query: "Creamy pasta carbonara or spaghetti" },
  { label: "🍜 Spicy Ramen / Pancit Canton", query: "Spicy ramen noodles or pancit canton" },
  { label: "🍲 Filipino Adobo & Sinangag", query: "Chicken pork adobo and garlic rice" },
  { label: "🧀 Cheese & Cold Cuts", query: "Charcuterie cheese board and wine/juices" },
  { label: "🍗 Fried Chicken / Inihaw BBQ", query: "Crispy fried chicken or grilled pork BBQ" },
];

export function getHomeFoodPairing(
  homeFoodQuery: string,
  menuItems: AiMenuItem[]
): HomeFoodPairingResult {
  const catalog: AiMenuItem[] =
    menuItems.length > 0
      ? menuItems
      : [
          { name: "Ube Cheese Pandesal", price: 65, description: "Soft ube pandesal with melty cheese", category: "food" },
          { name: "Pork Floss Ensaymada", price: 75, description: "Buttery ensaymada with savory pork floss", category: "food" },
          { name: "Matcha Latte", price: 149, description: "Smooth matcha latte with creamy milk", category: "drink" },
          { name: "Sausage Croissant", price: 95, description: "Flaky croissant wrapped around savory sausage", category: "food" },
          { name: "Ham & Cheese Croissant", price: 99, description: "Classic ham and cheese buttery croissant", category: "food" },
          { name: "Pistachio Pain au Chocolat", price: 120, description: "Chocolate-filled pastry with pistachio", category: "food" },
        ];

  const findItem = (regex: RegExp, fallbackIdx = 0): AiMenuItem =>
    catalog.find((i) => regex.test(i.name)) || catalog[fallbackIdx % catalog.length];

  const q = (homeFoodQuery || "Breakfast meal").toLowerCase();

  if (/corned|egg|itlog|tocino|longganisa|tapa|almusal|breakfast|hotdog|bacon/.test(q)) {
    const bake = findItem(/pandesal|ube/i, 0);
    const drink = findItem(/matcha|latte/i, 2);
    return {
      homeDish: homeFoodQuery || "Savory Filipino Breakfast (Corned Beef & Egg)",
      culinaryAnalysis:
        "Salty, umami-rich breakfast meats like corned beef and eggs crave a soft, slightly sweet pillowy crumb to soak up the savory juices.",
      primaryBake: bake,
      primaryBakeReason: `${bake.name} provides the classic sweet-salty Filipino contrast—slice it warm and stuff a spoonful of corned beef & egg right inside!`,
      companionItem: drink,
      companionReason: `${drink.name} cleanses the palate from rich breakfast oils while delivering smooth morning alertness.`,
      servingTip: "Toast the pandesal for 90 seconds so the cheese melts before pairing with your hot skillet breakfast.",
    };
  }

  if (/pasta|carbonara|spaghetti|alfredo|lasagna|macaroni|pizza|italian/.test(q)) {
    const bake = findItem(/ham|sausage|croissant/i, 4);
    const sweetBake = findItem(/pistachio|choco/i, 5);
    return {
      homeDish: homeFoodQuery || "Rich Pasta / Carbonara",
      culinaryAnalysis:
        "Creamy, starch-heavy pasta dishes pair best with shattered, airy laminated pastry layers rather than dense bread, followed by a crisp bittersweet finish.",
      primaryBake: bake,
      primaryBakeReason: `The flaky, airy 27-layer crust of ${bake.name} acts like gourmet garlic-butter table bread to wipe the last drop of carbonara sauce!`,
      companionItem: sweetBake,
      companionReason: `${sweetBake.name} serves as your artisanal Italian-French dessert course right after the savory pasta.`,
      servingTip: "Tear the warm croissant into bite-sized flakes and dip directly into your pasta sauce.",
    };
  }

  if (/spicy|ramen|noodles|buldak|pancit|chili|kimchi|maanghang|sisig/.test(q)) {
    const drink = findItem(/matcha|latte/i, 2);
    const bake = findItem(/ensaymada|ube/i, 1);
    return {
      homeDish: homeFoodQuery || "Spicy Noodles / Ramen",
      culinaryAnalysis:
        "Capsaicin (chili heat) binds to receptors on your tongue—dairy fat (casein) and buttery brioche sugar dissolve spicy oil instantly!",
      primaryBake: bake,
      primaryBakeReason: `The rich butter, sugar, and savory floss of ${bake.name} coat the palate and tame fiery spice between slurps.`,
      companionItem: drink,
      companionReason: `Iced ${drink.name} uses cold creamy milk to neutralize spicy heat while earthy green tea refreshes your taste buds.`,
      servingTip: "Order the Matcha Latte iced with 75% sugar for the ultimate spicy-ramen cooldown.",
    };
  }

  if (/adobo|sinigang|kare|ulam|kanin|rice|chicken|bbq|inihaw|liempo|lechon/.test(q)) {
    const bake = findItem(/ensaymada|pandesal/i, 1);
    const dessert = findItem(/pistachio|choco|ube/i, 5);
    return {
      homeDish: homeFoodQuery || "Hearty Filipino Ulam (Adobo / Grilled BBQ)",
      culinaryAnalysis:
        "Bold vinegar, soy, and smoky char flavors call for a decadent sweet-savory finisher that bridges lunch/dinner into merienda dessert.",
      primaryBake: dessert,
      primaryBakeReason: `After a savory ulam, ${dessert.name} delivers that luxurious dark chocolate & roasted pistachio finale your palate craves.`,
      companionItem: bake,
      companionReason: `${bake.name} pairs wonderfully with leftover adobo flakes or enjoys solo as a soft merienda roll.`,
      servingTip: "Serve warmed 10 minutes after your main meal as a shared family dessert board.",
    };
  }

  // Default / Cheese / General meal
  const bake = findItem(/ham|croissant/i, 4);
  const drink = findItem(/matcha|latte/i, 2);
  return {
    homeDish: homeFoodQuery || "Home-Cooked Meal",
    culinaryAnalysis:
      "Our AI Sommelier matched your home meal with our most versatile golden-baked viennoiserie and signature handcrafted latte.",
    primaryBake: bake,
    primaryBakeReason: `${bake.name} adds flaky, buttery crunch and melty richness that elevates any home spread into a café feast.`,
    companionItem: drink,
    companionReason: `${drink.name} brings café-grade smoothness right to your dining table.`,
    servingTip: "Warm the pastry for 2 minutes before serving alongside your home dish.",
  };
}

/* ============================================================================
 * 6. AI PERSONAL COFFEE BUDGET & HABIT COACH
 * ============================================================================ */
export interface HabitCoachReport {
  personaTitle: string;
  personaBadge: string;
  totalOrdersCount: number;
  totalSpent: number;
  avgOrderValue: number;
  monthlyBudgetGoal: number;
  budgetUsedPercent: number;
  favoriteItemName: string;
  favoriteItemCount: number;
  peakTimeLabel: string;
  loyaltyStampsEarned: number;
  stampsUntilFreeReward: number;
  coachingTips: {
    icon: string;
    title: string;
    detail: string;
    highlightValue: string;
  }[];
}

export function analyzeCoffeeHabits(
  orders: AiOrderRecord[],
  monthlyBudgetGoal: number = 1500
): HabitCoachReport {
  const validOrders = orders.filter((o) => o.status !== "cancelled");
  const totalOrdersCount = validOrders.length;
  const totalSpent = validOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const avgOrderValue = totalOrdersCount > 0 ? totalSpent / totalOrdersCount : 0;

  // Item frequency
  const itemCounts = new Map<string, number>();
  let morningCount = 0;
  let afternoonCount = 0;
  let eveningCount = 0;

  validOrders.forEach((o) => {
    const d = new Date(o.date);
    const hr = isNaN(d.getTime()) ? 14 : d.getHours();
    if (hr < 12) morningCount++;
    else if (hr < 17) afternoonCount++;
    else eveningCount++;

    (o.items || []).forEach((it) => {
      const base = it.name.replace(/\s*\(.*?\)$/, "").trim();
      itemCounts.set(base, (itemCounts.get(base) || 0) + (it.qty || 1));
    });
  });

  let favoriteItemName = "Matcha Latte & Ube Pandesal";
  let favoriteItemCount = 0;
  itemCounts.forEach((cnt, name) => {
    if (cnt > favoriteItemCount) {
      favoriteItemCount = cnt;
      favoriteItemName = name;
    }
  });

  const peakTimeLabel =
    morningCount >= afternoonCount && morningCount >= eveningCount
      ? "🌅 Morning Ritual (7 AM – 12 PM)"
      : afternoonCount >= eveningCount
      ? "☀️ Afternoon Merienda (12 PM – 5 PM)"
      : "🌙 Evening Study / Chill (5 PM+)";

  const loyaltyStampsEarned = totalOrdersCount % 8;
  const stampsUntilFreeReward = 8 - loyaltyStampsEarned;
  const cleanBudget = Math.max(300, monthlyBudgetGoal || 1500);
  const budgetUsedPercent = Math.min(100, Math.round((totalSpent / cleanBudget) * 100));

  const personaTitle =
    totalOrdersCount >= 8
      ? "Connoisseur Patron of the Oven"
      : totalOrdersCount >= 3
      ? "Artisan Merienda Regular"
      : "Fresh Bake Explorer";

  const personaBadge =
    avgOrderValue >= 220
      ? "👑 Combo Maximizer"
      : avgOrderValue > 0
      ? "💡 Smart Value Sipper"
      : "🌱 Ready for First Brew";

  const potentialBundleSavings = Math.max(120, Math.round((totalOrdersCount || 4) * 35));

  const coachingTips = [
    {
      icon: "🎯",
      title: "Loyalty Stamp Accelerator",
      detail:
        totalOrdersCount > 0
          ? `You've logged ${totalOrdersCount} completed order(s)! You are only ${stampsUntilFreeReward} stamp(s) away from unlocking a FREE signature pastry/drink reward.`
          : `Start your first order today—every 8th stamp on your Generation Bread card unlocks a reward on the house!`,
      highlightValue: `${stampsUntilFreeReward} stamps to reward`,
    },
    {
      icon: "💰",
      title: "Smart Pairing Value Optimization",
      detail: `Your signature pick is ${favoriteItemName}. Pairing a ₱65–₱75 artisan bake (like Ube Cheese Pandesal) with your drink in a single checkout saves ~₱${potentialBundleSavings}/month vs separate snack runs!`,
      highlightValue: `Save ~₱${potentialBundleSavings}/mo`,
    },
    {
      icon: "⏰",
      title: `Peak Rhythm: ${peakTimeLabel}`,
      detail: `Ordering 10 minutes before the peak rush using our Pre-Order (Scheduled Pickup) feature guarantees zero queue wait while keeping your monthly spend within your ₱${cleanBudget.toLocaleString()} goal.`,
      highlightValue: `${budgetUsedPercent}% of ₱${cleanBudget.toLocaleString()} goal`,
    },
  ];

  return {
    personaTitle,
    personaBadge,
    totalOrdersCount,
    totalSpent,
    avgOrderValue,
    monthlyBudgetGoal: cleanBudget,
    budgetUsedPercent,
    favoriteItemName,
    favoriteItemCount,
    peakTimeLabel,
    loyaltyStampsEarned,
    stampsUntilFreeReward,
    coachingTips,
  };
}

/* ============================================================================
 * 7. AI "WHAT BREAD / COFFEE ARE YOU?" PERSONALITY QUIZ
 * ============================================================================ */
export interface QuizQuestion {
  id: string;
  question: string;
  options: {
    id: "cozy" | "bold" | "zen" | "lux";
    emoji: string;
    label: string;
    sub: string;
  }[];
}

export const PERSONALITY_QUIZ_QUESTIONS: ReadonlyArray<QuizQuestion> = [
  {
    id: "q1",
    question: "1. Ano ang energy mo pagkagising sa umaga?",
    options: [
      { id: "cozy", emoji: "☁️", label: "Slow & Cozy", sub: "Five more minutes sa kama, gusto ng warm hug" },
      { id: "bold", emoji: "⚡", label: "Action Agad", sub: "Ready na humataw sa klase o trabaho!" },
      { id: "zen", emoji: "🌿", label: "Calm & Mindful", sub: "Tahimik na umaga, music + journaling" },
      { id: "lux", emoji: "✨", label: "Main Character", sub: "Dapat aesthetic ang OOTD at breakfast" },
    ],
  },
  {
    id: "q2",
    question: "2. Saan ka madalas umupo kapag nasa café?",
    options: [
      { id: "cozy", emoji: "🛋️", label: "Sulok na Sofa", sub: "Comfy corner kasama ang close friend" },
      { id: "bold", emoji: "💻", label: "Power Outlet Table", sub: "Bukas agad ang laptop, grind mode" },
      { id: "zen", emoji: "🪟", label: "Window Seat", sub: "Pinapanood ang ulan o mga dumadaan" },
      { id: "lux", emoji: "📸", label: "Best Lighting Spot", sub: "Kung saan maganda ang tama ng araw sa photo" },
    ],
  },
  {
    id: "q3",
    question: "3. Anong flavor profile ang nagpapa-happy sa'yo?",
    options: [
      { id: "cozy", emoji: "🟣", label: "Sweet & Nostalgic", sub: "Melty cheese, warm ube, childhood comfort" },
      { id: "bold", emoji: "🧀", label: "Savory & Filling", sub: "Smoky sausage, ham, buttery flaky crust" },
      { id: "zen", emoji: "🍵", label: "Earthy & Creamy", sub: "Smooth matcha, balanced sweetness, oat milk" },
      { id: "lux", emoji: "🍫", label: "Rich & Decadent", sub: "Dark chocolate, roasted pistachio, French pastry" },
    ],
  },
];

export interface QuizPersonaResult {
  archetypeKey: "cozy" | "bold" | "zen" | "lux";
  title: string;
  subtitle: string;
  description: string;
  traits: string[];
  vibeMotto: string;
  matchedBake: AiMenuItem;
  matchedDrink: AiMenuItem;
}

export function evaluatePersonalityQuiz(
  answers: ("cozy" | "bold" | "zen" | "lux")[],
  menuItems: AiMenuItem[]
): QuizPersonaResult {
  const counts: Record<"cozy" | "bold" | "zen" | "lux", number> = {
    cozy: 0,
    bold: 0,
    zen: 0,
    lux: 0,
  };
  answers.forEach((a) => {
    if (counts[a] !== undefined) counts[a]++;
  });

  const winner = (Object.keys(counts) as ("cozy" | "bold" | "zen" | "lux")[]).reduce((a, b) =>
    counts[b] > counts[a] ? b : a
  );

  const catalog: AiMenuItem[] =
    menuItems.length > 0
      ? menuItems
      : [
          { name: "Ube Cheese Pandesal", price: 65, description: "Soft ube pandesal with melty cheese", category: "food" },
          { name: "Pork Floss Ensaymada", price: 75, description: "Buttery ensaymada with savory pork floss", category: "food" },
          { name: "Matcha Latte", price: 149, description: "Smooth matcha latte with creamy milk", category: "drink" },
          { name: "Sausage Croissant", price: 95, description: "Flaky croissant wrapped around savory sausage", category: "food" },
          { name: "Ham & Cheese Croissant", price: 99, description: "Classic ham and cheese buttery croissant", category: "food" },
          { name: "Pistachio Pain au Chocolat", price: 120, description: "Chocolate-filled pastry with pistachio", category: "food" },
        ];

  const findItem = (regex: RegExp, fallbackIdx = 0): AiMenuItem =>
    catalog.find((i) => regex.test(i.name)) || catalog[fallbackIdx % catalog.length];

  const drinkMatch = findItem(/matcha|latte/i, 2);

  if (winner === "cozy") {
    return {
      archetypeKey: "cozy",
      title: "The Warm Ube Cloud Dreamer 💜🥐",
      subtitle: "You are Ube Cheese Pandesal & Creamy Latte",
      description:
        "Warm, comforting, and effortlessly lovable! People gravitate toward you because you feel like a safe space on a rainy afternoon—soft on the outside with a rich, golden heart.",
      traits: ["✨ Empathetic Listener", "☁️ Comfort Seeker", "💜 Loyal Barkada Pillar"],
      vibeMotto: "“Life is too short for cold bread and rushed mornings.”",
      matchedBake: findItem(/ube|pandesal/i, 0),
      matchedDrink: drinkMatch,
    };
  }

  if (winner === "bold") {
    return {
      archetypeKey: "bold",
      title: "The Golden Croissant Trailblazer 🔥🥐",
      subtitle: "You are Ham & Cheese / Sausage Croissant & Iced Brew",
      description:
        "Driven, reliable, and full of layers! When deadlines hit, you're the one who gets things done with style. You appreciate substance, savory boldness, and zero fluff.",
      traits: ["⚡ Goal-Getter", "🧀 Unapologetically Bold", "🏆 Natural Leader"],
      vibeMotto: "“Fuel up, lock in, and make it happen.”",
      matchedBake: findItem(/sausage|ham/i, 3),
      matchedDrink: drinkMatch,
    };
  }

  if (winner === "zen") {
    return {
      archetypeKey: "zen",
      title: "The Ceremonial Matcha Alchemist 🍵🌿",
      subtitle: "You are Smooth Matcha Latte & Pork Floss Ensaymada",
      description:
        "Grounded, thoughtful, and quietly magnetic. You notice the little details others miss—the aroma of fresh dough, a good playlist, and balanced harmony between sweet and savory.",
      traits: ["🌿 Deep Thinker", "🎧 Aesthetic Calm", "⚖️ Balanced Soul"],
      vibeMotto: "“Peace is found in a slow sip and a warm bake.”",
      matchedBake: findItem(/ensaymada|floss/i, 1),
      matchedDrink: drinkMatch,
    };
  }

  return {
    archetypeKey: "lux",
    title: "The Artisanal Pistachio Connoisseur ✨🍫",
    subtitle: "You are Pistachio Pain au Chocolat & Oat Matcha",
    description:
      "Sophisticated, creative, and curated! You have impeccable taste—whether in music, aesthetics, or French viennoiserie. You turn an ordinary Tuesday coffee run into a cinematic moment.",
    traits: ["✨ Impeccable Taste", "📸 Visual Storyteller", "🍫 Secretly Sweet"],
    vibeMotto: "“Romanticize every single bite.”",
    matchedBake: findItem(/pistachio|choco/i, 5),
    matchedDrink: drinkMatch,
  };
}

/* ============================================================================
 * 8. AI INSTAGRAM / TIKTOK "FOODIE PHOTO CAPTION" GENERATOR
 * ============================================================================ */
export type CaptionVibe =
  | "aesthetic"
  | "taglish_funny"
  | "minimalist"
  | "study_grind"
  | "main_character";

export type SocialPlatform = "instagram" | "story" | "tiktok";

export interface GeneratedCaption {
  id: string;
  vibeLabel: string;
  caption: string;
  hashtags: string;
  bestShotTip: string;
}

export function generateFoodieCaptions(
  itemNames: string[],
  vibe: CaptionVibe,
  platform: SocialPlatform
): GeneratedCaption[] {
  const cleanNames =
    itemNames.length > 0
      ? itemNames.map((n) => n.replace(/\s*\(.*?\)$/, "").trim())
      : ["Pistachio Pain au Chocolat", "Matcha Latte"];

  const primary = cleanNames[0];
  const secondary = cleanNames[1] || "fresh artisan bakes";
  const comboText = cleanNames.length > 1 ? `${primary} + ${secondary}` : primary;

  const platformTag =
    platform === "tiktok"
      ? "#GenerationBread #CafeTokPH #FoodieTok #CoffeeTokPH #PastryAddict"
      : platform === "story"
      ? "@GenerationBread ✨ #DailyBrew #CafeDiaries"
      : "#GenerationBread #ArtisanBakeryPH #CoffeeAesthetic #PastriesOfInstagram #ManilaCoffee";

  const sets: Record<CaptionVibe, { vibeLabel: string; caption: string; bestShotTip: string }[]> = {
    aesthetic: [
      {
        vibeLabel: "✨ Golden Hour Café",
        caption: `Slow mornings, warm layers of ${primary}, and quiet sips. ☕🥐✨\n\nNothing quite like fresh-out-of-the-oven therapy at Generation Bread.`,
        bestShotTip: "Shoot at a 45° angle near natural window light; tear the pastry slightly in half to show the flaky interior layers.",
      },
      {
        vibeLabel: "🌾 Warm Bakery Poetry",
        caption: `Built on butter, patience, and ${comboText}. 🤎\nToday's little ritual before the world gets loud.`,
        bestShotTip: "Hold the cup in the foreground with the pastry blurred softly in the background (Portrait Mode).",
      },
      {
        vibeLabel: "🕯️ Soft Neutral Vibes",
        caption: `Current state of mind: ${comboText} on repeat. 🥐🍵`,
        bestShotTip: "Flat-lay top-down shot on the table with your sunglasses, notebook, or headphones beside the plate.",
      },
    ],
    taglish_funny: [
      {
        vibeLabel: "😂 Diet Starts Tomorrow",
        caption: `Sabi ko magtitipid at magda-diet na ako today... tapos naamoy ko yung bagong lutong ${primary} sa Generation Bread. 😭🥐✨\n\nLord, bukas na lang po ulit ako magbabawas ng carbs!`,
        bestShotTip: "Record a 0.5x ultra-wide selfie holding the pastry close to the lens!",
      },
      {
        vibeLabel: "🤣 Emotional Support Tinapay",
        caption: `Walang problema ang hindi kayang solusyunan ng ${comboText}. 😌☕\nKung stressed ka, kumagat ka muna bago ka mag-reply sa GC!`,
        bestShotTip: "Boomerang or short clip pulling the melty cheese/flaky crust apart.",
      },
      {
        vibeLabel: "💸 Deserve Ko 'To Mentality",
        caption: `“Magkano nagastos mo?”\nMe holding my ${comboText}: “Hindi mahalaga ang pera, ang mahalaga masaya ang kaluluwa ko.” 💅🥐`,
        bestShotTip: "Close-up macro shot showing the glistening glaze and crumb texture.",
      },
    ],
    minimalist: [
      {
        vibeLabel: "🤍 Clean & Effortless",
        caption: ` flaky layers & ${primary.toLowerCase()}. ☕`,
        bestShotTip: "Negative space composition—place the pastry in the bottom-right rule-of-thirds intersection.",
      },
      {
        vibeLabel: "☕ Short & Chic",
        caption: `powered by ${comboText.toLowerCase()}.`,
        bestShotTip: "Tight crop on the cup sleeve and pastry crust.",
      },
      {
        vibeLabel: "🥐 Pure Crumb",
        caption: `fresh batch. 08:30 am. 🥐`,
        bestShotTip: "Slightly underexpose by -0.3 EV for rich, moody brown tones.",
      },
    ],
    study_grind: [
      {
        vibeLabel: "💻 Thesis / Work Fuel",
        caption: `Brain cells sponsored by Generation Bread's ${comboText}. 💻☕🥐\n\n3 chapters down, 100% caffeine in my bloodstream. Let's get this bread (literally).`,
        bestShotTip: "Frame your open laptop screen in the background with your drink and pastry in sharp focus in front.",
      },
      {
        vibeLabel: "📚 Locked In Mode",
        caption: `Romanticizing the deadline grind with ${primary}. ✨📈\nMas ginaganahan talagang mag-aral kapag masarap ang merienda!`,
        bestShotTip: "Snap from over your shoulder showing your notes, pen, and coffee.",
      },
      {
        vibeLabel: "⚡ Productivity Boost",
        caption: ` Romanticize the hustle: 1x ${comboText} = +500% productivity. 🚀☕`,
        bestShotTip: "Time-lapse clip of taking sips while typing.",
      },
    ],
    main_character: [
      {
        vibeLabel: "👑 Parisian Manila Energy",
        caption: `Pretending I'm in a little boulangerie in Paris, except the ${primary} here at Generation Bread actually hits different. 🥐✨🥂`,
        bestShotTip: "Candid mid-bite or mid-sip shot looking away from the camera.",
      },
      {
        vibeLabel: "✨ High Standards Only",
        caption: `My love language? Someone bringing me warm ${comboText} without me having to ask. 🤎🥐`,
        bestShotTip: "Two-hand hold over the table with warm café lighting.",
      },
      {
        vibeLabel: "🌟 Unbothered & Caffeinated",
        caption: `Booked, busy, and well-fed with ${comboText}. ✨☕`,
        bestShotTip: "Flash-on night aesthetic or sunlit golden shadow shot.",
      },
    ],
  };

  return (sets[vibe] || sets.aesthetic).map((entry, idx) => ({
    id: `cap_${vibe}_${platform}_${idx}`,
    vibeLabel: entry.vibeLabel,
    caption: entry.caption,
    hashtags: platformTag,
    bestShotTip: entry.bestShotTip,
  }));
}
