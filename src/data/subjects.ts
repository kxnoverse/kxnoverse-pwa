import { createId, db, type Subject } from "./db";

export async function createSubject(name: string): Promise<Subject> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("invalid-subject");
  const subject = { id: createId(), name: cleanName, color: "#8da9c0" };
  await db.subjects.add(subject);
  return subject;
}

export async function renameSubject(subjectId: string, name: string): Promise<void> {
  const cleanName = name.trim().slice(0, 80);
  if (!cleanName) throw new Error("invalid-subject");
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error("missing-subject");
  await db.subjects.put({ ...subject, name: cleanName });
}

export async function deleteSubject(subjectId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.subjects, db.teachers, db.timetable, db.exceptions, db.tasks, db.notes, db.files, db.documents, db.pdfProjects],
    async () => {
      const [teachers, timetable, exceptions] = await Promise.all([
        db.teachers.toArray(),
        db.timetable.where("subjectId").equals(subjectId).count(),
        db.exceptions.toArray(),
      ]);
      const usedBySchedule = timetable > 0 ||
        exceptions.some((entry) => entry.extra?.subjectId === subjectId) ||
        teachers.some((teacher) => teacher.subjectIds.includes(subjectId));
      if (usedBySchedule) throw new Error("subject-in-use");

      await Promise.all([
        db.tasks.where("subjectId").equals(subjectId).modify({ subjectId: undefined }),
        db.notes.where("subjectId").equals(subjectId).modify({ subjectId: undefined }),
        db.files.where("subjectId").equals(subjectId).modify({ subjectId: undefined }),
      ]);
      const [documents, pdfProjects] = await Promise.all([
        db.documents.toArray(),
        db.pdfProjects.toArray(),
      ]);
      await Promise.all([
        db.documents.bulkPut(documents.filter((item) => item.subjectId === subjectId)
          .map(({ subjectId: _subjectId, ...item }) => ({ ...item, updatedAt: Date.now() }))),
        db.pdfProjects.bulkPut(pdfProjects.filter((item) => item.subjectId === subjectId)
          .map(({ subjectId: _subjectId, ...item }) => ({ ...item, updatedAt: Date.now() }))),
        db.subjects.delete(subjectId),
      ]);
    },
  );
}

export function matchesSubject(subjectId: string | undefined, filter: string): boolean {
  if (!filter) return true;
  if (filter === "__no_subject__") return !subjectId;
  return subjectId === filter;
}
