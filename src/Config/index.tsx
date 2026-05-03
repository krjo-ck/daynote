import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Typography,
  Stack,
  Divider,
  Button,
  Alert,
} from '@mui/material';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import { DaynotedataClient, init } from '../database';
import {
  analyzeImportPayload,
  buildExportPayload,
  DatabaseTransferPayload,
  ImportConflictSummary,
  ImportMode,
  importPayload,
  parseImportPayload,
  serializeExportPayload,
} from '../database/transfer';
import { emitImportCompletedSignal } from '../database/importSignal';
import { getWeekNumber } from '../Week/DateExtensions';

export async function loader() {
  return null;
}

type PendingImport = {
  fileName: string;
  payload: DatabaseTransferPayload;
  summary: ImportConflictSummary;
};

type Status = {
  severity: 'success' | 'error' | 'info';
  message: string;
};

function createExportFileName(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  const second = `${date.getSeconds()}`.padStart(2, '0');

  return `daynote-export-${year}-${month}-${day}_${hour}-${minute}-${second}.json`;
}

const Config: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [database, setDatabase] = useState<DaynotedataClient>();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('ignore');
  const [status, setStatus] = useState<Status | null>(null);

  const today = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()), []);
  const currentWeek = useMemo(() => `${today.getFullYear()}w${getWeekNumber(today)}`, [today]);

  useEffect(() => {
    init()
      .then(db => setDatabase(db))
      .catch(error => {
        setStatus({ severity: 'error', message: `Failed to initialize database: ${String(error)}` });
      });
  }, []);

  const handleExport = async () => {
    if (!database) {
      return;
    }

    setStatus(null);
    setIsExporting(true);

    try {
      const payload = await buildExportPayload(database);
      const serializedPayload = serializeExportPayload(payload);
      const blob = new Blob([serializedPayload], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = createExportFileName(new Date());
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatus({ severity: 'success', message: 'Database export created successfully.' });
    } catch (error) {
      setStatus({ severity: 'error', message: `Export failed: ${String(error)}` });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenImport = () => {
    if (!database) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleImportFileSelected: React.ChangeEventHandler<HTMLInputElement> = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (!file || !database) {
      return;
    }

    setStatus(null);

    try {
      const payload = parseImportPayload(await file.text());
      const summary = await analyzeImportPayload(database, payload);

      setPendingImport({
        fileName: file.name,
        payload,
        summary,
      });
      setImportMode('ignore');
    } catch (error) {
      setStatus({ severity: 'error', message: `Import file validation failed: ${String(error)}` });
    }
  };

  const handleModeChange = (event: SelectChangeEvent<ImportMode>) => {
    setImportMode(event.target.value as ImportMode);
  };

  const handleCloseDialog = () => {
    if (isImporting) {
      return;
    }

    setPendingImport(null);
  };

  const handleConfirmImport = async () => {
    if (!database || !pendingImport) {
      return;
    }

    setIsImporting(true);
    setStatus(null);

    try {
      const report = await importPayload(database, pendingImport.payload, importMode);
      emitImportCompletedSignal();
      setStatus({
        severity: 'success',
        message:
          `Import completed. Notes: +${report.notes.inserted} inserted, ` +
          `${report.notes.updated} overwritten, ${report.notes.merged} merged, ${report.notes.skipped} skipped. ` +
          `Anniversaries: +${report.anniversaries.inserted} inserted, ${report.anniversaries.updated} overwritten, ` +
          `${report.anniversaries.merged} merged, ${report.anniversaries.skipped} skipped.`,
      });
      setPendingImport(null);
    } catch (error) {
      setStatus({ severity: 'error', message: `Import failed: ${String(error)}` });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Stack sx={{ alignItems: 'center', height: '100%', width: '100%' }}>
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <Stack sx={{ alignItems: 'center', width: '100%' }}>
          <Typography variant="h6" sx={{ m: 1 }}>
            Configuration
          </Typography>
        </Stack>
      </Paper>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Stack sx={{ alignItems: 'center', width: '100%', height: '100%', p: 2, gap: 2 }}>
        <Paper sx={{ width: '100%', maxWidth: 700, p: 2 }} elevation={0}>
          <Stack spacing={1}>
            <Typography variant="subtitle1">Application Version</Typography>
            <Typography variant="body1">{__APP_VERSION__}</Typography>
          </Stack>
        </Paper>

        <Paper sx={{ width: '100%', maxWidth: 700, p: 2 }} elevation={0}>
          <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
            <Button variant="contained" onClick={handleExport} disabled={!database || isExporting || isImporting}>
              {isExporting ? 'Exporting...' : 'Export database'}
            </Button>
            <Button variant="outlined" onClick={handleOpenImport} disabled={!database || isExporting || isImporting}>
              Import database
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileSelected}
              style={{ display: 'none' }}
            />
          </Stack>
        </Paper>

        {status && (
          <Paper sx={{ width: '100%', maxWidth: 700, p: 2 }} elevation={0}>
            <Alert severity={status.severity}>{status.message}</Alert>
          </Paper>
        )}
      </Stack>
      <Divider orientation="horizontal" variant="fullWidth" sx={{ width: '100%' }} />
      <Paper sx={{ width: '100%', borderRadius: 0 }} elevation={0}>
        <BottomNavigation showLabels>
          <BottomNavigationAction label="Week" href={`/week/${currentWeek}`} />
          <BottomNavigationAction label="Today" href={`/day/${today.valueOf()}`} />
        </BottomNavigation>
      </Paper>

      <Dialog open={pendingImport !== null} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>Import configuration</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">File: {pendingImport?.fileName}</Typography>
            <Typography variant="body2">
              Notes: {pendingImport?.summary.noteTotal} total, {pendingImport?.summary.duplicateNotes} duplicates,{' '}
              {pendingImport?.summary.newNotes} new
            </Typography>
            <Typography variant="body2">
              Anniversaries: {pendingImport?.summary.anniversaryTotal} total,{' '}
              {pendingImport?.summary.duplicateAnniversaries} duplicates, {pendingImport?.summary.newAnniversaries} new
            </Typography>
            <Typography variant="body2">Choose how duplicate dates should be handled for this import.</Typography>
            <FormControl fullWidth>
              <InputLabel id="duplicate-mode-label">Duplicate handling</InputLabel>
              <Select<ImportMode>
                labelId="duplicate-mode-label"
                value={importMode}
                label="Duplicate handling"
                onChange={handleModeChange}
                disabled={isImporting}
              >
                <MenuItem value="overwrite">Overwrite existing entries</MenuItem>
                <MenuItem value="ignore">Ignore duplicates from file</MenuItem>
                <MenuItem value="append-merge">Append by merging into existing entries</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleConfirmImport} disabled={isImporting} variant="contained">
            {isImporting ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default Config;
