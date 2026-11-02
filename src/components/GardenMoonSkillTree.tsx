import { useTranslation } from "react-i18next";
import {
  GARDEN_MOON_SKILLS,
  getGardenMoonSkillLevel,
  type GardenMoonSkillDefinition,
} from "../data/code-garden";
import type { GardenMoonFarmSave, GardenMoonSkillId } from "../data/db";

interface GardenMoonSkillTreeProps {
  farm: GardenMoonFarmSave;
  busy: boolean;
  onPurchase: (skill: GardenMoonSkillId) => void;
}

const MOON_NODES = [
  { id: "cryoseeding", x: 18, y: 82 },
  { id: "ice-condenser", x: 202, y: 24 },
  { id: "prism-grafting", x: 202, y: 170 },
  { id: "gravity-treads", x: 386, y: 24 },
  { id: "lunar-yield", x: 386, y: 170 },
] as const;
const NODE_WIDTH = 166;
const NODE_HEIGHT = 112;
const TREE_WIDTH = 570;
const TREE_HEIGHT = 300;

function moonNodePosition(skill: GardenMoonSkillDefinition) {
  return MOON_NODES.find((node) => node.id === skill.id)!;
}

export function GardenMoonSkillTree({ farm, busy, onPurchase }: GardenMoonSkillTreeProps) {
  const { t } = useTranslation();
  const connectors = GARDEN_MOON_SKILLS.flatMap((skill) => skill.requires.flatMap((requirement) => {
    const from = GARDEN_MOON_SKILLS.find((entry) => entry.id === requirement.id);
    if (!from) return [];
    const start = moonNodePosition(from);
    const end = moonNodePosition(skill);
    const startX = start.x + NODE_WIDTH;
    const startY = start.y + NODE_HEIGHT / 2;
    const endX = end.x;
    const endY = end.y + NODE_HEIGHT / 2;
    return [{
      d: `M ${startX} ${startY} C ${startX + 28} ${startY}, ${endX - 28} ${endY}, ${endX} ${endY}`,
      active: getGardenMoonSkillLevel(farm, requirement.id) >= requirement.level,
    }];
  }));

  function prerequisiteText(skill: GardenMoonSkillDefinition): string {
    if (!skill.requires.length) return t("codeLab.game.skillTree.moonSkillTree.startingSkill");
    return skill.requires.map((requirement) =>
      `${t(`codeLab.game.skillTree.moonSkillTree.skills.${requirement.id}.name`)} ${t("codeLab.game.skillTree.levelShort", { level: requirement.level })}`,
    ).join(" · ");
  }

  return (
    <section className="garden-moon-skills">
      <header className="garden-moon-skills__header">
        <div>
          <span className="garden-game__section-label">{t("codeLab.game.skillTree.moonSkillTree.kicker")}</span>
          <h3>{t("codeLab.game.skillTree.moonSkillTree.title")}</h3>
          <p>{t("codeLab.game.skillTree.moonSkillTree.intro")}</p>
        </div>
        <span className="garden-moon-skills__wallet" aria-live="polite">
          <span aria-hidden="true">✦</span>{farm.credits} {t("codeLab.game.moon.credits")}
        </span>
      </header>
      <div className="garden-moon-skills__scroll" role="region" aria-label={t("codeLab.game.skillTree.moonSkillTree.title")} tabIndex={0}>
        <div className="garden-moon-skills__canvas" style={{ width: TREE_WIDTH, height: TREE_HEIGHT }}>
          <svg aria-hidden="true" className="garden-moon-skills__links" viewBox={`0 0 ${TREE_WIDTH} ${TREE_HEIGHT}`}>
            {connectors.map((connector) => (
              <path className={connector.active ? "is-active" : ""} d={connector.d} key={connector.d} />
            ))}
          </svg>
          {GARDEN_MOON_SKILLS.map((skill) => {
            const level = getGardenMoonSkillLevel(farm, skill.id);
            const cost = skill.costs[level];
            const locked = skill.requires.some((requirement) =>
              getGardenMoonSkillLevel(farm, requirement.id) < requirement.level);
            const maxed = cost === undefined;
            const affordable = !maxed && farm.credits >= cost;
            const status = maxed ? "maxed" : locked ? "locked" : affordable ? "ready" : "poor";
            const statusLabel = maxed
              ? t("codeLab.game.skillTree.maxLevel")
              : locked
                ? t("codeLab.game.skillTree.locked")
                : affordable
                  ? t("codeLab.game.skillTree.available")
                  : t("codeLab.game.skillTree.notEnoughCoins");
            const position = moonNodePosition(skill);
            return (
              <button
                aria-label={`${t(`codeLab.game.skillTree.moonSkillTree.skills.${skill.id}.name`)}, ${t("codeLab.game.skillTree.level", { level, max: skill.costs.length })}. ${t(`codeLab.game.skillTree.moonSkillTree.skills.${skill.id}.description`)} ${statusLabel}`}
                className={`garden-moon-skills__node is-${status}`}
                disabled={busy || locked || maxed || !affordable}
                key={skill.id}
                onClick={() => onPurchase(skill.id)}
                style={{ left: position.x, top: position.y }}
                type="button"
              >
                <span className="garden-moon-skills__node-title">
                  <b>{t(`codeLab.game.skillTree.moonSkillTree.skills.${skill.id}.name`)}</b>
                  <small>{t("codeLab.game.skillTree.level", { level, max: skill.costs.length })}</small>
                </span>
                <span className="garden-moon-skills__description">
                  {t(`codeLab.game.skillTree.moonSkillTree.skills.${skill.id}.description`)}
                </span>
                <span className="garden-moon-skills__node-foot">
                  <small>{locked ? t("codeLab.game.skillTree.requires", { requirement: prerequisiteText(skill) }) : statusLabel}</small>
                  <b>{cost === undefined ? t("codeLab.game.skillTree.maxLevel") : `${cost} ${t("codeLab.game.moon.credits")}`}</b>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="garden-moon-skills__legend">{t("codeLab.game.skillTree.moonSkillTree.legend")}</p>
    </section>
  );
}
