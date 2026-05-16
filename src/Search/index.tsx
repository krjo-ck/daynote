import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ViewWeekIcon from '@mui/icons-material/ViewWeek';
import { getDatabase } from '../database';
import { note } from '../database/notes';

export function loader() {
  return {};
}

const EXCERPT_MAX_LENGTH = 120;

function makeExcerpt(text: string, query: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, EXCERPT_MAX_LENGTH) + (text.length > EXCERPT_MAX_LENGTH ? '…' : '');
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [allNotes, setAllNotes] = useState<note[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDatabase()
      .then(db => db.notes.sortBy('date'))
      .then(notes => setAllNotes([...notes].reverse()))
      .catch(console.error);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.trim()) {
        setSearchParams({ q: value }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const trimmedQuery = query.trim();
  const results =
    trimmedQuery.length > 0 ? allNotes.filter(n => n.note.toLowerCase().includes(trimmedQuery.toLowerCase())) : [];

  const handleResultClick = useCallback(
    (n: note) => {
      const backUrl = `/search?q=${encodeURIComponent(trimmedQuery)}`;
      navigate(`/day/${n.date}?back=${encodeURIComponent(backUrl)}`);
    },
    [navigate, trimmedQuery],
  );

  return (
    <Stack sx={{ alignItems: 'center', height: '100%', width: '100%' }}>
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <Stack direction="row" sx={{ alignItems: 'center', width: '100%', p: 1, gap: 1 }}>
          <TextField
            inputRef={inputRef}
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            placeholder="Search notes…"
            size="small"
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      </Paper>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Box sx={{ flex: '1 1 auto', width: '100%', overflowY: 'auto' }}>
        {trimmedQuery.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Type to search your notes.
          </Typography>
        )}
        {trimmedQuery.length > 0 && results.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No notes found for "{trimmedQuery}".
          </Typography>
        )}
        {results.length > 0 && (
          <List disablePadding>
            {results.map(n => {
              const date = new Date(n.date);
              return (
                <React.Fragment key={n.date}>
                  <ListItemButton onClick={() => handleResultClick(n)}>
                    <ListItemText
                      primary={date.toLocaleDateString()}
                      secondary={makeExcerpt(n.note, trimmedQuery)}
                      slotProps={{ secondary: { sx: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } } }}
                    />
                  </ListItemButton>
                  <Divider component="li" />
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <BottomNavigation showLabels>
          <BottomNavigationAction label="Week" href="/week" icon={<ViewWeekIcon />} />
        </BottomNavigation>
      </Paper>
    </Stack>
  );
};

export default Search;
