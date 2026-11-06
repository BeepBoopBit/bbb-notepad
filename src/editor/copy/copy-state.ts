import { EditorSelection, StateEffect, StateField } from '@codemirror/state';
export const holdPreview = StateEffect.define<EditorSelection | null>();
export const heldPreviewSelection = StateField.define<EditorSelection | null>({
  create:()=>null,
  update(value,tr) {
    if (tr.docChanged) return null;
    for (const effect of tr.effects) if (effect.is(holdPreview)) value=effect.value;
    return value;
  },
});
