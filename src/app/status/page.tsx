import type { Metadata } from "next";
import { PageColumn, pageTitleClass } from "@/shared/ui";
import { StatusPanel } from "@/domains/feedback";

export const metadata: Metadata = {
  title: "Check your status",
  description:
    "Enter your email to see the status of your coaching reviews. No login needed.",
};

export default function StatusPage() {
  return (
    <PageColumn>
        <div className="text-center">
          <h1 className={pageTitleClass}>
            Check your submissions
          </h1>
          <p className="mt-4 text-ink-muted">
            Enter the email you used at checkout. No password: your email is
            your identity.
          </p>
        </div>

        <div className="mt-10">
          <StatusPanel />
        </div>
    </PageColumn>
  );
}
