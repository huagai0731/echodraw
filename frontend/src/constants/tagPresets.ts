export type TagPreset = {
  id: string;
  name: string;
  defaultActive: boolean;
};

export const PRESET_TAGS: TagPreset[] = [
  { id: "sketch", name: "速写", defaultActive: true },
  { id: "daily-practice", name: "日常练习", defaultActive: true },
  { id: "abstract", name: "抽象", defaultActive: true },
  { id: "digital", name: "数字绘", defaultActive: false },
  { id: "concept", name: "概念设计", defaultActive: false },
  { id: "oil", name: "油画", defaultActive: false },
  { id: "watercolor", name: "水彩", defaultActive: false },
  { id: "portrait", name: "人物", defaultActive: false },
  { id: "landscape", name: "风景", defaultActive: false },
  { id: "fanart", name: "同人", defaultActive: false },
  { id: "comic", name: "漫画", defaultActive: false },
  { id: "experiment", name: "实验", defaultActive: false },
];

export function getPresetTagById(id: string): TagPreset | undefined {
  return PRESET_TAGS.find((item) => item.id === id);
}








































