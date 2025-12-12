export type TagPreset = {
  id: string;
  name: string;
  defaultActive: boolean;
};

export const PRESET_TAGS: TagPreset[] = [
  { id: "sketch", name: "速写", defaultActive: true },
  { id: "draft", name: "草稿", defaultActive: true },
  { id: "final", name: "成图", defaultActive: true },
  { id: "copy", name: "临摹", defaultActive: false },
  { id: "oc", name: "oc", defaultActive: false },
  { id: "practice", name: "练习", defaultActive: true },
];

export function getPresetTagById(id: string): TagPreset | undefined {
  return PRESET_TAGS.find((item) => item.id === id);
}









































