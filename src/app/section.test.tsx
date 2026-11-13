// #90: a part of the page that throws shows one line and a reload button, not a blank page.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Section from "./section";

describe("Section", () => {
  it("draws its children while they work", () => {
    const html = renderToStaticMarkup(<Section message="broken" reload="Reload"><p>fine</p></Section>);
    expect(html).toContain("fine");
    expect(html).not.toContain("broken");
  });

  it("turns a render error into its message and a reload button", () => {
    expect(Section.getDerivedStateFromError()).toEqual({ failed: true });
    const section = new Section({ message: "This part couldn't be shown.", reload: "Reload", children: null });
    section.state = { failed: true };
    const html = renderToStaticMarkup(<>{section.render()}</>);
    expect(html).toContain("This part couldn&#x27;t be shown.");
    expect(html).toContain("Reload");
  });
});
