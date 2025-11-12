import { useMemo, useState } from "react";
import clsx from "clsx";

import MaterialIcon from "@/components/MaterialIcon";
import {
  type AchievementDefinition,
  type LockedAchievementDefinition,
  LOCKED_ACHIEVEMENTS,
  UNLOCKED_ACHIEVEMENTS,
} from "@/pages/achievementsData";

import "./ProfileAchievements.css";

type ProfileAchievementsProps = {
  onBack: () => void;
  pinnedAchievementIds: string[];
  onTogglePinned: (payload: { id: string; title: string; subtitle: string; nextPinned: boolean }) => void;
};

function ProfileAchievements({ onBack, pinnedAchievementIds, onTogglePinned }: ProfileAchievementsProps) {
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | null>(null);

  const selectedAchievement = useMemo(
    () =>
      selectedAchievementId
        ? UNLOCKED_ACHIEVEMENTS.find((item) => item.id === selectedAchievementId) ?? null
        : null,
    [selectedAchievementId],
  );

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
        <h1>All Achievements</h1>
        <div className="achievements-page__header-placeholder" />
      </header>

      <main className="achievements-page__content">
        <section className="achievements-progress">
          <p>15/50 Unlocked</p>
          <div className="achievements-progress__track">
            <div className="achievements-progress__bar" style={{ width: "30%" }} />
          </div>
        </section>

        <section className="achievements-section">
          {UNLOCKED_ACHIEVEMENTS.map((achievement: AchievementDefinition) => {
            const isPinned = pinnedAchievementIds.includes(achievement.id);
            return (
              <button
                key={achievement.id}
                type="button"
                className="achievement-card"
                onClick={() => setSelectedAchievementId(achievement.id)}
              >
                <span className="achievement-card__accent" />
                <div className="achievement-card__summary">
                  <div className="achievement-card__text">
                    <p className="achievement-card__title">{achievement.title}</p>
                    <p className="achievement-card__description">{achievement.description}</p>
                  </div>
                  <div
                    className="achievement-card__thumb"
                    role="img"
                    aria-label={achievement.imageAlt}
                    style={{ backgroundImage: `url("${achievement.imageUrl}")` }}
                  />
                </div>
                <div className="achievement-card__footer">
                  <p className="achievement-card__date">{achievement.unlockedAt}</p>
                  <button
                    type="button"
                    className={clsx("achievement-card__action", isPinned && "achievement-card__action--pinned")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onTogglePinned({
                        id: achievement.id,
                        title: achievement.profileTitle,
                        subtitle: achievement.profileSubtitle,
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
          })}
        </section>

        <section className="achievements-locked">
          {LOCKED_ACHIEVEMENTS.map((achievement: LockedAchievementDefinition) => (
            <div key={achievement.id} className="achievements-locked-card">
              <div className="achievements-locked-card__icon">
                <MaterialIcon name="lock" />
              </div>
              <div className="achievements-locked-card__text">
                <p className="achievements-locked-card__title">{achievement.title}</p>
                <p className="achievements-locked-card__description">{achievement.description}</p>
              </div>
            </div>
          ))}
        </section>
      </main>

      {selectedAchievement ? (
        <div
          className="achievement-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="achievement-modal-title"
        >
          <div className="achievement-modal__overlay" onClick={() => setSelectedAchievementId(null)} />

          <div className="achievement-modal__inner">
            <div className="achievement-modal__background">
              <div className="achievement-modal__gallery">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div key={index} className="achievement-modal__gallery-cell" />
                ))}
              </div>
            </div>

            <div className="achievement-modal__content">
              <button
                type="button"
                className="achievement-modal__close"
                onClick={() => setSelectedAchievementId(null)}
                aria-label="关闭"
              >
                <MaterialIcon name="close" />
              </button>
              <div className="achievement-modal__header">
                <p className="achievement-modal__progress">{selectedAchievement.detailProgressLabel}</p>
                <div className="achievement-modal__progress-track">
                  <div
                    className="achievement-modal__progress-bar"
                    style={{ width: `${selectedAchievement.detailProgressPercent}%` }}
                  />
                </div>
              </div>

              <h2 id="achievement-modal-title">{selectedAchievement.detailTitle}</h2>
              <p className="achievement-modal__description">{selectedAchievement.detailDescription}</p>
              <p className="achievement-modal__time">{selectedAchievement.detailTimeLabel}</p>

              <div className="achievement-modal__artwork">
                <div className="achievement-modal__artwork-frame">
                  <div
                    className="achievement-modal__artwork-image"
                    role="img"
                    aria-label={selectedAchievement.imageAlt}
                    style={{ backgroundImage: `url("${selectedAchievement.imageUrl}")` }}
                  />
                </div>
              </div>

              <div className="achievement-modal__actions">
                <button
                  type="button"
                  className="achievement-modal__button achievement-modal__button--secondary"
                  onClick={() => setSelectedAchievementId(null)}
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

