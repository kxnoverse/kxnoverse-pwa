import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Check, ChevronLeft, ChevronRight,
  ClipboardList, Copy, Download, FilePlus2, FileText, FileUp, Highlighter, ImagePlus, Italic, Link,
  List, ListOrdered, LoaderCircle, Minus, MoreHorizontal, Redo2, Search, Strikethrough,
  Table2, Trash2, Underline, Undo2, X,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExtension from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import LinkExtension from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import FontFamily from "@tiptap/extension-font-family";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { createId, db, type SchoolDocument, type SchoolDocumentContent, type SchoolDocumentImage } from "../data/db";
import { countDocumentWords, createDocument, deleteDocument, duplicateDocument, extractDocumentText, isDocumentContent, saveDocument } from "../data/docs";
import { downloadBlob, exportDocumentDocx, exportDocumentText, safeFilename } from "../data/docs-export";
import { createDocumentPrintFrame } from "../data/docs-print";
import { importPdfProject, updatePdfProject } from "../data/docs-pdf";
import { PdfAnnotationWorkspace } from "./PdfAnnotationWorkspace";
import { DocumentFontSize, DocumentImage, DocumentIndent, DocumentPageBreak, DocumentParagraphSpacing } from "./docs-extensions";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/bmp"] as const;
type SaveState = "saved" | "saving" | "error";
type JsonNode = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: JsonNode[] };

function documentParagraphCount(content: unknown): number {
  let count = 0;
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const node = value as JsonNode;
    if (node.type === "paragraph" || node.type === "heading") count += 1;
    node.content?.forEach(visit);
  };
  visit(content);
  return count;
}

function findTextPositions(editor: Editor, query: string): Array<{ from: number; to: number }> {
  if (!query) return [];
  const matches: Array<{ from: number; to: number }> = [];
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return;
    const source = node.text.toLocaleLowerCase();
    const needle = query.toLocaleLowerCase();
    let offset = source.indexOf(needle);
    while (offset >= 0) {
      matches.push({ from: position + offset, to: position + offset + query.length });
      offset = source.indexOf(needle, offset + query.length);
    }
  });
  return matches;
}

function DocsEditor({
  documentInfo,
  storedContent,
  darkPaper,
  saveState,
  onToggleDarkPaper,
  onDocumentChange,
  onDuplicate,
  onDelete,
  onSaveState,
}: {
  documentInfo: SchoolDocument;
  storedContent: SchoolDocumentContent;
  darkPaper: boolean;
  saveState: SaveState;
  onToggleDarkPaper: () => void;
  onDocumentChange: (document: SchoolDocument) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveState: (state: SaveState) => void;
}) {
  const { t } = useTranslation();
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [exportError, setExportError] = useState("");
  const [imageError, setImageError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const documentRef = useRef(documentInfo);
  const editorRef = useRef<Editor | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveStateRef = useRef(onSaveState);
  const [titleDraft, setTitleDraft] = useState(documentInfo.title);
  const initialContent = useMemo(() => storedContent.content, [storedContent.id]);

  useEffect(() => { documentRef.current = documentInfo; }, [documentInfo]);
  useEffect(() => { saveStateRef.current = onSaveState; }, [onSaveState]);
  useEffect(() => { setTitleDraft(documentInfo.title); }, [documentInfo.id]);

  const flushSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !dirtyRef.current) return;
    dirtyRef.current = false;
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    try {
      await saveDocument(documentRef.current, editor.getJSON() as unknown as Record<string, unknown>);
      saveStateRef.current("saved");
    } catch {
      dirtyRef.current = true;
      saveStateRef.current("error");
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    saveStateRef.current("saving");
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 600);
  }, [flushSave]);

  const scheduleSaveRef = useRef(scheduleSave);
  useEffect(() => { scheduleSaveRef.current = scheduleSave; }, [scheduleSave]);

  const editor = useEditor({
    immediatelyRender: false,
    content: initialContent,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      UnderlineExtension,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      LinkExtension.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      FontFamily,
      DocumentFontSize,
      DocumentIndent,
      DocumentParagraphSpacing,
      DocumentImage,
      DocumentPageBreak,
    ],
    onUpdate: () => scheduleSaveRef.current(),
    editorProps: {
      attributes: { class: "docs-prose", spellcheck: "true", "aria-label": t("docs.editor") },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          setFindOpen(true);
          return true;
        }
        return false;
      },
    },
  }, [documentInfo.id]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => () => {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    if (dirtyRef.current && editorRef.current) {
      void saveDocument(documentRef.current, editorRef.current.getJSON() as unknown as Record<string, unknown>)
        .catch(() => saveStateRef.current("error"));
    }
  }, []);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, [flushSave]);

  const currentJson = editor?.getJSON() as unknown as Record<string, unknown> | undefined;
  const text = extractDocumentText(currentJson).trim();
  const matches = editor ? findTextPositions(editor, findQuery) : [];
  const selectedImage = editor?.isActive("documentImage") ?? false;

  function applyParagraphAttribute(attribute: "indent" | "paragraphSpacing" | "lineSpacing", value: number) {
    if (!editor) return;
    const type = editor.isActive("heading") ? "heading" : "paragraph";
    editor.chain().focus().updateAttributes(type, { [attribute]: value }).run();
  }

  async function insertImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !editor) return;
    if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) {
      setImageError(t("docs.imageType"));
      return;
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setImageError(t("docs.imageTooLarge"));
      return;
    }
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const ratio = bitmap.width / bitmap.height || 1.4;
      const width = Math.min(620, bitmap.width || 420);
      const height = Math.round(width / ratio);
      const asset: SchoolDocumentImage = {
        id: createId(),
        name: file.name,
        type: file.type as SchoolDocumentImage["type"],
        size: file.size,
        blob: file,
        createdAt: Date.now(),
      };
      await db.documentImages.add(asset);
      editor.chain().focus().insertContent({
        type: "documentImage",
        attrs: { assetId: asset.id, alt: file.name, width, height, ratio },
      }).run();
      setImageError("");
    } catch {
      setImageError(t("docs.imageSaveError"));
    } finally {
      bitmap?.close();
    }
  }

  function findNext() {
    if (!editor || !matches.length) return;
    const index = ((matchIndex % matches.length) + matches.length) % matches.length;
    editor.commands.setTextSelection(matches[index]);
    editor.commands.scrollIntoView();
    setMatchIndex((index + 1) % matches.length);
  }

  function replaceCurrent() {
    if (!editor || !findQuery) return;
    const selection = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(selection.from, selection.to);
    if (selectedText.toLocaleLowerCase() !== findQuery.toLocaleLowerCase()) {
      const match = findTextPositions(editor, findQuery)[0];
      if (!match) return;
      editor.commands.setTextSelection(match);
    }
    editor.chain().focus().insertContent(replaceQuery).run();
  }

  function replaceAll() {
    if (!editor || !findQuery) return;
    const found = findTextPositions(editor, findQuery);
    if (!found.length) return;
    editor.chain().focus().command(({ tr }) => {
      for (const match of [...found].reverse()) tr.insertText(replaceQuery, match.from, match.to);
      return true;
    }).run();
  }

  async function exportDocx() {
    try {
      setExportError("");
      await exportDocumentDocx(documentInfo, currentJson ?? storedContent.content);
    } catch {
      setExportError(t("docs.exportError"));
    }
  }

  function exportText() {
    const blob = exportDocumentText(titleDraft || t("docs.untitled"), currentJson ?? storedContent.content);
    downloadBlob(blob, `${safeFilename(titleDraft || t("docs.untitled"))}.txt`);
  }

  function printDocument() {
    void flushSave();
    const content = window.document.querySelector<HTMLElement>(".docs-prose");
    if (!content) {
      setExportError(t("docs.exportError"));
      return;
    }
    try {
      setExportError("");
      const frame = createDocumentPrintFrame(content, documentInfo);
      const printWindow = frame.contentWindow;
      if (!printWindow) throw new Error("The document print view could not be opened.");
      let cleanupTimer = 0;
      const cleanup = () => {
        window.clearTimeout(cleanupTimer);
        frame.remove();
      };
      printWindow.addEventListener("afterprint", cleanup, { once: true });
      cleanupTimer = window.setTimeout(cleanup, 60_000);
      printWindow.focus();
      printWindow.print();
    } catch {
      setExportError(t("docs.exportError"));
    }
  }

  function updateImageWidth(delta: number) {
    if (!editor || !selectedImage) return;
    const width = Number(editor.getAttributes("documentImage").width) || 420;
    const ratio = Number(editor.getAttributes("documentImage").ratio) || 1.4;
    const nextWidth = Math.max(120, Math.min(620, width + delta));
    editor.chain().focus().updateAttributes("documentImage", { width: nextWidth, height: Math.round(nextWidth / ratio) }).run();
  }

  return (
    <div className="docs-editor-shell">
      <header className="docs-document-header">
        <div className="docs-document-identity">
          <span className="docs-document-identity__icon"><FileText size={15} /></span>
          <div className="docs-document-identity__details">
            <input
              aria-label={t("docs.rename")}
              className="docs-document-title"
              maxLength={160}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const title = titleDraft.trim() || t("docs.untitled");
                setTitleDraft(title);
                if (title !== documentInfo.title) onDocumentChange({ ...documentInfo, title });
              }}
            />
            <div className="docs-document-status" role="status">
              <span className={`docs-save-dot docs-save-dot--${saveState}`} />
              {saveState === "saving" ? t("docs.saving") : saveState === "error" ? t("docs.saveError") : t("docs.saved")}
            </div>
          </div>
        </div>
        <div className="docs-header-actions">
          <button className={`docs-paper-toggle${darkPaper ? " is-active" : ""}`} type="button" aria-pressed={darkPaper} onClick={onToggleDarkPaper}>
            <span className="docs-paper-toggle__swatch" aria-hidden="true" />
            {darkPaper ? t("docs.normalPaper") : t("docs.paperPreview")}
          </button>
          <span className="docs-header-divider" aria-hidden="true" />
          <div className="docs-header-icon-group">
            <button className="docs-icon-button" type="button" aria-label={t("docs.duplicate")} title={t("docs.duplicate")} onClick={onDuplicate}><Copy size={14} /></button>
            <button className="docs-icon-button" type="button" aria-label={t("docs.delete")} title={t("docs.delete")} onClick={onDelete}><Trash2 size={14} /></button>
          </div>
          <details className="docs-export-menu">
            <summary><Download size={14} />{t("docs.export")}</summary>
            <div className="docs-menu-popover">
              <button type="button" onClick={() => void exportDocx()}>{t("docs.exportDocx")}</button>
              <button type="button" onClick={() => void printDocument()}>{t("docs.exportPdf")}</button>
              <button type="button" onClick={exportText}>{t("docs.exportTxt")}</button>
              <p>{t("docs.printHint")}</p>
            </div>
          </details>
        </div>
      </header>

      {exportError && <p className="docs-inline-error" role="alert">{exportError}</p>}
      <div className="docs-toolbar" role="toolbar" aria-label={t("docs.format")}>
        <div className="docs-toolbar__cluster docs-toolbar__cluster--history">
          <div className="docs-toolbar__group">
          <button type="button" className="docs-tool" aria-label={t("docs.undo")} title={t("docs.undo")} disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 /></button>
          <button type="button" className="docs-tool" aria-label={t("docs.redo")} title={t("docs.redo")} disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 /></button>
          </div>
        </div>
        <div className="docs-toolbar__cluster docs-toolbar__cluster--font">
        <select className="docs-select docs-select--format" aria-label={t("docs.format")} value={editor?.isActive("heading", { level: 1 }) ? "1" : editor?.isActive("heading", { level: 2 }) ? "2" : editor?.isActive("heading", { level: 3 }) ? "3" : "0"} onChange={(event) => {
          const value = Number(event.target.value);
          if (value) editor?.chain().focus().setHeading({ level: value as 1 | 2 | 3 }).run();
          else editor?.chain().focus().setParagraph().run();
        }}>
          <option value="0">{t("docs.paragraph")}</option><option value="1">{t("docs.heading1")}</option><option value="2">{t("docs.heading2")}</option><option value="3">{t("docs.heading3")}</option>
        </select>
        <select className="docs-select docs-select--font" aria-label={t("docs.fontFamily")} defaultValue="Arial" onChange={(event) => editor?.chain().focus().setFontFamily(event.target.value).run()}>
          {["Arial", "Georgia", "Inter", "Times New Roman", "Verdana"].map((font) => <option key={font} value={font}>{font}</option>)}
        </select>
        <select className="docs-select docs-select--size" aria-label={t("docs.fontSize")} defaultValue="12" onChange={(event) => editor?.chain().focus().setMark("textStyle", { fontSize: Number(event.target.value) }).run()}>
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        </div>
        <div className="docs-toolbar__group">
          <button type="button" className={`docs-tool${editor?.isActive("bold") ? " is-active" : ""}`} aria-label={t("docs.bold")} aria-pressed={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold /></button>
          <button type="button" className={`docs-tool${editor?.isActive("italic") ? " is-active" : ""}`} aria-label={t("docs.italic")} aria-pressed={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic /></button>
          <button type="button" className={`docs-tool${editor?.isActive("underline") ? " is-active" : ""}`} aria-label={t("docs.underline")} aria-pressed={editor?.isActive("underline")} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline /></button>
          <button type="button" className={`docs-tool${editor?.isActive("strike") ? " is-active" : ""}`} aria-label={t("docs.strike")} aria-pressed={editor?.isActive("strike")} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough /></button>
        </div>
        <label className="docs-color-control" title={t("docs.textColor")}><span className="docs-color-control__letter">A</span><input aria-label={t("docs.textColor")} type="color" defaultValue="#252a2e" onChange={(event) => editor?.chain().focus().setColor(event.target.value).run()} /></label>
        <button type="button" className={`docs-tool${editor?.isActive("highlight") ? " is-active" : ""}`} aria-label={t("docs.highlight")} onClick={() => editor?.chain().focus().toggleHighlight({ color: "#fff1a8" }).run()}><Highlighter /></button>
        <details className="docs-overflow-menu">
          <summary aria-label={t("docs.moreTools")} title={t("docs.moreTools")}><MoreHorizontal size={17} /></summary>
          <div className="docs-menu-popover docs-menu-popover--wide">
            <div className="docs-menu-grid">
              <button type="button" aria-label={t("docs.bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} />{t("docs.bulletList")}</button>
              <button type="button" aria-label={t("docs.orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} />{t("docs.orderedList")}</button>
              <button type="button" aria-label={t("docs.alignLeft")} onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft size={15} />{t("docs.alignLeft")}</button>
              <button type="button" aria-label={t("docs.alignCenter")} onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter size={15} />{t("docs.alignCenter")}</button>
              <button type="button" aria-label={t("docs.alignRight")} onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight size={15} />{t("docs.alignRight")}</button>
              <button type="button" aria-label={t("docs.alignJustify")} onClick={() => editor?.chain().focus().setTextAlign("justify").run()}><AlignJustify size={15} />{t("docs.alignJustify")}</button>
              <button type="button" aria-label={t("docs.indentLess")} onClick={() => applyParagraphAttribute("indent", Math.max(0, Number(editor?.getAttributes("paragraph").indent ?? 0) - 1))}><Minus size={15} />{t("docs.indentLess")}</button>
              <button type="button" aria-label={t("docs.indentMore")} onClick={() => applyParagraphAttribute("indent", Math.min(8, Number(editor?.getAttributes("paragraph").indent ?? 0) + 1))}><ChevronRight size={15} />{t("docs.indentMore")}</button>
              <label>{t("docs.lineSpacing")}<select aria-label={t("docs.lineSpacing")} defaultValue="1.15" onChange={(event) => applyParagraphAttribute("lineSpacing", Number(event.target.value))}><option value="1">1</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">2</option></select></label>
              <label>{t("docs.paragraphSpacing")}<select aria-label={t("docs.paragraphSpacing")} defaultValue="8" onChange={(event) => applyParagraphAttribute("paragraphSpacing", Number(event.target.value))}><option value="0">0</option><option value="8">8</option><option value="16">16</option><option value="24">24</option></select></label>
              <button type="button" aria-label={t("docs.insertLink")} onClick={() => {
                const href = window.prompt(t("docs.linkPrompt"), "https://");
                if (href && /^https?:\/\//i.test(href)) editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
              }}><Link size={15} />{t("docs.insertLink")}</button>
              <button type="button" aria-label={t("docs.insertTable")} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={15} />{t("docs.insertTable")}</button>
              <button type="button" aria-label={t("docs.insertImage")} onClick={() => imageInput.current?.click()}><ImagePlus size={15} />{t("docs.insertImage")}</button>
              {selectedImage && <><button type="button" onClick={() => updateImageWidth(-40)}><Minus size={15} />{t("docs.imageSmaller")}</button><button type="button" onClick={() => updateImageWidth(40)}><ChevronRight size={15} />{t("docs.imageLarger")}</button></>}
              <button type="button" aria-label={t("docs.insertPageBreak")} onClick={() => editor?.chain().focus().insertContent({ type: "pageBreak" }).run()}><FileText size={15} />{t("docs.insertPageBreak")}</button>
              <button type="button" aria-label={t("docs.findReplace")} onClick={() => setFindOpen((open) => !open)}><Search size={15} />{t("docs.findReplace")}</button>
              <button type="button" onClick={() => editor?.chain().focus().addRowAfter().run()}><ClipboardList size={15} />{t("docs.addTableRow")}</button>
            </div>
            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/bmp" hidden aria-label={t("docs.insertImage")} onChange={(event) => void insertImage(event)} />
            {imageError && <p className="docs-inline-error">{imageError}</p>}
          </div>
        </details>
        <details className="docs-page-setup">
          <summary title={t("docs.pageSetup")} aria-label={t("docs.pageSetup")}><MoreHorizontal size={16} /></summary>
          <div className="docs-menu-popover docs-page-setup__menu">
            <label>{t("docs.orientation")}<select aria-label={t("docs.orientation")} value={documentInfo.orientation} onChange={(event) => onDocumentChange({ ...documentInfo, orientation: event.target.value as SchoolDocument["orientation"] })}><option value="portrait">{t("docs.portrait")}</option><option value="landscape">{t("docs.landscape")}</option></select></label>
            <span>{t("docs.margins")}</span>
            {(["top", "right", "bottom", "left"] as const).map((side) => <label key={side}>{t(`docs.margin${side[0].toUpperCase()}${side.slice(1)}`)}<input aria-label={t(`docs.margin${side[0].toUpperCase()}${side.slice(1)}`)} type="number" min={10} max={40} step={1} value={documentInfo.margins[side]} onChange={(event) => onDocumentChange({ ...documentInfo, margins: { ...documentInfo.margins, [side]: Math.max(10, Math.min(40, Number(event.target.value) || 10)) } })} /></label>)}
            <label>{t("docs.header")}<input value={documentInfo.header} maxLength={120} onChange={(event) => onDocumentChange({ ...documentInfo, header: event.target.value })} /></label>
            <label>{t("docs.footer")}<input value={documentInfo.footer} maxLength={120} onChange={(event) => onDocumentChange({ ...documentInfo, footer: event.target.value })} /></label>
          </div>
        </details>
        <button className="docs-tool docs-find-toggle" type="button" aria-label={t("docs.findReplace")} title={t("docs.findReplace")} onClick={() => setFindOpen((open) => !open)}><Search /></button>
      </div>
      <p className="docs-shortcut-hint">{t("docs.shortcutHint")}</p>

      {findOpen && (
        <div className="docs-find-panel">
          <label><Search size={13} /><input autoFocus aria-label={t("docs.find")} placeholder={t("docs.find")} value={findQuery} onChange={(event) => { setFindQuery(event.target.value); setMatchIndex(0); }} /></label>
          <span className="docs-find-count">{matches.length ? `${Math.min(matchIndex + 1, matches.length)} / ${matches.length}` : "0"}</span>
          <button className="docs-tool" type="button" aria-label={t("docs.findNext")} onClick={findNext}><ChevronRight size={14} /></button>
          <input aria-label={t("docs.replace")} placeholder={t("docs.replace")} value={replaceQuery} onChange={(event) => setReplaceQuery(event.target.value)} />
          <button className="docs-find-action" type="button" onClick={replaceCurrent}>{t("docs.replaceNext")}</button>
          <button className="docs-find-action" type="button" onClick={replaceAll}>{t("docs.replaceAll")}</button>
          <button className="docs-tool" type="button" aria-label={t("docs.close")} onClick={() => setFindOpen(false)}><X size={14} /></button>
        </div>
      )}

      <div className={`docs-page-viewport${darkPaper ? " docs-page-viewport--dark" : ""}`}>
        <div className="docs-paper" style={{
          "--docs-margin-top": `${documentInfo.margins.top}mm`,
          "--docs-margin-right": `${documentInfo.margins.right}mm`,
          "--docs-margin-bottom": `${documentInfo.margins.bottom}mm`,
          "--docs-margin-left": `${documentInfo.margins.left}mm`,
          "--docs-page-width": documentInfo.orientation === "portrait" ? "210mm" : "297mm",
          "--docs-page-height": documentInfo.orientation === "portrait" ? "297mm" : "210mm",
        } as React.CSSProperties}>
          <style>{`@page { size: A4 ${documentInfo.orientation}; margin: ${documentInfo.margins.top}mm ${documentInfo.margins.right}mm ${documentInfo.margins.bottom}mm ${documentInfo.margins.left}mm; }`}</style>
          {documentInfo.header && <div className="docs-print-header">{documentInfo.header}</div>}
          <EditorContent editor={editor} />
          {documentInfo.footer && <div className="docs-print-footer">{documentInfo.footer}</div>}
        </div>
      </div>
      <footer className="docs-statusbar">
        <span>{t("docs.words", { count: countDocumentWords(text) })}</span>
        <span>{t("docs.characters", { count: text.length })}</span>
        <span>{t("docs.paragraphs", { count: documentParagraphCount(editor?.getJSON()) })}</span>
        <span className={`docs-save-indicator docs-save-indicator--${saveState}`}><Check size={12} />{saveState === "saving" ? t("docs.saving") : saveState === "error" ? t("docs.saveError") : t("docs.saved")}</span>
      </footer>
    </div>
  );
}

export function DocsPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDocumentId = searchParams.get("document") ?? "";
  const ignoredDocumentRoute = useRef<string | null>(null);
  const documents = useLiveQuery(() => db.documents.orderBy("updatedAt").reverse().toArray(), [], []);
  const pdfProjects = useLiveQuery(() => db.pdfProjects.orderBy("updatedAt").reverse().toArray(), [], []);
  const [activeId, setActiveId] = useState(requestedDocumentId);
  const [activePdfProjectId, setActivePdfProjectId] = useState("");
  const [storedContent, setStoredContent] = useState<SchoolDocumentContent | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [query, setQuery] = useState("");
  const [pdfImportStatus, setPdfImportStatus] = useState("");
  const [pdfImportError, setPdfImportError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("kxnodesk-docs-sidebar") === "collapsed");
  const [darkPaper, setDarkPaper] = useState(() => localStorage.getItem("kxnodesk-docs-dark-paper") === "true");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const pdfInput = useRef<HTMLInputElement>(null);

  const visibleDocuments = useMemo(() => documents.filter((item) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [documents, query]);
  const activeDocument = documents.find((item) => item.id === activeId);
  const activePdfProject = pdfProjects.find((item) => item.id === activePdfProjectId);

  useEffect(() => {
    if (requestedDocumentId) {
      if (requestedDocumentId === ignoredDocumentRoute.current) return;
      setActivePdfProjectId("");
      setActiveId(requestedDocumentId);
      return;
    }
    ignoredDocumentRoute.current = null;
    if (!activeId && !activePdfProjectId && documents.length) setActiveId(documents[0].id);
  }, [activeId, activePdfProjectId, documents, requestedDocumentId]);

  useEffect(() => {
    if (!activeId) {
      setStoredContent(null);
      setError("");
      return;
    }
    let active = true;
    setLoadingContent(true);
    void Promise.all([db.documents.get(activeId), db.documentContents.get(activeId)]).then(([document, content]) => {
      if (!active) return;
      if (!document) {
        setStoredContent(null);
        setError("");
        return;
      }
      if (!content || !isDocumentContent(content)) throw new Error("Document content is invalid.");
      setStoredContent(content);
      setError("");
    }).catch(() => {
      if (active) setError(t("docs.loadError"));
    }).finally(() => {
      if (active) setLoadingContent(false);
    });
    return () => { active = false; };
  }, [activeId, t]);

  useEffect(() => {
    document.title = `${t("appName")} — ${t("nav.docs")}`;
  }, [i18n.language, t]);

  async function createNewDocument() {
    try {
      const created = await createDocument(t("docs.untitled"));
      setActivePdfProjectId("");
      setActiveId(created.id);
      setSearchParams({ document: created.id }, { replace: true });
      setError("");
    } catch {
      setError(t("docs.saveError"));
    }
  }

  async function importPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPdfImportStatus(t("docs.pdfImporting", { name: file.name }));
    setPdfImportError("");
    try {
      const project = await importPdfProject(file);
      ignoredDocumentRoute.current = requestedDocumentId || null;
      setActiveId("");
      setActivePdfProjectId(project.id);
      setSearchParams({}, { replace: true });
      setPdfImportStatus(t("docs.pdfImportSuccess", { name: file.name }));
    } catch (reason) {
      setPdfImportStatus("");
      setPdfImportError(reason instanceof Error ? reason.message : t("docs.pdfImportError"));
    }
  }

  async function savePdfProject(project: import("../data/db").PdfProject) {
    await updatePdfProject(project);
  }

  async function updateDocument(updated: SchoolDocument) {
    try {
      const next = { ...updated, updatedAt: Date.now(), title: updated.title.slice(0, 160) };
      await db.documents.put(next);
      setError("");
    } catch {
      setSaveState("error");
      setError(t("docs.saveError"));
    }
  }

  async function duplicateActive() {
    if (!activeDocument) return;
    try {
      const duplicate = await duplicateDocument(activeDocument.id, t("docs.copySuffix"));
      setActiveId(duplicate.id);
      setSearchParams({ document: duplicate.id }, { replace: true });
    } catch {
      setError(t("docs.saveError"));
    }
  }

  async function deleteActive() {
    if (!activeDocument || !window.confirm(t("docs.confirmDelete", { title: activeDocument.title }))) return;
    try {
      await deleteDocument(activeDocument.id);
      const nextId = documents.find((item) => item.id !== activeDocument.id)?.id ?? "";
      setActiveId(nextId);
      setSearchParams(nextId ? { document: nextId } : {}, { replace: true });
      setStoredContent(null);
      setError("");
    } catch {
      setError(t("docs.saveError"));
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("kxnodesk-docs-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function togglePaper() {
    setDarkPaper((current) => {
      const next = !current;
      localStorage.setItem("kxnodesk-docs-dark-paper", String(next));
      return next;
    });
  }

  const savedLabel = saveState === "saving" ? t("docs.saving") : saveState === "error" ? t("docs.saveError") : t("docs.saved");

  return (
    <section className={`docs-page${sidebarCollapsed ? " docs-page--sidebar-collapsed" : ""}`} aria-label={t("nav.docs")}>
      <aside id="docs-document-sidebar" className="docs-sidebar">
        <header className="docs-sidebar__header">
          {!sidebarCollapsed && <strong>{t("nav.docs")}</strong>}
          <button id="docs-sidebar-toggle" className="docs-icon-button" type="button" aria-label={sidebarCollapsed ? t("docs.expandSidebar") : t("docs.collapseSidebar")} aria-expanded={!sidebarCollapsed} aria-controls="docs-document-sidebar" onClick={toggleSidebar}>
            {sidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </header>
        {!sidebarCollapsed && (
          <>
            <button className="docs-new-button" type="button" onClick={() => void createNewDocument()}><FilePlus2 size={14} />{t("docs.new")}</button>
          <button className="docs-import-pdf-button" type="button" onClick={() => pdfInput.current?.click()}><FileUp size={14} />{t("docs.pdfImport")}</button>
          <input ref={pdfInput} className="docs-pdf-input" type="file" accept="application/pdf,.pdf" aria-label={t("docs.pdfImport")} onChange={(event) => void importPdf(event)} />
          {pdfImportStatus && <p className="docs-pdf-feedback" role="status">{pdfImportStatus}</p>}
          {pdfImportError && <p className="docs-pdf-feedback docs-pdf-feedback--error" role="alert">{pdfImportError}</p>}
          <label className="docs-search"><Search size={13} /><input aria-label={t("docs.search")} placeholder={t("docs.search")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="docs-document-list">
              {visibleDocuments.map((item) => (
                <button key={item.id} type="button" className={`docs-document-row${item.id === activeId ? " is-active" : ""}`} aria-current={item.id === activeId ? "page" : undefined} onClick={() => {
                  setActivePdfProjectId("");
                  setActiveId(item.id);
                  setSearchParams({ document: item.id }, { replace: true });
                }}>
                  <FileText size={14} />
                  <span><strong>{item.title || t("docs.untitled")}</strong><small>{new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(item.updatedAt)}</small></span>
                </button>
              ))}
              {!visibleDocuments.length && <p className="docs-empty-list">{documents.length ? t("docs.noResults") : t("docs.noDocuments")}</p>}
              {!!pdfProjects.length && <div className="docs-pdf-list">
                <span>{t("docs.pdfProjects")}</span>
                {pdfProjects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`docs-document-row${item.id === activePdfProjectId ? " is-active" : ""}`}
                    aria-current={item.id === activePdfProjectId ? "page" : undefined}
                    onClick={() => {
                      setActiveId("");
                      setActivePdfProjectId(item.id);
                      setSearchParams({}, { replace: true });
                    }}
                  >
                    <FileText size={14} />
                    <span><strong>{item.title}</strong><small>{t("docs.pdfPageCount", { count: item.pageCount })}</small></span>
                  </button>
                ))}
              </div>}
            </div>
          </>
        )}
      </aside>
      <main className="docs-main">
        {activePdfProjectId ? activePdfProject ? (
          <PdfAnnotationWorkspace
            key={activePdfProject.id}
            project={activePdfProject}
            onProjectChange={savePdfProject}
            onBack={() => {
              setActivePdfProjectId("");
              const nextId = documents[0]?.id ?? "";
              setActiveId(nextId);
              setSearchParams(nextId ? { document: nextId } : {}, { replace: true });
            }}
            onConverted={(id) => {
              setActivePdfProjectId("");
              setActiveId(id);
              setSearchParams({ document: id }, { replace: true });
            }}
          />
        ) : <div className="docs-loading" role="status"><LoaderCircle size={16} />{t("docs.pdfLoading")}</div> : activeDocument && storedContent && !loadingContent ? (
          <DocsEditor
            key={activeDocument.id}
            documentInfo={activeDocument}
            storedContent={storedContent}
            darkPaper={darkPaper}
            saveState={saveState}
            onToggleDarkPaper={togglePaper}
            onDocumentChange={(next) => void updateDocument(next)}
            onDuplicate={() => void duplicateActive()}
            onDelete={() => void deleteActive()}
            onSaveState={setSaveState}
          />
        ) : loadingContent ? (
          <div className="docs-loading" role="status"><LoaderCircle size={16} />{t("app.loading")}</div>
        ) : (
          <div className="docs-empty-state">
            <FileText size={24} />
            <strong>{t("docs.welcome")}</strong>
            <p>{t("docs.noDocuments")}</p>
            <button className="docs-new-button" type="button" onClick={() => void createNewDocument()}><FilePlus2 size={14} />{t("docs.new")}</button>
          </div>
        )}
        {error && <p className="docs-error" role="alert">{error}</p>}
        {activeDocument && <span className="docs-page-save-status" role="status">{savedLabel}</span>}
      </main>
    </section>
  );
}
