import { redirect } from 'next/navigation';

/** Listas is now the Biblioteca: old bookmarks land there. */
export default function ListasPage() {
  redirect('/biblioteca');
}
