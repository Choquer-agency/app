"use client";

import { TicketAttachment } from "@/types";

interface AttachmentListProps {
  attachments: TicketAttachment[];
  onDelete?: (id: number) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType: string): string {
  if (fileType.startsWith("image/")) return "";
  if (fileType === "application/pdf") return "\ud83d\udcc4";
  if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.includes(".sheet"))
    return "\ud83d\udcca";
  if (fileType.includes("document") || fileType.includes("word") || fileType.includes(".document"))
    return "\ud83d\udcdd";
  if (fileType.includes("presentation") || fileType.includes("powerpoint"))
    return "\ud83d\udcfd\ufe0f";
  if (fileType.includes("zip") || fileType.includes("rar") || fileType.includes("compressed"))
    return "\ud83d\udce6";
  return "\ud83d\udcc1";
}

export default function AttachmentList({
  attachments,
  onDelete,
}: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {attachments.map((att) => {
        const isImage = att.fileType.startsWith("image/");
        return (
          <div
            key={att.id}
            className="group relative border border-[var(--border)] rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
          >
            <a
              href={att.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {isImage ? (
                <div className="aspect-video bg-gray-50 flex items-center justify-center">
                  <img
                    src={att.fileUrl}
                    alt={att.fileName}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gray-50 flex items-center justify-center text-3xl">
                  {getFileIcon(att.fileType)}
                </div>
              )}
              <div className="px-2 py-1.5">
                <p
                  className="text-xs font-medium truncate text-[var(--foreground)]"
                  title={att.fileName}
                >
                  {att.fileName}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {formatFileSize(att.fileSize)}
                </p>
              </div>
            </a>
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(att.id);
                }}
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 text-gray-500 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                title="Delete"
              >
                &times;
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
