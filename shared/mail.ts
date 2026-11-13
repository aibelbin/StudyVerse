// shared/mail.ts
export const LETTER_MAX = 280;
export const LETTER_GAP_MS = 30_000;
export const LETTERS_PER_DAY = 20;
/** Newest letters shown in the inbox. */
export const MAIL_SHOWN = 50;

export interface Letter {
  id: number;
  from: string;
  fromName: string;
  to: string;
  text: string;
  at: number;
  read: boolean;
}
