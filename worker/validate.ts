/**
 * Contact form validation. The service options come from the same content the form renders
 * (content/home.json, checked by the site's ContactCopy schema), so the two can't drift.
 */
import { z } from "zod";
import home from "../content/home.json";
import { ContactCopy } from "../src/content/schema";

export const SERVICE_OPTIONS = ContactCopy.shape.serviceOptions.parse(home.contact.serviceOptions);

const field = (label: string, max: number) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const ContactSchema = z.object({
  name: field("Name", 100),
  email: z
    .string({ error: "Email is required" })
    .trim()
    .max(254, "Email is too long")
    .pipe(z.email("Email is not valid")),
  service: z.enum(SERVICE_OPTIONS, { error: "Choose a service" }),
  message: field("Message", 5000),
  turnstileToken: z.string({ error: "Spam check missing" }).min(1, "Spam check missing").max(2048),
});
export type Contact = z.infer<typeof ContactSchema>;

export function validate(body: unknown): { ok: true; data: Contact } | { ok: false; error: string } {
  const result = ContactSchema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid request" };
}
