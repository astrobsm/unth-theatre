'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { exportToExcel, exportToCSV } from '@/lib/exportUtils';
import { notify } from '@/lib/notifications';

interface ExportButtonProps<T> {
  data: T[];
  filename: string;
  format?: 'excel' | 'csv' | 'both';
  disabled?: boolean;
  className?: string;
  columnMapping?: Record<keyof T, string>;
}

export default function ExportButton<T extends Record<string, any>>({
  data,
  filename,
  format = 'both',
  disabled = false,
  className = '',
  columnMapping,
}: ExportButtonProps<T>) {
  const handleExport = async (exportFormat: 'excel' | 'csv') => {
    if (!data || data.length === 0) {
      notify.error('No data to export');
      return;
    }

    // Format data if column mapping is provided
    let dataToExport = data;
    if (columnMapping) {
      dataToExport = data.map((row) => {
        const formattedRow: Record<string, any> = {};
        Object.entries(columnMapping).forEach(([key, header]) => {
          formattedRow[header] = row[key];
        });
        return formattedRow as T;
      });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}`;

    let success = false;
    if (exportFormat === 'excel') {
      success = await exportToExcel(dataToExport, fullFilename);
    } else {
      success = await exportToCSV(dataToExport, fullFilename);
    }

    if (success) {
      notify.success(`Exported successfully as ${exportFormat.toUpperCase()}`);
    } else {
      notify.error('Export failed. Please try again.');
    }
  };

  if (format === 'both') {
    return (
      <div className={`flex gap-2 ${className}`}>
        <button
          onClick={() => handleExport('excel')}
          disabled={disabled || !data || data.length === 0}
          className="btn-secondary flex items-center gap-2"
          title="Export to Excel"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Excel
        </button>
        <button
          onClick={() => handleExport('csv')}
          disabled={disabled || !data || data.length === 0}
          className="btn-secondary flex items-center gap-2"
          title="Export to CSV"
        >
          <FileText className="w-4 h-4" />
          CSV
        </button>
      </div>
    );
  }

  const Icon = format === 'excel' ? FileSpreadsheet : FileText;
  return (
    <button
      onClick={() => handleExport(format)}
      disabled={disabled || !data || data.length === 0}
      className={`btn-secondary flex items-center gap-2 ${className}`}
      title={`Export to ${format.toUpperCase()}`}
    >
      <Icon className="w-4 h-4" />
      <Download className="w-4 h-4" />
      Export {format.toUpperCase()}
    </button>
  );
}
