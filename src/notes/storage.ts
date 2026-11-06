import { invoke } from '@tauri-apps/api/core';
import { desktop } from '../platform/environment';
import { maskedContent, matchesSearch, searchQuery, parsePairs } from './pairs';
export type Note = { id: string; content: string; updated: number };
export type Session = { notes: Note[]; tabs: string[]; active: string | null };
const key = 'bbb-notes-preview-v1';
const empty = (): Session => ({ notes: [], tabs: [], active: null });
function read(): Session { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : empty(); }
export const storage = {
  async load(): Promise<Session> {
    if (desktop) return invoke('load_session');
    const data = read();
    return { ...data, notes: data.notes.filter(n => data.tabs.includes(n.id)) };
  },
  async saveNote(note: Note) {
    if (desktop) return invoke<void>('save_note', { note });
    const data = read(); data.notes = [...data.notes.filter(n => n.id !== note.id), note];
    localStorage.setItem(key, JSON.stringify(data));
  },
  async saveSession(tabs: string[], active: string | null) {
    if (desktop) return invoke<void>('save_session', { tabs, active });
    localStorage.setItem(key, JSON.stringify({ ...read(), tabs, active }));
  },
  async search(query: string): Promise<Note[]> {
    if (desktop) return invoke('search_notes', { query });
    return read().notes.filter(n => matchesSearch(n.content, query))
      .sort((a,b) => b.updated-a.updated).slice(0,100);
  },
};
const displayCache = new WeakMap<Note,string>();
export function title(note?: Note) {
  if (!note) return 'Untitled note';
  let text = displayCache.get(note);
  if (text === undefined) { text = maskedContent(note.content); displayCache.set(note,text); }
  return text.split('\n').find(line => line.trim())?.trim().slice(0,60) || 'Untitled note';
}
export function snippet(content: string, query: string) {
  const source = content;
  const parsed = searchQuery(query);
  const pairs = parsePairs(source);
  const matchingPair = parsed.key
    ? pairs.find(pair => pair.key === parsed.key && source.slice(pair.valueFrom,pair.valueTo).toLowerCase().includes(parsed.text.toLowerCase()))
    : pairs.find(pair => pair.key === 'ENV' && source.slice(pair.valueFrom,pair.valueTo).toLowerCase().includes(parsed.text.toLowerCase()));
  content = maskedContent(source);
  const index = matchingPair ? maskedContent(source.slice(0,matchingPair.from)).length : content.toLowerCase().indexOf(parsed.text.toLowerCase());
  const start = Math.max(0,index-45);
  return `${start ? '…' : ''}${content.slice(start,start+180)}${content.length > start+180 ? '…' : ''}`;
}
