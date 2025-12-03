import type { InspirationNoteRecord } from "@/services/api";

/**
 * 瀑布流布局：将记录分配到左右两列
 */
export function distributeRecords(records: InspirationNoteRecord[]): {
  left: InspirationNoteRecord[];
  right: InspirationNoteRecord[];
} {
  const left: InspirationNoteRecord[] = [];
  const right: InspirationNoteRecord[] = [];
  
  records.forEach((record, index) => {
    if (index % 2 === 0) {
      left.push(record);
    } else {
      right.push(record);
    }
  });
  
  return { left, right };
}

