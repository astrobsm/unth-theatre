// XLSX is loaded dynamically to keep it out of the initial bundle (~1MB)

/**
 * Export data to Excel file
 */
export async function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  sheetName: string = 'Sheet1'
) {
  try {
    const XLSX = await import('xlsx');
    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Auto-size columns
    const maxWidth = 50;
    const colWidths = Object.keys(data[0] || {}).map((key) => {
      const columnData = data.map((row) => String(row[key] || ''));
      const maxLength = Math.max(
        key.length,
        ...columnData.map((val) => val.length)
      );
      return { wch: Math.min(maxLength + 2, maxWidth) };
    });
    worksheet['!cols'] = colWidths;

    // Write file
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return false;
  }
}

/**
 * Export data to CSV file
 */
export async function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string
) {
  try {
    const XLSX = await import('xlsx');
    // Create worksheet from data
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Convert to CSV
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    return true;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return false;
  }
}

/**
 * Export multiple sheets to Excel
 */
export async function exportMultiSheetExcel(
  sheets: Array<{ name: string; data: any[] }>,
  filename: string
) {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();

    sheets.forEach(({ name, data }) => {
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Auto-size columns
      const maxWidth = 50;
      const colWidths = Object.keys(data[0] || {}).map((key) => {
        const columnData = data.map((row) => String(row[key] || ''));
        const maxLength = Math.max(
          key.length,
          ...columnData.map((val) => val.length)
        );
        return { wch: Math.min(maxLength + 2, maxWidth) };
      });
      worksheet['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, name);
    });

    XLSX.writeFile(workbook, `${filename}.xlsx` as string);
    return true;
  } catch (error) {
    console.error('Error exporting multi-sheet Excel:', error);
    return false;
  }
}

/**
 * Format data for export with custom column headers
 */
export function formatDataForExport<T extends Record<string, any>>(
  data: T[],
  columnMapping: Record<keyof T, string>
): Record<string, any>[] {
  return data.map((row) => {
    const formattedRow: Record<string, any> = {};
    Object.entries(columnMapping).forEach(([key, header]) => {
      formattedRow[header] = row[key];
    });
    return formattedRow;
  });
}

/**
 * Export data with custom formatting
 */
export async function exportWithFormat<T extends Record<string, any>>(
  data: T[],
  columnMapping: Record<keyof T, string>,
  filename: string,
  format: 'excel' | 'csv' = 'excel'
) {
  const formattedData = formatDataForExport(data, columnMapping);
  
  if (format === 'excel') {
    return await exportToExcel(formattedData, filename);
  } else {
    return await exportToCSV(formattedData, filename);
  }
}

/**
 * Export table data from DOM
 */
export async function exportTableToExcel(tableId: string, filename: string) {
  try {
    const XLSX = await import('xlsx');
    const table = document.getElementById(tableId);
    if (!table) {
      throw new Error(`Table with id "${tableId}" not found`);
    }

    const workbook = XLSX.utils.table_to_book(table);
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    return true;
  } catch (error) {
    console.error('Error exporting table:', error);
    return false;
  }
}
