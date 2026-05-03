import { DaynotedataClient } from '.';
import { anniversary } from './anniversaries';
import { note } from './notes';

const MERGE_SEPARATOR = '\n\n';

export type DatabaseTransferPayload = {
  schemaVersion: number;
  exportedAt: string;
  notes: note[];
  anniversaries: anniversary[];
};

export type ImportMode = 'overwrite' | 'ignore' | 'append-merge';

export type ImportConflictSummary = {
  noteTotal: number;
  anniversaryTotal: number;
  duplicateNotes: number;
  duplicateAnniversaries: number;
  newNotes: number;
  newAnniversaries: number;
};

export type ImportStoreReport = {
  total: number;
  inserted: number;
  updated: number;
  merged: number;
  skipped: number;
};

export type ImportReport = {
  mode: ImportMode;
  notes: ImportStoreReport;
  anniversaries: ImportStoreReport;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function appendText(existing: string, incoming: string): string {
  const existingText = existing.trim();
  const incomingText = incoming.trim();

  if (incomingText.length === 0) {
    return existing;
  }

  if (existingText.length === 0) {
    return incoming;
  }

  if (existing === incoming) {
    return existing;
  }

  return `${existing}${MERGE_SEPARATOR}${incoming}`;
}

function mergeNotes(existing: note, incoming: note): note {
  return {
    date: existing.date,
    note: appendText(existing.note, incoming.note),
    photo: existing.photo || incoming.photo,
  };
}

function mergeAnniversaries(existing: anniversary, incoming: anniversary): anniversary {
  return {
    date: existing.date,
    note: appendText(existing.note, incoming.note),
  };
}

function waitForTransactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Database transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Database transaction was aborted.'));
  });
}

export async function buildExportPayload(client: DaynotedataClient): Promise<DatabaseTransferPayload> {
  const [notes, anniversaries] = await Promise.all([client.notes.sortBy('date'), client.anniversaries.sortBy('date')]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    notes: notes.map(item => ({ ...item })),
    anniversaries: anniversaries.map(item => ({ ...item })),
  };
}

export function serializeExportPayload(payload: DatabaseTransferPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function parseImportPayload(serializedPayload: string): DatabaseTransferPayload {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(serializedPayload);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  return validateImportPayload(parsedPayload);
}

export function validateImportPayload(payload: unknown): DatabaseTransferPayload {
  if (!isObject(payload)) {
    throw new Error('Import payload must be a JSON object.');
  }

  const schemaVersion = payload.schemaVersion;
  const exportedAt = payload.exportedAt;
  const notesData = payload.notes;
  const anniversariesData = payload.anniversaries;

  if (schemaVersion !== undefined && (typeof schemaVersion !== 'number' || schemaVersion < 1)) {
    throw new Error('schemaVersion must be a positive number.');
  }

  if (exportedAt !== undefined && typeof exportedAt !== 'string') {
    throw new Error('exportedAt must be a string when present.');
  }

  if (!Array.isArray(notesData)) {
    throw new Error('notes must be an array.');
  }

  if (!Array.isArray(anniversariesData)) {
    throw new Error('anniversaries must be an array.');
  }

  const seenNoteDates = new Set<number>();
  const validatedNotes: note[] = notesData.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid notes entry at index ${index}.`);
    }

    if (typeof entry.date !== 'number' || Number.isFinite(entry.date) === false) {
      throw new Error(`notes[${index}].date must be a valid number.`);
    }

    if (seenNoteDates.has(entry.date)) {
      throw new Error(`Duplicate date found in notes payload: ${entry.date}.`);
    }

    if (typeof entry.note !== 'string') {
      throw new Error(`notes[${index}].note must be a string.`);
    }

    if (typeof entry.photo !== 'string') {
      throw new Error(`notes[${index}].photo must be a string.`);
    }

    seenNoteDates.add(entry.date);

    return {
      date: entry.date,
      note: entry.note,
      photo: entry.photo,
    };
  });

  const seenAnniversaryDates = new Set<number>();
  const validatedAnniversaries: anniversary[] = anniversariesData.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid anniversaries entry at index ${index}.`);
    }

    if (typeof entry.date !== 'number' || Number.isFinite(entry.date) === false) {
      throw new Error(`anniversaries[${index}].date must be a valid number.`);
    }

    if (seenAnniversaryDates.has(entry.date)) {
      throw new Error(`Duplicate date found in anniversaries payload: ${entry.date}.`);
    }

    if (typeof entry.note !== 'string') {
      throw new Error(`anniversaries[${index}].note must be a string.`);
    }

    seenAnniversaryDates.add(entry.date);

    return {
      date: entry.date,
      note: entry.note,
    };
  });

  return {
    schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 1,
    exportedAt: typeof exportedAt === 'string' ? exportedAt : new Date(0).toISOString(),
    notes: validatedNotes,
    anniversaries: validatedAnniversaries,
  };
}

export async function analyzeImportPayload(
  client: DaynotedataClient,
  payload: DatabaseTransferPayload,
): Promise<ImportConflictSummary> {
  const [existingNotes, existingAnniversaries] = await Promise.all([
    client.notes.sortBy('date'),
    client.anniversaries.sortBy('date'),
  ]);

  const noteDates = new Set(existingNotes.map(entry => entry.date));
  const anniversaryDates = new Set(existingAnniversaries.map(entry => entry.date));

  let duplicateNotes = 0;
  let duplicateAnniversaries = 0;

  for (const item of payload.notes) {
    if (noteDates.has(item.date)) {
      duplicateNotes += 1;
    }
  }

  for (const item of payload.anniversaries) {
    if (anniversaryDates.has(item.date)) {
      duplicateAnniversaries += 1;
    }
  }

  return {
    noteTotal: payload.notes.length,
    anniversaryTotal: payload.anniversaries.length,
    duplicateNotes,
    duplicateAnniversaries,
    newNotes: payload.notes.length - duplicateNotes,
    newAnniversaries: payload.anniversaries.length - duplicateAnniversaries,
  };
}

export async function importPayload(
  client: DaynotedataClient,
  payload: DatabaseTransferPayload,
  mode: ImportMode,
): Promise<ImportReport> {
  const [existingNotes, existingAnniversaries] = await Promise.all([
    client.notes.sortBy('date'),
    client.anniversaries.sortBy('date'),
  ]);

  const notesByDate = new Map<number, note>(existingNotes.map(entry => [entry.date, entry]));
  const anniversariesByDate = new Map<number, anniversary>(existingAnniversaries.map(entry => [entry.date, entry]));

  const report: ImportReport = {
    mode,
    notes: {
      total: payload.notes.length,
      inserted: 0,
      updated: 0,
      merged: 0,
      skipped: 0,
    },
    anniversaries: {
      total: payload.anniversaries.length,
      inserted: 0,
      updated: 0,
      merged: 0,
      skipped: 0,
    },
  };

  const transaction = client.transaction(['notes', 'anniversaries'], 'readwrite');
  const transactionCompleted = waitForTransactionCompletion(transaction);

  for (const incomingNote of payload.notes) {
    const existing = notesByDate.get(incomingNote.date);

    if (existing === undefined) {
      await client.notes.put(incomingNote, { transaction });
      notesByDate.set(incomingNote.date, incomingNote);
      report.notes.inserted += 1;
      continue;
    }

    if (mode === 'ignore') {
      report.notes.skipped += 1;
      continue;
    }

    if (mode === 'overwrite') {
      await client.notes.put(incomingNote, { transaction });
      notesByDate.set(incomingNote.date, incomingNote);
      report.notes.updated += 1;
      continue;
    }

    const merged = mergeNotes(existing, incomingNote);
    await client.notes.put(merged, { transaction });
    notesByDate.set(merged.date, merged);
    report.notes.merged += 1;
  }

  for (const incomingAnniversary of payload.anniversaries) {
    const existing = anniversariesByDate.get(incomingAnniversary.date);

    if (existing === undefined) {
      await client.anniversaries.put(incomingAnniversary, { transaction });
      anniversariesByDate.set(incomingAnniversary.date, incomingAnniversary);
      report.anniversaries.inserted += 1;
      continue;
    }

    if (mode === 'ignore') {
      report.anniversaries.skipped += 1;
      continue;
    }

    if (mode === 'overwrite') {
      await client.anniversaries.put(incomingAnniversary, { transaction });
      anniversariesByDate.set(incomingAnniversary.date, incomingAnniversary);
      report.anniversaries.updated += 1;
      continue;
    }

    const merged = mergeAnniversaries(existing, incomingAnniversary);
    await client.anniversaries.put(merged, { transaction });
    anniversariesByDate.set(merged.date, merged);
    report.anniversaries.merged += 1;
  }

  await transactionCompleted;

  return report;
}
