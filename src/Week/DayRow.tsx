import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Typography, Box, Stack } from '@mui/material';
import { note } from '../database/notes';
import { RecurringAnniversary, getDayMonthKeyFromDate } from '../database/anniversaries';

interface DayRowProps {
  date: Date;
  noteData?: note;
  anniversaryData?: RecurringAnniversary;
}

const DayRow: React.FC<DayRowProps> = ({ date, noteData, anniversaryData }: DayRowProps) => {
  const dateWithoutTime = useMemo(() => new Date(date.getFullYear(), date.getMonth(), date.getDate()), [date]);
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const effectiveNoteData = noteData ?? { date: date.valueOf(), note: '', photo: '' };
  const effectiveAnniversaryData = anniversaryData ?? {
    dayMonthKey: getDayMonthKeyFromDate(dateWithoutTime),
    items: [],
    note: '',
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Link to={`/day/${dateWithoutTime.valueOf()}`} style={{ textDecoration: 'none' }}>
        <Typography variant="body1">{date.toLocaleDateString()}</Typography>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <Stack direction="column" sx={{ alignContent: 'space-around', minWidth: '20px', minHeight: '40px' }}>
            {date.toLocaleDateString() === today.toLocaleDateString() && (
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'primary.main' }} />
            )}
            {effectiveAnniversaryData.note && (
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'secondary.main' }} />
            )}
          </Stack>
          <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
            {effectiveAnniversaryData.note}
          </Typography>
          {effectiveNoteData.photo && (
            <Box
              component="img"
              src={effectiveNoteData.photo}
              alt={`Note for ${date.toLocaleDateString()}`}
              sx={{ width: 40, height: 40, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <Typography variant="body2">{effectiveNoteData.note}</Typography>
        </Stack>
      </Link>
    </Box>
  );
};

export default DayRow;
