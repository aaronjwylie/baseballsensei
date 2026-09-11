"use client";

import { upload as blobUpload } from "@vercel/blob/client";

/**
 * Getting one file from the browser into storage, with progress.
 *
 * Two paths, because the two environments genuinely differ:
 *
 * - **`blob`** (production): the browser uploads *straight to Vercel Blob* using
 *   a short-lived token our route issues. This is not an optimisation — Vercel
 *   caps a serverless request body at about 4.5 MB, so a phone video physically
 *   cannot reach us through our own route. Blob then calls back and we register
 *   the result.
 * - **`proxy`** (development): there is no Blob store, so the bytes go through
 *   our own route to local disk. `next dev` has no body cap, and dev files are
 *   small.
 *
 * The seam is `supportsDirectUpload` on the storage driver; the page decides
 * which mode to hand down, so this module never reads config.
 */

export type UploadMode = "blob" | "proxy";

/** What the server recorded, echoed back so the card can show it. */
export interface UploadedFile {
  id: string;
  filename: string;
  sizeBytes: number;
}

/**
 * The three server routes an upload talks to. Defaulted to the customer's, but
 * the coach's feedback upload passes its own (operator-gated) set — same
 * machinery, different auth.
 */
export interface UploadEndpoints {
  /** Issues the Blob client token (prod, blob mode). */
  blobToken: string;
  /** Records a directly-uploaded file (prod, blob mode). */
  complete: string;
  /** Takes the bytes through us to local disk (dev, proxy mode). */
  proxy: string;
}

const CUSTOMER_ENDPOINTS: UploadEndpoints = {
  blobToken: "/api/upload/blob",
  complete: "/api/upload/complete",
  proxy: "/api/upload",
};

export interface UploadRequest {
  mode: UploadMode;
  /** `submissions/<id>` — where this submission's files live. */
  folder: string;
  /**
   * Which submission the tab believes it is on, for the proxy path's query.
   * The blob path already says it through the pathname. Only the customer's
   * flow sets this; the operator routes carry their own `?submission=`.
   */
  submissionId?: string;
  file: File;
  onProgress: (percentage: number) => void;
  signal?: AbortSignal;
  /** Defaults to the customer routes. */
  endpoints?: UploadEndpoints;
}

export async function uploadFile(request: UploadRequest): Promise<UploadedFile> {
  return request.mode === "blob" ? viaBlob(request) : viaProxy(request);
}

async function viaBlob({
  folder,
  file,
  onProgress,
  signal,
  endpoints = CUSTOMER_ENDPOINTS,
}: UploadRequest): Promise<UploadedFile> {
  // The filename is passed through unsanitized on purpose: this is a Blob key,
  // not a filesystem path, and the server only checks that it lands inside this
  // submission's folder. Blob appends its own random suffix, so two files of the
  // same name don't collide.
  const blob = await blobUpload(`${folder}/${file.name}`, file, {
    // Private, matching the store: customer files (video of minors) require auth
    // to read rather than living behind an unguessable public URL. Downloads go
    // through our access-checked routes, which stream the bytes.
    access: "private",
    handleUploadUrl: endpoints.blobToken,
    contentType: file.type || undefined,
    // Multipart splits large files and retries failed parts on its own, which
    // is what makes a 50 MB upload survive a phone changing cell towers.
    multipart: file.size > 8 * 1024 * 1024,
    abortSignal: signal,
    onUploadProgress: ({ percentage }) => onProgress(percentage),
  });

  const res = await fetch(endpoints.complete, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      fileUrl: blob.url,
      pathname: blob.pathname,
      filename: file.name,
      contentType: blob.contentType,
      sizeBytes: file.size,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    file?: UploadedFile;
    error?: string;
  };
  if (!res.ok || !json.file) throw uploadError(res, json.error);
  return json.file;
}

/**
 * Turn a failed response into something a person can act on.
 *
 * A body we can't parse means the response didn't come from our own route —
 * it's the platform, and the one that actually happens is a 413 when a request
 * body exceeds the serverless limit. Reporting that as "we couldn't save that
 * file" sent a real debugging session chasing the database instead of the
 * missing Blob store, so the status now survives into the message.
 */
function uploadError(res: Response, serverMessage?: string): Error {
  if (serverMessage) return new Error(serverMessage);
  if (res.status === 413) {
    return new Error(
      "That file was rejected as too large by the server before it reached us. This is a setup problem on our side, not yours.",
    );
  }
  return new Error(
    `We couldn't save that file (error ${res.status}). Please try again.`,
  );
}

/**
 * XHR rather than `fetch`, for one reason: `fetch` still cannot report *upload*
 * progress. A progress bar that jumps from 0 to 100 is worse than none, because
 * it reads as frozen on exactly the slow connections where it matters most.
 */
function viaProxy({
  file,
  submissionId,
  onProgress,
  signal,
  endpoints = CUSTOMER_ENDPOINTS,
}: UploadRequest): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // The feedback proxy carries `?submission=…` already; the customer's says
    // it here instead, so the gate can tell a superseded tab why.
    const sep = endpoints.proxy.includes("?") ? "&" : "?";
    const claim = submissionId
      ? `&submission=${encodeURIComponent(submissionId)}`
      : "";
    xhr.open(
      "POST",
      `${endpoints.proxy}${sep}filename=${encodeURIComponent(file.name)}${claim}`,
    );
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      let json: { file?: UploadedFile; error?: string } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        // Fall through to the generic message below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.file) {
        onProgress(100);
        resolve(json.file);
      } else if (json.error) {
        reject(new Error(json.error));
      } else if (xhr.status === 413) {
        reject(
          new Error(
            "That file was rejected as too large by the server before it reached us. This is a setup problem on our side, not yours.",
          ),
        );
      } else {
        reject(
          new Error(
            `We couldn't save that file (error ${xhr.status}). Please try again.`,
          ),
        );
      }
    });

    xhr.addEventListener("error", () =>
      reject(new Error("Network error. Please check your connection.")),
    );
    xhr.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));

    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}
