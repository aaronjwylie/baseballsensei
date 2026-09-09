import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * How a contact message is addressed — QA 1.2.15/1.2.16.
 *
 * The shape is the whole design: one visible identity, everyone reached, and no
 * address of ours able to travel back to the customer. Asserted on the envelope
 * rather than the body, because that is where all three live.
 */
const sent: Record<string, unknown>[] = [];
vi.mock("@/shared/email", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  sendEmail: async (message: Record<string, unknown>) => {
    sent.push(message);
    return { ok: true };
  },
}));
vi.mock("@/domains/operator", () => ({
  listAdminEmails: async () => [
    "contact@baseball-sensei.com",
    "aaron@example.com",
    "yuta@example.com",
  ],
}));

const { sendContactMessage, sendContactReceipt } = await import(
  "@/domains/contact/api/contactEmail"
);

const input = {
  firstName: "Norman",
  lastName: "Norms",
  email: "norman@example.com",
  message: "Do you review from side-on footage?",
  consent: true as const,
};

beforeEach(() => (sent.length = 0));

describe("the admin copy", () => {
  it("shows one identity and hides the people", async () => {
    await sendContactMessage(input);
    const [message] = sent;
    expect(message!.to).toBe("contact@baseball-sensei.com");
    expect(message!.bcc).toEqual(["aaron@example.com", "yuta@example.com"]);
    // The shared address is the identity, not also a hidden recipient.
    expect(message!.bcc).not.toContain("contact@baseball-sensei.com");
  });

  /*
    One Reply has to reach both sides: the customer, so the answer is delivered,
    and the shared inbox, so it is archived where the other admins read. Two
    addresses because an admin should not have to remember the second one.
  */
  it("continues the thread on both sides", async () => {
    await sendContactMessage(input);
    expect(sent[0]!.replyTo).toEqual([
      "norman@example.com",
      "contact@baseball-sensei.com",
    ]);
  });

  /*
    The point of bcc here. A customer is in this thread, and four admins in `to`
    means any one of them can hand over all four addresses with one reply-all.
  */
  it("puts no admin address anywhere the customer could reach", async () => {
    await sendContactMessage(input);
    const visible = JSON.stringify({ to: sent[0]!.to, html: sent[0]!.html });
    expect(visible).not.toContain("aaron@example.com");
    expect(visible).not.toContain("yuta@example.com");
  });
});

describe("the writer's receipt", () => {
  it("goes to them alone and names nobody else", async () => {
    await sendContactReceipt(input);
    const [message] = sent;
    expect(message!.to).toBe("norman@example.com");
    expect(message!.bcc).toBeUndefined();
    expect(message!.replyTo).toBeUndefined();
    const html = String(message!.html);
    for (const address of ["aaron@example.com", "yuta@example.com"]) {
      expect(html).not.toContain(address);
    }
  });
});
