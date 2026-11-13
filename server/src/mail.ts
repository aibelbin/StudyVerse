import { LETTER_GAP_MS, LETTERS_PER_DAY, MAIL_SHOWN } from '../../shared/mail';
import type { Store } from './db';
import type { Port } from './port';

/** Letters between cabin owners. Private: a letter only ever goes to its sender and recipient, never to a feed or broadcast. */
export class Mail {
  constructor(private store: Store, private port: Port) {}

  send(p: string, to: string, text: string): void {
    const err = (message: string) => this.port.error(p, 'bad_letter', message);
    if (to === p) return err('Write to someone else.');
    if (!this.store.cabinOf(to)) return err("There's no mailbox for them.");
    const now = this.port.now();
    if (this.store.lettersSentSince(p, now - LETTER_GAP_MS + 1) > 0) return err('Let the ink dry a moment before the next letter.');
    if (this.store.lettersSentSince(p, new Date(now).setHours(0, 0, 0, 0)) >= LETTERS_PER_DAY) return err(`You've sent ${LETTERS_PER_DAY} letters today. More tomorrow!`);
    const hadMail = this.store.unreadCount(to) > 0;
    const letter = this.store.addLetter(p, this.port.nameOf(p) ?? 'Someone', to, text, now);
    this.port.send(to, { t: 'letter', letter });
    this.port.send(p, { t: 'letter', letter });
    if (!hadMail) this.port.rosterChanged();
  }

  list(p: string): void {
    this.port.send(p, { t: 'mail', letters: this.store.letters(p, MAIL_SHOWN) });
  }

  read(p: string): void {
    if (this.store.markRead(p)) this.port.rosterChanged();
  }

  remove(p: string, id: number): void {
    if (!this.store.deleteLetter(id, p)) return this.port.error(p, 'bad_letter', "That letter isn't yours.");
    this.list(p);
  }

  /** Admins may delete any letter; an unread one may clear the recipient's flag. */
  adminRemove(id: number): void {
    if (this.store.deleteLetterAny(id)) this.port.rosterChanged();
  }

  unread(p: string): number {
    return this.store.unreadCount(p);
  }
}
