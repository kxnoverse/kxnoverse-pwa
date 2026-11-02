import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCodeReferenceEntries } from "../data/code-reference";
import type { GardenCropType, GardenWorldId } from "../data/db";

interface CodeReferenceProps {
  world?: GardenWorldId;
  availableCrops?: readonly GardenCropType[];
}

export function CodeReference({ world, availableCrops }: CodeReferenceProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return getCodeReferenceEntries(world, availableCrops).filter((entry) => {
      if (!needle) return true;
      const text = [
        entry.signature,
        entry.example,
        entry.argumentValues?.join(" "),
        entry.suggestedValues?.join(" "),
        t(`codeLab.reference.entries.${entry.id}.title`),
        t(`codeLab.reference.entries.${entry.id}.description`),
        t(`codeLab.reference.entries.${entry.id}.mistake`),
      ].join(" ").toLocaleLowerCase();
      return text.includes(needle);
    });
  }, [availableCrops, query, t, world]);

  return (
    <div className="code-reference">
      <label className="code-reference__search">
        <Search size={13} />
        <input aria-label={t("codeLab.reference.search")} onChange={(event) => setQuery(event.target.value)} placeholder={t("codeLab.reference.search")} value={query} />
      </label>
      <section className="code-reference__keyboard">
        <h3>{t("codeLab.reference.keyboardTitle")}</h3>
        <p>{t("codeLab.reference.keyboardHelp")}</p>
        <div><kbd>{t("codeLab.reference.usKeyboard")}</kbd><span>{t("codeLab.reference.usKeys")}</span></div>
        <div><kbd>{t("codeLab.reference.deKeyboard")}</kbd><span>{t("codeLab.reference.deKeys")}</span></div>
        <p>{t("codeLab.reference.autoPairing")}</p>
      </section>
      <div className="code-reference__entries" aria-live="polite">
        {entries.map((entry) => (
          <article className="code-reference__entry" key={entry.id}>
            <header><h3>{entry.signature ?? t(`codeLab.reference.entries.${entry.id}.title`)}</h3><span>{t(`codeLab.reference.categories.${entry.category}`)}</span></header>
            <p>{t(`codeLab.reference.entries.${entry.id}.description`)}</p>
            <dl>
              <div><dt>{t("codeLab.reference.use")}</dt><dd>{t(`codeLab.reference.entries.${entry.id}.use`)}</dd></div>
              <div><dt>{t("codeLab.reference.arguments")}</dt><dd>{t(`codeLab.reference.entries.${entry.id}.arguments`)}</dd></div>
              {entry.argumentValues && (
                <div><dt>{t("codeLab.reference.acceptedValues")}</dt><dd className="code-reference__values">
                  {entry.argumentValues.map((value) => <code key={value}>{value}</code>)}
                </dd></div>
              )}
              {entry.suggestedValues && (
                <div><dt>{t("codeLab.reference.suggestedValues")}</dt><dd className="code-reference__values">
                  {entry.suggestedValues.map((value) => <code key={value}>{value}</code>)}
                </dd></div>
              )}
              <div><dt>{t("codeLab.reference.example")}</dt><dd><pre className="code-reference__example"><code>{entry.example}</code></pre></dd></div>
              <div><dt>{t("codeLab.reference.mistake")}</dt><dd>{t(`codeLab.reference.entries.${entry.id}.mistake`)}</dd></div>
              <div><dt>{t("codeLab.reference.unlock")}</dt><dd>{t(entry.requirement === "field-scanner"
                ? "codeLab.game.researchNames.field-scanner"
                : entry.requirement === "syntax" ? "codeLab.reference.alwaysAvailable"
                  : `codeLab.game.missionNames.${entry.requirement}.name`)}</dd></div>
            </dl>
          </article>
        ))}
        {entries.length === 0 && <p className="code-reference__empty">{t("codeLab.reference.noResults")}</p>}
      </div>
    </div>
  );
}
