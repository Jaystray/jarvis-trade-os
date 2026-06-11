import { getDb } from "@/lib/db";
import type { Memory } from "@/types";

type MemoryRow = {
  id: string;
  title: string;
  content: string;
  tags: string;
  created_at: string;
};

const stopWords = new Set([
  "the",
  "and",
  "that",
  "with",
  "this",
  "from",
  "have",
  "what",
  "want",
  "into",
  "about",
  "when",
  "where",
  "your",
  "you",
  "are"
]);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function mapMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags || "[]"),
    createdAt: row.created_at
  };
}

export function getRelevantMemories(input: string, limit = 5) {
  const words = tokenize(input);
  const rows = getDb()
    .prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT 100")
    .all() as MemoryRow[];

  return rows
    .map((row) => {
      const haystack = `${row.title} ${row.content} ${row.tags}`.toLowerCase();
      const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
      return { memory: mapMemory(row), score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ memory }) => memory);
}

export function listMemories(limit = 20) {
  const rows = getDb()
    .prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?")
    .all(limit) as MemoryRow[];
  return rows.map(mapMemory);
}
