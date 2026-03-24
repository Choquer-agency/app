"use client";

import { useRef, useState, useCallback } from "react";

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
  className?: string;
  accept?: string;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export default function FileUpload({
  onUpload,
  disabled = false,
  className = "",
  accept = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError("");
      for (const file of Array.from(files)) {
        if (file.size > MAX_SIZE) {
          setError(`${file.name} exceeds 10MB limit`);
          continue;
        }
        setUploading(true);
        try {
          await onUpload(file);
        } catch {
          setError(`Failed to upload ${file.name}`);
        }
        setUploading(false);
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || uploading) return;
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [disabled, uploading, handleFiles]
  );

  return (
    <div className={className}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all text-sm
          ${dragOver
            ? "border-[var(--accent)] bg-[var(--accent-light)]"
            : "border-[var(--border)] hover:border-gray-300"
          }
          ${disabled || uploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <p className="text-[var(--muted)]">Uploading...</p>
        ) : (
          <p className="text-[var(--muted)]">
            Drop files here or <span className="text-[var(--accent)] font-medium">browse</span>
          </p>
        )}
      </div>
      {error && (
        <p className="text-xs text-[var(--danger-text)] mt-1">{error}</p>
      )}
    </div>
  );
}
