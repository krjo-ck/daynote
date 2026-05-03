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

function waitForRequestCompletion(request: IDBRequest): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Database request failed.'));
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

function normalizeLegacyField(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }

  return value.trim().toLowerCase() === '(null)' ? '' : value;
}

function parseLegacyAnniversaryWithYear(value: string):
  | {
      text: string;
      year: number;
    }
  | undefined {
  const parsed = value.match(/^(.*?)\s*\((\d{4})\)\s*$/);

  if (parsed === null) {
    return undefined;
  }

  const text = parsed[1].trim();
  const year = Number(parsed[2]);

  if (text.length === 0 || Number.isFinite(year) === false) {
    return undefined;
  }

  return {
    text,
    year,
  };
}

function parseLegacyDateToDayTimestamp(value: string): number {
  const parsed = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (parsed !== null) {
    const year = Number(parsed[1]);
    const month = Number(parsed[2]);
    const day = Number(parsed[3]);

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return new Date(year, month - 1, day).valueOf();
    }
  }

  const fallback = new Date(value);

  if (Number.isNaN(fallback.valueOf())) {
    throw new Error(`Invalid legacy date value: ${value}`);
  }

  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()).valueOf();
}

function parseLegacyXmlImportPayload(serializedPayload: string): DatabaseTransferPayload {
  const parser = new DOMParser();
  const document = parser.parseFromString(serializedPayload, 'application/xml');
  const parserError = document.querySelector('parsererror');

  if (parserError !== null) {
    throw new Error('Invalid XML file.');
  }

  const entries = Array.from(document.getElementsByTagName('daynotedata'));

  if (entries.length === 0) {
    throw new Error('No daynotedata entries were found in XML file.');
  }

  const notesByDate = new Map<number, note>();
  const anniversariesByDate = new Map<number, anniversary>();

  for (const entry of entries) {
    const fields = new Map<string, string>();

    for (const child of Array.from(entry.children)) {
      fields.set(child.tagName.toLowerCase(), child.textContent ?? '');
    }

    const dateValue = fields.get('date');

    if (dateValue === undefined) {
      throw new Error('Legacy XML entry is missing a date field.');
    }

    const date = parseLegacyDateToDayTimestamp(dateValue);
    const noteText = normalizeLegacyField(fields.get('note'));
    const photo = normalizeLegacyField(fields.get('photo'));
    const anniversaryText = normalizeLegacyField(fields.get('anniversary'));

    if (noteText.length > 0 || photo.length > 0) {
      notesByDate.set(date, {
        date,
        note: noteText,
        photo,
      });
    }

    if (anniversaryText.length > 0) {
      let anniversaryDate = date;
      let anniversaryNote = anniversaryText;
      const parsedAnniversaryWithYear = parseLegacyAnniversaryWithYear(anniversaryText);

      if (parsedAnniversaryWithYear !== undefined) {
        anniversaryNote = parsedAnniversaryWithYear.text;
        const sourceDate = new Date(date);
        anniversaryDate = new Date(
          parsedAnniversaryWithYear.year,
          sourceDate.getMonth(),
          sourceDate.getDate(),
        ).valueOf();
      }

      anniversariesByDate.set(anniversaryDate, {
        date: anniversaryDate,
        note: anniversaryNote,
      });
    }
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date(0).toISOString(),
    notes: Array.from(notesByDate.values()).sort((left, right) => left.date - right.date),
    anniversaries: Array.from(anniversariesByDate.values()).sort((left, right) => left.date - right.date),
  };
}

export function parseImportPayload(
  serializedPayload: string,
  options?: {
    fileName?: string;
  },
): DatabaseTransferPayload {
  const trimmedPayload = serializedPayload.trimStart();
  const lowerCaseFileName = options?.fileName?.toLowerCase();
  const isXmlPayload =
    trimmedPayload.startsWith('<') ||
    lowerCaseFileName?.endsWith('.xml') === true ||
    lowerCaseFileName?.endsWith('.daynote.xml') === true;

  if (isXmlPayload) {
    return validateImportPayload(parseLegacyXmlImportPayload(serializedPayload));
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(serializedPayload);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  return validateImportPayload(parsedPayload);
}

export function applyDateOffset(payload: DatabaseTransferPayload, offsetDays: number): DatabaseTransferPayload {
  const parsedOffsetDays = Number.isFinite(offsetDays) ? Math.trunc(offsetDays) : 0;

  if (parsedOffsetDays === 0) {
    return {
      schemaVersion: payload.schemaVersion,
      exportedAt: payload.exportedAt,
      notes: payload.notes.map(item => ({ ...item })),
      anniversaries: payload.anniversaries.map(item => ({ ...item })),
    };
  }

  const offsetMilliseconds = parsedOffsetDays * 24 * 60 * 60 * 1000;

  return {
    schemaVersion: payload.schemaVersion,
    exportedAt: payload.exportedAt,
    notes: payload.notes
      .map(item => ({
        ...item,
        date: item.date + offsetMilliseconds,
      }))
      .sort((left, right) => left.date - right.date),
    anniversaries: payload.anniversaries
      .map(item => ({
        ...item,
        date: item.date + offsetMilliseconds,
      }))
      .sort((left, right) => left.date - right.date),
  };
}

export async function clearAllData(client: DaynotedataClient): Promise<void> {
  const transaction = client.transaction(['notes', 'anniversaries'], 'readwrite');
  const transactionCompleted = waitForTransactionCompletion(transaction);

  const notesClearRequest = transaction.objectStore('notes').clear();
  const anniversariesClearRequest = transaction.objectStore('anniversaries').clear();

  await Promise.all([waitForRequestCompletion(notesClearRequest), waitForRequestCompletion(anniversariesClearRequest)]);
  await transactionCompleted;
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
