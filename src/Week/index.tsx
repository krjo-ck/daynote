import React, { useMemo } from 'react';
import { Params, useLoaderData } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Typography, Stack, Divider } from '@mui/material';
import { getLastWeekNumberOfYear, getWeekNumber, getWeekDates } from './DateExtensions';
import DayRow from './DayRow';

export async function loader({ params }: { params: Params }) {
  const week = params['week'] ?? `${new Date().getFullYear()}w${getWeekNumber(new Date())}`;
  return { week };
}

const Week: React.FC = () => {
  const { week } = useLoaderData() as { week: string };
  const [year, weekNo] = week.split('w').map(v => Number(v));
  const weekDates = getWeekDates(year, weekNo);
  const month = weekDates[0].toLocaleString('default', { month: 'long' });

  const previousWeek = useMemo(() => {
    if (weekNo > 1) {
      return `${year}w${weekNo - 1}`;
    }
    const prevYear = year - 1;
    return `${prevYear}w${getLastWeekNumberOfYear(prevYear)}`;
  }, [weekNo, year]);

  const today = `${new Date().getFullYear()}w${getWeekNumber(new Date())}`;

  const nextWeek = useMemo(() => {
    const nextWeekNo = weekNo + 1;
    const lastWeekNo = getLastWeekNumberOfYear(year);
    if (nextWeekNo > lastWeekNo) {
      return `${year + 1}w1`;
    }
    return `${year}w${nextWeekNo}`;
  }, [weekNo, year]);

  return (
    <Stack alignItems="center" height="100%" width="100%">
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <Stack alignItems="center" width="100%">
          <Typography variant="h6" margin={1}>
            {month} {week}
          </Typography>
        </Stack>
      </Paper>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Stack alignItems="center" justifyContent="space-evenly" height="100%">
        <DayRow key="monday" date={weekDates[0]} />
        <DayRow key="tuesday" date={weekDates[1]} />
        <DayRow key="wendesday" date={weekDates[2]} />
        <DayRow key="thursday" date={weekDates[3]} />
        <DayRow key="friday" date={weekDates[4]} />
        <DayRow key="saturday" date={weekDates[5]} />
        <DayRow key="sunday" date={weekDates[6]} />
      </Stack>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <BottomNavigation showLabels>
          <BottomNavigationAction label={previousWeek} href={`/week/${previousWeek}`} />
          <BottomNavigationAction label="Today" href={`/week/${today}`} />
          <BottomNavigationAction label={nextWeek} href={`/week/${nextWeek}`} />
        </BottomNavigation>
      </Paper>
    </Stack>
  );
};

export default Week;
