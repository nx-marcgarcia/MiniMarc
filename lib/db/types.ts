import type { ItemTypeId } from '@/lib/items/itemTypes';

/** Every type of the registry (lib/items/itemTypes.ts). */
export type ItemType = ItemTypeId;
export type Area = 'personal' | 'trabajo';
/**
 * The item's state, one of its type's states (compra: quiero, en_carrito…; tarea: pendiente,
 * hecha…). Rows written before phase 1 ('hecho', 'archivado') are translated on read
 * (normalizeLegacyStatus); archiving is the separate flag `archived`.
 */
export type ItemStatus = string;
export type Origin = 'web' | 'siri' | 'extension';
export type Priority = 'baja' | 'media' | 'alta';
/** Libro only (its status is the reading state); every other item has null. */
export type ReadingState = 'por_leer' | 'leyendo' | 'leido' | 'abandonado';

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  notes: string | null;
  area: Area | null;
  /** ISO 8601 (UTC). */
  dueAt: string | null;
  hasTime: boolean;
  status: ItemStatus;
  personId: string | null;
  origin: Origin;
  needsReview: boolean;
  confidence: number | null;
  calendarEventId: string | null;
  syncError: string | null;
  /** The whole captured text (Siri, extension, web) this item came from; null if made by hand. */
  sourceText: string | null;
  /** Libro: its author (kept on the item so a future search finds it). */
  author: string | null;
  /** Libro: its reading state, which is its status. Null otherwise. Derived on read; write `status`. */
  readingState: ReadingState | null;
  /**
   * The item's link: a libro's ficha, tienda o reseña, or the first URL of the title or notes
   * (set on save by deriveLink, lib/links/linkify.ts).
   */
  link: string | null;
  /** Link preview (0009), fetched on the server after saving: page title, og:image URL, site name. */
  linkTitle: string | null;
  linkImage: string | null;
  /** Set on every preview attempt (the domain when the page gives no site name); null = not fetched yet. */
  linkSite: string | null;
  /** Dirección o sitio de la nota (0010); va al campo Ubicación del evento de Calendar. */
  location: string | null;
  /** Fields of the item's type (0011), validated by the registry: `ITEM_TYPES[type].fields`. */
  data: Record<string, unknown>;
  storeId: string | null;
  priority: Priority | null;
  /** ISO 8601 (UTC). */
  remindAt: string | null;
  pinned: boolean;
  /** Archived apart from its status (it keeps the state it had). */
  archived: boolean;
  /** Set by the repo when the status enters a closing state of the type. */
  completedAt: string | null;
  tags: string[];
  /** What the AI thinks a doubtful item (needsReview) is; the Bandeja offers to accept it. */
  suggestion: { type: ItemType; confidence: number } | null;
  createdAt: string;
  deletedAt: string | null;
}

/** Campos obligatorios: type y title; el resto toma valores por defecto. */
export type NewItem = Pick<Item, 'type' | 'title'> &
  Partial<Omit<Item, 'id' | 'type' | 'title' | 'createdAt' | 'deletedAt'>>;

export type ItemPatch = Partial<Omit<Item, 'id' | 'createdAt' | 'deletedAt'>>;

export interface ItemFilter {
  type?: ItemType;
  area?: Area;
  /** Exactly this state. */
  status?: ItemStatus;
  /** Not archived and not in a closing state of its type: what a to-do list shows. */
  open?: boolean;
  archived?: boolean;
  storeId?: string;
  needsReview?: boolean;
  /** Only items created at or after this ISO instant (Bandeja "Recién añadido"). */
  createdSince?: string;
}

export const RELATIONS = ['familia', 'pareja', 'amigo', 'trabajo', 'otro'] as const;
export type Relation = (typeof RELATIONS)[number];

export interface Person {
  id: string;
  name: string;
  /** 'YYYY-MM-DD' */
  birthday: string | null;
  notes: string | null;
  /** Other ways Marc writes the name ("papá", "padre"): the capture finds the person by them too. */
  alias: string[];
  relation: Relation | null;
  likes: string | null;
  dislikes: string | null;
  /** "camiseta": "M", "zapatos": "42"… */
  sizes: Record<string, string>;
  contact: { email?: string; phone?: string };
}

/** A special date of a person besides the birthday (person_dates row). */
export interface PersonDate {
  id: string;
  personId: string;
  /** "Aniversario", "Santo", "Nos conocimos"… */
  label: string;
  /** 'YYYY-MM-DD'. Year NO_YEAR (1604, as Apple Contacts does) = year unknown. */
  date: string;
  /** Repeats every year (default); false = a one-off date. */
  yearly: boolean;
  notes: string | null;
  createdAt: string;
}

export type NewPersonDate = Pick<PersonDate, 'personId' | 'label' | 'date'> &
  Partial<Pick<PersonDate, 'yearly' | 'notes'>>;

export type PersonDatePatch = Partial<Pick<PersonDate, 'label' | 'date' | 'yearly' | 'notes'>>;
