// SMTP provider over nodemailer. Config arrives as constructor args (the route maps SMTP_* into them); the provider
// never reads process.env. The transport factory is injectable so tests never open a socket.
import * as nodemailer from 'nodemailer';
import { errorMessage } from '../errors.ts';
import type { EmailProvider } from '../types.ts';

/** STARTTLS submission port, the default when SMTP_PORT is unset. */
export const SMTP_DEFAULT_PORT = 587;
/** Implicit TLS ("SMTPS"); `secure` defaults to true on this port only. */
export const SMTP_IMPLICIT_TLS_PORT = 465;

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
}

export interface SmtpMail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** The slice of a nodemailer Transporter the provider uses. */
export interface SmtpTransport {
  sendMail(mail: SmtpMail): Promise<{ messageId: string }>;
}

export interface SmtpProviderOptions {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Implicit TLS; defaults to `port === SMTP_IMPLICIT_TLS_PORT`. */
  secure?: boolean;
  /** Injected in tests; defaults to `nodemailer.createTransport`. */
  transportFactory?: (options: SmtpTransportOptions) => SmtpTransport;
}

export function createSmtpProvider(options: SmtpProviderOptions): EmailProvider {
  const transportOptions: SmtpTransportOptions = {
    host: options.host,
    port: options.port,
    secure: options.secure ?? options.port === SMTP_IMPLICIT_TLS_PORT,
  };
  if (options.user && options.pass) transportOptions.auth = { user: options.user, pass: options.pass };
  const factory = options.transportFactory ?? ((opts: SmtpTransportOptions): SmtpTransport => nodemailer.createTransport(opts));
  const transport = factory(transportOptions);
  return {
    name: 'smtp',
    async send(msg) {
      try {
        const info = await transport.sendMail({ from: options.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
        if (!info?.messageId) return { error: 'smtp transport returned no message id' };
        return { id: info.messageId };
      } catch (e) {
        return { error: errorMessage(e) };
      }
    },
  };
}
