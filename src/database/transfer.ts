import { DaynotedataClient } from '.';
import { anniversary, anniversaryItem, getDayMonthKeyFromDate, parseDayMonthKey } from './anniversaries';
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
  const mergedItems = new Map<string, anniversaryItem>();

  for (const item of existing.items) {
    const key = `${item.year ?? 'none'}::${item.note}`;
    mergedItems.set(key, item);
  }

  for (const item of incoming.items) {
    const key = `${item.year ?? 'none'}::${item.note}`;
    mergedItems.set(key, item);
  }

  return {
    dayMonthKey: existing.dayMonthKey,
    items: Array.from(mergedItems.values()).sort((left, right) => {
      const leftYear = left.year ?? Number.MIN_SAFE_INTEGER;
      const rightYear = right.year ?? Number.MIN_SAFE_INTEGER;
      return leftYear - rightYear;
    }),
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
  const [notes, anniversaries] = await Promise.all([
    client.notes.sortBy('date'),
    client.anniversaries.sortBy('dayMonthKey'),
  ]);

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
  const anniversariesByDayMonth = new Map<number, anniversary>();

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
      const sourceDate = new Date(date);
      const dayMonthKey = getDayMonthKeyFromDate(sourceDate);
      let anniversaryYear: number | undefined = sourceDate.getFullYear();
      let anniversaryNote = anniversaryText;
      const parsedAnniversaryWithYear = parseLegacyAnniversaryWithYear(anniversaryText);

      if (parsedAnniversaryWithYear !== undefined) {
        anniversaryNote = parsedAnniversaryWithYear.text;
        anniversaryYear = parsedAnniversaryWithYear.year;
      }

      const existing = anniversariesByDayMonth.get(dayMonthKey);
      const item: anniversaryItem =
        anniversaryYear === undefined ? { note: anniversaryNote } : { note: anniversaryNote, year: anniversaryYear };

      if (existing === undefined) {
        anniversariesByDayMonth.set(dayMonthKey, {
          dayMonthKey,
          items: [item],
        });
      } else {
        existing.items.push(item);
      }
    }
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date(0).toISOString(),
    notes: Array.from(notesByDate.values()).sort((left, right) => left.date - right.date),
    anniversaries: Array.from(anniversariesByDayMonth.values())
      .map(entry => ({
        dayMonthKey: entry.dayMonthKey,
        items: entry.items.sort((left, right) => {
          const leftYear = left.year ?? Number.MIN_SAFE_INTEGER;
          const rightYear = right.year ?? Number.MIN_SAFE_INTEGER;
          return leftYear - rightYear;
        }),
      }))
      .sort((left, right) => left.dayMonthKey - right.dayMonthKey),
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
      .map(item => {
        const { month, day } = parseDayMonthKey(item.dayMonthKey);
        const baseDate = new Date(2000, month - 1, day);
        const shifted = new Date(baseDate.valueOf() + offsetMilliseconds);
        const yearDelta = shifted.getFullYear() - 2000;

        return {
          dayMonthKey: getDayMonthKeyFromDate(shifted),
          items: item.items.map(anniversaryItemEntry => ({
            note: anniversaryItemEntry.note,
            year: anniversaryItemEntry.year === undefined ? undefined : anniversaryItemEntry.year + yearDelta,
          })),
        };
      })
      .sort((left, right) => left.dayMonthKey - right.dayMonthKey),
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

  const seenAnniversaryDayMonthKeys = new Set<number>();
  const validatedAnniversaries: anniversary[] = anniversariesData.map((entry, index) => {
    if (!isObject(entry)) {
      throw new Error(`Invalid anniversaries entry at index ${index}.`);
    }

    if (typeof entry.dayMonthKey !== 'number' || Number.isFinite(entry.dayMonthKey) === false) {
      throw new Error(`anniversaries[${index}].dayMonthKey must be a valid number.`);
    }

    if (seenAnniversaryDayMonthKeys.has(entry.dayMonthKey)) {
      throw new Error(`Duplicate dayMonthKey found in anniversaries payload: ${entry.dayMonthKey}.`);
    }

    if (!Array.isArray(entry.items)) {
      throw new Error(`anniversaries[${index}].items must be an array.`);
    }

    const validatedItems = entry.items.map((item, itemIndex) => {
      if (!isObject(item)) {
        throw new Error(`anniversaries[${index}].items[${itemIndex}] must be an object.`);
      }

      if (typeof item.note !== 'string') {
        throw new Error(`anniversaries[${index}].items[${itemIndex}].note must be a string.`);
      }

      if (item.year !== undefined && (typeof item.year !== 'number' || Number.isInteger(item.year) === false)) {
        throw new Error(`anniversaries[${index}].items[${itemIndex}].year must be an integer when present.`);
      }

      return item.year === undefined
        ? {
            note: item.note,
          }
        : {
            note: item.note,
            year: item.year,
          };
    });

    seenAnniversaryDayMonthKeys.add(entry.dayMonthKey);

    return {
      dayMonthKey: entry.dayMonthKey,
      items: validatedItems,
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
    client.anniversaries.sortBy('dayMonthKey'),
  ]);

  const noteDates = new Set(existingNotes.map(entry => entry.date));
  const anniversaryDayMonthKeys = new Set(existingAnniversaries.map(entry => entry.dayMonthKey));

  let duplicateNotes = 0;
  let duplicateAnniversaries = 0;

  for (const item of payload.notes) {
    if (noteDates.has(item.date)) {
      duplicateNotes += 1;
    }
  }

  for (const item of payload.anniversaries) {
    if (anniversaryDayMonthKeys.has(item.dayMonthKey)) {
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
    client.anniversaries.sortBy('dayMonthKey'),
  ]);

  const notesByDate = new Map<number, note>(existingNotes.map(entry => [entry.date, entry]));
  const anniversariesByDayMonth = new Map<number, anniversary>(
    existingAnniversaries.map(entry => [entry.dayMonthKey, entry]),
  );

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
    const existing = anniversariesByDayMonth.get(incomingAnniversary.dayMonthKey);

    if (existing === undefined) {
      await client.anniversaries.put(incomingAnniversary, { transaction });
      anniversariesByDayMonth.set(incomingAnniversary.dayMonthKey, incomingAnniversary);
      report.anniversaries.inserted += 1;
      continue;
    }

    if (mode === 'ignore') {
      report.anniversaries.skipped += 1;
      continue;
    }

    if (mode === 'overwrite') {
      await client.anniversaries.put(incomingAnniversary, { transaction });
      anniversariesByDayMonth.set(incomingAnniversary.dayMonthKey, incomingAnniversary);
      report.anniversaries.updated += 1;
      continue;
    }

    const merged = mergeAnniversaries(existing, incomingAnniversary);
    await client.anniversaries.put(merged, { transaction });
    anniversariesByDayMonth.set(merged.dayMonthKey, merged);
    report.anniversaries.merged += 1;
  }

  await transactionCompleted;

  return report;
}
