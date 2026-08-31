import type { Metadata } from "next";
import { Container } from "@/shared/ui";
import { StatusLookup } from "@/domains/submission";

export const metadata: Metadata = {
  title: "Check your status",
  description:
    "Enter your email to see the status of your coaching reviews. No login needed.",
};

export default function StatusPage() {
  return (
    <section className="py-14 sm:py-20">
      <Container className="max-w-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Check your submissions
          </h1>
          <p className="mt-4 text-ink-muted">
            Enter the email you used at checkout. No password — your email is
            your identity.
          </p>
        </div>

        <div className="mt-10">
          <StatusLookup />
        </div>
      </Container>
    </section>
  );
}
