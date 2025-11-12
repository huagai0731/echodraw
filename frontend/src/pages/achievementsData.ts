export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
  unlockedAt: string;
  unlockedAtDate: string;
  imageUrl: string;
  imageAlt: string;
  detailProgressLabel: string;
  detailProgressPercent: number;
  detailDescription: string;
  detailTimeLabel: string;
  detailTitle: string;
  profileTitle: string;
  profileSubtitle: string;
  profileDateLabel: string;
  defaultPinned?: boolean;
};

export type LockedAchievementDefinition = {
  id: string;
  title: string;
  description: string;
};

export const UNLOCKED_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first-brushstroke",
    title: "First Brushstroke",
    description: "The very first step on a magnificent journey. Your canvas awaits.",
    unlockedAt: "Unlocked on 2023-10-26",
    unlockedAtDate: "2023-10-26",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDDl7Y0sALMP1mYxw_hbgwAqxKUU2mlEBJUG4Ie1iw_GMOzESEyIRWAj1aLlINWp7u1kmc0FwQ4HomzQMAUX3M8Bz0oKCNKlPQFg-aeFUjdSiDbnkzUSl_8aJacWRS6KK_-HrVTJVOO9bpJ2Im0YFNkI-glF8yqYjF_yldye-NIFMmzc5g2mLeMSDwveAMV2jLtdAjpIF446M2OcDvZAAL_ANwIOIycQVn5GccE-YnMEDLdiDLmCJfbSR_xKw9ptwY39sXIZ6oAZgQ5",
    imageAlt: "Abstract painting with swirls of blue and gold",
    detailProgressLabel: "成就：3/100",
    detailProgressPercent: 3,
    detailDescription: "恭喜你，捕捉到了创作中独特的光影瞬间。",
    detailTimeLabel: "时间：2023.10.26",
    detailTitle: "光影捕手",
    profileTitle: "光影捕手",
    profileSubtitle: "捕捉到了创作中独特的光影瞬间。",
    profileDateLabel: "2023.10.26",
    defaultPinned: true,
  },
  {
    id: "midnight-oil",
    title: "Midnight Oil",
    description: "For the creators who find their muse in the quiet hours of the night.",
    unlockedAt: "Unlocked on 2023-10-28",
    unlockedAtDate: "2023-10-28",
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCpmTQwQmk22t6Ba7Da2TkLewIngqBrO4YVt4sXTihqcPB3bZerxbzGtXRUMq0mOzBylY-Qp00Kzarviv42KpEetzhBefvwcoQ0UOCozyxd-Fq2ovOqTLet0PI_YaqK9rNcIJCXpP-I7H2leiFTyxpQoekMulcf13DLPuX6Mo7BtqyPFFETnCHidtQAcPEAPaEMAw-l72FM9NuAIvUU8q4i4QRWqdEBDc7Jn-s6GqL-aSGf5Pn67uqM1v2OTZoeMBp3YXpwYxtkqj2f",
    imageAlt: "A dark, moody abstract image with hints of purple and deep blue",
    detailProgressLabel: "成就：8/100",
    detailProgressPercent: 8,
    detailDescription: "在寂静夜色中完成创作，灵感在星光下流淌。",
    detailTimeLabel: "时间：2023.10.28",
    detailTitle: "午夜灵感",
    profileTitle: "午夜灵感",
    profileSubtitle: "在寂静夜色中完成创作，灵感在星光下流淌。",
    profileDateLabel: "2023.10.28",
  },
];

export const LOCKED_ACHIEVEMENTS: LockedAchievementDefinition[] = [
  {
    id: "creative-marathon",
    title: "Creative Marathon",
    description: "Keep creating to unlock",
  },
  {
    id: "chromatic-virtuoso",
    title: "Chromatic Virtuoso",
    description: "A mystery to be revealed",
  },
  {
    id: "ritualist",
    title: "Ritualist",
    description: "Continue your journey",
  },
];

