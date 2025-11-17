import { useMemo, useState } from "react";
import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";
import type { AchievementGroupDefinition, AchievementLevelDefinition } from "@/pages/achievementsData";

import "./ProfileAchievements.css";

const GROUP_PREFIX = "group:";
const STANDALONE_PREFIX = "standalone:";

type SelectedState =
  | { kind: "group"; groupId: string; levelId: string }
  | { kind: "standalone"; levelId: string }
  | null;

type ProfileAchievementsSummary = {
  group_count?: number;
  standalone_count?: number;
  achievement_count?: number;
} | null;

type ProfileAchievementsProps = {
  onBack: () => void;
  pinnedAchievementIds: string[];
  onTogglePinned: (payload: { id: string; title: string; subtitle: string; nextPinned: boolean }) => void;
  groups?: AchievementGroupDefinition[];
  standalone?: AchievementLevelDefinition[];
  summary?: ProfileAchievementsSummary;
  loading?: boolean;
};

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function gradientFromSlug(slug: string): string {
  const source = slug && slug.trim().length > 0 ? slug : "achievement";
  const base = Math.abs(hashString(source));
  const hue1 = base % 360;
  const hue2 = (hue1 + 36) % 360;
  const saturation = 62;
  const lightness1 = 58;
  const lightness2 = 34;
  return `linear-gradient(135deg, hsl(${hue1} ${saturation}% ${lightness1}%), hsl(${hue2} ${saturation + 8}% ${lightness2}%))`;
}

function resolveBackground(slug: string, metadata?: Record<string, unknown>): string {
  // 优先使用解锁时使用的图片
  const unlockImage = typeof metadata?.unlock_image_url === "string" ? metadata.unlock_image_url.trim() : "";
  if (unlockImage) {
    return `url("${unlockImage}")`;
  }
  
  // 其次使用封面图片
  const cover = typeof metadata?.cover_image === "string" ? metadata.cover_image.trim() : "";
  if (cover) {
    if (/^(?:linear|radial|conic)-gradient|^paint\(/i.test(cover)) {
      return cover;
    }
    return `url("${cover}")`;
  }
  return gradientFromSlug(slug);
}

function buildGroupPinnedId(group: AchievementGroupDefinition): string {
  return `${GROUP_PREFIX}${group.slug}`;
}

function buildStandalonePinnedId(level: AchievementLevelDefinition): string {
  return `${STANDALONE_PREFIX}${level.slug}`;
}

function isLevelUnlocked(level: AchievementLevelDefinition): boolean {
  return Boolean(level.unlockedAtDate);
}

function getHighestUnlockedLevel(group: AchievementGroupDefinition): AchievementLevelDefinition | null {
  if (!group.levels || group.levels.length === 0) {
    return null;
  }
  const unlocked = group.levels
    .filter(isLevelUnlocked)
    .sort((a, b) => b.level - a.level);
  return unlocked[0] ?? null;
}

function formatLevelSubtitle(level: AchievementLevelDefinition): string {
  return level.conditionText || level.description || "持续创作以解锁更多故事。";
}

function ProfileAchievements({
  onBack,
  pinnedAchievementIds,
  onTogglePinned,
  groups = [],
  standalone = [],
  summary = null,
  loading = false,
}: ProfileAchievementsProps) {
  const [selected, setSelected] = useState<SelectedState>(null);

  const unlockedGroups = useMemo(() => {
    return groups
      .map((group) => {
        const unlockedLevel = getHighestUnlockedLevel(group);
        return unlockedLevel ? { group, unlockedLevel } : null;
      })
      .filter(
        (entry): entry is { group: AchievementGroupDefinition; unlockedLevel: AchievementLevelDefinition } =>
          entry !== null,
      );
  }, [groups]);

  const lockedGroups = useMemo(() => {
    const unlockedIds = new Set(unlockedGroups.map((entry) => entry.group.id));
    return groups.filter((group) => !unlockedIds.has(group.id));
  }, [groups, unlockedGroups]);

  const unlockedStandalone = useMemo(
    () => standalone.filter((level) => isLevelUnlocked(level)),
    [standalone],
  );

  const lockedStandalone = useMemo(
    () => standalone.filter((level) => !isLevelUnlocked(level)),
    [standalone],
  );

  const selectedEntry = useMemo(() => {
    if (!selected) {
      return null;
    }
    if (selected.kind === "group") {
      const entry = unlockedGroups.find((item) => item.group.id === selected.groupId);
      if (!entry) {
        return null;
      }
      const { group, unlockedLevel } = entry;
      const level = group.levels.find((item) => item.id === selected.levelId) ?? unlockedLevel;
      if (!level) {
        return null;
      }
      return { kind: "group" as const, group, level };
    }
    const level = unlockedStandalone.find((item) => item.id === selected.levelId);
    if (!level) {
      return null;
    }
    return { kind: "standalone" as const, level };
  }, [selected, unlockedGroups, unlockedStandalone]);

  const totalLevels = useMemo(() => {
    const grouped = groups.reduce((sum, group) => sum + group.summary.levelCount, 0);
    return grouped + standalone.length;
  }, [groups, standalone.length]);

  const unlockedLevels = useMemo(() => {
    const grouped = unlockedGroups.reduce(
      (sum, entry) => sum + entry.group.summary.unlockedLevels.length,
      0,
    );
    const singles = unlockedStandalone.length;
    return grouped + singles;
  }, [unlockedGroups, unlockedStandalone.length]);

  const progressPercent =
    totalLevels > 0 ? Math.min(100, Math.max(0, Math.round((unlockedLevels / totalLevels) * 100))) : 0;
  const progressLabel =
    totalLevels > 0 ? `已解锁 ${unlockedLevels}/${totalLevels}` : "暂无成就数据";

  const handleSelectGroup = (group: AchievementGroupDefinition, level: AchievementLevelDefinition | null) => {
    if (!level || !isLevelUnlocked(level)) {
      return;
    }
    setSelected({ kind: "group", groupId: group.id, levelId: level.id });
  };

  const handleSelectStandalone = (level: AchievementLevelDefinition) => {
    if (!isLevelUnlocked(level)) {
      return;
    }
    setSelected({ kind: "standalone", levelId: level.id });
  };

  const renderGroupCard = (group: AchievementGroupDefinition, representative: AchievementLevelDefinition) => {
    if (!isLevelUnlocked(representative)) {
      return null;
    }

    const pinnedId = buildGroupPinnedId(group);
    const isPinned = pinnedAchievementIds.includes(pinnedId);
    const backgroundImage = resolveBackground(group.slug, group.metadata);
    const subtitle = formatLevelSubtitle(representative);

    return (
      <button
        key={group.id}
        type="button"
        className="achievement-card achievement-card--group"
        onClick={() => handleSelectGroup(group, representative)}
      >
        <span className="achievement-card__accent" />
        <div className="achievement-card__summary">
          <div className="achievement-card__text">
            <p className="achievement-card__title">{group.name}</p>
            <p className="achievement-card__description">{subtitle}</p>
            <p className="achievement-card__meta">共 {group.summary.levelCount} 等</p>
          </div>
          <div
            className="achievement-card__thumb achievement-card__thumb--group"
            role="img"
            aria-label={group.name}
            style={{ backgroundImage }}
          >
            <span className="achievement-card__badge">Lv.{representative.level}</span>
          </div>
        </div>
        <div className="achievement-card__footer">
          <p className="achievement-card__date">{representative.unlockedAtLabel}</p>
          <button
            type="button"
            className={clsx("achievement-card__action", isPinned && "achievement-card__action--pinned")}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePinned({
                id: pinnedId,
                title: group.name,
                subtitle,
                nextPinned: !isPinned,
              });
            }}
            aria-pressed={isPinned}
          >
            <MaterialIcon name="push_pin" filled={isPinned} />
            <span>{isPinned ? "Displayed" : "Display on profile"}</span>
          </button>
        </div>
      </button>
    );
  };

  const renderStandaloneCard = (level: AchievementLevelDefinition) => {
    if (!isLevelUnlocked(level)) {
      return null;
    }

    const pinnedId = buildStandalonePinnedId(level);
    const isPinned = pinnedAchievementIds.includes(pinnedId);
    const subtitle = formatLevelSubtitle(level);
    const backgroundImage = resolveBackground(level.slug, level.metadata);

    return (
      <button
        key={level.id}
        type="button"
        className="achievement-mini-card"
        onClick={() => handleSelectStandalone(level)}
      >
        <div
          className="achievement-mini-card__thumb"
          role="img"
          aria-label={level.name}
          style={{ backgroundImage }}
        />
        <div className="achievement-mini-card__body">
          <div className="achievement-mini-card__header">
            <strong>{level.name}</strong>
            <span className="achievement-mini-card__tag">独立</span>
          </div>
          <p className="achievement-mini-card__subtitle">{subtitle}</p>
          <div className="achievement-mini-card__meta">
            <span>{level.unlockedAtLabel}</span>
            <button
              type="button"
              className={clsx(
                "achievement-mini-card__pin",
                isPinned && "achievement-mini-card__pin--active",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePinned({
                  id: pinnedId,
                  title: level.name,
                  subtitle,
                  nextPinned: !isPinned,
                });
              }}
              aria-pressed={isPinned}
            >
              <MaterialIcon name="push_pin" filled={isPinned} />
            </button>
          </div>
        </div>
      </button>
    );
  };

  const modalContent = selectedEntry
    ? (() => {
        if (selectedEntry.kind === "group") {
          const { group, level } = selectedEntry;
          const levelPercent =
            group.summary.levelCount > 0
              ? Math.min(100, Math.round((level.level / group.summary.levelCount) * 100))
              : 0;
          return {
            title: `${group.name} · Lv.${level.level}`,
            subtitle: formatLevelSubtitle(level),
            time: level.unlockedAtLabel,
            progressLabel: `等级 ${level.level}/${group.summary.levelCount}`,
            progressPercent: levelPercent,
            background: resolveBackground(group.slug, group.metadata),
            levels: group.levels,
            selectedLevelId: level.id,
            group,
          };
        }
        const { level } = selectedEntry;
        return {
          title: level.name,
          subtitle: formatLevelSubtitle(level),
          time: level.unlockedAtLabel,
          progressLabel: level.unlockedAtDate ? "已完成" : "待解锁",
          progressPercent: level.unlockedAtDate ? 100 : 0,
          background: resolveBackground(level.slug, level.metadata),
          levels: null,
          selectedLevelId: level.id,
          group: null,
        };
      })()
    : null;

  return (
    <div className="achievements-page">
      <div className="achievements-page__bg">
        <div className="achievements-page__glow achievements-page__glow--mint" />
        <div className="achievements-page__glow achievements-page__glow--blue" />
      </div>

      <header className="achievements-page__header">
        <button type="button" className="achievements-page__nav-button" onClick={onBack}>
          <MaterialIcon name="arrow_back_ios_new" />
        </button>
        <h1>成就总览</h1>
        <div className="achievements-page__header-placeholder" />
      </header>

      <main className="achievements-page__content">
        <section className="achievements-progress">
          <p>{progressLabel}</p>
          <div className="achievements-progress__track">
            <div
              className="achievements-progress__bar"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <span className="achievements-progress__caption">
            成就组 {summary?.group_count ?? groups.length} · 独立成就 {summary?.standalone_count ?? standalone.length}
          </span>
        </section>

        <section className="achievements-section achievements-section--groups">
          <div className="achievements-section__header">
            <h2>成就组</h2>
            <span>{unlockedGroups.length}</span>
          </div>
          {loading ? (
            <div className="achievements-section__state" role="status">
              正在加载成就...
            </div>
          ) : unlockedGroups.length === 0 ? (
            <div className="achievements-section__state">尚未解锁成就组</div>
          ) : (
            <div className="achievements-groups-grid">
              {unlockedGroups.map(({ group, unlockedLevel }) => renderGroupCard(group, unlockedLevel))}
            </div>
          )}
        </section>

        <section className="achievements-section achievements-section--standalone">
          <div className="achievements-section__header">
            <h2>独立成就</h2>
            <span>{unlockedStandalone.length}</span>
          </div>
          {loading ? (
            <div className="achievements-section__state" role="status">
              正在加载成就...
            </div>
          ) : unlockedStandalone.length === 0 ? (
            <div className="achievements-section__state">尚未解锁独立成就</div>
          ) : (
            <div className="achievements-standalone-grid">
              {unlockedStandalone.map((level) => renderStandaloneCard(level))}
            </div>
          )}
        </section>

        <section className="achievements-section achievements-section--locked-groups">
          <div className="achievements-section__header">
            <h2>未解锁成就组</h2>
            <span>{lockedGroups.length}</span>
          </div>
          {lockedGroups.length === 0 ? (
            <div className="achievements-section__state">全部成就组已解锁</div>
          ) : (
            <div className="achievements-locked__grid" role="list">
              {lockedGroups.map((group) => (
                <div key={group.id} className="achievements-locked__item" role="listitem">
                  <span className="achievements-locked__name">{group.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="achievements-section achievements-section--locked-standalone">
          <div className="achievements-section__header">
            <h2>未解锁独立成就</h2>
            <span>{lockedStandalone.length}</span>
          </div>
          {lockedStandalone.length === 0 ? (
            <div className="achievements-section__state">全部独立成就已解锁</div>
          ) : (
            <div className="achievements-locked__grid" role="list">
              {lockedStandalone.map((level) => (
                <div key={level.id} className="achievements-locked__item" role="listitem">
                  <span className="achievements-locked__name">{level.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {modalContent ? (
        <div className="achievement-modal" role="dialog" aria-modal="true" aria-labelledby="achievement-modal-title">
          <div className="achievement-modal__overlay" onClick={() => setSelected(null)} />

          <div className="achievement-modal__inner">
            <div className="achievement-modal__background">
              <div className="achievement-modal__gallery">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="achievement-modal__gallery-cell" />
                ))}
              </div>
            </div>

            <div className="achievement-modal__content">
              <div className="achievement-modal__header">
                <p className="achievement-modal__progress">{modalContent.progressLabel}</p>
                <div className="achievement-modal__progress-track">
                  <div
                    className="achievement-modal__progress-bar"
                    style={{ width: `${modalContent.progressPercent}%` }}
                  />
                </div>
              </div>

              <h2 id="achievement-modal-title">{modalContent.title}</h2>
              <p className="achievement-modal__description">{modalContent.subtitle}</p>
              <p className="achievement-modal__time">{modalContent.time}</p>

              <div className="achievement-modal__artwork">
                <div className="achievement-modal__artwork-frame">
                  <div
                    className="achievement-modal__artwork-image"
                    role="img"
                    aria-label={modalContent.title}
                    style={{ backgroundImage: modalContent.background }}
                  />
                </div>
              </div>

              {modalContent.levels ? (
                <div className="achievement-modal__levels">
                  {modalContent.levels.map((level) => {
                    const active = level.id === modalContent.selectedLevelId;
                    const disabled = !isLevelUnlocked(level);
                    return (
                      <button
                        key={level.id}
                        type="button"
                        className={clsx(
                          "achievement-modal__level",
                          active && "achievement-modal__level--active",
                          disabled && "achievement-modal__level--disabled",
                        )}
                        onClick={() =>
                          setSelected({
                            kind: "group",
                            groupId: modalContent.group!.id,
                            levelId: level.id,
                          })
                        }
                        disabled={disabled}
                      >
                        <span className="achievement-modal__level-badge">Lv.{level.level}</span>
                        <div className="achievement-modal__level-text">
                          <strong>{level.name}</strong>
                          <span>{formatLevelSubtitle(level)}</span>
                        </div>
                        <span className="achievement-modal__level-time">{level.unlockedAtLabel}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="achievement-modal__actions">
                <button
                  type="button"
                  className="achievement-modal__button achievement-modal__button--secondary"
                  onClick={() => setSelected(null)}
                >
                  关闭
                </button>
                <button type="button" className="achievement-modal__button achievement-modal__button--primary">
                  导出
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProfileAchievements;

