import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function ModulePage() {
  const { module = "" } = useParams();
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    tasks: "tasks",
    calendar: "calendar",
    notes: "notes",
    focus: "focus",
    files: "files",
  };
  const label = labels[module.toLowerCase()];

  if (!label) {
    return <section className="module-page"><h1>{t("module.notFound")}</h1></section>;
  }

  return (
    <section className="module-page">
      <h1>{t(`nav.${label}`)}</h1>
      <p>{t("module.unavailable")}</p>
      <Link className="back-link" to="/"><ArrowLeft size={15} />{t("module.back")}</Link>
    </section>
  );
}
