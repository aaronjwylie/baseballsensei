import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    The commit this bundle was built from, inlined so the browser can say which
    build it is running.

    During a QA pass the question "am I testing your fix or the previous one?"
    came up repeatedly and neither of us could answer it — a deploy takes a few
    minutes and a reload is not proof. The probe reports this with every run, so
    the log settles it instead of the tester guessing.

    Read here rather than in shared/config because only the build environment
    has it: Vercel sets VERCEL_GIT_COMMIT_SHA while building, and it is gone by
    the time anything runs.
  */
  env: {
    BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA ?? "dev").slice(0, 7),
  },
  experimental: {
    // Coach photos are uploaded through the create/edit Server Actions, which
    // default to a 1 MB body cap — too small for a photo.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
