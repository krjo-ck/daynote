import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Params, useLoaderData, useNavigate } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Typography,
  Stack,
  Box,
  Divider,
  TextField,
  List,
  ListItem,
  FormControlLabel,
  Checkbox,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SettingsIcon from '@mui/icons-material/Settings';
import TodayIcon from '@mui/icons-material/Today';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import { DaynotedataClient, init } from '../database';
import { note } from '../database/notes';
import { anniversaryItem, getDayMonthKeyFromDate } from '../database/anniversaries';
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
  const dayMonthKey = useMemo(() => getDayMonthKeyFromDate(dateWithoutTime), [dateWithoutTime]);
  const [noteData, setNoteData] = useState<note>({ date: date.valueOf(), note: '', photo: '' });
  const [anniversaryItems, setAnniversaryItems] = useState<anniversaryItem[]>([]);
  const [newAnniversaryNote, setNewAnniversaryNote] = useState<string>('');
  const [isNewAnniversaryYearEnabled, setIsNewAnniversaryYearEnabled] = useState<boolean>(false);
  const [newAnniversaryYear, setNewAnniversaryYear] = useState<string>('');
  const [editingAnniversaryIndex, setEditingAnniversaryIndex] = useState<number | null>(null);
  const [editingAnniversaryNote, setEditingAnniversaryNote] = useState<string>('');
  const [isEditingAnniversaryYearEnabled, setIsEditingAnniversaryYearEnabled] = useState<boolean>(false);
  const [editingAnniversaryYear, setEditingAnniversaryYear] = useState<string>('');

  const [goToDateOpen, setGoToDateOpen] = useState(false);
  const [goToDateValue, setGoToDateValue] = useState('');

  const handleOpenGoToDate = () => {
    const d = dateWithoutTime;
    setGoToDateValue(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
    setGoToDateOpen(true);
  };

  const handleGoToDate = () => {
    if (!goToDateValue) return;
    const d = new Date(`${goToDateValue}T00:00:00`);
    setGoToDateOpen(false);
    navigate(`/day/${d.valueOf()}`);
  };

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

  const sortAnniversaryItems = useCallback((items: anniversaryItem[]) => {
    return [...items].sort((left, right) => {
      const leftYear = left.year ?? Number.MIN_SAFE_INTEGER;
      const rightYear = right.year ?? Number.MIN_SAFE_INTEGER;

      if (leftYear !== rightYear) {
        return leftYear - rightYear;
      }

      return left.note.localeCompare(right.note);
    });
  }, []);

  const normalizeAnniversaryItems = useCallback(
    (items: anniversaryItem[]) => {
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

      return sortAnniversaryItems(Array.from(deduplicated.values()));
    },
    [sortAnniversaryItems],
  );

  const persistAnniversaryItems = useCallback(
    (items: anniversaryItem[]) => {
      if (!database) {
        return Promise.resolve();
      }

      const normalizedItems = normalizeAnniversaryItems(items);

      if (normalizedItems.length === 0) {
        return database.anniversaries.delete(dayMonthKey).then(() => {
          setAnniversaryItems([]);
        });
      }

      return database.anniversaries
        .put({
          dayMonthKey,
          items: normalizedItems,
        })
        .then(() => {
          setAnniversaryItems(normalizedItems);
        });
    },
    [database, dayMonthKey, normalizeAnniversaryItems],
  );

  const refreshDayData = useCallback(() => {
    if (!database) {
      return;
    }

    database.notes
      .get(date.valueOf())
      .then(n => setNoteData(n))
      .catch(console.error);

    database.anniversaries
      .get(dayMonthKey)
      .then(a => {
        const normalizedItems = normalizeAnniversaryItems(a.items);
        setAnniversaryItems(normalizedItems);

        if (normalizedItems.length !== a.items.length) {
          database.anniversaries
            .put({
              dayMonthKey,
              items: normalizedItems,
            })
            .catch(console.error);
        }
      })
      .catch(() => setAnniversaryItems([]));
  }, [database, date, dayMonthKey, normalizeAnniversaryItems]);

  useEffect(() => {
    refreshDayData();
  }, [refreshDayData]);

  useEffect(() => {
    return subscribeToImportCompletedSignal(() => {
      refreshDayData();
    });
  }, [refreshDayData]);

  const handleAddAnniversaryEntry = useCallback(() => {
    if (!database) {
      return;
    }

    const trimmedNote = newAnniversaryNote.trim();

    if (trimmedNote.length === 0) {
      return;
    }

    const parsedYear = Number(newAnniversaryYear);
    const shouldSetYear = isNewAnniversaryYearEnabled && Number.isInteger(parsedYear);

    if (isNewAnniversaryYearEnabled && shouldSetYear === false) {
      return;
    }

    const itemToAdd: anniversaryItem = shouldSetYear ? { note: trimmedNote, year: parsedYear } : { note: trimmedNote };
    const updatedItems = normalizeAnniversaryItems([...anniversaryItems, itemToAdd]);

    persistAnniversaryItems(updatedItems)
      .then(() => {
        setAnniversaryItems(updatedItems);
        setNewAnniversaryNote('');
        setIsNewAnniversaryYearEnabled(false);
        setNewAnniversaryYear('');
      })
      .catch(console.error);
  }, [
    anniversaryItems,
    database,
    isNewAnniversaryYearEnabled,
    newAnniversaryNote,
    newAnniversaryYear,
    persistAnniversaryItems,
    normalizeAnniversaryItems,
  ]);

  const handleStartEditAnniversaryEntry = useCallback(
    (index: number) => {
      const item = anniversaryItems[index];

      if (item === undefined) {
        return;
      }

      setEditingAnniversaryIndex(index);
      setEditingAnniversaryNote(item.note);
      setIsEditingAnniversaryYearEnabled(item.year !== undefined);
      setEditingAnniversaryYear(item.year?.toString() ?? '');
    },
    [anniversaryItems],
  );

  const handleCancelEditAnniversaryEntry = useCallback(() => {
    setEditingAnniversaryIndex(null);
    setEditingAnniversaryNote('');
    setIsEditingAnniversaryYearEnabled(false);
    setEditingAnniversaryYear('');
  }, []);

  const handleSaveEditAnniversaryEntry = useCallback(() => {
    if (editingAnniversaryIndex === null) {
      return;
    }

    const trimmedNote = editingAnniversaryNote.trim();

    if (trimmedNote.length === 0) {
      return;
    }

    const parsedYear = Number(editingAnniversaryYear);
    const shouldSetYear = isEditingAnniversaryYearEnabled && Number.isInteger(parsedYear);

    if (isEditingAnniversaryYearEnabled && shouldSetYear === false) {
      return;
    }

    const updatedItem: anniversaryItem = shouldSetYear
      ? { note: trimmedNote, year: parsedYear }
      : { note: trimmedNote };
    const updatedItems = anniversaryItems.map((item, index) =>
      index === editingAnniversaryIndex ? updatedItem : item,
    );
    const sortedItems = normalizeAnniversaryItems(updatedItems);

    persistAnniversaryItems(sortedItems)
      .then(() => {
        handleCancelEditAnniversaryEntry();
      })
      .catch(console.error);
  }, [
    anniversaryItems,
    editingAnniversaryIndex,
    editingAnniversaryNote,
    editingAnniversaryYear,
    handleCancelEditAnniversaryEntry,
    isEditingAnniversaryYearEnabled,
    persistAnniversaryItems,
    normalizeAnniversaryItems,
  ]);

  const handleDeleteAnniversaryEntry = useCallback(
    (indexToDelete: number) => {
      const updatedItems = anniversaryItems.filter((_, index) => index !== indexToDelete);

      persistAnniversaryItems(updatedItems)
        .then(() => {
          if (editingAnniversaryIndex === indexToDelete) {
            handleCancelEditAnniversaryEntry();
          }
        })
        .catch(console.error);
    },
    [anniversaryItems, editingAnniversaryIndex, handleCancelEditAnniversaryEntry, persistAnniversaryItems],
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
            icon={<ViewWeekIcon />}
            style={{ maxWidth: '80px' }}
          />
          <Stack direction="row" sx={{ flex: '1 1 auto', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h6" sx={{ m: 1, textAlign: 'center' }}>
              {date.toLocaleDateString()}
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
            style={{ maxWidth: '80px' }}
          />
        </Stack>
      </Paper>
      <Dialog open={goToDateOpen} onClose={() => setGoToDateOpen(false)}>
        <DialogTitle>Go to date</DialogTitle>
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
      <Stack sx={{ alignItems: 'center', height: '100%', width: '100%', p: 1 }}>
        <Typography variant="subtitle1" sx={{ alignSelf: 'flex-start', mt: 0.5 }}>
          Anniversaries
        </Typography>
        <List dense sx={{ width: '100%', pt: 0, pb: 0.5 }}>
          {anniversaryItems.length === 0 && (
            <ListItem disableGutters>
              <Typography variant="body2" color="text.secondary">
                No anniversary entries for this day.
              </Typography>
            </ListItem>
          )}
          {anniversaryItems.map((item, index) => (
            <ListItem key={`${item.note}-${item.year ?? 'no-year'}-${index}`} disableGutters>
              {editingAnniversaryIndex === index ? (
                <Stack sx={{ width: '100%', gap: 1, py: 0.5 }}>
                  <TextField
                    label="Anniversary note"
                    variant="outlined"
                    size="small"
                    fullWidth
                    value={editingAnniversaryNote}
                    onChange={e => setEditingAnniversaryNote(e.target.value)}
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={isEditingAnniversaryYearEnabled}
                        onChange={e => setIsEditingAnniversaryYearEnabled(e.target.checked)}
                      />
                    }
                    label="Set year"
                  />
                  {isEditingAnniversaryYearEnabled && (
                    <TextField
                      label="Year"
                      variant="outlined"
                      size="small"
                      type="number"
                      fullWidth
                      value={editingAnniversaryYear}
                      onChange={e => setEditingAnniversaryYear(e.target.value)}
                    />
                  )}
                  <Stack direction="row" sx={{ gap: 1 }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveEditAnniversaryEntry}
                      disabled={
                        editingAnniversaryNote.trim().length === 0 ||
                        (isEditingAnniversaryYearEnabled && Number.isInteger(Number(editingAnniversaryYear)) === false)
                      }
                    >
                      Save
                    </Button>
                    <Button variant="text" size="small" onClick={handleCancelEditAnniversaryEntry}>
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Box
                  sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                >
                  <Typography variant="body2">{`${item.note} (${item.year ?? 'not set'})`}</Typography>
                  <Stack direction="row" sx={{ gap: 1 }}>
                    <Button variant="text" size="small" onClick={() => handleStartEditAnniversaryEntry(index)}>
                      Edit
                    </Button>
                    <Button
                      variant="text"
                      color="error"
                      size="small"
                      onClick={() => handleDeleteAnniversaryEntry(index)}
                    >
                      Delete
                    </Button>
                  </Stack>
                </Box>
              )}
            </ListItem>
          ))}
        </List>
        <Stack sx={{ width: '100%', gap: 1, mb: 1 }}>
          <Typography variant="subtitle2">Add</Typography>
          <TextField
            id="anniversary-add-note"
            aria-label="anniversary-add-note"
            label="Anniversary note"
            variant="outlined"
            size="small"
            fullWidth
            value={newAnniversaryNote}
            onChange={e => setNewAnniversaryNote(e.target.value)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={isNewAnniversaryYearEnabled}
                onChange={e => setIsNewAnniversaryYearEnabled(e.target.checked)}
              />
            }
            label="Set year"
          />
          {isNewAnniversaryYearEnabled && (
            <TextField
              id="anniversary-add-year"
              aria-label="anniversary-add-year"
              label="Year"
              variant="outlined"
              size="small"
              type="number"
              fullWidth
              value={newAnniversaryYear}
              onChange={e => setNewAnniversaryYear(e.target.value)}
            />
          )}
          <Button
            variant="contained"
            onClick={handleAddAnniversaryEntry}
            disabled={
              newAnniversaryNote.trim().length === 0 ||
              (isNewAnniversaryYearEnabled && Number.isInteger(Number(newAnniversaryYear)) === false)
            }
          >
            Add anniversary entry
          </Button>
        </Stack>
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
          <BottomNavigationAction
            label={new Date(previousDay).toLocaleDateString()}
            href={`/day/${previousDay}`}
            icon={<NavigateBeforeIcon />}
          />
          <BottomNavigationAction label="Today" href={`/day/${today.valueOf()}`} icon={<TodayIcon />} />
          <BottomNavigationAction
            label={new Date(nextDay).toLocaleDateString()}
            href={`/day/${nextDay}`}
            icon={<NavigateNextIcon />}
          />
        </BottomNavigation>
      </Paper>
    </Stack>
  );
};

export default Day;
