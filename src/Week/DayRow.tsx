import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Typography, Box, Stack } from '@mui/material';
import { note } from '../database/notes';
import { anniversary } from '../database/anniversaries';
import { DaynotedataClient, init } from '../database';
import { getRecurringAnniversaryForDate } from '../database/anniversaryRecurrence';
import { subscribeToImportCompletedSignal } from '../database/importSignal';

interface DayRowProps {
  date: Date;
}

const DayRow: React.FC<DayRowProps> = ({ date }: DayRowProps) => {
  const [database, setDatabase] = useState<DaynotedataClient>();
  const dateWithoutTime = useMemo(() => new Date(date.getFullYear(), date.getMonth(), date.getDate()), [date]);
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [noteData, setNoteData] = useState<note>({ date: date.valueOf(), note: '', photo: '' });
  const [anniversaryData, setAnniversaryData] = useState<anniversary>({ date: dateWithoutTime.valueOf(), note: '' });

  useEffect(() => {
    init()
      .then(db => {
        setDatabase(db);
      })
      .catch(console.error);
  }, []);

  const refreshDayRowData = React.useCallback(() => {
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
    refreshDayRowData();
  }, [refreshDayRowData]);

  useEffect(() => {
    return subscribeToImportCompletedSignal(() => {
      refreshDayRowData();
    });
  }, [refreshDayRowData]);

  return (
    <Box sx={{ width: '100%' }}>
      <Link to={`/day/${dateWithoutTime.valueOf()}`} style={{ textDecoration: 'none' }}>
        <Typography variant="body1">{date.toLocaleDateString()}</Typography>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Stack direction="column" sx={{ alignContent: 'space-around', minWidth: '20px', minHeight: '40px' }}>
            {date.toLocaleDateString() === today.toLocaleDateString() && (
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'primary.main' }} />
            )}
            {anniversaryData.note && (
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'secondary.main' }} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            {anniversaryData.note}
          </Typography>
          {noteData.photo && (
            <Box
              component="img"
              src={noteData.photo}
              alt={`Note for ${date.toLocaleDateString()}`}
              sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <Typography variant="body2">{noteData.note}</Typography>
        </Stack>
      </Link>
    </Box>
  );
};

export default DayRow;
