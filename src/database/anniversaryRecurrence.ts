import { DaynotedataClient } from './index';
import { RecurringAnniversary, anniversaryItem, getDayMonthKeyFromDate } from './anniversaries';

function normalizeRecurringItems(items: anniversaryItem[]): anniversaryItem[] {
  const deduplicated = new Map<string, anniversaryItem>();

  for (const item of items) {
    const normalizedNote = item.note.trim();

    if (normalizedNote.length === 0) {
      continue;
    }

    const normalizedYear = item.year;
    const key = `${normalizedYear ?? 'none'}::${normalizedNote}`;

    if (deduplicated.has(key)) {
      continue;
    }

    deduplicated.set(
      key,
      normalizedYear === undefined ? { note: normalizedNote } : { note: normalizedNote, year: normalizedYear },
    );
  }

  return Array.from(deduplicated.values()).sort((left, right) => {
    const leftYear = left.year ?? Number.MIN_SAFE_INTEGER;
    const rightYear = right.year ?? Number.MIN_SAFE_INTEGER;

    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return left.note.localeCompare(right.note);
  });
}

export async function getRecurringAnniversaryForDate(
  database: DaynotedataClient,
  date: Date,
): Promise<RecurringAnniversary> {
  const dateWithoutTime = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayMonthKey = getDayMonthKeyFromDate(dateWithoutTime);
  const currentYear = dateWithoutTime.getFullYear();

  const entry = await database.anniversaries.get(dayMonthKey).catch(() => undefined);
  const matchingItems: anniversaryItem[] = normalizeRecurringItems(
    (entry?.items ?? []).filter(item => item.year === undefined || item.year <= currentYear),
  );

  const combinedNote = matchingItems
    .map(item => item.note.trim())
    .filter(item => item.length > 0)
    .join(', ');

  return { dayMonthKey, items: matchingItems, note: combinedNote };
}
