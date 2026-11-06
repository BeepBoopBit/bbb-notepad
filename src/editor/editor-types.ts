export type EditorPosition = { start: number; end: number; scroll: number };
export type NoteEditorHandle = {
  getPosition(): EditorPosition;
  focus(position?: EditorPosition, match?: string): void;
};
