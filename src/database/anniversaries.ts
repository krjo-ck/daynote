export type anniversary = {
  dayMonthKey: number;
  items: anniversaryItem[];
};
export type anniversaryItem = {
  note: string;
  year?: number;
};

export type RecurringAnniversary = {
  dayMonthKey: number;
  items: anniversaryItem[];
  note: string;
};

export type AnniversariesIndexes = 'dayMonthKey';
export type AnniversariesWhereQueryType<IndexName extends AnniversariesIndexes> = IndexName extends 'dayMonthKey'
  ? number
  : never;
export type AnniversariesAddArgs = {
  dayMonthKey: number;
  items: anniversaryItem[];
};
export type AnniversariesPutArgs =
  | AnniversariesAddArgs
  | {
      dayMonthKey: number;
      items: anniversaryItem[];
    };
export type AnniversariesDeleteArgs =
  | number
  | {
      dayMonthKey: number;
    };
export type AnniversariesGetArgs =
  | number
  | {
      dayMonthKey: number;
    };
const isAnniversariesDayMonthKeyIndex = (
  arg: AnniversariesGetArgs | AnniversariesDeleteArgs,
): arg is {
  dayMonthKey: number;
} => {
  return typeof arg === 'object' && Object.keys(arg).length === 1 && Reflect.has(arg, 'dayMonthKey');
};

export function getDayMonthKeyFromDate(date: Date): number {
  return (date.getMonth() + 1) * 100 + date.getDate();
}

export function parseDayMonthKey(dayMonthKey: number): {
  month: number;
  day: number;
} {
  return {
    month: Math.trunc(dayMonthKey / 100),
    day: dayMonthKey % 100,
  };
}

export function getAnniversariesId(arg: AnniversariesGetArgs | AnniversariesDeleteArgs) {
  const id = isAnniversariesDayMonthKeyIndex(arg) ? arg.dayMonthKey : arg;
  return id;
}
