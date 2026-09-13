"use client";

/** The hidden `<input type="file">` both upload surfaces open. */
export function UploadFilePicker({
  pickerRef,
  multiple,
  accept,
  onFiles,
}: {
  accept?: string;
  multiple: boolean;
  onFiles: (files: File[]) => void;
  pickerRef: React.RefObject<HTMLInputElement | null>;
}): React.ReactElement {
  return (
    <input
      className="hidden"
      multiple={multiple}
      onChange={(event) => {
        onFiles([...(event.target.files ?? [])]);
        // Clear so re-picking the same file fires change again.
        event.target.value = "";
      }}
      ref={pickerRef}
      type="file"
      {...(accept ? { accept } : {})}
    />
  );
}
