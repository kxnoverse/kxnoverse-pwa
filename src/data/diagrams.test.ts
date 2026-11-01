import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  addDiagramNode, connectDiagramNodes, createDiagramProject, deleteDiagramProject,
  deleteDiagramSelection, diagramConnectorGeometry, diagramToSvg, isDiagramProject, loadDiagramProjects,
  saveDiagramProject, updateDiagramNode,
} from "./diagrams";

describe("diagram projects", () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it("creates editable nodes, connections, updates, and selections", () => {
    const project = createDiagramProject("Study flow");
    const third = addDiagramNode(project, { x: 600, y: 400 });
    const expanded = connectDiagramNodes(third, project.nodes[1].id, third.nodes[2].id);
    const updated = updateDiagramNode(expanded, third.nodes[2].id, { label: "Review <notes>", shape: "diamond" });

    expect(updated.nodes[2]).toMatchObject({ label: "Review <notes>", shape: "diamond" });
    expect(project.nodes.every((existing) =>
      updated.nodes[2].x >= existing.x + existing.width ||
      updated.nodes[2].x + updated.nodes[2].width <= existing.x ||
      updated.nodes[2].y >= existing.y + existing.height ||
      updated.nodes[2].y + updated.nodes[2].height <= existing.y,
    )).toBe(true);
    expect(updated.connectors).toHaveLength(2);
    expect(isDiagramProject(updated)).toBe(true);

    const removed = deleteDiagramSelection(updated, new Set([third.nodes[2].id]), new Set());
    expect(removed.nodes).toHaveLength(2);
    expect(removed.connectors).toHaveLength(1);
  });

  it("validates graph bounds and safely serializes labels into SVG", () => {
    const project = createDiagramProject();
    const safeProject = updateDiagramNode(project, project.nodes[0].id, { label: "<script>alert(1)</script>" });
    const invalid = updateDiagramNode(project, project.nodes[0].id, { x: 2000 });

    expect(isDiagramProject(invalid)).toBe(false);
    const svg = diagramToSvg(safeProject);
    expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("marker-end");
    const geometry = diagramConnectorGeometry(safeProject.nodes[0], safeProject.nodes[1]);
    expect(geometry.path).toContain("M 360 374 C");
    expect(geometry.path).toContain("520 374");
  });

  it("saves and reopens locally without altering project data", async () => {
    const project = createDiagramProject("Saved diagram");
    const saved = await saveDiagramProject(project);

    expect(await db.diagramProjects.get(project.id)).toMatchObject({ name: "Saved diagram" });
    expect(await loadDiagramProjects()).toMatchObject([{ id: project.id, nodes: project.nodes, connectors: project.connectors }]);

    await deleteDiagramProject(saved.id);
    expect(await loadDiagramProjects()).toEqual([]);
  });
});
