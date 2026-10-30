import { describe, expect, it } from "vitest";
import { createSchoolDocument } from "./docs";
import { createDocumentPrintFrame } from "./docs-print";

describe("document print layout", () => {
  it("prints widget content while excluding drag and editing controls", () => {
    const source = document.createElement("div");
    source.className = "docs-prose";
    source.innerHTML = `<section class="docs-widget docs-widget--callout docs-widget--positioned" data-doc-widget="" style="position: absolute; left: 24px; top: 48px; background-color: rgb(234, 242, 248)">
      <header class="docs-widget__header"><span>Callout</span><button>Drag</button></header>
      <div class="docs-widget__content"><p>Visible widget content</p></div>
      <div class="docs-widget__controls"><button>Remove</button></div>
    </section>`;

    const frame = createDocumentPrintFrame(source, createSchoolDocument("Template"));
    const printed = frame.contentDocument?.querySelector(".docs-widget");

    expect(printed).not.toBeNull();
    expect(printed?.textContent).toContain("Visible widget content");
    expect(printed?.textContent).not.toContain("Callout");
    expect(printed?.textContent).not.toContain("Drag");
    expect(printed?.textContent).not.toContain("Remove");
    expect((printed as HTMLElement).style.left).toBe("24px");
    expect((printed as HTMLElement).style.top).toBe("48px");
    frame.remove();
  });
});
