import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";
import { Button } from "./button";
import { cn } from "../../lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ColumnDef<T> = {
  header: string;
  accessorKey?: keyof T | ((row: T) => React.ReactNode);
  cell?: (row: T) => React.ReactNode;
  className?: string; // e.g. w-[100px] text-right
};

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: React.ElementType;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyCTA?: { label: string; onClick: () => void };
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
  pagination?: {
    page: number;
    total: number;
    limit: number;
    onPageChange: (newPage: number) => void;
  };
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyIcon,
  emptyTitle = "No data found",
  emptyDescription = "There is no data to display here yet.",
  emptyCTA,
  onRowClick,
  skeletonRows = 5,
  pagination,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-md border bg-[hsl(var(--card))]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, idx) => (
                <TableHead key={idx} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: skeletonRows }).map((_, rIdx) => (
              <TableRow key={rIdx}>
                {columns.map((col, cIdx) => (
                  <TableCell key={cIdx} className={col.className}>
                    <Skeleton className="h-5 w-full max-w-[120px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-md border bg-[hsl(var(--card))] p-8">
        {emptyIcon ? (
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyCTA}
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            {emptyTitle}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-[hsl(var(--card))] overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, idx) => (
                <TableHead key={idx} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, rIdx) => (
              <TableRow
                key={rIdx}
                onClick={() => onRowClick && onRowClick(row)}
                className={cn(
                  "group transition-colors duration-150 data-[state=selected]:bg-[hsl(var(--muted))]",
                  onRowClick && "cursor-pointer hover:bg-[hsl(var(--accent))]/50"
                )}
              >
                {columns.map((col, cIdx) => (
                  <TableCell key={cIdx} className={col.className}>
                    {col.cell
                      ? col.cell(row)
                      : typeof col.accessorKey === "function"
                      ? col.accessorKey(row)
                      : col.accessorKey
                      ? (row as any)[col.accessorKey]
                      : null}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-[hsl(var(--muted-foreground))]">
            Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.limit >= pagination.total}
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
