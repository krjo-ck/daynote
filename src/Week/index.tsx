import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Params, useLoaderData, useNavigate } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Typography,
  Stack,
  Divider,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SettingsIcon from '@mui/icons-material/Settings';
import TodayIcon from '@mui/icons-material/Today';
import { getLastWeekNumberOfYear, getWeekNumber, getWeekDates } from './DateExtensions';
import DayRow from './DayRow';
import { getDatabase } from '../database';
import { note } from '../database/notes';
import { RecurringAnniversary, getDayMonthKeyFromDate } from '../database/anniversaries';
import { getRecurringAnniversaryForDate } from '../database/anniversaryRecurrence';
import { subscribeToImportCompletedSignal } from '../database/importSignal';

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
  const weekDates = useMemo(() => getWeekDates(year, weekNo), [year, weekNo]);
  const month = weekDates[0].toLocaleString('default', { month: 'long' });

  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [goToDateValue, setGoToDateValue] = useState('');
  const [weekNotes, setWeekNotes] = useState<Map<number, note>>(new Map());
  const [weekAnniversaries, setWeekAnniversaries] = useState<Map<number, RecurringAnniversary>>(new Map());

  useEffect(() => {
    getDatabase().catch(console.error);
  }, []);

  const fetchWeekData = useCallback(async () => {
    const database = await getDatabase();
    const notesArray = await database.notes.where('date').isBetween({
      from: weekDates[0].valueOf(),
      to: weekDates[6].valueOf(),
    });
    setWeekNotes(new Map(notesArray.map(n => [n.date, n])));

    const anniversaryResults = await Promise.all(weekDates.map(d => getRecurringAnniversaryForDate(database, d)));
    setWeekAnniversaries(new Map(anniversaryResults.map(a => [a.dayMonthKey, a])));
  }, [weekDates]);

  useEffect(() => {
    fetchWeekData().catch(console.error);
  }, [fetchWeekData]);

  useEffect(() => {
    return subscribeToImportCompletedSignal(() => {
      fetchWeekData().catch(console.error);
    });
  }, [fetchWeekData]);

  const handleOpenGoToDate = () => {
    const d = weekDates[0];
    setGoToDateValue(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
    setGoToDateOpen(true);
  };

  const handleGoToDate = () => {
    if (!goToDateValue) return;
    const d = new Date(`${goToDateValue}T00:00:00`);
    const targetWeek = `${d.getFullYear()}w${getWeekNumber(d)}`;
    setGoToDateOpen(false);
    navigate(`/week/${targetWeek}`);
  };

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
          <Stack direction="row" sx={{ flex: '1 1 auto', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h6" sx={{ m: 1, textAlign: 'center' }}>
              {month} {week}
            </Typography>
            <IconButton size="small" onClick={handleOpenGoToDate} aria-label="Go to date">
              <CalendarMonthIcon fontSize="small" />
            </IconButton>
          </Stack>
          <BottomNavigationAction
            label="Settings"
            href="/config"
            showLabel
            icon={<SettingsIcon />}
            style={{ maxWidth: '88px' }}
          />
        </Stack>
      </Paper>
      <Dialog open={goToDateOpen} onClose={() => setGoToDateOpen(false)}>
        <DialogTitle>Go to week</DialogTitle>
        <DialogContent>
          <TextField
            type="date"
            label="Date"
            value={goToDateValue}
            onChange={e => setGoToDateValue(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGoToDateOpen(false)}>Cancel</Button>
          <Button onClick={handleGoToDate} variant="contained" disabled={!goToDateValue}>
            Go
          </Button>
        </DialogActions>
      </Dialog>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Stack sx={{ alignItems: 'center', justifyContent: 'space-evenly', height: '100%' }}>
        <DayRow key="monday" date={weekDates[0]} noteData={weekNotes.get(weekDates[0].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[0]))} />
        <DayRow key="tuesday" date={weekDates[1]} noteData={weekNotes.get(weekDates[1].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[1]))} />
        <DayRow key="wendesday" date={weekDates[2]} noteData={weekNotes.get(weekDates[2].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[2]))} />
        <DayRow key="thursday" date={weekDates[3]} noteData={weekNotes.get(weekDates[3].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[3]))} />
        <DayRow key="friday" date={weekDates[4]} noteData={weekNotes.get(weekDates[4].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[4]))} />
        <DayRow key="saturday" date={weekDates[5]} noteData={weekNotes.get(weekDates[5].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[5]))} />
        <DayRow key="sunday" date={weekDates[6]} noteData={weekNotes.get(weekDates[6].valueOf())} anniversaryData={weekAnniversaries.get(getDayMonthKeyFromDate(weekDates[6]))} />
      </Stack>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <BottomNavigation showLabels>
          <BottomNavigationAction label={previousWeek} href={`/week/${previousWeek}`} icon={<NavigateBeforeIcon />} />
          <BottomNavigationAction label="Today" href={`/week/${today}`} icon={<TodayIcon />} />
          <BottomNavigationAction label={nextWeek} href={`/week/${nextWeek}`} icon={<NavigateNextIcon />} />
        </BottomNavigation>
      </Paper>
    </Stack>
  );
};

export default Week;
