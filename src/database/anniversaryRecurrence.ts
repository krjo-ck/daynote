import { DaynotedataClient } from './index';
import { RecurringAnniversary, anniversaryItem, getDayMonthKeyFromDate } from './anniversaries';

export async function getRecurringAnniversaryForDate(
  database: DaynotedataClient,
  date: Date,
): Promise<RecurringAnniversary> {
  const dateWithoutTime = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayMonthKey = getDayMonthKeyFromDate(dateWithoutTime);
  const currentYear = dateWithoutTime.getFullYear();

  const entry = await database.anniversaries.get(dayMonthKey).catch(() => undefined);
  const matchingItems: anniversaryItem[] = (entry?.items ?? [])
    .filter(item => item.year === undefined || item.year <= currentYear)
    .sort((left, right) => {
      const leftYear = left.year ?? Number.MIN_SAFE_INTEGER;
      const rightYear = right.year ?? Number.MIN_SAFE_INTEGER;
      return leftYear - rightYear;
    });

  const combinedNote = matchingItems
    .map(item => item.note.trim())
    .filter(item => item.length > 0)
    .join(', ');

  return { dayMonthKey, items: matchingItems, note: combinedNote };
}
