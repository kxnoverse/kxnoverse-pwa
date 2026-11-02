import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { GARDEN_SECOND_ROBOT_COST, GARDEN_SKILLS, getGardenSkillLevel, type GardenSkillDefinition } from "../data/code-garden";
import type { GardenAdventureSave, GardenSkillId } from "../data/db";

interface GardenSkillTreeProps {
  farm: GardenAdventureSave;
  busy: boolean;
  onPurchase: (skill: GardenSkillId) => void;
  onPurchaseRobot: () => void;
}

const NODE_WIDTH = 168;
const NODE_HEIGHT = 116;
const COLUMN_GAP = 10;
const COLUMN_STEP = 178;
const ROW_STEP = 140;
const TREE_WIDTH = 720;
const TREE_HEIGHT = 432;

function nodePosition(skill: GardenSkillDefinition) {
  const branchSkills = GARDEN_SKILLS.filter((entry) => entry.branch === skill.branch);
  const column = ["agriculture", "automation", "equipment", "expansion"].indexOf(skill.branch);
  const row = branchSkills.findIndex((entry) => entry.id === skill.id);
  return {
    x: COLUMN_GAP + column * COLUMN_STEP,
    y: 12 + row * ROW_STEP,
  };
}

export function GardenSkillTree({ farm, busy, onPurchase, onPurchaseRobot }: GardenSkillTreeProps) {
  const { t } = useTranslation();
  const connectors = GARDEN_SKILLS.flatMap((skill) => skill.requires.flatMap((requirement) => {
    const from = GARDEN_SKILLS.find((entry) => entry.id === requirement.id);
    if (!from) return [];
    const start = nodePosition(from);
    const end = nodePosition(skill);
    const x = start.x + NODE_WIDTH / 2;
    return [{
      d: `M ${x} ${start.y + NODE_HEIGHT} C ${x} ${start.y + NODE_HEIGHT + 12}, ${x} ${end.y - 12}, ${x} ${end.y}`,
      active: getGardenSkillLevel(farm, requirement.id) >= requirement.level,
    }];
  }));

  function prerequisiteText(skill: GardenSkillDefinition): string {
    if (skill.requires.length === 0) return t("codeLab.game.skillTree.startingSkill");
    return skill.requires.map((requirement) =>
      `${t(`codeLab.game.skillTree.skills.${requirement.id}.name`)} ${t("codeLab.game.skillTree.levelShort", { level: requirement.level })}`,
    ).join(" · ");
  }

  function statusFor(skill: GardenSkillDefinition): "locked" | "ready" | "owned" | "maxed" | "poor" {
    const level = getGardenSkillLevel(farm, skill.id);
    if (level >= skill.costs.length) return "maxed";
    if (skill.requires.some((requirement) => getGardenSkillLevel(farm, requirement.id) < requirement.level)) return "locked";
    return farm.coins >= skill.costs[level] ? "ready" : "poor";
  }

  return (
    <div className="garden-skill-tree">
      <header className="garden-skill-tree__header">
        <div>
          <span className="garden-game__section-label">{t("codeLab.game.skillTree.kicker")}</span>
          <h3>{t("codeLab.game.skillTree.title")}</h3>
          <p>{t("codeLab.game.skillTree.intro")}</p>
        </div>
        <span className="garden-skill-tree__wallet" aria-live="polite">
          <span aria-hidden="true">✦</span>{farm.coins} {t("codeLab.game.adventure.coins")}
        </span>
      </header>
      <div className="garden-skill-tree__branches" aria-hidden="true">
        {(["agriculture", "automation", "equipment", "expansion"] as const).map((branch) => (
          <span className={`garden-skill-tree__branch garden-skill-tree__branch--${branch}`} key={branch}>
            {t(`codeLab.game.skillTree.branches.${branch}`)}
          </span>
        ))}
      </div>
      <div className="garden-skill-tree__scroll" role="region" aria-label={t("codeLab.game.skillTree.title")} tabIndex={0}>
        <div className="garden-skill-tree__canvas" style={{ width: TREE_WIDTH, height: TREE_HEIGHT }}>
          <svg aria-hidden="true" className="garden-skill-tree__links" viewBox={`0 0 ${TREE_WIDTH} ${TREE_HEIGHT}`}>
            {connectors.map((path) => <path className={path.active ? "is-active" : ""} d={path.d} key={path.d} />)}
          </svg>
          {GARDEN_SKILLS.map((skill) => {
            const position = nodePosition(skill);
            const level = getGardenSkillLevel(farm, skill.id);
            const status = statusFor(skill);
            const cost = skill.costs[level];
            const locked = status === "locked";
            const unavailable = busy || locked || status === "poor" || status === "maxed";
            const statusLabel = status === "maxed"
              ? t("codeLab.game.skillTree.maxLevel")
              : status === "locked"
                ? t("codeLab.game.skillTree.locked")
                : status === "poor"
                  ? t("codeLab.game.skillTree.notEnoughCoins")
                  : level > 0
                    ? t("codeLab.game.skillTree.upgradeAvailable")
                    : t("codeLab.game.skillTree.available");
            return (
              <button
                aria-describedby={`garden-skill-description-${skill.id}`}
                aria-label={`${t(`codeLab.game.skillTree.skills.${skill.id}.name`)}, ${t("codeLab.game.skillTree.level", { level, max: skill.costs.length })}. ${t(`codeLab.game.skillTree.skills.${skill.id}.description`)} ${statusLabel}`}
                className={`garden-skill-tree__node garden-skill-tree__node--${skill.branch} is-${status}`}
                disabled={unavailable}
                key={skill.id}
                onClick={() => onPurchase(skill.id)}
                style={{ left: position.x, top: position.y }}
                type="button"
              >
                <span className="garden-skill-tree__node-top">
                  <b>{t(`codeLab.game.skillTree.skills.${skill.id}.name`)}</b>
                  <small>{t("codeLab.game.skillTree.level", { level, max: skill.costs.length })}</small>
                </span>
                <span className="garden-skill-tree__description" id={`garden-skill-description-${skill.id}`}>
                  {t(`codeLab.game.skillTree.skills.${skill.id}.description`)}
                </span>
                <span className="garden-skill-tree__node-bottom">
                  <small>{locked ? t("codeLab.game.skillTree.requires", { requirement: prerequisiteText(skill) }) : statusLabel}</small>
                  <b>{cost === undefined ? t("codeLab.game.skillTree.maxLevel") : t("codeLab.game.adventure.upgradeCost", { cost })}</b>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <footer className="garden-skill-tree__footer">
        <p className="garden-skill-tree__legend">{t("codeLab.game.skillTree.legend")}</p>
        {getGardenSkillLevel(farm, "robot-blueprints") > 0 && (
          <button
            className="garden-skill-tree__robot"
            disabled={busy || Boolean(farm.secondRobot) || farm.coins < GARDEN_SECOND_ROBOT_COST}
            onClick={onPurchaseRobot}
            type="button"
          >
            <Bot size={15} />
            {farm.secondRobot
              ? t("codeLab.game.skillTree.robotOwned")
              : t("codeLab.game.skillTree.buyRobot", { cost: GARDEN_SECOND_ROBOT_COST })}
          </button>
        )}
      </footer>
    </div>
  );
}
