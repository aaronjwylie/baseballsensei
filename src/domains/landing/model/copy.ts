/**
 * Landing-page section copy. Client-editable — change words here, never in the
 * section components.
 *
 * Transcribed from Audrey's Figma, page "Final design"
 * (`nZ2cQxvViIVzxrA9ILchVt`, read 2026-08-15), which supersedes the wireframe
 * this file previously carried. Ben confirmed sign-off on the copy.
 *
 * Two strings are **not** verbatim, both because the Figma's own value is
 * broken rather than because it was improved on. Each is marked `AUTHORED` at
 * the value with what the file actually said. Nothing else departs from it.
 *
 * Brand facts used across the whole app (name, price, turnaround) live in
 * `shared/config/site.ts`; this file is only what the landing page says.
 */
import { site } from "@/shared/config/site";

/**
 * A heading the design sets in two colours — the second half picked out in lime
 * on dark grounds, blue on light ones. Splitting it here rather than in the
 * component keeps the break a copy decision, which is what it is: move a word
 * across and the emphasis moves with it.
 */
export type SplitHeading = { lead: string; highlight: string };

export const hero = {
  eyebrow: "Professional Baseball Coaching",
  title: { lead: "Train like", highlight: "Japan's best players" },
  body: `Upload your swing or pitching mechanics. Receive precision analysis from a progression coach from Japan within ${site.turnaround}.`,
  primaryCta: "Get coach feedback",
  secondaryCta: "How it works",
} as const;

/**
 * The scrolling strip under the hero. Six claims, not the seven the Figma
 * draws — its seventh is "japan precision" a second time, which is the row
 * repeating to fill 1079px rather than a seventh claim. The marquee repeats the
 * set in the component, so the duplicate would have come back doubled.
 */
export const ticker = [
  `${site.turnaround.replace(" hours", "h")} turnaround`,
  "no robots",
  "human coaching",
  "real pro coach",
  "japan precision",
  "1:1 video reply",
] as const;

export const method = {
  title: { lead: "Three steps.", highlight: "That's it." },
  steps: [
    {
      title: "Upload your swing or pitch",
      body: "Share your videos, your goals, and we'll handle the rest.",
      image: "/images/step-card-a.webp",
    },
    {
      title: "Get expert feedback",
      body: "Receive personalized video feedback and written coaching notes.",
      image: "/images/step-card-b.webp",
    },
    {
      title: "Improve every rep",
      body: "Train with purpose using your personalized feedback.",
      image: "/images/step-card-c.webp",
    },
  ],
} as const;

/**
 * ⚠️ `role` is still the Figma's placeholder — it reads "Title here" there and
 * reads the same here, because inventing a job title for a real, named person
 * is not a gap code should fill. It needs Masatomo's actual title before launch.
 */
export const coach = {
  eyebrow: "Professional Baseball Coaching",
  title: { lead: "Your coach.", highlight: "Your next level." },
  name: "masatomo",
  role: "Title here",
  bio: "Get personalized guidance from Masatomo and his team of experienced Japanese baseball coaches. They'll help you see what's working, understand what needs improvement, and give you clear advice you can take back to the field.",
  stats: [
    { value: "NPB", label: "Played at the highest level" },
    { value: "12 yrs", label: "Coaching young athletes" },
    { value: "JP METHOD", label: "Japanese approach to training" },
    { value: "GAME IQ", label: "Mechanics + mindset" },
  ],
} as const;

/**
 * The price is *not* written here. The design draws "80$", and it is right, but
 * the number belongs to the `settings` row the admin edits at `/admin/settings`
 * — hardcoding it means the landing page keeps quoting 80 after the price
 * changes. The section reads it and formats it.
 */
export const pricing = {
  unit: "Per Submission",
  included: [
    "No subscription needed",
    "Coach video walkthrough",
    "Written summary of notes",
    `Delivered within ${site.turnaround}`,
  ],
  cta: "Get coach feedback",
  contactPrompt: "Question?",
  contactLink: "Reach Out",
} as const;

export const faqHeading = {
  lead: "Straight",
  highlight: "answers",
} as const;

export const faqs = [
  {
    q: "Why Baseball Sensei?",
    /*
      AUTHORED. The Figma's answer is the same fragment printed twice and cut
      mid-clause — "…experienced Japanese baseball coaches—noYou get
      personalized feedback from experienced Japanese baseball coaches—no". The
      duplication is a paste artefact and the "—no" is a truncation, so there is
      no complete sentence in the file to transcribe. This finishes the thought
      the fragment starts, using the claims the design makes elsewhere ("no
      robots", "real pro coach"). Needs Audrey's eye.
    */
    a: "You get personalized feedback from experienced Japanese baseball coaches — not an algorithm, and not a generic tip sheet. Every review is done by a real coach who watches your reps and answers you directly.",
  },
  {
    q: "What can I send?",
    a: "Send a video, photos, or notes about your hitting, pitching, or another part of your game. Tell us what you're working on or where you're struggling.",
  },
  {
    q: "What will I get back?",
    a: "Your coach will review your submission and send personalized feedback explaining what they see, what to improve, and what to work on next.",
  },
  {
    q: "How long does feedback take?",
    a: `You'll receive your coach's feedback within ${site.turnaround} of submitting your request.`,
  },
  {
    q: "Who are the coaches?",
    a: "Our coaches have experience in Japan's professional baseball system and bring that knowledge to developing players of different ages and skill levels.",
  },
  {
    q: "What age or skill level is this for?",
    a: "Baseball Sensei is designed for players ages 10+—from developing youth players to more advanced athletes looking to sharpen their game.",
  },
  {
    q: "Can I submit more than one thing?",
    a: "Yes. You can include multiple videos, photos, and notes when they relate to the same coaching question or area you'd like reviewed.",
  },
  {
    q: "Do I need a subscription?",
    a: "No. Baseball Sensei is pay-per-submission. Send something when you need feedback—no membership or ongoing commitment.",
  },
] as const;

export const closing = {
  title: { lead: "Be the player", highlight: "your team counts on" },
  body: "Build your skills. Grow your confidence. Step onto the field ready to contribute, compete, and be part of something bigger.",
  /**
   * The photo strip along the bottom of the band.
   *
   * **Four tiles, where the design draws six.** Three of its six slots share
   * one image — the same "Screenshot 2026-08-06" placed as three separate
   * layers — so the file holds four distinct photographs, not six. Repeating
   * one three times across a single row reads as a mistake at any size, so the
   * strip ships with what actually exists. Two more photographs fill it out.
   */
  gallery: [
    "/images/gallery-player-1.webp",
    "/images/gallery-screenshot.webp",
    "/images/gallery-generated.webp",
    "/images/gallery-player-2.webp",
  ],
} as const;

export const finalCta = {
  title: { lead: "Send your", highlight: "first clip" },
  cta: "Start now",
} as const;
