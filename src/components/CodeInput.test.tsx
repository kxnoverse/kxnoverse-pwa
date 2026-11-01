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

  it("resolves suggestions from the caret context and supports keyboard navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const suggestions = vi.fn((_source: string, _cursor: number) => [
      { insert: "east", signature: "east", detail: "Move east" },
      { insert: "west", signature: "west", detail: "Move west" },
    ]);
    render(<CodeInput label="Garden code" language="garden" onChange={onChange} value="move(" suggestions={suggestions} />);
    const editor = screen.getByRole("textbox", { name: "Garden code" }) as HTMLTextAreaElement;
    editor.setSelectionRange(5, 5);
    fireEvent.select(editor);

    expect(suggestions).toHaveBeenLastCalledWith("move(", 5);
    expect(screen.getByRole("option", { name: /east.*Move east/ })).toBeInTheDocument();
    editor.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("move(west");
  });

  it("offers crop-name suggestions inside Adventure plant arguments", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const suggestions = [
      { insert: "turnip", signature: "turnip", detail: "Available crop seeds" },
      { insert: "carrot", signature: "carrot", detail: "Available crop seeds" },
      { insert: "berry", signature: "berry", detail: "Available crop seeds" },
    ];
    render(<CodeInput label="Garden code" language="garden" onChange={onChange} value={'plant("'} suggestions={suggestions} />);
    const editor = screen.getByRole("textbox", { name: "Garden code" });
    expect(screen.getByRole("option", { name: /turnip.*Available crop seeds/ })).toBeInTheDocument();
    await user.click(editor);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith('plant("carrot');
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
