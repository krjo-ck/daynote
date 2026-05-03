import React, { useMemo, useRef } from 'react';
import { Params, useLoaderData, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Typography, Stack, Divider, Box } from '@mui/material';
import { getLastWeekNumberOfYear, getWeekNumber, getWeekDates } from './DateExtensions';
import DayRow from './DayRow';

export async function loader({ params }: { params: Params }) {
  const week = params['week'] ?? `${new Date().getFullYear()}w${getWeekNumber(new Date())}`;
  return { week };
}

const Week: React.FC = () => {
  const { week } = useLoaderData() as { week: string };
  const navigate = useNavigate();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
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

  const minSwipeDistance = 50;

  const shouldIgnoreGestureTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"]'));
  };

  const handleGestureEnd = (endX: number, endY: number, startX: number, startY: number) => {
    const deltaX = endX - startX;
    const deltaY = endY - startY;

    if (Math.abs(deltaX) < minSwipeDistance || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    if (deltaX < 0) {
      navigate(`/week/${nextWeek}`);
      return;
    }

    navigate(`/week/${previousWeek}`);
  };

  const handleTouchStart: React.TouchEventHandler<HTMLDivElement> = event => {
    if (shouldIgnoreGestureTarget(event.target)) {
      return;
    }

    const touch = event.changedTouches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd: React.TouchEventHandler<HTMLDivElement> = event => {
    if (touchStartX.current === null || touchStartY.current === null) {
      return;
    }

    const touch = event.changedTouches[0];
    const startX = touchStartX.current;
    const startY = touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    handleGestureEnd(touch.clientX, touch.clientY, startX, startY);
  };

  const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = event => {
    if (event.pointerType === 'touch' || shouldIgnoreGestureTarget(event.target)) {
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    pointerStartX.current = event.clientX;
    pointerStartY.current = event.clientY;
  };

  const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = event => {
    if (event.pointerType === 'touch') {
      return;
    }

    if (pointerStartX.current === null || pointerStartY.current === null) {
      return;
    }

    const startX = pointerStartX.current;
    const startY = pointerStartY.current;

    pointerStartX.current = null;
    pointerStartY.current = null;

    handleGestureEnd(event.clientX, event.clientY, startX, startY);
  };

  const handlePointerCancel: React.PointerEventHandler<HTMLDivElement> = () => {
    pointerStartX.current = null;
    pointerStartY.current = null;
  };

  return (
    <Stack
      sx={{ alignItems: 'center', height: '100%', width: '100%' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <Stack direction="row" sx={{ alignItems: 'center', width: '100%' }}>
          <Box sx={{ width: 88, flexShrink: 0 }} />
          <Typography variant="h6" sx={{ m: 1, textAlign: 'center', flex: '1 1 auto' }}>
            {month} {week}
          </Typography>
          <BottomNavigationAction label="Settings" href="/config" showLabel style={{ maxWidth: '88px' }} />
        </Stack>
      </Paper>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Stack sx={{ alignItems: 'center', justifyContent: 'space-evenly', height: '100%' }}>
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
