import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeInput } from "./CodeInput";

describe("CodeInput assistance", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows filtered suggestions, accepts with Tab, and inserts indentation otherwise", async () => {
    const user = userEvent.setup();
    let value = "mo";
    const onChange = vi.fn((next: string) => { value = next; });
    const { rerender } = render(<CodeInput label="Garden code" language="garden" onChange={onChange} value={value} suggestions={[
      { insert: "move()", detail: "Move the robot" },
      { insert: "harvest()", detail: "Harvest a crop" },
    ]} />);
    const editor = screen.getByRole("textbox", { name: "Garden code" });
    expect(screen.getByRole("option", { name: /move\(\).*Move the robot/ })).toBeInTheDocument();

    await user.click(editor);
    await user.keyboard("{Tab}");
    expect(onChange).toHaveBeenLastCalledWith("move()");

    value = "move()\n";
    rerender(<CodeInput label="Garden code" language="garden" onChange={onChange} value={value} suggestions={[]} />);
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(onChange).toHaveBeenLastCalledWith("move()\n  ");
  });

  it("inserts paired delimiters and syntax-color markup", () => {
    const onChange = vi.fn();
    render(<CodeInput label="JavaScript editor" language="javascript" onChange={onChange} value="const n = 2;" />);
    const editor = screen.getByRole("textbox", { name: "JavaScript editor" }) as HTMLTextAreaElement;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.keyDown(editor, { key: "(" });
    expect(onChange).toHaveBeenCalledWith("const n = 2;()");
    expect(document.querySelector(".code-input__token[data-language='javascript']")).toBeInTheDocument();
  });

  it("renders escaped characters as source text rather than HTML entities", () => {
    render(<CodeInput label="Garden code" language="garden" onChange={vi.fn()} value={'move("east")'} />);
    expect(document.querySelector(".code-input__highlight")?.textContent).toBe('move("east")');
  });
});
