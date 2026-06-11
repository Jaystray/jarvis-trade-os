import { getDb, id } from "../lib/db";

const db = getDb();

const memoryCount = db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number };
if (memoryCount.count === 0) {
  const insertMemory = db.prepare(
    "INSERT INTO memories (id, title, content, tags) VALUES (?, ?, ?, ?)"
  );
  insertMemory.run(
    id("mem"),
    "APEX system market",
    "My APEX system trades MNQ on the 15 second chart.",
    JSON.stringify(["APEX", "MNQ", "strategy"])
  );
  insertMemory.run(
    id("mem"),
    "Execution discipline",
    "Prioritize clean setups, stop placement, and avoiding revenge trades after a loss.",
    JSON.stringify(["discipline", "risk"])
  );
}

const noteCount = db
  .prepare("SELECT COUNT(*) as count FROM workspace_notes")
  .get() as { count: number };
if (noteCount.count === 0) {
  const insertNote = db.prepare(
    "INSERT INTO workspace_notes (id, section, title, content) VALUES (?, ?, ?, ?)"
  );
  insertNote.run(
    id("note"),
    "APEX Strategy Notes",
    "Baseline APEX Plan",
    "Trade MNQ on the 15 second chart. Mark trend, wait for confirmation, define stop before entry."
  );
  insertNote.run(
    id("note"),
    "Lessons Learned",
    "Post-loss reset",
    "After a full stop, pause and review whether the next setup is independent or emotional."
  );
}

const journalCount = db
  .prepare("SELECT COUNT(*) as count FROM trade_journal")
  .get() as { count: number };
if (journalCount.count === 0) {
  db.prepare(
    `INSERT INTO trade_journal
      (id, date, market, direction, entry, stop, target, result, points, notes, mistake_tag, setup_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id("trade"),
    new Date().toISOString().slice(0, 10),
    "MNQ",
    "Long",
    "18420.25",
    "18412.25",
    "18436.25",
    "Win",
    "16",
    "Sample APEX continuation trade. Entry followed confirmation and target was hit cleanly.",
    "None",
    "APEX continuation"
  );
}

console.log("Seed data ready.");
