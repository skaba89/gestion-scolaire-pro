import { format as formatDate } from "date-fns";

/**
 * Exports data to CSV format and triggers download
 */
export const exportToCSV = (data: Record<string, any>[], filename: string, selectedFields?: string[]) => {
    if (!data || data.length === 0) {
        return 0;
    }

    const headers = selectedFields || Object.keys(data[0]);
    const csvContent = [
        headers.join(";"),
        ...data.map((row) =>
            headers.map((h) => {
                const value = row[h];
                if (value === null || value === undefined) return "";
                const str = String(value);
                return str.includes(";") || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
            }).join(";")
        ),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${formatDate(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return data.length;
};

/**
 * Exports data to JSON format and triggers download
 */
export const exportToJSON = (data: Record<string, any>[], filename: string, selectedFields?: string[]) => {
    if (!data || data.length === 0) {
        return 0;
    }

    const filteredData = selectedFields
        ? data.map(row => {
            const filtered: Record<string, any> = {};
            selectedFields.forEach(field => {
                if (field in row) filtered[field] = row[field];
            });
            return filtered;
        })
        : data;

    const jsonContent = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_${formatDate(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return data.length;
};
