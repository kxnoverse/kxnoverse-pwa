import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CODE_REFERENCE_ENTRIES } from "../data/code-reference";

export function CodeReference() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const entries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return CODE_REFERENCE_ENTRIES.filter(([id]) => {
      if (!needle) return true;
      const text = [
        t(`codeLab.reference.entries.${id}.title`),
        t(`codeLab.reference.entries.${id}.description`),
        t(`codeLab.reference.entries.${id}.example`),
        t(`codeLab.reference.entries.${id}.mistake`),
      ].join(" ").toLocaleLowerCase();
      return text.includes(needle);
    });
  }, [query, t]);

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
        {entries.map(([id, category, example, requirement]) => (
          <article className="code-reference__entry" key={id}>
            <header><h3>{t(`codeLab.reference.entries.${id}.title`)}</h3><span>{t(`codeLab.reference.categories.${category}`)}</span></header>
            <p>{t(`codeLab.reference.entries.${id}.description`)}</p>
            <dl>
              <div><dt>{t("codeLab.reference.use")}</dt><dd>{t(`codeLab.reference.entries.${id}.use`)}</dd></div>
              <div><dt>{t("codeLab.reference.arguments")}</dt><dd>{t(`codeLab.reference.entries.${id}.arguments`)}</dd></div>
              <div><dt>{t("codeLab.reference.example")}</dt><dd><code>{example}</code></dd></div>
              <div><dt>{t("codeLab.reference.mistake")}</dt><dd>{t(`codeLab.reference.entries.${id}.mistake`)}</dd></div>
              <div><dt>{t("codeLab.reference.unlock")}</dt><dd>{t(requirement === "field-scanner"
                ? "codeLab.game.researchNames.field-scanner"
                : requirement === "syntax" ? "codeLab.reference.alwaysAvailable"
                  : `codeLab.game.missionNames.${requirement}.name`)}</dd></div>
            </dl>
          </article>
        ))}
        {entries.length === 0 && <p className="code-reference__empty">{t("codeLab.reference.noResults")}</p>}
      </div>
    </div>
  );
}
