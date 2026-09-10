// The floor's formatter, so a refusal names the size it is refusing in the
// same words the customer's panel has always used.
import { formatFileSize } from "@/shared/lib";
/**
 * What anyone is allowed to send us.
 *
 * On the floor rather than in `domains/upload` since 2026-09-06: four surfaces
 * take files — the customer's panel, the coach's, the translator's and the
 * admin's folder boxes — and three of them live in other domains. Keeping the
 * rule inside one of them meant `feedback` importing `upload`, which closed a
 * cycle back through the retention sweep. What we accept is a platform fact,
 * not a fact about the customer's leg of the flow.
 *
 * **The single home for that question.** The file picker's `accept` attribute,
 * the browser-side pre-check, and the server's re-validation all read this
 * list, so they cannot drift into disagreeing — the same reason the submission
 * schemas are shared between form and route.
 *
 * Extension *and* MIME type are both listed because neither alone is reliable:
 * some browsers report an empty `type` for `.mov` and `.docx`, and a MIME type
 * is trivially spoofed. The server checks the extension, which is what actually
 * determines the stored object's name.
 *
 * Client-safe: no server imports, so a `"use client"` component may import this
 * module directly (structure.md §3b).
 */

export interface AllowedType {
  extension: string;
  mimeTypes: string[];
  /** How the UI groups it when explaining what's accepted. */
  group: "Video" | "Audio" | "Image" | "Document";
}

export const ALLOWED_TYPES: readonly AllowedType[] = [
  { extension: ".mp4", mimeTypes: ["video/mp4"], group: "Video" },
  { extension: ".mov", mimeTypes: ["video/quicktime"], group: "Video" },
  { extension: ".mp3", mimeTypes: ["audio/mpeg", "audio/mp3"], group: "Audio" },
  { extension: ".jpg", mimeTypes: ["image/jpeg"], group: "Image" },
  { extension: ".jpeg", mimeTypes: ["image/jpeg"], group: "Image" },
  { extension: ".png", mimeTypes: ["image/png"], group: "Image" },
  { extension: ".gif", mimeTypes: ["image/gif"], group: "Image" },
  { extension: ".pdf", mimeTypes: ["application/pdf"], group: "Document" },
  { extension: ".doc", mimeTypes: ["application/msword"], group: "Document" },
  {
    extension: ".docx",
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    group: "Document",
  },
] as const;

/**
 * The `accept` attribute for the file picker.
 *
 * Both extensions and MIME types: iOS Safari filters on MIME, desktop Chrome on
 * extension, and offering both is what makes the picker grey out the wrong
 * files on all of them.
 */
export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_TYPES.map((t) => t.extension),
  ...new Set(ALLOWED_TYPES.flatMap((t) => t.mimeTypes)),
].join(",");

/** Every MIME type we accept — what the Blob client token is scoped to. */
export const ALLOWED_MIME_TYPES = [
  ...new Set(ALLOWED_TYPES.flatMap((t) => t.mimeTypes)),
];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

/** Is this a file type we accept? Decided on the extension. */
export function isAllowedFilename(filename: string): boolean {
  const ext = extensionOf(filename);
  return ALLOWED_TYPES.some((t) => t.extension === ext);
}

/**
 * The content type to store, preferring the browser's when it is one we know
 * and falling back to the extension's when the browser gave us nothing useful.
 */
export function resolveContentType(
  filename: string,
  browserType: string | undefined,
): string {
  const ext = extensionOf(filename);
  const allowed = ALLOWED_TYPES.find((t) => t.extension === ext);
  if (!allowed) return "application/octet-stream";
  if (browserType && allowed.mimeTypes.includes(browserType)) return browserType;
  return allowed.mimeTypes[0];
}

/** "Video, audio, images, and documents" — the sentence under the file picker. */
export function describeAllowedTypes(): string {
  return ALLOWED_TYPES.map((t) => t.extension.replace(".", "").toUpperCase())
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(", ");
}

/**
 * Why this file can't be uploaded — asked **before** the upload starts, in the
 * browser, by every surface that takes a file.
 *
 * The customer's panel had this logic inline and nobody else had it at all, so
 * a coach, a translator or an admin uploaded first and was refused afterwards:
 * the bytes went up, the server said no, and the operator watched a progress
 * bar complete before being told it was pointless. On the admin's folder boxes
 * it was worse than pointless — the upload went through a Server Action, so an
 * oversize file blew the request body limit and Next replied with its own
 * "this page couldn't load" instead of anything we wrote (Ben, QA 6.6.1).
 *
 * One function, so the four surfaces can't drift on what they'll accept, and
 * so the wording a person sees is the same wording wherever they see it. The
 * server still re-checks all of it — this is the courtesy, `checkFile` is the
 * enforcement, and a browser is never the place a limit actually lives.
 *
 * Returns null when the file is fine.
 */
export function refuseFile(
  file: { name: string; size: number },
  maxFileSizeMb: number,
): string | null {
  if (!isAllowedFilename(file.name)) {
    return `That file type isn't supported. Accepted: ${describeAllowedTypes()}.`;
  }
  if (file.size <= 0) return "That file is empty.";
  if (file.size > maxFileSizeMb * 1024 * 1024) {
    return `That file is ${formatFileSize(file.size)}. The limit is ${maxFileSizeMb} MB.`;
  }
  return null;
}
