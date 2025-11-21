import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchMoods, type Mood } from "@/services/api";

export function useMood(selectedMoodId: number | null, onSelect: (moodId: number | null) => void) {
  const [moods, setMoods] = useState<Mood[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    
    async function loadMoods() {
      try {
        setIsLoading(true);
        const data = await fetchMoods();
        if (!cancelled) {
          setMoods(data);
        }
      } catch (error) {
        console.warn("[useMood] Failed to load moods:", error);
        if (!cancelled) {
          // 如果API失败，使用硬编码的fallback列表（保持向后兼容）
          setMoods([
            { id: 1, name: "灵感爆棚", displayOrder: 1, isActive: true, createdAt: "", updatedAt: "" },
            { id: 2, name: "画感全开", displayOrder: 2, isActive: true, createdAt: "", updatedAt: "" },
            { id: 3, name: "稳扎慢练", displayOrder: 3, isActive: true, createdAt: "", updatedAt: "" },
            { id: 4, name: "卡住反复", displayOrder: 4, isActive: true, createdAt: "", updatedAt: "" },
            { id: 5, name: "惊喜超标", displayOrder: 5, isActive: true, createdAt: "", updatedAt: "" },
            { id: 6, name: "随便摸鱼", displayOrder: 6, isActive: true, createdAt: "", updatedAt: "" },
            { id: 7, name: "换法试笔", displayOrder: 7, isActive: true, createdAt: "", updatedAt: "" },
            { id: 8, name: "小小进步", displayOrder: 8, isActive: true, createdAt: "", updatedAt: "" },
            { id: 9, name: "爆肝冲刺", displayOrder: 9, isActive: true, createdAt: "", updatedAt: "" },
            { id: 10, name: "疲惫挂机", displayOrder: 10, isActive: true, createdAt: "", updatedAt: "" },
            { id: 11, name: "细节打磨", displayOrder: 11, isActive: true, createdAt: "", updatedAt: "" },
            { id: 12, name: "产能见底", displayOrder: 12, isActive: true, createdAt: "", updatedAt: "" },
            { id: 13, name: "画废崩溃", displayOrder: 13, isActive: true, createdAt: "", updatedAt: "" },
            { id: 14, name: "自我怀疑", displayOrder: 14, isActive: true, createdAt: "", updatedAt: "" },
            { id: 15, name: "摆烂自救", displayOrder: 15, isActive: true, createdAt: "", updatedAt: "" },
            { id: 16, name: "情绪重启", displayOrder: 16, isActive: true, createdAt: "", updatedAt: "" },
          ]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadMoods();

    return () => {
      cancelled = true;
    };
  }, []);

  const moodMatrix = useMemo(() => {
    const result: Mood[][] = [];
    const activeMoods = moods.filter((m) => m.isActive);
    for (let i = 0; i < activeMoods.length; i += 4) {
      result.push(activeMoods.slice(i, i + 4));
    }
    return result;
  }, [moods]);

  const selectMood = useCallback(
    (mood: Mood) => {
      onSelect(mood.id);
    },
    [onSelect]
  );

  const selectedMood = useMemo(() => {
    if (selectedMoodId === null) return null;
    return moods.find((m) => m.id === selectedMoodId) || null;
  }, [moods, selectedMoodId]);

  return {
    moods,
    moodMatrix,
    selectedMood,
    isLoading,
    selectMood,
  };
}
