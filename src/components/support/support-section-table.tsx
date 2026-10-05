import type { ReactNode } from "react";

type Column<T> = {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
};

type SupportSectionTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  maxHeightClassName?: string;
};

export function SupportSectionTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  maxHeightClassName = "max-h-80",
}: SupportSectionTableProps<T>) {
  return (
    <div className={`overflow-auto rounded-lg border border-zinc-200 ${maxHeightClassName}`}>
      <table className="min-w-full text-left text-sm">
        <thead className="sticky top-0 z-10 bg-zinc-50/95 text-xs font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur-xs">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`px-3 py-2.5 ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-zinc-50/60">
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-2.5 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-10 text-center text-xs text-zinc-500"
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
