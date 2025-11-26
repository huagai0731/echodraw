export type AchievementLevelDefinition = {
  id: string;
  slug: string;
  level: number;
  name: string;
  description: string;
  displayOrder?: number;
  category: string | null;
  icon: string | null;
  metadata: Record<string, unknown>;
  condition: Record<string, unknown>;
  conditionText: string | null;
  unlockedAtLabel: string;
  unlockedAtDate: string | null;
};

export type AchievementGroupSummaryDefinition = {
  levelCount: number;
  highestUnlockedLevel: number;
  unlockedLevels: number[];
};

export type AchievementGroupDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  displayOrder?: number;
  category: string | null;
  icon: string | null;
  metadata: Record<string, unknown>;
  summary: AchievementGroupSummaryDefinition;
  levels: AchievementLevelDefinition[];
};
