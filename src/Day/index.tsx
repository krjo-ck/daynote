import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Params, useLoaderData, useNavigate } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, Typography, Stack, Divider, TextField } from '@mui/material';
import { DaynotedataClient, init } from '../database';
import { note } from '../database/notes';
import { anniversary } from '../database/anniversaries';
import { getRecurringAnniversaryForDate } from '../database/anniversaryRecurrence';
import { subscribeToImportCompletedSignal } from '../database/importSignal';
import { getWeekNumber } from '../Week/DateExtensions';
import ImagePicker, { ImagePickerConf } from './ImagePicker';

export async function loader({ params }: { params: Params }) {
  const day = params['day'] ?? '';
  return { day };
}

const Day: React.FC = () => {
  const { day } = useLoaderData() as { day: string };
  const navigate = useNavigate();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pointerStartX = useRef<number | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const date = useMemo(() => new Date(Number(day)), [day]);

  const currentWeek = useMemo(() => `${date.getFullYear()}w${getWeekNumber(date)}`, [date]);

  const previousDay = useMemo(() => Number(day) - 86400000, [day]);
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const nextDay = useMemo(() => Number(day) + 86400000, [day]);

  const [database, setDatabase] = useState<DaynotedataClient>();
  const dateWithoutTime = useMemo(() => new Date(date.getFullYear(), date.getMonth(), date.getDate()), [date]);
  const [noteData, setNoteData] = useState<note>({ date: date.valueOf(), note: '', photo: '' });
  const [anniversaryData, setAnniversaryData] = useState<anniversary>({ date: dateWithoutTime.valueOf(), note: '' });

  const config: ImagePickerConf = {
    borderRadius: '8px',
    language: 'en',
    width: '330px',
    height: '250px',
    objectFit: 'contain',
    compressInitial: null,
  };

  useEffect(() => {
    init()
      .then(db => {
        setDatabase(db);
      })
      .catch(console.error);
  }, []);

  const refreshDayData = useCallback(() => {
    if (!database) {
      return;
    }

    database.notes
      .get(date.valueOf())
      .then(n => setNoteData(n))
      .catch(console.error);
    getRecurringAnniversaryForDate(database, dateWithoutTime)
      .then(a => setAnniversaryData(a))
      .catch(console.error);
  }, [database, date, dateWithoutTime]);

  useEffect(() => {
    refreshDayData();
  }, [refreshDayData]);

  useEffect(() => {
    return subscribeToImportCompletedSignal(() => {
      refreshDayData();
    });
  }, [refreshDayData]);

  const handleAnniversaryChange = useCallback(
    (value: string) => {
      if (database) {
        database.anniversaries
          .put({ date: dateWithoutTime.valueOf(), note: value })
          .then(a => setAnniversaryData(a))
          .catch(e => {
            console.error(e);
            setAnniversaryData({ date: dateWithoutTime.valueOf(), note: '' });
          });
      }
    },
    [database, dateWithoutTime],
  );

  const handleNoteChange = useCallback(
    (value: string) => {
      if (database) {
        database.notes
          .put({ date: dateWithoutTime.valueOf(), note: value, photo: noteData.photo })
          .then(a => setNoteData(a))
          .catch(e => {
            console.error(e);
            setNoteData({ date: dateWithoutTime.valueOf(), note: '', photo: noteData.photo });
          });
      }
    },
    [database, dateWithoutTime, noteData.photo],
  );

  const handlePhotoChange = useCallback(
    (value: string | null) => {
      if (database) {
        database.notes
          .put({ date: dateWithoutTime.valueOf(), note: noteData.note, photo: value || '' })
          .then(a => setNoteData(a))
          .catch(e => {
            console.error(e);
            setNoteData({ date: dateWithoutTime.valueOf(), note: noteData.note, photo: '' });
          });
      }
    },
    [database, dateWithoutTime, noteData.note],
  );

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
      navigate(`/day/${nextDay}`);
      return;
    }

    navigate(`/day/${previousDay}`);
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
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <BottomNavigationAction
            label={currentWeek}
            href={`/week/${currentWeek}`}
            showLabel
            style={{ maxWidth: '80px' }}
          />
          <Typography variant="h6" sx={{ m: 1, textAlign: 'center', flex: '1 1 auto' }}>
            {date.toLocaleDateString()}
          </Typography>
          <BottomNavigationAction label="Settings" href="/config" showLabel style={{ maxWidth: '80px' }} />
        </Stack>
      </Paper>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Stack sx={{ alignItems: 'center', height: '100%', width: '100%', p: 1 }}>
        <TextField
          id="anniversary"
          aria-label="anniversary"
          label="Anniversary"
          variant="outlined"
          margin="dense"
          fullWidth
          value={anniversaryData.note}
          onChange={e => handleAnniversaryChange(e.target.value)}
        />
        <TextField
          id="note"
          aria-label="note"
          label="Note"
          variant="outlined"
          value={noteData.note}
          margin="dense"
          fullWidth
          multiline
          minRows={3}
          onChange={e => handleNoteChange(e.target.value)}
        />
        <ImagePicker config={config} imageSrcProp={noteData.photo} imageChanged={handlePhotoChange} />
      </Stack>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <BottomNavigation showLabels>
          <BottomNavigationAction label={new Date(previousDay).toLocaleDateString()} href={`/day/${previousDay}`} />
          <BottomNavigationAction label="Today" href={`/day/${today.valueOf()}`} />
          <BottomNavigationAction label={new Date(nextDay).toLocaleDateString()} href={`/day/${nextDay}`} />
        </BottomNavigation>
      </Paper>
    </Stack>
  );
};

export default Day;
