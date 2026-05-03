import { DaynotedataClient } from './index';
import { anniversary } from './anniversaries';

const isSameMonthAndDay = (sourceDate: Date, targetDate: Date) => {
  return sourceDate.getMonth() === targetDate.getMonth() && sourceDate.getDate() === targetDate.getDate();
};

export async function getRecurringAnniversaryForDate(database: DaynotedataClient, date: Date): Promise<anniversary> {
  const dateWithoutTime = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const candidates = await database.anniversaries.where('date').isLessThanOrEqualTo(dateWithoutTime.valueOf());

  const matchingAnniversaries: Array<anniversary> = [];
  for (const candidate of candidates) {
    const candidateDate = new Date(candidate.date);
    if (!isSameMonthAndDay(candidateDate, dateWithoutTime)) {
      continue;
    }

    matchingAnniversaries.push(candidate);
  }

  matchingAnniversaries.sort((a, b) => a.date - b.date);

  const combinedNote = matchingAnniversaries
    .map(item => item.note.trim())
    .filter(item => item.length > 0)
    .join(', ');

  return { date: dateWithoutTime.valueOf(), note: combinedNote };
}
