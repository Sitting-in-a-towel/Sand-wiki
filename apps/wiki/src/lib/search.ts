import { ITEM_CATEGORIES, type Category } from "@/lib/taxonomy";

export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null; icon?: string | null; rarity?: string | null }
/** A searchable environment entity (loot container, landmark, or NPC). `category` is its
 *  env category slug, used to group it in the dropdown and pick its icon. */
export interface IndexPlace { slug: string; name: string; category: string }
export interface SearchIndex { items: IndexItem[]; places: IndexPlace[] }
export interface Suggestions { categories: Category[]; items: IndexItem[]; places: IndexPlace[] }

const ITEM_CAP = 8;
const PLACE_CAP = 6;

/** Case-insensitive substring match over category labels, item names (+derived names),
 *  and place names (containers, landmarks, NPCs). Items and places are capped independently. */
export function searchSuggestions(query: string, items: IndexItem[], places: IndexPlace[] = []): Suggestions {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { categories: [], items: [], places: [] };
  const categories = ITEM_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  const matchedItems = items
    .filter((i) => i.name.toLowerCase().includes(q) || (i.derivedName ?? "").toLowerCase().includes(q))
    .slice(0, ITEM_CAP);
  const matchedPlaces = places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, PLACE_CAP);
  return { categories, items: matchedItems, places: matchedPlaces };
}
