export const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;

export function imageFileValidationError(file: Pick<File, "size" | "type">): string | undefined {
  if (!file.type.startsWith("image/")) return "Choose an image file.";
  if (file.size <= 0) return "The selected image is empty.";
  if (file.size > MAX_IMAGE_FILE_BYTES) return "Images must be 25 MB or smaller.";
  return undefined;
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The image could not be read."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}
