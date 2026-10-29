export type ApprovedEmail = {
  to: string;
  subject: string;
  body: string;
  attachmentPath: string;
  idempotencyKey: string;
};

export type EmailProviderResult =
  | { sent: false; reason: "disabled" }
  | { sent: true; providerMessageId: string };

/** Provider boundary for a future OAuth/API adapter. It never sends mail. */
export interface EmailProvider {
  send(email: ApprovedEmail): Promise<EmailProviderResult>;
}

export const disabledEmailProvider: EmailProvider = {
  async send() {
    return { sent: false, reason: "disabled" };
  },
};
