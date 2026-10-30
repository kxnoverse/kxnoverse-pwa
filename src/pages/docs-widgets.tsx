import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { GripVertical, Trash2 } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

export const DOC_WIDGET_KINDS = [
  "heading", "text", "divider", "table", "noteBox", "callout", "vocabulary", "qaCard", "mindMap",
] as const;

export type DocWidgetKind = (typeof DOC_WIDGET_KINDS)[number];

const widgetDefaults = {
  width: 100,
  minHeight: 48,
  fontSize: 14,
  spacing: 12,
  textColor: "#111111",
  backgroundColor: "#ffffff",
  borderColor: "#d5d9de",
};

export function createWidgetNode(kind: DocWidgetKind, placement: { positioned?: boolean; x?: number; y?: number } = {}): Record<string, unknown> {
  const content = kind === "table"
    ? [{
      type: "table",
      content: Array.from({ length: 3 }, (_, row) => ({
        type: "tableRow",
        content: Array.from({ length: 2 }, () => ({
          type: row === 0 ? "tableHeader" : "tableCell",
          content: [{ type: "paragraph" }],
        })),
      })),
    }]
    : kind === "divider"
      ? [{ type: "paragraph" }]
      : [{ type: kind === "heading" ? "heading" : "paragraph", ...(kind === "heading" ? { attrs: { level: 2 } } : {}) }];
  return {
    type: "documentWidget",
    attrs: { ...widgetDefaults, ...(kind === "mindMap" ? { width: 60, minHeight: 160 } : {}), ...placement, kind },
    content,
  };
}

function WidgetView({ node, editor, getPos, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const drag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number; moved: boolean } | null>(null);
  const kind = DOC_WIDGET_KINDS.includes(node.attrs.kind as DocWidgetKind)
    ? node.attrs.kind as DocWidgetKind
    : "text";
  const width = Math.max(30, Math.min(100, Number(node.attrs.width) || 100));
  const minHeight = Math.max(32, Math.min(720, Number(node.attrs.minHeight) || 48));
  const spacing = Math.max(0, Math.min(40, Number(node.attrs.spacing) || 0));
  const style = {
    width: `${width}%`,
    minHeight: `${minHeight}px`,
    padding: `${spacing}px`,
    color: String(node.attrs.textColor || "#111111"),
    backgroundColor: String(node.attrs.backgroundColor || "#ffffff"),
    borderColor: String(node.attrs.borderColor || "#d5d9de"),
    fontSize: `${Math.max(8, Math.min(48, Number(node.attrs.fontSize) || 14))}px`,
    ...(node.attrs.positioned ? {
      position: "absolute" as const,
      left: `${Math.max(0, Number(node.attrs.x) || 0)}px`,
      top: `${Math.max(0, Number(node.attrs.y) || 0)}px`,
      zIndex: 2,
    } : {}),
  };

  return (
    <NodeViewWrapper
      className={`docs-widget docs-widget--${kind}${node.attrs.positioned ? " docs-widget--positioned" : ""}${selected ? " is-selected" : ""}`}
      data-doc-widget=""
      data-widget-kind={kind}
      style={style}
    >
      <header className="docs-widget__header">
        <span className="docs-widget__kind" contentEditable={false}>{t(`docs.widget.${kind}`)}</span>
        <span
          className="docs-widget__drag"
          data-drag-handle
          contentEditable={false}
          aria-label={t("docs.widget.drag")}
          role="button"
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            const widget = event.currentTarget.closest<HTMLElement>(".docs-widget");
            const prose = widget?.closest<HTMLElement>(".docs-prose");
            if (!widget || !prose) return;
            const widgetBounds = widget.getBoundingClientRect();
            const proseBounds = prose.getBoundingClientRect();
            drag.current = {
              pointerId: event.pointerId,
              clientX: event.clientX,
              clientY: event.clientY,
              x: node.attrs.positioned ? Number(node.attrs.x) || 0 : widgetBounds.left - proseBounds.left,
              y: node.attrs.positioned ? Number(node.attrs.y) || 0 : widgetBounds.top - proseBounds.top,
              moved: false,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const state = drag.current;
            if (!state || state.pointerId !== event.pointerId) return;
            const dx = event.clientX - state.clientX;
            const dy = event.clientY - state.clientY;
            if (!state.moved && Math.hypot(dx, dy) < 3) return;
            state.moved = true;
            const widget = event.currentTarget.closest<HTMLElement>(".docs-widget");
            if (widget) widget.style.transform = `translate(${dx}px, ${dy}px)`;
          }}
          onPointerUp={(event) => {
            const state = drag.current;
            drag.current = null;
            if (!state || state.pointerId !== event.pointerId) return;
            const widget = event.currentTarget.closest<HTMLElement>(".docs-widget");
            if (widget) widget.style.transform = "";
            const dx = event.clientX - state.clientX;
            const dy = event.clientY - state.clientY;
            if (!state.moved && Math.hypot(dx, dy) < 3) return;
            updateAttributes({
              positioned: true,
              x: Math.max(0, Math.round((state.x + dx) / 8) * 8),
              y: Math.max(0, Math.round((state.y + dy) / 16) * 16),
            });
          }}
          onClick={() => {
            const position = getPos();
            if (typeof position === "number") editor.commands.setNodeSelection(position);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const position = getPos();
              if (typeof position === "number") editor.commands.setNodeSelection(position);
            }
          }}
        >
          <GripVertical size={13} />
        </span>
      </header>
      <NodeViewContent className="docs-widget__content" />
      {selected && (
        <div className="docs-widget__controls" contentEditable={false} onMouseDown={(event) => event.stopPropagation()}>
          <label>
            {t("docs.widget.width")}
            <input aria-label={t("docs.widget.width")} type="range" min="30" max="100" step="5" value={width} onChange={(event) => updateAttributes({ width: Number(event.target.value) })} />
          </label>
          <label>
            {t("docs.widget.height")}
            <input aria-label={t("docs.widget.height")} type="range" min="32" max="720" step="16" value={minHeight} onChange={(event) => updateAttributes({ minHeight: Math.round(Number(event.target.value) / 16) * 16 })} />
          </label>
          <label>
            {t("docs.widget.textColor")}
            <input aria-label={t("docs.widget.textColor")} type="color" value={style.color} onChange={(event) => updateAttributes({ textColor: event.target.value })} />
          </label>
          <label>
            {t("docs.widget.background")}
            <input aria-label={t("docs.widget.background")} type="color" value={style.backgroundColor} onChange={(event) => updateAttributes({ backgroundColor: event.target.value })} />
          </label>
          <label>
            {t("docs.widget.border")}
            <input aria-label={t("docs.widget.border")} type="color" value={style.borderColor} onChange={(event) => updateAttributes({ borderColor: event.target.value })} />
          </label>
          <label>
            {t("docs.widget.fontSize")}
            <input aria-label={t("docs.widget.fontSize")} type="range" min="8" max="32" step="1" value={Number(node.attrs.fontSize) || 14} onChange={(event) => updateAttributes({ fontSize: Number(event.target.value) })} />
          </label>
          <label>
            {t("docs.widget.spacing")}
            <input aria-label={t("docs.widget.spacing")} type="range" min="0" max="40" step="4" value={spacing} onChange={(event) => updateAttributes({ spacing: Number(event.target.value) })} />
          </label>
          <button type="button" aria-label={t("docs.widget.remove")} onClick={deleteNode}><Trash2 size={13} /></button>
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const DocumentWidget = Node.create({
  name: "documentWidget",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      kind: { default: "text" },
      width: { default: widgetDefaults.width },
      minHeight: { default: widgetDefaults.minHeight },
      positioned: { default: false },
      x: { default: 0 },
      y: { default: 0 },
      fontSize: { default: widgetDefaults.fontSize },
      spacing: { default: widgetDefaults.spacing },
      textColor: { default: widgetDefaults.textColor },
      backgroundColor: { default: widgetDefaults.backgroundColor },
      borderColor: { default: widgetDefaults.borderColor },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-doc-widget]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const kind = DOC_WIDGET_KINDS.includes(HTMLAttributes.kind as DocWidgetKind) ? HTMLAttributes.kind : "text";
    const style = [
      `width:${Math.max(30, Math.min(100, Number(HTMLAttributes.width) || 100))}%`,
      `min-height:${Math.max(32, Number(HTMLAttributes.minHeight) || 48)}px`,
      `padding:${Math.max(0, Number(HTMLAttributes.spacing) || 0)}px`,
      `font-size:${Math.max(8, Number(HTMLAttributes.fontSize) || 14)}px`,
      `color:${HTMLAttributes.textColor || "#111111"}`,
      `background-color:${HTMLAttributes.backgroundColor || "#ffffff"}`,
      `border-color:${HTMLAttributes.borderColor || "#d5d9de"}`,
      ...(HTMLAttributes.positioned ? [`position:absolute`, `left:${Math.max(0, Number(HTMLAttributes.x) || 0)}px`, `top:${Math.max(0, Number(HTMLAttributes.y) || 0)}px`, `z-index:2`] : []),
    ].join(";");
    return ["section", mergeAttributes(HTMLAttributes, {
      "data-doc-widget": "",
      "data-widget-kind": kind,
      class: `docs-widget docs-widget--${kind}${HTMLAttributes.positioned ? " docs-widget--positioned" : ""}`,
      style,
    }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WidgetView);
  },
});
