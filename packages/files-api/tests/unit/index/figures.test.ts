import { describe, expect, it } from "vitest";

import { createStructureChunker } from "../../../src/modules/index/chunker";
import {
  figureIdsFrom,
  figureObjectKey,
  figuresSection,
  linkFigures,
} from "../../../src/modules/index/figures";

describe("figures", () => {
  it("links placeholders to stable refs, and reads the ids back", () => {
    const markdown = linkFigures(
      "See ![img-0.jpeg](img-0.jpeg) and ![b](img-1.png)",
      [{ id: "img-0.jpeg" }, { id: "img-1.png" }]
    );
    expect(markdown).toBe(
      "See ![img-0.jpeg](figure://img-0.jpeg) and ![b](figure://img-1.png)"
    );
    expect(figureIdsFrom(markdown)).toEqual(["img-0.jpeg", "img-1.png"]);
    expect(figureIdsFrom(null)).toEqual([]);
  });

  it("keys figure objects under their source object", () => {
    expect(figureObjectKey("org/project/file", "img-0.jpeg")).toBe(
      "org/project/file/figures/img-0.jpeg"
    );
  });

  it("renders captions as a section, and nothing for no figures", () => {
    expect(figuresSection([])).toBe("");
    const section = figuresSection([
      { id: "img-0.jpeg", caption: "Site photo of the east facade.", page: 3 },
      { id: "img-1.png", caption: "Door schedule detail." },
    ]);
    expect(section).toContain("# Figures");
    expect(section).toContain("<!-- page:3 -->");
    expect(section).toContain("Figure img-0.jpeg: Site photo");
  });

  it("chunks a captions section under its own heading with the figure's page", () => {
    const markdown = `# Fire safety\n\nBody text.${figuresSection([
      { id: "img-0.jpeg", caption: "Escape route plan, level 2.", page: 7 },
    ])}`;
    const chunks = createStructureChunker().chunk(markdown);

    const caption = chunks.find((chunk) => chunk.text.includes("img-0.jpeg"));
    expect(caption?.heading).toBe("Figures");
    expect(caption?.page).toBe(7);
    // The document's own text keeps its heading; captions do not bleed in.
    expect(chunks[0]?.heading).toBe("Fire safety");
  });
});
