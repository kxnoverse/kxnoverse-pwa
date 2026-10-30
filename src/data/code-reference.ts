export const CODE_REFERENCE_ENTRIES = [
  ["move", "command", "move(\"east\")", "first-harvest"],
  ["turn", "command", "turn(\"left\")", "first-harvest"],
  ["harvest", "command", "harvest()", "first-harvest"],
  ["plant", "command", "plant()", "garden-routine"],
  ["collect", "command", "collect()", "garden-routine"],
  ["wait", "command", "wait()", "garden-routine"],
  ["repeat", "language", "repeat(3) { move(\"east\") }", "repeat-the-row"],
  ["condition", "language", "if (tile == \"ripe\") { harvest() }", "read-the-ground"],
  ["variable", "language", "let cycles = 2", "seed-cycle"],
  ["function", "language", "function harvest_row() { harvest() }", "garden-routine"],
  ["tileSensor", "sensor", "tile_is(\"ripe\")", "field-scanner"],
  ["energySensor", "sensor", "energy_at_least(2)", "field-scanner"],
  ["storageSensor", "sensor", "storage_has_room(\"wood\")", "field-scanner"],
  ["braces", "syntax", "{ ... }", "syntax"],
  ["parentheses", "syntax", "move(\"east\")", "syntax"],
  ["quotes", "syntax", "move(\"east\")", "syntax"],
  ["comparison", "syntax", "tile == \"ripe\"", "syntax"],
  ["comments", "syntax", "# explanation", "syntax"],
] as const;

export type CodeReferenceEntryId = (typeof CODE_REFERENCE_ENTRIES)[number][0];
