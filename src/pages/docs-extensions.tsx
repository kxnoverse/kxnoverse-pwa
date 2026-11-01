import { useEffect, useState } from "react";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { db } from "../data/db";
import { diagramToSvg, isDiagramProject } from "../data/diagrams";
import type { DiagramProject } from "../data/db";

function DocumentImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const [src, setSrc] = useState("");
  const assetId = String(node.attrs.assetId ?? "");
  const width = Number(node.attrs.width) || 420;
  const ratio = Number(node.attrs.ratio) || 1.4;

  useEffect(() => {
    let active = true;
    let url = "";
    void db.documentImages.get(assetId).then((asset) => {
      if (!active || !asset) return;
      url = URL.createObjectURL(asset.blob);
      setSrc(url);
    }).catch(() => setSrc(""));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId]);

  return (
    <NodeViewWrapper className={`docs-image-node${selected ? " is-selected" : ""}`}>
      {src ? <img src={src} alt={String(node.attrs.alt ?? "")} style={{ width: `${width}px` }} /> : <span>Image unavailable</span>}
      {selected && (
        <input
          aria-label="Image width"
          type="range"
          min={120}
          max={620}
          step={20}
          value={width}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const nextWidth = Number(event.target.value);
            updateAttributes({ width: nextWidth, height: Math.round(nextWidth / ratio) });
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const DocumentImage = Node.create({
  name: "documentImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      assetId: { default: "" },
      alt: { default: "" },
      width: { default: 420 },
      height: { default: 300 },
      ratio: { default: 1.4 },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-doc-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-doc-image": "" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocumentImageView);
  },
});

function DocumentDiagramView({ node, updateAttributes, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const project = isDiagramProject(node.attrs.project) ? node.attrs.project : null;
  return (
    <NodeViewWrapper className={`docs-diagram-node${selected ? " is-selected" : ""}`}>
      {project ? (
        <div className="docs-diagram-node__preview" dangerouslySetInnerHTML={{ __html: diagramToSvg(project) }} />
      ) : (
        <p className="docs-diagram-node__error" role="alert">{t("diagram.unavailable")}</p>
      )}
      {project && (
        <div className="docs-diagram-node__actions">
          <span>{project.name}</span>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => window.dispatchEvent(new CustomEvent<{ project: DiagramProject; onApply: (next: DiagramProject) => void }>(
              "kxno:edit-diagram",
              { detail: { project, onApply: (next) => updateAttributes({ project: next }) } },
            ))}
          >
            {t("diagram.editDiagram")}
          </button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const DocumentDiagram = Node.create({
  name: "documentDiagram",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { project: { default: null } };
  },
  parseHTML() {
    return [{
      tag: "div[data-doc-diagram]",
      getAttrs: (element) => {
        try {
          const project = JSON.parse((element as HTMLElement).dataset.project ?? "") as unknown;
          return isDiagramProject(project) ? { project } : false;
        } catch {
          return false;
        }
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    const { project: rawProject, ...attributes } = HTMLAttributes;
    const project = isDiagramProject(rawProject) ? rawProject : null;
    return ["div", mergeAttributes(attributes, {
      "data-doc-diagram": "",
      "data-project": project ? JSON.stringify(project) : "",
    })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocumentDiagramView);
  },
});

export const DocumentPageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-doc-page-break]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-doc-page-break": "" }), ["span", {}, "Page break"]];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => this.editor.commands.insertContent({ type: this.name }),
    };
  },
});

export const DocumentFontSize = Extension.create({
  name: "documentFontSize",
  addGlobalAttributes() {
    return [{
      types: ["textStyle"],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element: HTMLElement) => element.style.fontSize.replace(/px$/, "") || null,
          renderHTML: (attributes: Record<string, unknown>) => {
            if (!attributes.fontSize) return {};
            return { style: `font-size: ${attributes.fontSize}px` };
          },
        },
      },
    }];
  },
});

export const DocumentIndent = Extension.create({
  name: "documentIndent",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        indent: {
          default: 0,
          parseHTML: (element: HTMLElement) => Number.parseInt(element.style.marginLeft, 10) / 24 || 0,
          renderHTML: (attributes: Record<string, unknown>) => {
            const indent = Number(attributes.indent) || 0;
            return indent ? { style: `margin-left: ${indent * 24}px` } : {};
          },
        },
      },
    }];
  },
});

export const DocumentParagraphSpacing = Extension.create({
  name: "documentParagraphSpacing",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        paragraphSpacing: {
          default: 8,
          parseHTML: (element: HTMLElement) => Number.parseInt(element.style.marginBottom, 10) || 8,
          renderHTML: (attributes: Record<string, unknown>) => ({
            style: `margin-bottom: ${Number(attributes.paragraphSpacing ?? 8)}px`,
          }),
        },
        lineSpacing: {
          default: 1.15,
          parseHTML: (element: HTMLElement) => Number.parseFloat(element.style.lineHeight) || 1.15,
          renderHTML: (attributes: Record<string, unknown>) => ({
            style: `line-height: ${Number(attributes.lineSpacing ?? 1.15)}`,
          }),
        },
      },
    }];
  },
});
