import { useEffect, useState } from "react";
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { db } from "../data/db";

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
