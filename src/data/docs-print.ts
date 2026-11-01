import type { SchoolDocument } from "./db";

function pageMargin(value: number): number {
  return Number.isFinite(value) ? Math.min(40, Math.max(10, value)) : 20;
}

export function createDocumentPrintFrame(
  content: HTMLElement,
  documentInfo: SchoolDocument,
): HTMLIFrameElement {
  const ownerDocument = content.ownerDocument;
  const frame = ownerDocument.createElement("iframe");
  frame.title = "Document print preview";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  ownerDocument.body.append(frame);

  const printDocument = frame.contentDocument;
  if (!printDocument) {
    frame.remove();
    throw new Error("The document print view could not be created.");
  }
  printDocument.open();
  printDocument.write("<!doctype html><html><head><meta charset=\"utf-8\"><title></title></head><body></body></html>");
  printDocument.close();

  const style = printDocument.createElement("style");
  const margins = documentInfo.margins;
  const top = pageMargin(margins.top);
  const right = pageMargin(margins.right);
  const bottom = pageMargin(margins.bottom);
  const left = pageMargin(margins.left);
  const orientation = documentInfo.orientation === "landscape" ? "landscape" : "portrait";
  style.textContent = `
    @page { size: A4 ${orientation}; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #24292d; }
    body { font: 12px/1.15 Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .docs-prose { position: relative; min-height: 0; margin: 0; outline: 0; color: #24292d; font: 12px/1.15 Arial, sans-serif; overflow-wrap: anywhere; }
    .docs-prose > * { margin-top: 0; }
    .docs-prose p { margin: 0 0 8px; }
    .docs-prose h1 { margin: 0 0 14px; font-size: 24px; line-height: 1.2; }
    .docs-prose h2 { margin: 0 0 12px; font-size: 20px; line-height: 1.25; }
    .docs-prose h3 { margin: 0 0 10px; font-size: 16px; line-height: 1.3; }
    .docs-prose ul, .docs-prose ol { padding-left: 24px; }
    .docs-prose a { color: #1769aa; text-decoration: underline; }
    .docs-prose table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .docs-prose td, .docs-prose th { min-width: 1em; padding: 5px 7px; border: 1px solid #aeb5ba; vertical-align: top; }
    .docs-prose [data-doc-page-break] { height: 0; margin: 0; border: 0; break-before: page; page-break-before: always; color: transparent; }
    .docs-prose [data-doc-page-break] span, .docs-image-node input { display: none !important; }
    .docs-prose tr, .docs-prose img { break-inside: avoid; page-break-inside: avoid; }
    .docs-diagram-node { max-width: 100%; margin: 0 0 8px; break-inside: avoid; page-break-inside: avoid; }
    .docs-diagram-node__preview { width: min(100%, 620px); overflow: hidden; }
    .docs-diagram-node__preview svg { display: block; width: 100%; height: auto; }
    .docs-diagram-node__actions { display: none !important; }
    .docs-widget { box-sizing: border-box; margin: 0 0 8px; border: 1px solid; break-inside: avoid; page-break-inside: avoid; }
    .docs-widget__header, .docs-widget__controls { display: none !important; }
    .docs-widget__content > * { margin-top: 0; }
    .docs-print-header, .docs-print-footer { position: fixed; right: 0; left: 0; color: #555; font: 9pt Arial, sans-serif; }
    .docs-print-header { top: -${top}mm; }
    .docs-print-footer { bottom: -${bottom}mm; }
  `;
  printDocument.head.append(style);

  const clone = content.cloneNode(true) as HTMLElement;
  clone.removeAttribute("contenteditable");
  clone.removeAttribute("spellcheck");
  clone.classList.remove("ProseMirror-focused");
  clone.querySelectorAll("input, button, [contenteditable]").forEach((element) => element.remove());
  clone.querySelectorAll(".docs-widget__header, .docs-widget__controls").forEach((element) => element.remove());
  clone.querySelectorAll("[data-doc-page-break] span").forEach((element) => element.remove());
  clone.querySelectorAll(".is-selected, .ProseMirror-selectednode").forEach((element) => {
    element.classList.remove("is-selected", "ProseMirror-selectednode");
  });
  if (documentInfo.header.trim()) {
    const header = printDocument.createElement("header");
    header.className = "docs-print-header";
    header.textContent = documentInfo.header;
    printDocument.body.append(header);
  }
  printDocument.body.append(clone);
  if (documentInfo.footer.trim()) {
    const footer = printDocument.createElement("footer");
    footer.className = "docs-print-footer";
    footer.textContent = documentInfo.footer;
    printDocument.body.append(footer);
  }
  return frame;
}
