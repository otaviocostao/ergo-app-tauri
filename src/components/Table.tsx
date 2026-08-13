import { ReactNode } from "react";
import { Inbox, Loader2 } from "lucide-react";

export interface ColumnDef<T> {
  header: ReactNode;
  accessorKey?: keyof T;
  cell?: (item: T, index: number) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (item: T, index: number) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: ReactNode;
  onRowClick?: (item: T) => void;
  className?: string;
}

export default function Table<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = "Nenhum registro encontrado",
  emptyIcon,
  onRowClick,
  className = "",
}: TableProps<T>) {
  const getAlignClass = (align?: "left" | "center" | "right") => {
    switch (align) {
      case "center":
        return "text-center";
      case "right":
        return "text-right";
      default:
        return "text-left";
    }
  };

  return (
    <div
      className={`w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-colors ${className}`}
    >
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 border-collapse">
          <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-800 tracking-wider">
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  scope="col"
                  className={`px-5 py-3.5 font-semibold ${getAlignClass(
                    col.align
                  )} ${col.headerClassName || ""} ${col.className || ""}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-slate-500 dark:text-slate-400"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                    <span className="text-sm font-medium">Carregando dados...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-12 text-center text-slate-500 dark:text-slate-400"
                >
                  <div className="flex flex-col items-center justify-center gap-2">
                    {emptyIcon || <Inbox className="h-8 w-8 text-slate-400 dark:text-slate-500 stroke-[1.5]" />}
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item, rowIdx) => {
                const key = keyExtractor(item, rowIdx);
                const isClickable = Boolean(onRowClick);

                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(item)}
                    className={`transition-colors ${isClickable
                        ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                      }`}
                  >
                    {columns.map((col, colIdx) => {
                      const value =
                        col.cell
                          ? col.cell(item, rowIdx)
                          : col.accessorKey
                            ? (item[col.accessorKey] as ReactNode)
                            : null;

                      return (
                        <td
                          key={colIdx}
                          className={`px-5 py-4 whitespace-nowrap align-middle ${getAlignClass(
                            col.align
                          )} ${col.className || ""}`}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
